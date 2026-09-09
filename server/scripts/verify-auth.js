const assert = require('node:assert/strict')
const { pool } = require('../src/database')

const apiUrl = process.env.API_URL || 'http://127.0.0.1:3000'
const email = `sabi-auth-check-${Date.now()}@example.com`
const password = `Verification-${Date.now()}!`

async function request(path, { cookie, body, method = 'GET' } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { response, data: response.status === 204 ? null : await response.json() }
}

async function verify() {
  try {
    const signup = await request('/api/auth/signup', {
      method: 'POST',
      body: { name: 'Account Test', email, password },
    })
    assert.equal(signup.response.status, 201)
    assert.equal(signup.data.user.email, email)
    const signupCookie = signup.response.headers.getSetCookie()[0].split(';')[0]
    assert.match(signupCookie, /^sabi_session=/)

    const me = await request('/api/auth/me', { cookie: signupCookie })
    assert.equal(me.response.status, 200)
    assert.equal(me.data.user.name, 'Account Test')

    const signout = await request('/api/auth/signout', { method: 'POST', cookie: signupCookie })
    assert.equal(signout.response.status, 204)

    const expired = await request('/api/auth/me', { cookie: signupCookie })
    assert.equal(expired.response.status, 401)

    const signin = await request('/api/auth/signin', {
      method: 'POST',
      body: { email, password },
    })
    assert.equal(signin.response.status, 200)
    assert.match(signin.response.headers.getSetCookie()[0], /^sabi_session=/)
    console.log('Signup, session restore, signout, and signin all passed.')
  } finally {
    await pool.query('DELETE FROM customer_users WHERE email = $1', [email])
    await pool.end()
  }
}

verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
