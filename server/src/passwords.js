const crypto = require('node:crypto')
const { promisify } = require('node:util')

const scrypt = promisify(crypto.scrypt)
const KEY_LENGTH = 64

async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`
}

async function verifyPassword(password, storedHash) {
  try {
    const [algorithm, saltHex, keyHex] = String(storedHash).split(':')
    if (algorithm !== 'scrypt' || !saltHex || !keyHex) return false
    const storedKey = Buffer.from(keyHex, 'hex')
    const suppliedKey = await scrypt(password, Buffer.from(saltHex, 'hex'), storedKey.length)
    return storedKey.length === suppliedKey.length && crypto.timingSafeEqual(storedKey, suppliedKey)
  } catch {
    return false
  }
}

module.exports = { hashPassword, verifyPassword }
