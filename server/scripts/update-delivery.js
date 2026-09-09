const { pool, initializeDatabase } = require('../src/database')
const { updateDelivery } = require('../src/delivery')

async function main() {
  const [reference, status] = process.argv.slice(2)
  if (!reference || !status) throw new Error('Usage: npm run delivery:update -- <order-reference> "Getting a dispatch|Out for delivery|Delivered"')
  await initializeDatabase()
  const order = await updateDelivery(pool, reference, status)
  console.log(`${order.reference}: ${order.status}`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => pool.end())
