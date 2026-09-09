const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword, verifyPassword } = require('../src/passwords')

test('passwords are hashed and verified', async () => {
  const hash = await hashPassword('strong-password')
  assert.notEqual(hash, 'strong-password')
  assert.equal(await verifyPassword('strong-password', hash), true)
  assert.equal(await verifyPassword('wrong-password', hash), false)
})

test('invalid stored hashes fail safely', async () => {
  assert.equal(await verifyPassword('password', 'invalid'), false)
})
