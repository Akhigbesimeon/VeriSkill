import { Request, Response, NextFunction } from 'express'
import type { ZodSchema } from 'zod'

/** Base class for all API errors — carries HTTP status and optional field details. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') { super(404, message) }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') { super(401, message) }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') { super(403, message) }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) { super(422, message, details) }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(409, message) }
}

export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten() as Record<string, unknown>)
  }
  return result.data
}

/**
 * Global error handler middleware.
 * Must be the last middleware registered in app.ts.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
      requestId: req.requestId,
    })
  }

  // Unexpected error — log it and return a generic 500
  console.error(`[UNHANDLED ERROR] rid=${req.requestId}`, err)
  return res.status(500).json({
    error: 'Internal server error',
    requestId: req.requestId,
  })
}
