const { verifyPassword } = require('./passwords')

function profileError(status, message) {
  return Object.assign(new Error(message), { status })
}

async function updateProfile(pool, userId, details) {
  if (typeof details?.name !== 'string' || typeof details?.email !== 'string') {
    throw profileError(400, 'Enter your full name and email address.')
  }
  const name = details.name.trim().replace(/\s+/g, ' ')
  const email = details.email.trim().toLowerCase()
  if (name.length < 2 || name.length > 100) throw profileError(400, 'Use a full name between 2 and 100 characters.')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw profileError(400, 'Enter a valid email address.')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT id, email, password_hash FROM customer_users WHERE id = $1 FOR UPDATE', [userId])
    const user = result.rows[0]
    if (!user) throw profileError(401, 'Your account is unavailable. Please sign in again.')
    if (email !== user.email) {
      const password = details.currentPassword
      if (typeof password !== 'string' || !password.length || password.length > 128) throw profileError(400, 'Enter your current password to change your email address.')
      if (!(await verifyPassword(password, user.password_hash))) throw profileError(403, 'Your current password is incorrect.')
    }
    const saved = await client.query('UPDATE customer_users SET full_name = $2, email = $3, updated_at = NOW() WHERE id = $1 RETURNING id, full_name, email', [userId, name, email])
    await client.query('COMMIT')
    return { id: String(saved.rows[0].id), name: saved.rows[0].full_name, email: saved.rows[0].email }
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') throw profileError(409, 'An account already uses this email address. Choose another email.')
    throw error
  } finally {
    client.release()
  }
}

module.exports = { updateProfile }
