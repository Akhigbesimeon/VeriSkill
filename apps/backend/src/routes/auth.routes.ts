import { Router, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import * as AuthService from '../services/auth.service'
import { authenticate } from '../middleware/auth.middleware'
import { ForbiddenError, validate } from '../middleware/error.middleware'
import { env } from '../config/env'

export const authRouter = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many attempts — wait 15 minutes.' },
})

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
  displayName: z.string().min(2).max(100),
  role: z.enum(['developer', 'recruiter']), // Only these two can self-register
  walletType: z.enum(['managed', 'self_custody']),
  walletAddress: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

const walletSchema = z.object({
  walletType: z.enum(['managed', 'self_custody']),
  walletAddress: z.string().optional(),
})

const profileSchema = z.object({
  displayName:   z.string().min(2).max(100).optional(),
  bio:           z.string().max(2000).nullable().optional(),
  location:      z.string().max(100).nullable().optional(),
  company:       z.string().max(100).nullable().optional(),
  externalLinks: z.array(z.string().url()).max(10).optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8).max(200),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  token:       z.string().min(1),
  newPassword: z.string().min(8).max(200),
})

const isMobile = (req: Request) =>
  !!env.MOBILE_API_KEY && req.get('x-mobile-key') === env.MOBILE_API_KEY

/** POST /api/v1/auth/register */
authRouter.post('/register', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validate(registerSchema, req.body)
    if (isMobile(req) && input.role !== 'recruiter') {
      throw new ForbiddenError('The mobile app is for recruiters only')
    }
    if (!isMobile(req) && input.role !== 'developer') {
      throw new ForbiddenError('Web self-registration is for developers only')
    }
    const result = await AuthService.register(input)
    res.status(201).json(result)
  } catch (err) { next(err) }
})

/** POST /api/v1/auth/login */
authRouter.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = validate(loginSchema, req.body)
    const result = await AuthService.login(email, password)
    if (isMobile(req) && result.user.role !== 'recruiter') {
      throw new ForbiddenError('The mobile app is for recruiters only')
    }
    res.json(result)
  } catch (err) { next(err) }
})

/** POST /api/v1/auth/forgot-password — always returns ok to avoid user enumeration. */
authRouter.post('/forgot-password', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = validate(forgotPasswordSchema, req.body)
    await AuthService.requestPasswordReset(email)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

/** POST /api/v1/auth/reset-password */
authRouter.post('/reset-password', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = validate(resetPasswordSchema, req.body)
    await AuthService.resetPassword(token, newPassword)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

/** POST /api/v1/auth/refresh */
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = validate(refreshSchema, req.body)
    const result = await AuthService.refreshTokens(refreshToken)
    res.json(result)
  } catch (err) { next(err) }
})

/** GET /api/v1/auth/me */
authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await AuthService.getProfile(req.user!.id)
    res.json({ user })
  } catch (err) { next(err) }
})

/** PATCH /api/v1/auth/me */
authRouter.patch('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validate(profileSchema, req.body)
    const user = await AuthService.updateProfile(req.user!.id, input)
    res.json({ user })
  } catch (err) { next(err) }
})

/** PATCH /api/v1/auth/me/wallet */
authRouter.patch('/me/wallet', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validate(walletSchema, req.body)
    const user = await AuthService.updateWallet(req.user!.id, input.walletType, input.walletAddress)
    res.json({ user })
  } catch (err) { next(err) }
})

/** POST /api/v1/auth/change-password */
authRouter.post('/change-password', authLimiter, authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = validate(changePasswordSchema, req.body)
    await AuthService.changePassword(req.user!.id, currentPassword, newPassword)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

/** DELETE /api/v1/auth/me — soft delete (sets is_active=false). */
authRouter.delete('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AuthService.deactivateAccount(req.user!.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
})
