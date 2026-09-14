const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { updateProfile } = require('../src/profile')

test('profile validation rejects malformed details before accessing the database', async () => {
  const pool = { connect() { assert.fail('Invalid input must not reach the database') } }
  for (const details of [null, {}, { name: [], email: 'a@example.com' }, { name: 'A', email: 'a@example.com' }, { name: ' '.repeat(10), email: 'a@example.com' }, { name: 'a'.repeat(101), email: 'a@example.com' }, { name: 'Test User', email: 'invalid' }, { name: 'Test User', email: 'a'.repeat(250) + '@example.com' }]) {
    await assert.rejects(updateProfile(pool, '1', details), { status: 400 })
  }
})

test('profile changes persist, require email reauthentication, and preserve account ownership', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  const { pool, initializeDatabase } = require('../src/database')
  const { app } = require('../server')
  await initializeDatabase()
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const ids = []
  const password = 'profile-test-password'
  const email = `${crypto.randomUUID()}@example.com`
  const newEmail = `${crypto.randomUUID()}@example.com`
  async function request(path, method = 'GET', cookie, body, origin) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, data: await response.json().catch(() => null), cookie: response.headers.getSetCookie()[0]?.split(';')[0] }
  }
  async function signup(address) {
    const result = await request('/auth/signup', 'POST', null, { name: 'Profile Test', email: address, password })
    assert.equal(result.status, 201)
    ids.push(result.data.user.id)
    return result
  }
  try {
    const one = await signup(email)
    const two = await signup(`${crypto.randomUUID()}@example.com`)
    const details = { name: 'Updated Name', email: newEmail }
    assert.equal((await request('/customer/profile', 'PATCH', null, details)).status, 401)
    assert.equal((await request('/customer/profile', 'PATCH', 'sabi_session=expired', details)).status, 401)
    assert.equal((await request('/customer/profile', 'PATCH', one.cookie, details, 'https://untrusted.example')).status, 403)
    assert.equal((await request('/customer/profile', 'PATCH', one.cookie, { ...details, email })).status, 200, 'Name changes do not require a password')
    for (const currentPassword of [undefined, 'wrong-password', 'a'.repeat(129)]) {
      const result = await request('/customer/profile', 'PATCH', one.cookie, { ...details, currentPassword })
      assert.equal(result.status, currentPassword === 'wrong-password' ? 403 : 400)
      assert.equal((await request('/auth/me', 'GET', one.cookie)).data.user.email, email)
    }
    const duplicate = await request('/customer/profile', 'PATCH', one.cookie, { ...details, name: 'Must Roll Back', email: two.data.user.email, currentPassword: password })
    assert.equal(duplicate.status, 409)
    assert.equal((await request('/auth/me', 'GET', one.cookie)).data.user.name, 'Updated Name')
    await pool.query('INSERT INTO customer_carts(user_id, items) VALUES($1, $2)', [ids[0], { cway: 2 }])
    const saved = await request('/customer/profile', 'PATCH', one.cookie, { name: '  Updated   Person  ', email: `  ${newEmail.toUpperCase()}  `, currentPassword: password, userId: ids[1] })
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.data.user, { id: ids[0], name: 'Updated Person', email: newEmail })
    assert.deepEqual((await request('/auth/me', 'GET', one.cookie)).data.user, saved.data.user)
    assert.deepEqual((await request('/auth/me', 'GET', two.cookie)).data.user, two.data.user, 'Client-supplied IDs cannot modify another account')
    assert.deepEqual((await request('/customer/cart', 'GET', one.cookie)).data.cart, { cway: 2 })
    assert.equal((await request('/auth/signin', 'POST', null, { email, password })).status, 401)
    assert.equal((await request('/auth/signin', 'POST', null, { email: newEmail, password })).status, 200)
  } finally {
    await pool.query('DELETE FROM customer_users WHERE id = ANY($1::bigint[])', [ids])
    await new Promise(resolve => server.close(resolve))
    await pool.end()
  }
})
