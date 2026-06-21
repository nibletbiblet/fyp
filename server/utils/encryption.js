import crypto from 'node:crypto'
import { env } from '../config/env.js'

const ALGORITHM = 'aes-256-gcm'

/**
 * Encrypts bank account details using AES-256-GCM.
 * @param {string} plaintext — The raw bank account number.
 * @returns {{ encrypted: string, iv: string, authTag: string }}
 */
export function encryptBankDetails(plaintext) {
  const key = Buffer.from(env.encryptionKey, 'hex')
  const iv = crypto.randomBytes(12) // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag,
  }
}

/**
 * Decrypts bank account details.
 * @param {string} encrypted — Hex-encoded ciphertext.
 * @param {string} ivHex — Hex-encoded IV.
 * @param {string} authTagHex — Hex-encoded GCM auth tag.
 * @returns {string} The decrypted plaintext.
 */
export function decryptBankDetails(encrypted, ivHex, authTagHex) {
  const key = Buffer.from(env.encryptionKey, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
