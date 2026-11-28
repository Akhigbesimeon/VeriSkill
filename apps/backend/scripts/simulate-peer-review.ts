/* eslint-disable no-console */
/**
 * simulate-peer-review — synthetic experiment that compares the old and new
 * peer-review scoring rules on three adversary populations.
 *
 * This is a SIMULATION, not a field study. The adversary model is idealised:
 * colluders reuse ASNs and rationales, low-effort reviewers submit fast with
 * boilerplate text. Real behaviour is messier. Numbers are suggestive, not
 * evidence of deployed effectiveness.
 *
 * Run with:   npx ts-node apps/backend/scripts/simulate-peer-review.ts
 */

import { shingleJaccard, buildWeightFactors } from '../src/services/peer-review.service'

type Population = 'honest' | 'colluding' | 'low_effort'

interface Reviewer {
  id: string
  population: Population
  asn: number
  ipHash: string
  priorRationales: string[]      // what this reviewer has said before
  priorMutualByDeveloper: Record<string, number>
}

interface Review {
  reviewerId: string
  decision: 'APPROVE' | 'FLAG'
  rationale: string
  submittedSecondsAfterAssign: number
}

interface Credential {
  id: string
  developerId: string
  developerAsn: number
  developerIpHash: string
  bad: boolean                   // is this a credential that *should* fail?
}

const RNG = mulberry32(42)
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function randint(lo: number, hi: number) { return Math.floor(RNG() * (hi - lo + 1)) + lo }

// ─── Reviewer populations ──────────────────────────────────────────────────
// Honest: distinct ASNs, distinct rationales, thoughtful pace.
// Colluding: a small ASN ring, reuse each other's rationales.
// Low-effort: distinct ASNs but submit in seconds with near-identical boilerplate.

function buildReviewer(id: string, population: Population): Reviewer {
  const asn =
    population === 'colluding' ? 64500 + randint(0, 2)   // 3 ASNs max for the ring
      : population === 'low_effort' ? 70000 + randint(0, 200)
      : 10000 + randint(0, 50_000)
  return {
    id,
    population,
    asn,
    ipHash: hashlike(`ip-${id}-${asn}`),
    priorRationales: [],
    priorMutualByDeveloper: {},
  }
}

function hashlike(s: string): string {
  // Not real SHA-256, but deterministic and good enough for cluster diversity.
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16).padStart(16, '0').repeat(4)
}

function synthRationale(population: Population, reviewer: Reviewer): string {
  if (population === 'low_effort') {
    return 'This repository demonstrates competent TypeScript and clean module structure, meeting the skill claim.'
  }
  if (population === 'colluding') {
    // Collusion ring: 2 templates, picked at random.
    const options = [
      'The author shows a solid grasp of TypeScript and testing practices in the repository.',
      'The repository is well structured, with meaningful commits that back the skill claim clearly.',
    ]
    return options[randint(0, options.length - 1)]
  }
  // Honest: short per-review vocabulary drawn from a bigger pool.
  const bits = [
    ['parser', 'migration', 'queue', 'router', 'reducer', 'component', 'script'],
    ['covers', 'tests', 'handles', 'validates', 'documents', 'uses', 'exposes'],
    ['the edge case', 'null input', 'auth failure', 'retry logic', 'async timing', 'the happy path'],
    ['cleanly', 'with care', 'in a readable way', 'with real tests', 'with a clear commit log'],
  ]
  return [
    `Looked at the ${pick(bits[0])}`,
    `${pick(bits[1])} ${pick(bits[2])} ${pick(bits[3])}.`,
    `Author style is consistent across commits ${reviewer.id}.`,
  ].join(' ')
}

function pick<T>(arr: T[]): T { return arr[randint(0, arr.length - 1)] }

function synthReview(reviewer: Reviewer, credential: Credential): Review {
  const text = synthRationale(reviewer.population, reviewer)
  const decision: 'APPROVE' | 'FLAG' =
    reviewer.population === 'honest'
      ? (credential.bad ? (RNG() < 0.7 ? 'FLAG' : 'APPROVE') : 'APPROVE')
      : 'APPROVE'    // bad actors rubber-stamp
  const seconds =
    reviewer.population === 'low_effort' ? randint(5, 45)
      : reviewer.population === 'colluding' ? randint(30, 200)
      : randint(300, 3600)
  return { reviewerId: reviewer.id, decision, rationale: text, submittedSecondsAfterAssign: seconds }
}

// ─── Old-logic vs new-logic scorers ────────────────────────────────────────

// Old: weightFactor was 1.0 by default; sum of weight_factors ≥ 1 = Layer 4,
// ≥ 3 = Layer 5. No text check. No cluster check. No skill eligibility.
function scoreOld(reviews: Review[], reviewerByIp: Map<string, Reviewer>): {
  layer: number; weighted: number
} {
  const weighted = reviews
    .filter(r => r.decision === 'APPROVE')
    .reduce((sum, r) => {
      const rev = reviewerByIp.get(r.reviewerId)!
      // Old same-ASN heuristic was per-pair, not aggregated. Simulate by
      // discounting if ≥2 reviews came from the same ASN.
      const sameAsnCount = reviews.filter(x =>
        reviewerByIp.get(x.reviewerId)!.asn === rev.asn
      ).length
      const base = sameAsnCount > 1 ? 0.5 : 1.0
      return sum + base
    }, 0)

  const layer = weighted >= 3 ? 5 : weighted >= 1 ? 4 : 3
  return { layer, weighted }
}

// New: cluster gate + flag downweight + agreement (cold-start neutral).
function scoreNew(
  reviews: Review[],
  reviewerByIp: Map<string, Reviewer>,
  credential: Credential,
  fastSubmitSeconds = 60,
  dupThreshold = 0.75,
): { layer: number; weighted: number; flaggedCount: number } {
  let weighted = 0
  let flaggedCount = 0
  const clusters = new Set<string>()
  const seenRationales: string[] = []

  for (const r of reviews) {
    if (r.decision !== 'APPROVE') continue
    const rev = reviewerByIp.get(r.reviewerId)!
    const sameAsnCount = reviews.filter(x =>
      reviewerByIp.get(x.reviewerId)!.asn === rev.asn
    ).length
    const sameAsn = sameAsnCount > 1 && rev.asn === credential.developerAsn
    const sameIp = rev.ipHash === credential.developerIpHash
    const fast = r.submittedSecondsAfterAssign < fastSubmitSeconds
    const nearDup = seenRationales.some(t => shingleJaccard(r.rationale, t) >= dupThreshold)
    seenRationales.push(r.rationale)

    const factors = buildWeightFactors({
      sameIpHash: sameIp, sameAsn, priorMutual: 0,
      skillMatched: true, agreementRate: null,
      fastSubmit: fast, nearDuplicate: nearDup,
      reviewerAsn: rev.asn, reviewerIpHash: rev.ipHash,
    })
    weighted += factors.final
    if (factors.flagged) flaggedCount++
    clusters.add(factors.cluster)
  }
  const clusterOk = clusters.size >= 2
  const layer = (weighted >= 3 && clusterOk) ? 5
              : (weighted >= 1 && clusterOk) ? 4
              : 3
  return { layer, weighted, flaggedCount }
}

// ─── Experiment ────────────────────────────────────────────────────────────

const RUNS_PER_CELL = 1000

function runCell(population: Population, credentialBad: boolean): {
  oldApprovedRate: number; newApprovedRate: number; avgFlagged: number
} {
  let oldPass = 0, newPass = 0, totalFlagged = 0
  for (let i = 0; i < RUNS_PER_CELL; i++) {
    const developerAsn = 50000 + randint(0, 1000)
    const credential: Credential = {
      id: `c${i}`, developerId: `dev${i}`,
      developerAsn, developerIpHash: hashlike(`dev-${i}`),
      bad: credentialBad,
    }
    const reviewers = [0, 1, 2].map(k => buildReviewer(`r${i}-${k}`, population))
    const reviews = reviewers.map(r => synthReview(r, credential))
    const map = new Map(reviewers.map(r => [r.id, r]))

    const oldRes = scoreOld(reviews, map)
    const newRes = scoreNew(reviews, map, credential)
    if (oldRes.layer >= 4) oldPass++
    if (newRes.layer >= 4) newPass++
    totalFlagged += newRes.flaggedCount
  }
  return {
    oldApprovedRate: oldPass / RUNS_PER_CELL,
    newApprovedRate: newPass / RUNS_PER_CELL,
    avgFlagged: totalFlagged / RUNS_PER_CELL,
  }
}

function pct(n: number): string { return (n * 100).toFixed(1) + '%' }

function main() {
  console.log('peer-review simulation — N=' + RUNS_PER_CELL + ' per cell. Treat as a model, not a field study.\n')

  const cells: Array<{ label: string; population: Population; bad: boolean }> = [
    { label: 'honest reviewers, good credential',    population: 'honest',     bad: false },
    { label: 'honest reviewers, BAD credential',     population: 'honest',     bad: true  },
    { label: 'colluding reviewers, BAD credential',  population: 'colluding',  bad: true  },
    { label: 'low-effort reviewers, BAD credential', population: 'low_effort', bad: true  },
  ]

  const rows: Array<[string, string, string, string]> = [
    ['scenario', 'old: pass rate (Layer ≥ 4)', 'new: pass rate (Layer ≥ 4)', 'avg flagged / credential'],
  ]
  for (const cell of cells) {
    const r = runCell(cell.population, cell.bad)
    rows.push([cell.label, pct(r.oldApprovedRate), pct(r.newApprovedRate), r.avgFlagged.toFixed(2)])
  }

  const colW = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)))
  for (const r of rows) {
    console.log(r.map((v, i) => v.padEnd(colW[i])).join('   '))
  }

  console.log('\nReading the numbers:')
  console.log('  honest / good → the new rules must not hurt genuinely good credentials much.')
  console.log('  honest / bad  → the new rules must not get in the way of honest FLAG decisions.')
  console.log('  colluding     → the new rules should block most of the pass-throughs.')
  console.log('  low-effort    → flagged volume should rise and pass rate should fall.')
  console.log('\nSimulation only. See docs/PEER_REVIEW_INTEGRITY.md for the threat model and the honest list of limits.')
}

main()
