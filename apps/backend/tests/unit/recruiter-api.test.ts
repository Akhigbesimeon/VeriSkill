// Unit tests for the recruiter API: public GET, API-key middleware, batch
// POST. Models and env are mocked; no DB, no network. Also enforces the
// privacy contract — the response must never leak off-chain personal data.

import express from 'express'
import { beforeAll, describe, expect, jest, test } from '@jest/globals'
import request from 'supertest'
import { publicVerdictSchema, batchResponseSchema } from '@veriskill/shared'

// ─── Env (must mock before any import that reads it) ────────────────────────
// Two valid keys; one is in-range (16+ chars) and one is deliberately short
// to exercise the "ignore accidentally-short entries" branch.
jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    RECRUITER_API_KEYS: 'key-aaaaaaaaaaaaaaaa-1,bad,key-bbbbbbbbbbbbbbbb-2',
    RECRUITER_API_RATE_LIMIT_WINDOW_MS: 60_000,
    RECRUITER_API_RATE_LIMIT_MAX: 10_000, // high enough that it never trips here
    CHAIN_ID: 11_155_111,
    CHAIN_NAME: 'sepolia',
    CONTRACT_ADDRESS: '0x14032516c8e06CC0530b1BA8F9345B10315b5C4A',
  },
}))

jest.mock('../../src/config/sequelize', () => ({ __esModule: true, default: {} }))

// ─── Model fixtures ─────────────────────────────────────────────────────────
const CRED_VALID     = '00000000-0000-4000-8000-000000000001'
const CRED_SUSPENDED = '00000000-0000-4000-8000-000000000002'
const CRED_REVOKED   = '00000000-0000-4000-8000-000000000003'
const CRED_DRAFT     = '00000000-0000-4000-8000-000000000004'
const CRED_MISSING   = '00000000-0000-4000-8000-000000000099'

const credStore: Record<string, any> = {
  [CRED_VALID]:     { id: CRED_VALID,     skill: 'TypeScript', verificationLayer: 5,
                      lifecycleStatus: 'MINTED',    trustScore: 82, tokenId: '42',
                      commitHash: '0x' + '11'.repeat(32),
                      onChainMintedAt: new Date('2026-01-15T12:00:00Z'),
                      // Private, must never leak:
                      email: 'secret@example.com', walletAddress: '0xSECRETWALLET',
                    },
  [CRED_SUSPENDED]: { id: CRED_SUSPENDED, skill: 'React', verificationLayer: 4,
                      lifecycleStatus: 'SUSPENDED', trustScore: 61, tokenId: '43',
                      onChainMintedAt: new Date('2026-01-15T12:00:00Z') },
  [CRED_REVOKED]:   { id: CRED_REVOKED,   skill: 'Python', verificationLayer: 4,
                      lifecycleStatus: 'REVOKED',   trustScore: 55, tokenId: '44',
                      onChainMintedAt: new Date('2026-01-15T12:00:00Z') },
  [CRED_DRAFT]:     { id: CRED_DRAFT,     skill: 'Go', verificationLayer: 1,
                      lifecycleStatus: 'DRAFT',     trustScore: 0,  tokenId: null,
                      onChainMintedAt: null },
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

// For the VALID credential, pretend a `credential.minted` audit log exists
// with easUid + txHash. The other credentials have no audit log so those
// fields fall to null.
jest.mock('../../src/models/AuditLog', () => ({
  AuditLog: {
    findOne: jest.fn(async (opts: any) => {
      if (opts?.where?.resourceId === CRED_VALID) {
        return { resourceId: CRED_VALID, payload: {
          easUid: '0x' + 'ab'.repeat(32),
          txHash: '0x' + 'cd'.repeat(32),
        }}
      }
      return null
    }),
    findAll: jest.fn(async (opts: any) => {
      const ids: string[] = opts?.where?.resourceId ?? []
      return ids.includes(CRED_VALID) ? [{ resourceId: CRED_VALID, payload: {
        easUid: '0x' + 'ab'.repeat(32),
        txHash: '0x' + 'cd'.repeat(32),
      }}] : []
    }),
  },
}))

// ─── Build the app with the recruiter router ────────────────────────────────

let app: express.Express

beforeAll(async () => {
  const { recruiterApiRouter } = await import('../../src/routes/recruiter-api.routes')
  const { errorHandler }       = await import('../../src/middleware/error.middleware')
  app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => { req.requestId = 'test-req'; next() })
  app.use('/api/v1/verify', recruiterApiRouter)
  app.use(errorHandler)
})

// ─── Tests ──────────────────────────────────────────────────────────────────

const VALID_KEY   = 'key-aaaaaaaaaaaaaaaa-1'
const INVALID_KEY = 'nope-key-definitely-not-real'

const FORBIDDEN_FIELDS = ['email', 'walletAddress', 'reviewerId', 'evidenceUrl', 'ipHash']

function assertNoPrivateFields(obj: unknown, path = '$'): void {
  if (obj === null || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoPrivateFields(v, `${path}[${i}]`))
    return
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (FORBIDDEN_FIELDS.includes(k)) {
      throw new Error(`Forbidden field "${k}" leaked at ${path}`)
    }
    assertNoPrivateFields(v, `${path}.${k}`)
  }
}

describe('GET /api/v1/verify/public/:id', () => {
  test('returns VALID verdict with on-chain proof — passes shared schema', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_VALID}`)
    expect(res.status).toBe(200)
    // Parse through the shared Zod schema. Any field drift fails here.
    const verdict = publicVerdictSchema.parse(res.body)
    expect(verdict.status).toBe('VALID')
    expect(verdict.skill).toBe('TypeScript')
    expect(verdict.layer).toBe(5)
    expect(verdict.trustScore).toBe(82)
    expect(verdict.onChain).toMatchObject({
      chain: 'sepolia', chainId: 11_155_111,
      contractAddress: '0x14032516c8e06CC0530b1BA8F9345B10315b5C4A',
      tokenId: '42',
      easAttestationUid: '0x' + 'ab'.repeat(32),
      txHash: '0x' + 'cd'.repeat(32),
    })
    expect(verdict.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/)
    expect(res.headers['etag']).toMatch(/^W\//)
    assertNoPrivateFields(res.body)
  })

  test('returns SUSPENDED verdict', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_SUSPENDED}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('SUSPENDED')
    expect(res.body.skill).toBe('React')
    assertNoPrivateFields(res.body)
  })

  test('returns REVOKED verdict', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_REVOKED}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('REVOKED')
  })

  test('returns NOT_FOUND (404 body) for unknown credential', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_MISSING}`)
    expect(res.status).toBe(404)
    expect(res.body.status).toBe('NOT_FOUND')
    expect(res.body.skill).toBeNull()
  })

  test('returns NOT_FOUND for unminted (DRAFT) credential — never leaks state machine', async () => {
    const res = await request(app).get(`/api/v1/verify/public/${CRED_DRAFT}`)
    expect(res.status).toBe(404)
    expect(res.body.status).toBe('NOT_FOUND')
  })

  test('returns 400 for a non-UUID id', async () => {
    const res = await request(app).get('/api/v1/verify/public/not-a-uuid')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not a valid credential/i)
  })

  test('honors If-None-Match (returns 304 for repeated poll)', async () => {
    const first = await request(app).get(`/api/v1/verify/public/${CRED_VALID}`)
    expect(first.status).toBe(200)
    const etag = first.headers['etag']
    const second = await request(app)
      .get(`/api/v1/verify/public/${CRED_VALID}`)
      .set('If-None-Match', etag)
    expect(second.status).toBe(304)
  })
})

describe('POST /api/v1/verify/batch', () => {
  test('rejects missing API key', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .send({ ids: [CRED_VALID] })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/api key/i)
  })

  test('rejects invalid API key', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', INVALID_KEY)
      .send({ ids: [CRED_VALID] })
    expect(res.status).toBe(401)
  })

  test('returns one verdict per id, in input order, passes batch schema', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids: [CRED_VALID, CRED_MISSING, CRED_SUSPENDED, CRED_REVOKED, CRED_DRAFT] })
    expect(res.status).toBe(200)
    const parsed = batchResponseSchema.parse(res.body)
    expect(parsed.results).toHaveLength(5)
    expect(parsed.results.map(r => r.status)).toEqual([
      'VALID', 'NOT_FOUND', 'SUSPENDED', 'REVOKED', 'NOT_FOUND',
    ])
    assertNoPrivateFields(res.body)
  })

  test('rejects empty batch', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids: [] })
    expect(res.status).toBe(422)
  })

  test('rejects batch over 50 ids', async () => {
    const ids = Array.from({ length: 51 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids })
    expect(res.status).toBe(422)
  })

  test('rejects malformed input (not an array)', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids: 'nope' })
    expect(res.status).toBe(422)
  })

  test('rejects id that is not a UUID', async () => {
    const res = await request(app)
      .post('/api/v1/verify/batch')
      .set('X-API-Key', VALID_KEY)
      .send({ ids: ['not-a-uuid'] })
    expect(res.status).toBe(422)
  })
})

describe('rate limiting (scoped per API key)', () => {
  test('trips 429 after RECRUITER_API_RATE_LIMIT_MAX requests', async () => {
    // Build an isolated app with MAX=3 so we can trip the limiter without
    // affecting the tests above. Reset modules so a fresh middleware is
    // created with the overridden env.
    jest.resetModules()
    jest.doMock('../../src/config/env', () => ({
      env: {
        NODE_ENV: 'test',
        RECRUITER_API_KEYS: 'key-aaaaaaaaaaaaaaaa-1',
        RECRUITER_API_RATE_LIMIT_WINDOW_MS: 60_000,
        RECRUITER_API_RATE_LIMIT_MAX: 3,
        CHAIN_ID: 11_155_111,
        CHAIN_NAME: 'sepolia',
        CONTRACT_ADDRESS: '0x14032516c8e06CC0530b1BA8F9345B10315b5C4A',
      },
    }))
    jest.doMock('../../src/config/sequelize', () => ({ __esModule: true, default: {} }))
    jest.doMock('../../src/models/Credential', () => ({
      Credential: { findByPk: jest.fn(async () => credStore[CRED_VALID]) },
    }))
    jest.doMock('../../src/models/AuditLog', () => ({
      AuditLog: { findOne: jest.fn(async () => null) },
    }))
    const { recruiterApiRouter } = await import('../../src/routes/recruiter-api.routes')
    const { errorHandler }       = await import('../../src/middleware/error.middleware')
    const localApp = express()
    localApp.use(express.json())
    localApp.use((req: any, _res, next) => { req.requestId = 'test-req'; next() })
    localApp.use('/api/v1/verify', recruiterApiRouter)
    localApp.use(errorHandler)

    const r1 = await request(localApp).get(`/api/v1/verify/public/${CRED_VALID}`)
    const r2 = await request(localApp).get(`/api/v1/verify/public/${CRED_VALID}`)
    const r3 = await request(localApp).get(`/api/v1/verify/public/${CRED_VALID}`)
    const r4 = await request(localApp).get(`/api/v1/verify/public/${CRED_VALID}`)
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200])
    expect(r4.status).toBe(429)
  })
})
