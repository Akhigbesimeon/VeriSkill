import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { v4 as uuidv4 } from 'uuid'
import { env } from './config/env'
import { errorHandler } from './middleware/error.middleware'
import { requestLogger } from './middleware/logger.middleware'
import { authRouter } from './routes/auth.routes'
import { credentialRouter } from './routes/credential.routes'
import { peerReviewRouter } from './routes/peer-review.routes'
import { expertReviewRouter } from './routes/expert-review.routes'
import { adminRouter } from './routes/admin.routes'
import { internalRouter } from './routes/internal.routes'
import { verifyRouter } from './routes/verify.routes'

const app = express()

// Trust Render's load balancer so req.ip is the real client IP
app.set('trust proxy', 1)

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet())

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}))

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))

// ─── Request ID ───────────────────────────────────────────────────────────────
// Attach a unique ID to every request for tracing through logs and audit records
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.requestId = (req.headers['x-request-id'] as string) ?? uuidv4()
  next()
})

// ─── Request logger ──────────────────────────────────────────────────────────
app.use(requestLogger)

// ─── Health check ─────────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    })
  })

  // ─── Global rate limiter ──────────────────────────────────────────────────────
  // Tighter per-route limits are applied in auth routes (login/register)
  app.use(rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — try again later.' },
  }))

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth',         authRouter)
app.use('/api/v1/credentials',  credentialRouter)
app.use('/api/v1/peer-reviews', peerReviewRouter)
app.use('/api/v1/expert-reviews', expertReviewRouter)
app.use('/api/v1/admin',        adminRouter)
app.use('/api/v1/verify',       verifyRouter)

// ─── Internal (pg_cron webhooks — ADR-016) ────────────────────────────────────
// Not exposed via /api/v1 and not documented in docs/API.md on purpose.
// Guarded by CRON_SECRET inside the router.
app.use('/internal',            internalRouter)

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' })
})

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler)

export default app
