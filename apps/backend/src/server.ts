import './config/env' // Validate env vars before anything else
import app from './app'
import { env } from './config/env'
import { sequelize } from './models'
import { initQueues, closeQueues, registerWorkers } from './jobs/queues'

async function start() {
  // Verify database connection
  await sequelize.authenticate()
  console.log('✓ Database connected')

  // Initialise job queues (BullMQ + Redis). On Render free tier we also run
  // the workers in-process to avoid the paid Background Worker service — the
  // separate worker.ts is kept so this can be split out later without a rewrite.
  await initQueues()
  registerWorkers()
  console.log('✓ Job queues initialised + workers registered (in-process)')

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
