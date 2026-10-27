import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Op } from 'sequelize'
import { env } from '../config/env'
import { User, UserRole, WalletType } from '../models/User'
import { ConflictError, UnauthorizedError, ValidationError } from '../middleware/error.middleware'
import { JwtPayload } from '../middleware/auth.middleware'
import { sendPasswordResetEmail } from './mailer.service'

const SALT_ROUNDS = 12

function assertNotIssuerWallet(address: string | null | undefined) {
  if (address && address.toLowerCase() === env.ISSUER_ADDRESS.toLowerCase()) {
    throw new ValidationError('Cannot use the issuer wallet as your personal wallet')
  }
}

function signToken(user: User, kind: 'access' | 'refresh'): string {
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, type: kind }
  const secret  = kind === 'access' ? env.JWT_SECRET         : env.JWT_REFRESH_SECRET
  const expires = kind === 'access' ? env.JWT_EXPIRES_IN     : env.JWT_REFRESH_EXPIRES_IN
  return jwt.sign(payload, secret, { expiresIn: expires as jwt.SignOptions['expiresIn'] })
}

function issueTokens(user: User) {
  return { accessToken: signToken(user, 'access'), refreshToken: signToken(user, 'refresh') }
}

export interface RegisterInput {
  email: string
  password: string
  displayName: string
  role: UserRole
  walletType: WalletType
  walletAddress?: string   // Required when walletType === 'self_custody'
}

export async function register(input: RegisterInput) {
  if (input.walletType === 'self_custody' && !/^0x[a-fA-F0-9]{40}$/.test(input.walletAddress ?? '')) {
    throw new ValidationError('A valid EVM wallet address is required for self-custody wallets')
  }
  assertNotIssuerWallet(input.walletAddress)

  const existing = await User.findOne({ where: { email: input.email.toLowerCase() } })
  if (existing) throw new ConflictError('An account with this email already exists')

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)

  const user = await User.create({
    email: input.email.toLowerCase(),
    passwordHash,
    role: input.role,
    displayName: input.displayName,
    walletType: input.walletType,
    walletAddress: input.walletAddress ?? null,
    bio: null,
    location: null,
    externalLinks: [],
  })

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      walletType: user.walletType,
      walletAddress: user.walletAddress,
    },
    ...issueTokens(user),
  }
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ where: { email: email.toLowerCase() } })
  if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials')

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new UnauthorizedError('Invalid credentials')

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      walletType: user.walletType,
      walletAddress: user.walletAddress,
    },
    ...issueTokens(user),
  }
}

function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    bio: user.bio,
    location: user.location,
    company: user.company,
    externalLinks: user.externalLinks ?? [],
    walletType: user.walletType,
    walletAddress: user.walletAddress,
    createdAt: user.createdAt,
  }
}

export async function getProfile(userId: string) {
  const user = await User.findByPk(userId)
  if (!user || !user.isActive) throw new UnauthorizedError('Account not found or inactive')
  return serializeUser(user)
}

export interface UpdateProfileInput {
  displayName?: string
  bio?: string | null
  location?: string | null
  company?: string | null
  externalLinks?: string[]
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await User.findByPk(userId)
  if (!user || !user.isActive) throw new UnauthorizedError('Account not found or inactive')

  if (input.displayName !== undefined) {
    const name = input.displayName.trim()
    if (name.length < 2 || name.length > 100) {
      throw new ValidationError('Display name must be between 2 and 100 characters')
    }
    user.displayName = name
  }
  if (input.bio !== undefined)      user.bio      = input.bio === null ? null : input.bio.trim() || null
  if (input.location !== undefined) user.location = input.location === null ? null : input.location.trim() || null
  if (input.company !== undefined)  user.company  = input.company === null ? null : input.company.trim() || null
  if (input.externalLinks !== undefined) {
    const cleaned = input.externalLinks.map(l => l.trim()).filter(Boolean)
    for (const link of cleaned) {
      try { new URL(link) } catch { throw new ValidationError(`Invalid URL: ${link}`) }
    }
    user.externalLinks = cleaned
  }

  await user.save()
  return serializeUser(user)
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await User.findByPk(userId)
  if (!user || !user.isActive) throw new UnauthorizedError('Account not found or inactive')

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) throw new UnauthorizedError('Current password is incorrect')

  if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new ValidationError('New password must be 8+ characters with an uppercase letter and a number')
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  await user.save()
}

export async function deactivateAccount(userId: string) {
  const user = await User.findByPk(userId)
  if (!user || !user.isActive) throw new UnauthorizedError('Account not found or inactive')
  user.isActive = false
  await user.save()
}

export async function updateWallet(
  userId: string,
  walletType: WalletType,
  walletAddress?: string | null,
) {
  if (walletType === 'self_custody' && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress ?? '')) {
    throw new ValidationError('A valid EVM wallet address is required for self-custody wallets')
  }
  assertNotIssuerWallet(walletAddress)

  const user = await User.findByPk(userId)
  if (!user || !user.isActive) throw new UnauthorizedError('Account not found or inactive')

  user.walletType = walletType
  user.walletAddress = walletType === 'self_custody' ? walletAddress! : null
  await user.save()

  return serializeUser(user)
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Always resolves — never leaks whether the email exists. */
export async function requestPasswordReset(email: string) {
  const user = await User.findOne({ where: { email: email.toLowerCase() } })
  if (!user || !user.isActive) return

  const token = crypto.randomBytes(32).toString('hex')
  user.passwordResetTokenHash = hashResetToken(token)
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)
  await user.save()

  const link = `${env.WEB_BASE_URL}/reset-password?token=${token}`
  await sendPasswordResetEmail(user.email, link)
}

export async function resetPassword(token: string, newPassword: string) {
  if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new ValidationError('New password must be 8+ characters with an uppercase letter and a number')
  }

  const user = await User.findOne({
    where: {
      passwordResetTokenHash: hashResetToken(token),
      passwordResetExpiresAt: { [Op.gt]: new Date() },
    },
  })
  if (!user || !user.isActive) throw new UnauthorizedError('Reset link is invalid or has expired')

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  user.passwordResetTokenHash = null
  user.passwordResetExpiresAt = null
  await user.save()
}

export async function refreshTokens(refreshToken: string) {
  let payload: JwtPayload
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  if (payload.type !== 'refresh') throw new UnauthorizedError('Invalid token type')

  const user = await User.findByPk(payload.sub)
  if (!user || !user.isActive) throw new UnauthorizedError('Account not found or inactive')

  return issueTokens(user)
}
