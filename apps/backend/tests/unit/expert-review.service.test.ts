// Unit test for expert-review.service.assignExpertReviewers.
import { beforeEach, describe, expect, jest, test } from '@jest/globals'

type UserRow = { id: string; role: string; isActive: boolean; createdAt: Date }
type ExpertRow = { credentialId: string; expertId: string; status: string }

const userStore: UserRow[] = []
const expertStore: ExpertRow[] = []

jest.mock('../../src/models/User', () => ({
  User: {
    findAll: jest.fn(async ({ where, limit }: { where: Record<string, unknown>; limit: number }) => {
      const roleWanted = where.role
      const excludeId = (where.id as { [k: symbol]: string } | undefined)
      // Op.ne is a symbol key — the mock pulls the first symbol value as the excluded id.
      const excl = excludeId ? Object.getOwnPropertySymbols(excludeId).map(s => (excludeId as any)[s])[0] : undefined
      const isActiveWanted = where.isActive
      return userStore
        .filter(u => u.role === roleWanted)
        .filter(u => u.isActive === isActiveWanted)
        .filter(u => (excl ? u.id !== excl : true))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
    }),
  },
}))

jest.mock('../../src/models/ExpertReview', () => ({
  ExpertReview: {
    count: jest.fn(async ({ where }: { where: { credentialId: string } }) =>
      expertStore.filter(r => r.credentialId === where.credentialId).length
    ),
    create: jest.fn(async (row: ExpertRow) => {
      expertStore.push(row)
      return row
    }),
  },
}))

import { assignExpertReviewers } from '../../src/services/expert-review.service'

describe('assignExpertReviewers', () => {
  beforeEach(() => {
    userStore.length = 0
    expertStore.length = 0
  })

  test('creates one row per expert_verifier, excludes the developer and non-experts', async () => {
    userStore.push(
      { id: 'dev-1',  role: 'developer',       isActive: true, createdAt: new Date('2026-01-01') },
      { id: 'exp-a',  role: 'expert_verifier', isActive: true, createdAt: new Date('2026-01-02') },
      { id: 'exp-b',  role: 'expert_verifier', isActive: true, createdAt: new Date('2026-01-03') },
      { id: 'peer-1', role: 'peer_verifier',   isActive: true, createdAt: new Date('2026-01-04') },
    )

    const created = await assignExpertReviewers('cred-1', 'dev-1')

    expect(created).toHaveLength(2)
    expect(created.map(r => r.expertId).sort()).toEqual(['exp-a', 'exp-b'])
    expect(created.every(r => r.status === 'ASSIGNED')).toBe(true)
  })

  test('idempotent — second call creates nothing when any expert review exists', async () => {
    userStore.push(
      { id: 'exp-a', role: 'expert_verifier', isActive: true, createdAt: new Date('2026-01-02') },
    )

    const first  = await assignExpertReviewers('cred-2', 'dev-1')
    const second = await assignExpertReviewers('cred-2', 'dev-1')

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(0)
  })

  test('no experts available — returns empty, no rows created', async () => {
    userStore.push(
      { id: 'peer-1', role: 'peer_verifier', isActive: true, createdAt: new Date('2026-01-01') },
    )

    const created = await assignExpertReviewers('cred-3', 'dev-1')

    expect(created).toEqual([])
    expect(expertStore).toHaveLength(0)
  })
})
