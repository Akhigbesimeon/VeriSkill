import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'
import { env } from '../config/env'
import { UnauthorizedError } from './error.middleware'
import { UserRole } from '../models/User'

export interface JwtPayload {
  sub: string      // user ID
  email: string
  role: UserRole
  type: 'access' | 'refresh'
}

/** Verifies the Bearer JWT and attaches the decoded user to req.user. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Bearer token required')

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    if (payload.type !== 'access') throw new UnauthorizedError('Invalid token type')
    req.user = { id: payload.sub, email: payload.email, role: payload.role }
    next()
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid or expired token')
  }
}

/** Attach req.user if a valid Bearer access token is present. Never throws. */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next()
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as JwtPayload
    if (payload.type === 'access') {
      req.user = { id: payload.sub, email: payload.email, role: payload.role }
    }
  } catch { /* ignore — anonymous */ }
  next()
}

/** Role guard — must be used after authenticate(). */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError()
    if (!roles.includes(req.user.role)) {
      throw new UnauthorizedError('Insufficient permissions for this action')
    }
    next()
  }
}
