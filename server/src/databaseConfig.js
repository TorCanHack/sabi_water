function databaseConfig(env = process.env) {
  const discrete = Boolean(env.PGHOST)
  const options = discrete ? {
    host: env.PGHOST,
    port: Number(env.PGPORT) || 5432,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database: env.PGDATABASE || 'postgres',
  } : { connectionString: env.DATABASE_URL }
  const max = Number(env.DATABASE_POOL_MAX || 10)
  if (!Number.isInteger(max) || max < 1) throw new Error('DATABASE_POOL_MAX must be a positive integer.')
  if (env.DATABASE_SSL && !['true', 'false'].includes(env.DATABASE_SSL)) throw new Error('DATABASE_SSL must be true or false.')
  let url = null
  if (!discrete && env.DATABASE_URL) {
    try {
      url = new URL(env.DATABASE_URL)
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error()
    } catch {
      // URL parsing errors otherwise include the original credential-bearing input.
      throw new Error('DATABASE_URL must be a valid PostgreSQL URL.')
    }
  }
  const urlHasSSL = url && ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some(key => url.searchParams.has(key))
  if (urlHasSSL && (env.DATABASE_SSL || env.DATABASE_CA_CERT)) {
    throw new Error('Configure database TLS in the URL or DATABASE_SSL/DATABASE_CA_CERT, not both.')
  }
  if (!urlHasSSL) {
    const enabled = env.DATABASE_SSL ? env.DATABASE_SSL === 'true' : discrete
    if (env.DATABASE_CA_CERT && !enabled) throw new Error('DATABASE_CA_CERT requires DATABASE_SSL=true.')
    options.ssl = enabled ? {
      rejectUnauthorized: true,
      ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT.replace(/\\n/g, '\n') } : {}),
    } : false
  }
  return { ...options, max, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000 }
}

module.exports = { databaseConfig }
