import type { graphql as GraphqlNS } from '@octokit/graphql' with { 'resolution-mode': 'import' }
import https from 'https'
import { env } from '../config/env'
import { GithubScan } from '../models/GithubScan'
import { ApprovedSkill } from '../models/Credential'
import { calculateTrustScore } from './trust-score.service'

// @octokit/graphql@8 is ESM-only; import dynamically so this CJS module compiles.
type GhClient = ReturnType<typeof GraphqlNS.defaults>
let ghClient: Promise<GhClient> | null = null
function gh(): Promise<GhClient> {
  return ghClient ??= import('@octokit/graphql').then(m => m.graphql.defaults({
    headers: { authorization: `token ${env.GITHUB_TOKEN}` },
  }))
}

// Phase 0 Section 7 — language-to-skill mapping.
const SKILL_LANGUAGE_MAP: Record<ApprovedSkill, string[]> = {
  'JavaScript': ['JavaScript', 'TypeScript'],
  'TypeScript': ['TypeScript', 'JavaScript'],
  'Python':     ['Python'],
  'Java':       ['Java', 'Kotlin'],
  'Kotlin':     ['Kotlin', 'Java'],
  'Swift':      ['Swift'],
  'Go':         ['Go'],
  'Rust':       ['Rust'],
  'C':          ['C'],
  'C#':         ['C#'],
  'PHP':        ['PHP'],
  'Ruby':       ['Ruby'],
  'Solidity':   ['Solidity'],
  'HTML':       ['HTML'],
  'CSS':        ['CSS', 'SCSS', 'Less'],
  // shortcut: GitHub reports dialects (PLpgSQL/TSQL/PLSQL) rather than plain SQL,
  // so pure-SQL repos may show weak match. Upgrade with a .sql file-detection
  // pass if false negatives matter.
  'SQL':        ['PLpgSQL', 'TSQL', 'PLSQL', 'SQL'],
  'React':      ['JavaScript', 'TypeScript', 'JSX', 'TSX'],
  'Node.js':    ['JavaScript', 'TypeScript'],
  'Git':        [],
  'Docker':     ['Dockerfile', 'HCL'],
  'Kubernetes': ['YAML', 'HCL'],
  'AWS':        ['HCL', 'YAML'],
  'Terraform':  ['HCL'],
}

// One GraphQL query replaces 5 REST calls.
interface RepoGraph {
  repository: {
    isFork: boolean
    pushedAt: string | null
    hasReadme: { oid: string } | null
    licenseInfo: { key: string } | null
    workflows: { entries: { name: string }[] | null } | null
    rootEntries: { entries: { name: string; type: string }[] | null } | null
    languages: {
      edges: { size: number; node: { name: string } }[]
      totalSize: number
    } | null
    defaultBranchRef: {
      target: {
        history: { totalCount: number }
      } | null
    } | null
  } | null
}

const REPO_QUERY = /* GraphQL */ `
  query RepoScan($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      isFork
      pushedAt
      hasReadme: object(expression: "HEAD:README.md") { ... on Blob { oid } }
      licenseInfo { key }
      workflows: object(expression: "HEAD:.github/workflows") {
        ... on Tree { entries { name } }
      }
      rootEntries: object(expression: "HEAD:") {
        ... on Tree { entries { name type } }
      }
      languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
        edges { size node { name } }
        totalSize
      }
      defaultBranchRef {
        target { ... on Commit { history { totalCount } } }
      }
    }
  }
`

interface HealthBreakdown {
  [key: string]: number
  hasReadme: number
  hasLicence: number
  hasTests: number
  hasCI: number
  recentCommits: number
}

function computeHealthFromGraph(data: RepoGraph, lastCommitAt: Date | null): {
  score: number
  breakdown: HealthBreakdown
} {
  const breakdown: HealthBreakdown = {
    hasReadme: 0, hasLicence: 0, hasTests: 0, hasCI: 0, recentCommits: 0,
  }
  const repo = data.repository
  if (!repo) return { score: 0, breakdown }

  if (repo.hasReadme) breakdown.hasReadme = 6
  if (repo.licenseInfo) breakdown.hasLicence = 4

  const rootNames = (repo.rootEntries?.entries ?? []).map(e => e.name.toLowerCase())
  if (rootNames.some(n => ['test', 'tests', 'spec', '__tests__'].includes(n))) breakdown.hasTests = 8
  if (
    (repo.workflows?.entries?.length ?? 0) > 0 ||
    rootNames.some(n => ['.circleci', '.travis.yml', '.gitlab-ci.yml'].includes(n))
  ) breakdown.hasCI = 6

  if (lastCommitAt) {
    const daysSince = (Date.now() - lastCommitAt.getTime()) / 86_400_000
    if (daysSince <= 30) breakdown.recentCommits = 6
    else if (daysSince <= 60) breakdown.recentCommits = 4
    else if (daysSince <= 90) breakdown.recentCommits = 2
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
  return { score, breakdown }
}

// shortcut: public Scorecard API is cached (can be days old); treated as an
// optional nudge, not a primary signal. Upgrade to on-demand scorecard CLI if
// freshness matters more than operational simplicity.
function fetchScorecard(owner: string, repo: string): Promise<number | null> {
  return new Promise(resolve => {
    const url = `https://api.securityscorecards.dev/projects/github.com/${owner}/${repo}`
    const req = https.get(url, { timeout: 5000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null) }
      let body = ''
      res.on('data', c => (body += c))
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          const raw = Number(parsed?.score)
          resolve(Number.isFinite(raw) ? raw : null)
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

function computeSkillMatch(
  skill: ApprovedSkill,
  languages: Record<string, number>
): { matchType: 'exact' | 'partial' | 'weak' | 'none'; matchScore: number } {
  const targetLangs = SKILL_LANGUAGE_MAP[skill]
  if (targetLangs.length === 0) return { matchType: 'weak', matchScore: 1 }

  const topLang = Object.entries(languages).sort(([, a], [, b]) => b - a)[0]?.[0] ?? ''
  const totalMatched = Object.entries(languages)
    .filter(([lang]) => targetLangs.includes(lang))
    .reduce((sum, [, pct]) => sum + pct, 0)

  if (targetLangs.includes(topLang) && totalMatched >= 50) return { matchType: 'exact', matchScore: 6 }
  if (totalMatched >= 20) return { matchType: 'partial', matchScore: 3 }
  if (totalMatched > 0) return { matchType: 'weak', matchScore: 1 }
  return { matchType: 'none', matchScore: 0 }
}

export async function scanRepository(
  githubScanId: string,
  owner: string,
  repo: string,
  skill: ApprovedSkill
): Promise<void> {
  const scan = await GithubScan.findByPk(githubScanId)
  if (!scan) return

  try {
    const client = await gh()
    const data = await client<RepoGraph>(REPO_QUERY, { owner, repo })
    const r = data.repository
    if (!r) throw new Error('Repository not found or inaccessible')

    const lastCommitAt = r.pushedAt ? new Date(r.pushedAt) : null
    const commitCount = r.defaultBranchRef?.target?.history.totalCount ?? 0

    // Languages: { name: pct } rounded to 1 decimal.
    const totalBytes = r.languages?.totalSize ?? 0
    const languages: Record<string, number> = {}
    for (const edge of r.languages?.edges ?? []) {
      languages[edge.node.name] = totalBytes > 0
        ? Math.round((edge.size / totalBytes) * 100 * 10) / 10
        : 0
    }

    const { score: localHealth, breakdown: healthBreakdown } = computeHealthFromGraph(data, lastCommitAt)

    // Scorecard adds a bounded bonus into healthBreakdown (optional signal).
    let healthScore = localHealth
    if (env.OPENSSF_SCORECARD_ENABLED) {
      const scorecard = await fetchScorecard(owner, repo)
      if (scorecard !== null) {
        healthBreakdown.scorecard = Math.round(scorecard)
        healthScore = Math.min(100, localHealth + Math.round(scorecard))
      }
    }

    const { matchType: skillMatchType, matchScore: skillMatchScore } =
      computeSkillMatch(skill, languages)

    const frameworks: string[] = []
    if (languages['JavaScript'] || languages['TypeScript']) {
      if (scan.repoUrl.toLowerCase().includes('react') || healthScore > 15) frameworks.push('React')
      frameworks.push('Node.js')
    }

    await scan.update({
      isFork: r.isFork,
      languages,
      frameworks,
      healthScore,
      healthBreakdown,
      skillMatchType,
      skillMatchScore,
      commitCount,
      // shortcut: contributorCount hardcoded to 1; the GraphQL schema needs
      // a separate call for the full contributor list. Upgrade when the trust
      // model actually consumes this field.
      contributorCount: 1,
      lastCommitAt,
      scanStatus: 'COMPLETE',
      lastScannedAt: new Date(),
    })

    await calculateTrustScore(scan.credentialId)
  } catch (err) {
    await scan.update({ scanStatus: 'FAILED', lastScannedAt: new Date() })
    throw err
  }
}
