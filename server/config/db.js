import mysql from 'mysql2/promise'
import { env } from './env.js'

// Connection pool — reused across all requests
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  timezone: 'Z',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
})

export default pool
