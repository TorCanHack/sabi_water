const { initializeDatabase, pool } = require('../src/database')

initializeDatabase()
  .then(() => console.log('Sabi Water shared Supabase schema is up to date.'))
  .catch((error) => {
    console.error('Could not apply the Sabi Water schema:', error.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
