import { createHash, timingSafeEqual } from 'crypto'
import { Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { env } from '../config/env'
import { UnauthorizedError } from './error.middleware'

/**
 * API key auth for the recruiter / ATS endpoints.
 *
 * Keys live plaintext in RECRUITER_API_KEYS (comma-separated) and are hashed
 * once at module load. The incoming X-API-Key header is hashed with the same
 * algorithm, then compared with timingSafeEqual on the raw bytes. We never
 * log the key or the hash, and we never surface which key matched.
 *
 * Why plaintext in env, hash in memory: the operator needs the plaintext to
 * hand to ATS vendors. Keeping only hashes in env would prevent re-issuing
 * a key without rotating it. The tradeoff is standard for shared-secret
 * API keys.
 */

const HASH_ALGO = 'sha256'

function hashKey(raw: string): Buffer {
  return createHash(HASH_ALGO).update(raw).digest()
}

// Short, non-reversible identifier for the key — used only as the rate-limit
// bucket name in req.apiKeyId. First 12 hex chars of the digest.
function keyIdFor(hash: Buffer): string {
  return hash.toString('hex').slice(0, 12)
}

// Parse and hash the configured keys once. An empty / missing env var means
// no keys are enabled and batch endpoints will reject all callers.
const configuredHashes: Buffer[] = (env.RECRUITER_API_KEYS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(s => s.length >= 16) // guard against accidental empty/short entries
  .map(hashKey)

function matchKey(providedRaw: string | undefined): Buffer | null {
  if (!providedRaw || configuredHashes.length === 0) return null
  const providedHash = hashKey(providedRaw)
  for (const h of configuredHashes) {
    if (h.length === providedHash.length && timingSafeEqual(h, providedHash)) {
      return providedHash
    }
  }
  return null
}

/**
 * Require a valid X-API-Key. Attaches req.apiKeyId (short hash id) for the
 * per-key rate limiter to scope on.
 */
export function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  const provided = req.header('x-api-key')
  const matched = matchKey(provided)
  if (!matched) {
    throw new UnauthorizedError('Invalid or missing API key')
  }
  req.apiKeyId = keyIdFor(matched)
  next()
}

/**
 * Rate limiter scoped per API key (when present) or per IP (for the public
 * unauthenticated GET). Fixed window; configurable via env.
 */
export const recruiterApiRateLimit = rateLimit({
  windowMs: env.RECRUITER_API_RATE_LIMIT_WINDOW_MS,
  max:      env.RECRUITER_API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.apiKeyId ?? `ip:${req.ip ?? 'unknown'}`,
  message: { error: 'Rate limit exceeded for recruiter API — try again later.' },
})

