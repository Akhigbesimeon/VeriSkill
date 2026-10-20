import sequelize from '../config/sequelize'
import { Credential } from '../models/Credential'
import { EvidenceUrl } from '../models/EvidenceUrl'
import { GithubScan } from '../models/GithubScan'
import { PeerReview } from '../models/PeerReview'
import { ExpertReview } from '../models/ExpertReview'
import { TrustScoreHistory } from '../models/TrustScoreHistory'

/**
 * Trust Score Engine — implements the full Phase 0 formula from docs/TRUST_SCORE.md
 *
 * Layer determination:
 *   Layer 1 (Self-declaration):    score  0–10%  — credential exists
 *   Layer 2 (URL verified):        score 20–40%  — at least one VALID evidence URL
 *   Layer 3 (GitHub scanned):      score 40–60%  — GitHub scan COMPLETE with match
 *   Layer 4 (Peer verified 1–2):   score 60–80%  — ≥1 weighted APPROVE peer review
 *   Layer 5 (Community 3+):        score 80–90%  — ≥3 weighted APPROVE peer reviews
 *   Layer 6 (Expert verified):     score 90–100% — expert submitted with confidence ≥ 3
 *
 * The 10–20% band is intentionally unassigned (Phase 0 ADR-002).
 * Score is bounded by layer ceiling — sub-scores cannot push into a higher band
 * without meeting the qualitative gate for that layer.
 */

interface SubScores {
  selfDeclaration: number     // Layer 1 base: 5
  urlEvidence: number         // Layer 2 contribution: 0–20
  githubScan: number          // Layer 3 contribution: 0–20
  peerReview: number          // Layer 4/5 contribution: 0–30
  expertReview: number        // Layer 6 contribution: 0–10
}

interface TrustScoreResult {
  score: number
  layer: number
  breakdown: SubScores
}

export async function calculateTrustScore(credentialId: string): Promise<TrustScoreResult> {
  const breakdown: SubScores = {
    selfDeclaration: 5,
    urlEvidence: 0,
    githubScan: 0,
    peerReview: 0,
    expertReview: 0,
  }

  const evidenceUrls = await EvidenceUrl.findAll({ where: { credentialId } })
  const validUrls = evidenceUrls.filter(e => e.validationStatus === 'VALID')
  const tier1Count = validUrls.filter(e => e.providerTier === 1).length
  const tier2Count = validUrls.filter(e => e.providerTier === 2).length

  // Tier 1 = 10 pts each, Tier 2 = 5 pts each; URL evidence capped at 20.
  breakdown.urlEvidence = Math.min(20, tier1Count * 10 + tier2Count * 5)

  const scans = await GithubScan.findAll({
    where: { credentialId, scanStatus: 'COMPLETE' },
    order: [['createdAt', 'DESC']],
    limit: 1,
  })

  if (scans.length > 0) {
    const scan = scans[0]
    const healthContribution = Math.round((scan.healthScore / 30) * 14) // 0–30 → 0–14
    const matchContribution = scan.skillMatchScore                       // exact=6, partial=3, weak=1, none=0
    const forkPenalty = scan.isFork ? 3 : 0
    breakdown.githubScan = Math.max(0, Math.min(20, healthContribution + matchContribution - forkPenalty))
  }

  // status=SUBMITTED already implies decision=APPROVE (the submit route sends
  // decision=FLAG to status=FLAGGED), so filtering on decision too would
  // silently drop any manually-inserted rows that forgot to set the column.
  const peerReviews = await PeerReview.findAll({
    where: { credentialId, status: 'SUBMITTED' },
  })

  // weightFactor is DECIMAL in Postgres → Sequelize returns a string; coerce.
  const weightedApprovals = peerReviews.reduce((sum, r) => sum + Number(r.weightFactor), 0)

  if (weightedApprovals >= 3) {
    // Layer 5: 3+ weighted approvals → 80–90% band → up to 30 pts.
    breakdown.peerReview = Math.min(30, Math.round(weightedApprovals * 8))
  } else if (weightedApprovals >= 1) {
    // Layer 4: 1–2 weighted approvals → 60–80% band → up to 20 pts.
    breakdown.peerReview = Math.min(20, Math.round(weightedApprovals * 12))
  }

  const expertReviews = await ExpertReview.findAll({
    where: { credentialId, status: 'SUBMITTED' },
  })

  const bestExpert = expertReviews
    .filter(e => e.confidenceRating !== null)
    .sort((a, b) => (b.confidenceRating ?? 0) - (a.confidenceRating ?? 0))[0]

  if (bestExpert?.confidenceRating) {
    // confidenceRating → points: 1→0, 2→2, 3→5, 4→7, 5→10.
    const confidenceScoreMap: Record<number, number> = { 1: 0, 2: 2, 3: 5, 4: 7, 5: 10 }
    breakdown.expertReview = confidenceScoreMap[bestExpert.confidenceRating] ?? 0
  }

  const rawScore = Object.values(breakdown).reduce((a, b) => a + b, 0)

  let layer = 1
  let score = breakdown.selfDeclaration

  if (breakdown.expertReview > 0 && bestExpert?.confidenceRating && bestExpert.confidenceRating >= 3) {
    layer = 6
    score = Math.min(100, Math.max(90, rawScore))
  } else if (weightedApprovals >= 3) {
    layer = 5
    score = Math.min(90, Math.max(80, rawScore))
  } else if (weightedApprovals >= 1) {
    layer = 4
    score = Math.min(80, Math.max(60, rawScore))
  } else if (breakdown.githubScan > 0) {
    layer = 3
    score = Math.min(60, Math.max(40, rawScore))
  } else if (breakdown.urlEvidence > 0) {
    layer = 2
    score = Math.min(40, Math.max(20, rawScore))
  } else {
    layer = 1
    score = Math.min(10, rawScore)
  }

  // Persist new score + history entry atomically. Lifecycle is only touched by
  // explicit transitions (submit, mint, revoke) — never here.
  const credential = await Credential.findByPk(credentialId)
  if (credential) {
    const oldScore = Number(credential.trustScore)
    const oldLayer = credential.verificationLayer
    if (oldScore !== score || oldLayer !== layer) {
      await sequelize.transaction(async (tx) => {
        await credential.update({ trustScore: score, verificationLayer: layer }, { transaction: tx })
        await TrustScoreHistory.create({
          credentialId,
          oldScore,
          newScore: score,
          oldLayer,
          newLayer: layer,
          triggerEvent: 'recalculation',
          scoreBreakdown: breakdown as unknown as Record<string, unknown>,
        }, { transaction: tx })
      })
    }
  }

  return { score, layer, breakdown }
}
