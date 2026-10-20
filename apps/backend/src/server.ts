import './config/env' // Validate env vars before anything else
import app from './app'
import { env } from './config/env'
import { sequelize } from './models'
import { initQueues, closeQueues } from './jobs/queues'

async function start() {
  // Verify database connection
  await sequelize.authenticate()
  console.log('✓ Database connected')

  // Initialise job queues (Bull + Redis)
  await initQueues()
  console.log('✓ Job queues initialised')

  const server = app.listen(env.PORT, () => {
    console.log(`✓ VeriSkill API running on port ${env.PORT} [${env.NODE_ENV}]`)
  })

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully...`)
    server.close(async () => {
      await closeQueues()
      await sequelize.close()
      console.log('Goodbye.')
      process.exit(0)
    })
    // Force-exit after 10 s if close takes too long
    setTimeout(() => process.exit(1), 10_000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
