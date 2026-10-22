import { beforeEach, describe, expect, jest, test } from '@jest/globals'

// Unit test for github-scan.service.
// - preflightSkillMatch: rejects mismatched repos BEFORE anything is persisted,
//   fail-closed on GitHub errors.
// - scanRepository: happy path still completes end-to-end.

jest.mock('../../src/config/env', () => ({
  env: { GITHUB_TOKEN: 'test', OPENSSF_SCORECARD_ENABLED: false },
}))

const graphqlFn = jest.fn<(...args: unknown[]) => Promise<unknown>>()
jest.mock('@octokit/graphql', () => ({
  __esModule: true,
  graphql: { defaults: () => graphqlFn },
}))

type MockScan = {
  id: string
  credentialId: string
  repoUrl: string
  update: jest.Mock<(patch: Record<string, unknown>) => Promise<MockScan>>
}
const scanStore: Record<string, MockScan> = {}

jest.mock('../../src/models/GithubScan', () => ({
  GithubScan: {
    findByPk: jest.fn(async (id: string) => scanStore[id] ?? null),
  },
}))

const calculateTrustScore = jest.fn(async () => ({ score: 0, layer: 1 }))
jest.mock('../../src/services/trust-score.service', () => ({
  calculateTrustScore,
}))

function makeScan(id: string, repoUrl = 'https://github.com/x/y'): MockScan {
  const s: MockScan = {
    id,
    credentialId: `cred-${id}`,
    repoUrl,
    update: jest.fn(async (patch: Record<string, unknown>) => {
      Object.assign(s, patch)
      return s
    }),
  }
  scanStore[id] = s
  return s
}

function repoWithLanguages(langs: Array<[string, number]>) {
  const totalSize = langs.reduce((a, [, s]) => a + s, 0)
  return {
    repository: {
      isFork: false,
      pushedAt: new Date().toISOString(),
      hasReadme: null,
      licenseInfo: null,
      workflows: null,
      rootEntries: { entries: [] },
      languages: {
        edges: langs.map(([name, size]) => ({ size, node: { name } })),
        totalSize,
      },
      defaultBranchRef: { target: { history: { totalCount: 1 } } },
    },
  }
}

describe('preflightSkillMatch', () => {
  beforeEach(() => { graphqlFn.mockReset() })

  test('returns a rejection message when no language overlaps the skill', async () => {
    graphqlFn.mockResolvedValueOnce(repoWithLanguages([['Python', 100]]))
    const { preflightSkillMatch } = await import('../../src/services/github-scan.service')
    const result = await preflightSkillMatch('x', 'y', 'JavaScript')
    expect(result).toMatch(/does not match/i)
  })

  test('returns null when the repo language matches the skill', async () => {
    graphqlFn.mockResolvedValueOnce(repoWithLanguages([['JavaScript', 100]]))
    const { preflightSkillMatch } = await import('../../src/services/github-scan.service')
    expect(await preflightSkillMatch('x', 'y', 'JavaScript')).toBeNull()
  })

  test('fails closed when GitHub throws (network/rate-limit)', async () => {
    graphqlFn.mockRejectedValueOnce(new Error('boom'))
    const { preflightSkillMatch } = await import('../../src/services/github-scan.service')
    const result = await preflightSkillMatch('x', 'y', 'JavaScript')
    expect(result).toMatch(/could not reach github/i)
  })

  test('fails closed when the repo is not found', async () => {
    graphqlFn.mockResolvedValueOnce({ repository: null })
    const { preflightSkillMatch } = await import('../../src/services/github-scan.service')
    const result = await preflightSkillMatch('x', 'y', 'JavaScript')
    expect(result).toMatch(/not found|not public/i)
  })
})

describe('scanRepository — happy path', () => {
  beforeEach(() => {
    for (const k of Object.keys(scanStore)) delete scanStore[k]
    graphqlFn.mockReset()
    calculateTrustScore.mockClear()
  })

  test('matching language completes and triggers trust-score recompute', async () => {
    const scan = makeScan('s1')
    graphqlFn.mockResolvedValueOnce(repoWithLanguages([['JavaScript', 100]]))

    const { scanRepository } = await import('../../src/services/github-scan.service')
    await scanRepository(scan.id, 'x', 'y', 'JavaScript')

    const patch = scan.update.mock.calls.at(-1)![0]
    expect(patch).toMatchObject({ scanStatus: 'COMPLETE' })
    expect(calculateTrustScore).toHaveBeenCalledWith(scan.credentialId)
  })
})
