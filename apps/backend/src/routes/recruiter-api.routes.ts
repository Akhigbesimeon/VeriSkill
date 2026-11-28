import { Router } from 'express'
import { createHash } from 'crypto'
import { z } from 'zod'
import { buildVerdict, buildVerdictBatch } from '../services/public-verify.service'
import { requireApiKey, recruiterApiRateLimit } from '../middleware/api-key.middleware'
import { validate } from '../middleware/error.middleware'

/**
 * Recruiter / ATS API.
 *
 * Mounted at /api/v1/verify BEFORE the existing verifyRouter so these routes
 * match before the dynamic GET /:id catchall. The existing web/mobile verify
 * contract is unchanged.
 *
 * Two endpoints:
 *   GET  /api/v1/verify/public/:id  — public, no auth, cache-friendly, used
 *                                     by shareable QR links and CV URLs.
 *   POST /api/v1/verify/batch       — API-key auth, up to 50 ids per call,
 *                                     for ATS integrations.
 */

export const recruiterApiRouter = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Short cache window. The data behind this endpoint changes on suspend /
// revoke / layer update, so we can't cache aggressively. 30s balances
// handling an ATS burst and surfacing status changes quickly.
const PUBLIC_CACHE_SECONDS = 30

const BatchBodySchema = z.object({
  ids: z.array(z.string().regex(UUID_RE, 'Not a valid credential ID'))
        .min(1, 'At least one id required')
        .max(50, 'At most 50 ids per request'),
})

// ETag over the full response body so a repeated poll that gets identical
// data can short-circuit at the client. Weak ETag (W/) because the verifiedAt
// field is a timestamp and will change every second — we strip it before
// hashing so the ETag reflects the verdict, not the clock.
function etagFor(payload: unknown): string {
  const stable = JSON.stringify(payload, (key, value) => key === 'verifiedAt' ? undefined : value)
  const digest = createHash('sha256').update(stable).digest('hex').slice(0, 24)
  return `W/"${digest}"`
}

/**
 * GET /api/v1/verify/public/:id
 *
 * Public, unauthenticated, cache-friendly single-credential verdict.
 * Returns 200 even when the credential is unknown or unminted, with
 * status=NOT_FOUND in the body — ATS integrations get a uniform shape
 * regardless of outcome. 404 is still used for a truly invalid id (bad UUID).
 */
recruiterApiRouter.get('/public/:id', recruiterApiRateLimit, async (req, res, next) => {
  try {
    const id = req.params.id
    if (!UUID_RE.test(id)) {
      return res.status(400).json({
        error: 'Not a valid credential ID',
        requestId: req.requestId,
      })
    }

    const verdict = await buildVerdict(id)
    const etag = etagFor(verdict)

    res.setHeader('Cache-Control', `public, max-age=${PUBLIC_CACHE_SECONDS}`)
    res.setHeader('ETag', etag)

    // Standard conditional-GET: client sends If-None-Match from a previous
    // response, we return 304 with no body if the content is identical.
    if (req.header('if-none-match') === etag) {
      return res.status(304).end()
    }

    const status = verdict.status === 'NOT_FOUND' ? 404 : 200
    return res.status(status).json(verdict)
  } catch (err) { next(err) }
})

/**
 * POST /api/v1/verify/batch
 *
 * API-key-authenticated bulk lookup. Body: { ids: string[] (1..50) }.
 * Response: { results: PublicVerdict[] } in the same order as the input ids.
 */
recruiterApiRouter.post(
  '/batch',
  requireApiKey,
  recruiterApiRateLimit,
  async (req, res, next) => {
    try {
      const { ids } = validate(BatchBodySchema, req.body)

      // Deduplicate inside a single request so a mistake on the caller's end
      // doesn't amplify DB work, but preserve order on the way out.
      const unique = Array.from(new Set(ids))
      const verdicts = await buildVerdictBatch(unique)
      const byId = new Map(verdicts.map(v => [v.id, v]))

      const results = ids.map(id => byId.get(id)!)
      const body = { results }
      const etag = etagFor(body)

      res.setHeader('Cache-Control', `private, max-age=${PUBLIC_CACHE_SECONDS}`)
      res.setHeader('ETag', etag)
      if (req.header('if-none-match') === etag) return res.status(304).end()

      return res.json(body)
    } catch (err) { next(err) }
  },
)
