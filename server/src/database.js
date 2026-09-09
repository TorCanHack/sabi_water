const fs = require('node:fs/promises')
const path = require('node:path')
const { Pool } = require('pg')

const usesDiscreteConfig = Boolean(process.env.PGHOST)
const pool = new Pool(usesDiscreteConfig ? {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
} : {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

async function initializeDatabase() {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error('DATABASE_URL or Supabase PGHOST/PGUSER/PGPASSWORD settings are required.')
  }
  const schema = await fs.readFile(path.join(__dirname, '..', 'schema.sql'), 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Multiple API instances (or test workers) may start at the same time.
    await client.query('SELECT pg_advisory_xact_lock(73120491)')
    await client.query(schema)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

module.exports = { pool, initializeDatabase }
