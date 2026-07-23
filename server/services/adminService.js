import bcrypt from 'bcrypt'
import pool from '../config/db.js'

const DUMMY_PASSWORD_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO15D/MH6fiHvo4G7Yx1uUymRETrx2rga'

export async function authenticateAdmin(email, password) {
  const [rows] = await pool.query(
    `SELECT admin_user_id, email, password_hash, full_name, role, status
     FROM admin_users
     WHERE email = ?
     LIMIT 1`,
    [email]
  )

  if (rows.length === 0) {
    await bcrypt.compare(password || '', DUMMY_PASSWORD_HASH)
    throw Object.assign(new Error('Invalid admin credentials'), { code: 'INVALID_CREDENTIALS' })
  }

  const admin = rows[0]
  const valid = await bcrypt.compare(password || '', admin.password_hash)
  if (!valid || admin.status !== 'ACTIVE') {
    throw Object.assign(new Error('Invalid admin credentials'), { code: 'INVALID_CREDENTIALS' })
  }

  await pool.query(
    `UPDATE admin_users
     SET last_login_at = CURRENT_TIMESTAMP
     WHERE admin_user_id = ?`,
    [admin.admin_user_id]
  )

  await pool.query(
    `INSERT INTO audit_logs (actor_type, actor_id, action, details)
     VALUES ('ADMIN', ?, 'ADMIN_LOGIN', ?)`,
    [admin.admin_user_id, JSON.stringify({ email: admin.email, role: admin.role })]
  )

  return {
    adminUserId: admin.admin_user_id,
    email: admin.email,
    fullName: admin.full_name,
    role: admin.role,
    status: admin.status,
  }
}

export async function getAdminProfile(adminUserId) {
  const [rows] = await pool.query(
    `SELECT admin_user_id, email, full_name, role, status, last_login_at, created_at
     FROM admin_users
     WHERE admin_user_id = ?
     LIMIT 1`,
    [adminUserId]
  )

  if (rows.length === 0) {
    throw Object.assign(new Error('Admin not found'), { code: 'NOT_FOUND' })
  }

  return rows[0]
}
