const { initializeDatabase, pool } = require('../src/database')
const { logError } = require('../src/runtime')

initializeDatabase()
  .then(() => console.log('Sabi Water shared Supabase schema is up to date.'))
  .catch((error) => {
    logError('migration_failed', error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
