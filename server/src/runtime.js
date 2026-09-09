function runtimeConfig(env = process.env) {
  const port = Number(env.PORT || 3000)
  const trustProxy = Number(env.TRUST_PROXY || 0)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.')
  if (!Number.isInteger(trustProxy) || trustProxy < 0) throw new Error('TRUST_PROXY must be a nonnegative proxy hop count.')
  const origins = (env.FRONTEND_URL || 'http://localhost:5174').split(',').map(value => value.trim())
  for (const origin of origins) {
    const url = new URL(origin)
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('FRONTEND_URL must contain exact HTTP(S) origins without trailing slashes.')
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production FRONTEND_URL must use HTTPS.')
  }
  return { port, host: env.HOST || '0.0.0.0', trustProxy, origins }
}

// Deliberately omit messages, stacks, SQL details, URLs, and request bodies.
function logError(event, error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code) ? error.code : 'UNEXPECTED_ERROR'
  console.error(JSON.stringify({ event, code }))
}

function installShutdown(server, pool, stopWorker, processRef = process, timeoutMs = 25000) {
  let pending
  const shutdown = () => {
    if (pending) return pending
    pending = (async () => {
      const deadline = setTimeout(() => processRef.exit(1), timeoutMs)
      try {
        await Promise.all([
          new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
          stopWorker(),
        ])
        await pool.end()
        processRef.exitCode = 0
      } catch (error) {
        logError('shutdown_failed', error)
        processRef.exit(1)
      } finally {
        clearTimeout(deadline)
        processRef.removeListener('SIGTERM', shutdown)
        processRef.removeListener('SIGINT', shutdown)
      }
    })()
    return pending
  }
  processRef.on('SIGTERM', shutdown)
  processRef.on('SIGINT', shutdown)
  return shutdown
}

module.exports = { runtimeConfig, logError, installShutdown }
