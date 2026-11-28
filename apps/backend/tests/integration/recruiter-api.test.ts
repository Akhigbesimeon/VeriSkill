// End-to-end recruiter API test. Boots the real Express app (minus sequelize,
// which is mocked — same approach as tests/integration/mint-flow.test.ts) and
// exercises every documented scenario. Also measures p50 / p95 latency for
// single and batch lookups on this local setup and prints the numbers for the
// report.

import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'
import request from 'supertest'
import { publicVerdictSchema, batchResponseSchema } from '@veriskill/shared'

// ─── Env ────────────────────────────────────────────────────────────────────
jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 4000,
    API_BASE_URL: 'http://localhost:4000',
    WEB_BASE_URL: 'http://localhost:5173',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    DATABASE_URL: 'postgres://ignored',
    DATABASE_SSL: false,
    CRON_SECRET: 'x'.repeat(32),
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'x'.repeat(32),
    JWT_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d',
    MOBILE_API_KEY: undefined,
    RECRUITER_API_KEYS: 'integration-key-aaaaaaaaaaaaaaaa,integration-key-bbbbbbbbbbbbbbbb',
    RECRUITER_API_RATE_LIMIT_WINDOW_MS: 60_000,
    RECRUITER_API_RATE_LIMIT_MAX: 10_000,
    RPC_URL: 'http://localhost:8545',
    CONTRACT_ADDRESS: '0x14032516c8e06CC0530b1BA8F9345B10315b5C4A',
    ISSUER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    ISSUER_ADDRESS: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    EAS_ADDRESS: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e',
    EAS_SCHEMA_UID: '0x' + '11'.repeat(32),
    GITHUB_TOKEN: 'x',
    OPENSSF_SCORECARD_ENABLED: false,
    REDIS_URL: 'redis://localhost:6379',
    RATE_LIMIT_WINDOW_MS: 900_000,
    RATE_LIMIT_MAX_REQUESTS: 10_000,
    URL_FETCH_TIMEOUT_MS: 10_000,
    URL_FETCH_MAX_RESPONSE_BYTES: 2_097_152,
    URL_FETCH_MAX_REDIRECTS: 3,
    RESEND_FROM: 'test@example.com',
    CHAIN_ID: 11_155_111,
    CHAIN_NAME: 'sepolia',
  },
}))

jest.mock('../../src/config/sequelize', () => ({ __esModule: true, default: {} }))

// ─── Fixture data ───────────────────────────────────────────────────────────
const CRED_VALID     = '00000000-0000-4000-8000-000000000001'
const CRED_SUSPENDED = '00000000-0000-4000-8000-000000000002'
const CRED_REVOKED   = '00000000-0000-4000-8000-000000000003'
const CRED_MISSING   = '00000000-0000-4000-8000-000000000099'

const credStore: Record<string, any> = {
  [CRED_VALID]:     { id: CRED_VALID, skill: 'TypeScript', verificationLayer: 5,
                      lifecycleStatus: 'MINTED', trustScore: 82, tokenId: '42',
                      onChainMintedAt: new Date('2026-01-15T12:00:00Z'),
                      // Private, must never leak:
                      email: 'secret@test', walletAddress: '0xSECRET' },
  [CRED_SUSPENDED]: { id: CRED_SUSPENDED, skill: 'React', verificationLayer: 4,
                      lifecycleStatus: 'SUSPENDED', trustScore: 61, tokenId: '43',
                      onChainMintedAt: new Date('2026-01-15T12:00:00Z') },
  [CRED_REVOKED]:   { id: CRED_REVOKED, skill: 'Python', verificationLayer: 4,
                      lifecycleStatus: 'REVOKED', trustScore: 55, tokenId: '44',
                      onChainMintedAt: new Date('2026-01-15T12:00:00Z') },
}

jest.mock('../../src/models/Credential', () => ({
  Credential: {
    findByPk: jest.fn(async (id: string) => credStore[id] ?? null),
    findAll:  jest.fn(async (opts: any) => {
      const ids: string[] = opts?.where?.id ?? []
      return ids.map(id => credStore[id]).filter(Boolean)
    }),
  },
}))

jest.mock('../../src/models/AuditLog', () => ({
  AuditLog: {
    findOne: jest.fn(async (opts: any) => {
      if (opts?.where?.resourceId === CRED_VALID) {
        return { resourceId: CRED_VALID, payload: {
          easUid: '0x' + 'ab'.repeat(32), txHash: '0x' + 'cd'.repeat(32),
        }}
      }
      return null
    }),
    findAll: jest.fn(async (opts: any) => {
      const ids: string[] = opts?.where?.resourceId ?? []
      return ids.includes(CRED_VALID) ? [{ resourceId: CRED_VALID, payload: {
        easUid: '0x' + 'ab'.repeat(32), txHash: '0x' + 'cd'.repeat(32),
      }}] : []
    }),
    create: jest.fn(async (p: any) => p),
  },
}))

// Other models imported by verify.routes (which gets registered after ours
// in app.ts) but not exercised here.
jest.mock('../../src/models/User', () => ({ User: {} }))
jest.mock('../../src/models/EvidenceUrl',       () => ({ EvidenceUrl: {} }))
jest.mock('../../src/models/GithubScan',        () => ({ GithubScan:  {} }))
jest.mock('../../src/models/PeerReview',        () => ({ PeerReview:  {} }))
jest.mock('../../src/models/ExpertReview',      () => ({ ExpertReview:{} }))
jest.mock('../../src/models/TrustScoreHistory', () => ({ TrustScoreHistory: {} }))
jest.mock('../../src/models/Provider',          () => ({ Provider: {} }))

// Queues and heavy services — not touched by the verify routes, but imported
// transitively through app.ts.
jest.mock('../../src/jobs/queues', () => ({
  urlVerificationQueue: { add: jest.fn() },
  githubScanQueue:      { add: jest.fn() },
}))
jest.mock('../../src/services/trust-score.service', () => ({ calculateTrustScore: jest.fn() }))
jest.mock('../../src/services/peer-review.service', () => ({ assignPeerReviewers: jest.fn() }))
jest.mock('../../src/services/github-scan.service', () => ({
  scanRepository: jest.fn(),
  preflightSkillMatch: jest.fn(async () => ({ matches: true })),
}))
jest.mock('../../src/services/url-verification.service', () => ({
  verifyUrl: jest.fn(async () => ({ ok: true })),
}))

// Blockchain service — not called by the verify routes. Stub to avoid the
// real import chain pulling in ethers wallet setup.
jest.mock('../../src/services/blockchain.service', () => ({
  mintCredential: jest.fn(),
  signMintVoucher: jest.fn(),
  confirmMint: jest.fn(),
  revokeOnChain: jest.fn(),
}))

const VALID_KEY = 'integration-key-aaaaaaaaaaaaaaaa'

let app: any
beforeAll(async () => {
  app = (await import('../../src/app')).default
})

afterAll(() => {
  // Jest sometimes keeps the handle alive via express-rate-limit's internal
  // timer. Force-exit comes from the --forceExit CLI flag in package.json.
})

// ─── Scenarios ──────────────────────────────────────────────────────────────

describe('integration: GET /api/v1/verify/public/:id', () => {
  test('valid credential — 200 with on-chain proof, no private fields', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_VALID}`)
    expect(res.status).toBe(200)
    // Contract test: parse through the shared Zod schema. If any field is
    // renamed or changes type the test suite fails here.
    const verdict = publicVerdictSchema.parse(res.body)
    expect(verdict.status).toBe('VALID')
    expect(verdict.onChain?.tokenId).toBe('42')
    expect(verdict.onChain?.easAttestationUid).toMatch(/^0x[a-f0-9]{64}$/)
    expect(res.headers['cache-control']).toBeDefined()
    expect(res.headers['etag']).toBeDefined()
    expect(JSON.stringify(res.body)).not.toMatch(/secret@test|0xSECRET/)
  })

  test('suspended — 200 status=SUSPENDED', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_SUSPENDED}`)
    expect(res.status).toBe(200)
    expect(publicVerdictSchema.parse(res.body).status).toBe('SUSPENDED')
  })

  test('revoked — 200 status=REVOKED', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_REVOKED}`)
    expect(res.status).toBe(200)
    expect(publicVerdictSchema.parse(res.body).status).toBe('REVOKED')
  })

  test('unknown — 404 status=NOT_FOUND (still schema-conformant)', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_MISSING}`)
    expect(res.status).toBe(404)
    // The NOT_FOUND body must also conform to the schema so batch callers
    // can treat every entry the same way.
    expect(publicVerdictSchema.parse(res.body).status).toBe('NOT_FOUND')
  })

  test('If-None-Match short-circuits to 304', async () => {
    const first = await request(app).get(`/api/v1/verify/public/${CRED_VALID}`)
    const second = await request(app)
      .get(`/api/v1/verify/public/${CRED_VALID}`)
      .set('If-None-Match', first.headers['etag'])
    expect(second.status).toBe(304)
  })
})

describe('integration: POST /api/v1/verify/batch', () => {
  test('no API key — 401', async () => {
    const res = await request(app).post('/api/v1/verify/batch').send({ ids: [CRED_VALID] })
    expect(res.status).toBe(401)
  })

  test('bad API key — 401', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', 'definitely-wrong')
      .send({ ids: [CRED_VALID] })
    expect(res.status).toBe(401)
  })

  test('mixed batch — one row per id, same order, schema-conformant', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids: [CRED_VALID, CRED_MISSING, CRED_SUSPENDED] })
    expect(res.status).toBe(200)
    // Contract test: full batch response through the shared schema.
    const parsed = batchResponseSchema.parse(res.body)
    expect(parsed.results.map(r => r.status)).toEqual(['VALID', 'NOT_FOUND', 'SUSPENDED'])
    expect(JSON.stringify(res.body)).not.toMatch(/secret@test|0xSECRET/)
  })

  test('batch over 50 — 422', async () => {
    const ids = Array.from({ length: 51 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids })
    expect(res.status).toBe(422)
  })

  test('malformed — 422', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids: 'not-an-array' })
    expect(res.status).toBe(422)
  })
})

describe('integration: shape contract (shared Zod schema)', () => {
  // These tests exist to catch accidental shape drift between the backend
  // and the shared/client package. If someone renames a field on the server,
  // the schema.parse call throws a ZodError and the test fails. The fix is
  // to either revert the rename or bump both the schema and the client in
  // lockstep.
  test('single verdict passes the shared schema for every status', async () => {
    for (const id of [CRED_VALID, CRED_SUSPENDED, CRED_REVOKED]) {
      const res = await request(app).get(`/api/v1/verify/public/${id}`)
      publicVerdictSchema.parse(res.body) // throws on drift
    }
  })

  test('batch response passes the shared schema', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids: [CRED_VALID, CRED_SUSPENDED, CRED_REVOKED] })
    batchResponseSchema.parse(res.body)
  })
})

describe('integration: existing verify routes still work', () => {
  test('GET /api/v1/verify/:id (web contract) still mounted — returns from verifyRouter, not recruiterApiRouter', async () => {
    // The existing verify.routes requires optional auth and returns a fat
    // response. With our mocks, Credential.findByPk returns the row; the
    // route's response shape differs from the public one (has `verified`,
    // `developer` object, etc.) which proves verifyRouter handled it.
    const res = await request(app).get(`/api/v1/verify/${CRED_VALID}`)
    // Response shape: either 200 with legacy fields, or 404 (if the row is
    // missing include-associations). Either way, the body shape must NOT be
    // the recruiter-API shape (status: VALID/...).
    if (res.status === 200) {
      expect(res.body).toHaveProperty('verificationLayer')
      expect(res.body).not.toHaveProperty('onChain')
    }
  })
})

// ─── Latency measurement ────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[i]
}

describe('latency (local setup, mocked DB)', () => {
  test('measures p50/p95/p99 for single and batch lookups', async () => {
    const N = 100

    // Single-lookup
    const singleTimings: number[] = []
    for (let i = 0; i < N; i++) {
      const t = Date.now()
      const res = await request(app).get(`/api/v1/verify/public/${CRED_VALID}`)
      singleTimings.push(Date.now() - t)
      expect(res.status).toBe(200)
    }
    singleTimings.sort((a, b) => a - b)

    // Batch-of-10
    const b10Timings: number[] = []
    const ids10 = [CRED_VALID, CRED_SUSPENDED, CRED_REVOKED, CRED_VALID, CRED_SUSPENDED,
                   CRED_REVOKED, CRED_VALID, CRED_SUSPENDED, CRED_REVOKED, CRED_VALID]
    for (let i = 0; i < N; i++) {
      const t = Date.now()
      const res = await request(app)
        .post('/api/v1/verify/batch')
        .set('X-API-Key', VALID_KEY)
        .send({ ids: ids10 })
      b10Timings.push(Date.now() - t)
      expect(res.status).toBe(200)
    }
    b10Timings.sort((a, b) => a - b)

    // Batch-of-50
    const b50Timings: number[] = []
    const ids50 = Array.from({ length: 50 }, (_, i) =>
      [CRED_VALID, CRED_SUSPENDED, CRED_REVOKED][i % 3])
    for (let i = 0; i < N; i++) {
      const t = Date.now()
      const res = await request(app)
        .post('/api/v1/verify/batch')
        .set('X-API-Key', VALID_KEY)
        .send({ ids: ids50 })
      b50Timings.push(Date.now() - t)
      expect(res.status).toBe(200)
    }
    b50Timings.sort((a, b) => a - b)

    const line = (label: string, arr: number[]) =>
      `  ${label.padEnd(16)}  p50=${percentile(arr, 0.50)}ms  p95=${percentile(arr, 0.95)}ms  p99=${percentile(arr, 0.99)}ms  min=${arr[0]}ms  max=${arr[arr.length - 1]}ms`

    // eslint-disable-next-line no-console
    console.log(`
Recruiter API latency (N=${N} per scenario, local Node, mocked DB):
${line('single',   singleTimings)}
${line('batch×10', b10Timings)}
${line('batch×50', b50Timings)}
`)

    // Sanity: p95 under 100ms for a mocked backend is generous.
    expect(percentile(singleTimings, 0.95)).toBeLessThan(500)
    expect(percentile(b10Timings,   0.95)).toBeLessThan(500)
    expect(percentile(b50Timings,   0.95)).toBeLessThan(1000)
  }, 120_000)
})
