import { Request, Response, NextFunction } from 'express'

/** Structured request logger — prints method, path, status, duration, requestId. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO'
    console.log(
      `[${level}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms rid=${req.requestId}`
    )
  })
  next()
}
