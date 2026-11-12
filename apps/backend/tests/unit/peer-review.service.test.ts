// Unit tests for peer-review.service (hashIp + assignPeerReviewers).
// Models, env and the MaxMind reader are mocked; no DB, no .env, no .mmdb file.

import crypto from 'crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { Op } from 'sequelize'

// ─── Mocks (hoisted) ────────────────────────────────────────────────────────
// Shared mock handles live at module level so they survive jest.isolateModules.

type AnyFn = (...args: any[]) => any

const mockUserFindAll = jest.fn<AnyFn>()
const mockPeerCount = jest.fn<AnyFn>()
const mockPeerFindAll = jest.fn<AnyFn>()
const mockPeerCreate = jest.fn<AnyFn>()
const mockReaderOpen = jest.fn<AnyFn>()
const mockAsnLookup = jest.fn<AnyFn>()
const mockEnv: { MAXMIND_ASN_DB_PATH?: string } = {}

// The real env module validates process.env and exits the process on failure.
jest.mock('../../src/config/env', () => ({ env: mockEnv }))

// The service only uses Op.ne / Op.or. Sequelize defines these as Symbol.for(name).
jest.mock('sequelize', () => ({ Op: { ne: Symbol.for('ne'), or: Symbol.for('or') } }))

jest.mock('@maxmind/geoip2-node', () => ({ Reader: { open: mockReaderOpen } }))

jest.mock('../../src/models/User', () => ({ User: { findAll: mockUserFindAll } }))

jest.mock('../../src/models/PeerReview', () => ({
  PeerReview: { count: mockPeerCount, findAll: mockPeerFindAll, create: mockPeerCreate },
}))

// ─── Helpers ────────────────────────────────────────────────────────────────

// The service keeps the ASN reader in module-level state, so every test gets a
// fresh copy of it. ValidationError is loaded from the same registry so
// instanceof checks line up.
function loadService() {
  let svc: typeof import('../../src/services/peer-review.service')
  let errors: typeof import('../../src/middleware/error.middleware')
  jest.isolateModules(() => {
    svc = require('../../src/services/peer-review.service')
    errors = require('../../src/middleware/error.middleware')
  })
  return { ...svc!, ValidationError: errors!.ValidationError }
}

type Service = ReturnType<typeof loadService>

const user = (id: string) => ({ id })
let internalUsers: Array<{ id: string }>
let externalUsers: Array<{ id: string }>
let existingCount: number
let alreadyAssigned: Array<{ reviewerId: string }>
let priorMutualCountByReviewer: Record<string, number>

let service: Service

// The first load pulls the module graph through ts-jest. Do it once up front
// so that cost is not charged to the first test's 5s timeout.
beforeAll(() => {
  loadService()
}, 60_000)

beforeEach(() => {
  jest.resetAllMocks()
  internalUsers = []
  externalUsers = []
  existingCount = 0
  alreadyAssigned = []
  priorMutualCountByReviewer = {}
  delete mockEnv.MAXMIND_ASN_DB_PATH

  mockUserFindAll.mockImplementation(async ({ where }: any) =>
    where.role === 'developer' ? internalUsers : externalUsers
  )
  // PeerReview.count is used twice: "how many reviews exist for this credential"
  // (plain where) and the prior-mutual-review lookup (has `include`).
  mockPeerCount.mockImplementation(async (opts: any) =>
    opts.include ? (priorMutualCountByReviewer[opts.where.reviewerId] ?? 0) : existingCount
  )
  mockPeerFindAll.mockImplementation(async () => alreadyAssigned)
  mockPeerCreate.mockImplementation(async (row: any) => ({ ...row }))

  service = loadService()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

// ─── hashIp ─────────────────────────────────────────────────────────────────

describe('hashIp', () => {
  test('returns the SHA-256 hex digest of the IP', () => {
    const ip = '203.0.113.7'
    const expected = crypto.createHash('sha256').update(ip).digest('hex')

    expect(service.hashIp(ip)).toBe(expected)
    expect(service.hashIp(ip)).toMatch(/^[0-9a-f]{64}$/)
  })

  test('is deterministic and distinguishes different IPs', () => {
    expect(service.hashIp('198.51.100.1')).toBe(service.hashIp('198.51.100.1'))
    expect(service.hashIp('198.51.100.1')).not.toBe(service.hashIp('198.51.100.2'))
  })

  test('never contains the raw IP', () => {
    expect(service.hashIp('198.51.100.1')).not.toContain('198.51.100.1')
  })
})

// ─── assignPeerReviewers — guards ───────────────────────────────────────────

describe('assignPeerReviewers — guards', () => {
  test('rejects credentials below Layer 3 with a 422 ValidationError and touches no data', async () => {
    const err = await service.assignPeerReviewers('cred-1', 'dev-1', 2).catch(e => e)

    expect(err).toBeInstanceOf(service.ValidationError)
    expect(err.statusCode).toBe(422)
    expect(err.message).toMatch(/Layer 3/)
    expect(mockPeerCount).not.toHaveBeenCalled()
    expect(mockUserFindAll).not.toHaveBeenCalled()
    expect(mockPeerCreate).not.toHaveBeenCalled()
  })

  test('accepts Layer 3 and above', async () => {
    internalUsers = [user('rev-1')]

    await expect(service.assignPeerReviewers('cred-1', 'dev-1', 3)).resolves.toHaveLength(1)
    await expect(service.assignPeerReviewers('cred-1', 'dev-1', 4)).resolves.toHaveLength(1)
  })

  test('returns [] without looking up candidates when 2+ reviews already exist', async () => {
    existingCount = 2
    internalUsers = [user('rev-1')]

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(result).toEqual([])
    expect(mockUserFindAll).not.toHaveBeenCalled()
    expect(mockPeerCreate).not.toHaveBeenCalled()
  })

  test('still assigns when exactly 1 review already exists', async () => {
    existingCount = 1
    internalUsers = [user('rev-1')]

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(result).toHaveLength(1)
  })
})

// ─── assignPeerReviewers — reviewer selection ───────────────────────────────

describe('assignPeerReviewers — reviewer selection', () => {
  test('queries active developers (excluding the owner) and active peer_verifiers', async () => {
    await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(mockUserFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: 'developer', id: { [Op.ne]: 'dev-1' }, isActive: true },
      limit: 10,
      order: [['createdAt', 'ASC']],
    }))
    expect(mockUserFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: 'peer_verifier', isActive: true },
      limit: 3,
    }))
  })

  test('tags internal and external reviewers, internal first', async () => {
    internalUsers = [user('int-1')]
    externalUsers = [user('ext-1'), user('ext-2')]

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(result.map(r => [r.reviewerId, r.reviewerType])).toEqual([
      ['int-1', 'internal'],
      ['ext-1', 'external'],
      ['ext-2', 'external'],
    ])
  })

  test('caps the assignment at 3 reviewers', async () => {
    internalUsers = [user('int-1'), user('int-2'), user('int-3'), user('int-4')]
    externalUsers = [user('ext-1')]

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(result.map(r => r.reviewerId)).toEqual(['int-1', 'int-2', 'int-3'])
    expect(mockPeerCreate).toHaveBeenCalledTimes(3)
  })

  test('skips reviewers already assigned to this credential', async () => {
    internalUsers = [user('int-1'), user('int-2')]
    externalUsers = [user('ext-1')]
    alreadyAssigned = [{ reviewerId: 'int-1' }]

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(result.map(r => r.reviewerId)).toEqual(['int-2', 'ext-1'])
    expect(mockPeerFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { credentialId: 'cred-1' } }))
  })

  test('returns [] and creates nothing when there are no candidates', async () => {
    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(result).toEqual([])
    expect(mockPeerCreate).not.toHaveBeenCalled()
  })

  test('returns [] when every candidate is already assigned', async () => {
    internalUsers = [user('int-1')]
    alreadyAssigned = [{ reviewerId: 'int-1' }]

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(result).toEqual([])
    expect(mockPeerCreate).not.toHaveBeenCalled()
  })
})

// ─── assignPeerReviewers — created rows ─────────────────────────────────────

describe('assignPeerReviewers — created rows', () => {
  test('creates ASSIGNED rows with empty decision, null IP hash and a 7-day expiry', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    const now = new Date('2026-11-12T10:00:00.000Z')
    jest.setSystemTime(now)
    internalUsers = [user('int-1')]

    const [row] = await service.assignPeerReviewers('cred-9', 'dev-1', 3)

    const expectedExpiry = new Date(now)
    expectedExpiry.setDate(expectedExpiry.getDate() + 7)

    expect(row).toEqual({
      credentialId: 'cred-9',
      reviewerId: 'int-1',
      reviewerType: 'internal',
      status: 'ASSIGNED',
      decision: null,
      rationale: null,
      weightFactor: 1,
      reviewerIpHash: null,
      assignedAt: now,
      expiresAt: expectedExpiry,
    })
  })

  test('propagates a failure from PeerReview.create', async () => {
    internalUsers = [user('int-1')]
    mockPeerCreate.mockRejectedValueOnce(new Error('unique constraint'))

    await expect(service.assignPeerReviewers('cred-1', 'dev-1', 3)).rejects.toThrow('unique constraint')
  })
})

// ─── assignPeerReviewers — anti-collusion weight ────────────────────────────

describe('assignPeerReviewers — weight factor', () => {
  test('weight is 1.0 for a reviewer with no prior reviews of this developer', async () => {
    internalUsers = [user('int-1')]

    const [row] = await service.assignPeerReviewers('cred-1', 'dev-1', 3, service.hashIp('203.0.113.7'))

    expect(row.weightFactor).toBe(1.0)
  })

  test('weight stays 1.0 with exactly one prior submitted review of this developer', async () => {
    internalUsers = [user('int-1')]
    priorMutualCountByReviewer = { 'int-1': 1 }

    const [row] = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(row.weightFactor).toBe(1.0)
  })

  test('weight drops to 0.5 after more than one prior submitted review of this developer', async () => {
    internalUsers = [user('int-1'), user('int-2')]
    priorMutualCountByReviewer = { 'int-1': 2, 'int-2': 0 }

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(Object.fromEntries(result.map(r => [r.reviewerId, r.weightFactor]))).toEqual({
      'int-1': 0.5,
      'int-2': 1.0,
    })
  })

  test('counts only SUBMITTED reviews by this reviewer on this developer\'s credentials', async () => {
    internalUsers = [user('int-1')]

    await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(mockPeerCount).toHaveBeenCalledWith({
      where: {
        reviewerId: 'int-1',
        [Op.or]: [{ '$credential.developer_id$': 'dev-1' }],
        status: 'SUBMITTED',
      },
      include: [{ association: 'credential', attributes: ['developer_id'] }],
    })
  })
})

// ─── assignPeerReviewers — ASN lookup ───────────────────────────────────────

describe('assignPeerReviewers — ASN lookup', () => {
  beforeEach(() => {
    internalUsers = [user('int-1')]
    mockReaderOpen.mockResolvedValue({ asn: mockAsnLookup })
    mockAsnLookup.mockReturnValue({ autonomousSystemNumber: 64500 })
  })

  test('does not open the ASN database when no developer IP is supplied', async () => {
    mockEnv.MAXMIND_ASN_DB_PATH = '/data/GeoLite2-ASN.mmdb'

    await service.assignPeerReviewers('cred-1', 'dev-1', 3)

    expect(mockReaderOpen).not.toHaveBeenCalled()
  })

  test('skips ASN checks quietly when MAXMIND_ASN_DB_PATH is not configured', async () => {
    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3, undefined, '203.0.113.7')

    expect(result).toHaveLength(1)
    expect(mockReaderOpen).not.toHaveBeenCalled()
  })

  test('opens the configured database and looks up the developer IP', async () => {
    mockEnv.MAXMIND_ASN_DB_PATH = '/data/GeoLite2-ASN.mmdb'

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3, undefined, '203.0.113.7')

    expect(result).toHaveLength(1)
    expect(mockReaderOpen).toHaveBeenCalledWith('/data/GeoLite2-ASN.mmdb')
    expect(mockAsnLookup).toHaveBeenCalledWith('203.0.113.7')
  })

  test('loads the database once and reuses it across calls', async () => {
    mockEnv.MAXMIND_ASN_DB_PATH = '/data/GeoLite2-ASN.mmdb'

    await service.assignPeerReviewers('cred-1', 'dev-1', 3, undefined, '203.0.113.7')
    await service.assignPeerReviewers('cred-2', 'dev-1', 3, undefined, '203.0.113.7')

    expect(mockReaderOpen).toHaveBeenCalledTimes(1)
    expect(mockAsnLookup).toHaveBeenCalledTimes(2)
  })

  test('a failed database load warns, still assigns, and is not retried', async () => {
    mockEnv.MAXMIND_ASN_DB_PATH = '/data/missing.mmdb'
    mockReaderOpen.mockRejectedValue(new Error('ENOENT'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    const first = await service.assignPeerReviewers('cred-1', 'dev-1', 3, undefined, '203.0.113.7')
    const second = await service.assignPeerReviewers('cred-2', 'dev-1', 3, undefined, '203.0.113.7')

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ASN DB load failed'), 'ENOENT')
    expect(mockReaderOpen).toHaveBeenCalledTimes(1)
  })

  test('an IP the database cannot resolve does not break assignment', async () => {
    mockEnv.MAXMIND_ASN_DB_PATH = '/data/GeoLite2-ASN.mmdb'
    mockAsnLookup.mockImplementation(() => { throw new Error('address not found') })

    const result = await service.assignPeerReviewers('cred-1', 'dev-1', 3, undefined, '10.0.0.1')

    expect(result).toHaveLength(1)
    expect(result[0].weightFactor).toBe(1.0)
  })
})
