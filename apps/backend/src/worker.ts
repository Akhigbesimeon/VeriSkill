import './config/env' // Validate env vars before anything else
import { sequelize } from './models'
import { initQueues, closeQueues, registerWorkers } from './jobs/queues'

async function start() {
  await sequelize.authenticate()
  console.log('✓ Worker: database connected')

  await initQueues()
  registerWorkers()
  console.log('✓ Worker: queues initialised, processors registered')

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down worker...`)
    await closeQueues()
    await sequelize.close()
    console.log('Goodbye.')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))

  // Keep the event loop alive — Bull holds its own handles, but be explicit.
  setInterval(() => {}, 1 << 30)
}

start().catch(err => {
  console.error('Worker failed to start:', err)
  process.exit(1)
})
