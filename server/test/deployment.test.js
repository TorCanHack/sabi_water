const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { runtimeConfig, logError, installShutdown } = require('../src/runtime')
const { databaseConfig } = require('../src/databaseConfig')

test('deployment configuration supports direct hosting and trusted production proxies', () => {
  assert.equal(runtimeConfig({}).trustProxy, 0)
  assert.deepEqual(runtimeConfig({ NODE_ENV: 'production', FRONTEND_URL: 'https://shop.example.com', PORT: '10000', TRUST_PROXY: '1' }), {
    host: '0.0.0.0', port: 10000, trustProxy: 1, origins: ['https://shop.example.com'],
  })
  assert.throws(() => runtimeConfig({ NODE_ENV: 'production' }), /HTTPS/)
  assert.throws(() => runtimeConfig({ FRONTEND_URL: 'https://shop.example.com/' }), /origins/)
  assert.throws(() => runtimeConfig({ PORT: 'invalid' }), /PORT/)
  assert.throws(() => runtimeConfig({ TRUST_PROXY: 'true' }), /TRUST_PROXY/)
})

test('database TLS verifies certificates and rejects conflicting configuration', () => {
  const config = databaseConfig({ DATABASE_URL: 'postgresql://localhost/sabi', DATABASE_SSL: 'true', DATABASE_CA_CERT: 'first\\nsecond' })
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: 'first\nsecond' })
  assert.equal(config.connectionTimeoutMillis, 3000)
  assert.equal(databaseConfig({ PGHOST: 'localhost', DATABASE_SSL: 'false' }).ssl, false)
  assert.equal(databaseConfig({ PGHOST: 'database.example.com' }).ssl.rejectUnauthorized, true)
  assert.equal(databaseConfig({ DATABASE_URL: 'postgresql://localhost/sabi?sslmode=verify-full' }).ssl, undefined)
  assert.throws(() => databaseConfig({ DATABASE_URL: 'postgresql://localhost/sabi?sslmode=require', DATABASE_SSL: 'true' }), /not both/)
  assert.throws(() => databaseConfig({ DATABASE_POOL_MAX: '-1' }), /positive/)
  assert.throws(() => databaseConfig({ DATABASE_URL: 'private-password' }), error => {
    assert.equal(error.message, 'DATABASE_URL must be a valid PostgreSQL URL.')
    assert.equal(error.input, undefined)
    return true
  })
})

test('error logging never serializes sensitive error details', t => {
  const entries = []
  t.mock.method(console, 'error', line => entries.push(JSON.parse(line)))
  logError('request_failed', { code: '23505', message: 'secret-password', detail: 'customer@example.com', stack: 'secret-stack' })
  logError('startup_failed', { code: 'postgres://private:password@database' })
  assert.deepEqual(entries, [
    { event: 'request_failed', code: '23505' },
    { event: 'startup_failed', code: 'UNEXPECTED_ERROR' },
  ])
})

test('shutdown waits for requests and refund work before closing the pool, once', async () => {
  const events = []
  let finishRequest, finishWorker
  const server = { close(callback) { events.push('stop-http'); finishRequest = callback } }
  const pool = { async end() { events.push('close-db') } }
  const worker = () => { events.push('stop-worker'); return new Promise(resolve => { finishWorker = resolve }) }
  const processRef = new EventEmitter()
  processRef.exit = () => assert.fail('Shutdown should not force exit')
  const shutdown = installShutdown(server, pool, worker, processRef)
  processRef.emit('SIGTERM')
  const pending = shutdown()
  assert.equal(shutdown(), pending)
  finishRequest()
  await Promise.resolve()
  assert.deepEqual(events, ['stop-http', 'stop-worker'])
  finishWorker()
  await pending
  assert.deepEqual(events, ['stop-http', 'stop-worker', 'close-db'])
  assert.equal(processRef.exitCode, 0)
  assert.equal(processRef.listenerCount('SIGTERM'), 0)
})

test('shutdown forces a failed exit when work cannot drain', async () => {
  const processRef = new EventEmitter()
  const exit = new Promise(resolve => { processRef.exit = resolve })
  let finish
  const shutdown = installShutdown({ close(callback) { finish = callback } }, { async end() {} }, async () => {}, processRef, 10)
  const pending = shutdown()
  assert.equal(await exit, 1)
  finish()
  await pending
})

test('health endpoint reports database readiness without exposing failures', async t => {
  const { app } = require('../server')
  const { pool } = require('../src/database')
  let fails = false
  t.mock.method(pool, 'query', async () => {
    if (fails) throw new Error('private database details')
    return { rows: [{ '?column?': 1 }] }
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  let response = await fetch(`${url}/api/health`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { ok: true })
  fails = true
  response = await fetch(`${url}/api/health`)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { ok: false })
})
