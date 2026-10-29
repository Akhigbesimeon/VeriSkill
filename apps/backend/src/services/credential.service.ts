import { fn, col } from 'sequelize'
import { Credential, ApprovedSkill } from '../models/Credential'
import { EvidenceUrl } from '../models/EvidenceUrl'
import { GithubScan } from '../models/GithubScan'
import { User, UserRole } from '../models/User'
import { PeerReview } from '../models/PeerReview'
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/error.middleware'
import { urlVerificationQueue, githubScanQueue, safeEnqueue } from '../jobs/queues'
import { calculateTrustScore } from './trust-score.service'
import { assignPeerReviewers } from './peer-review.service'
import { preflightSkillMatch } from './github-scan.service'

export async function createCredential(developerId: string, skill: ApprovedSkill) {
  return Credential.create({
    developerId,
    skill,
    verificationLayer: 1,
    lifecycleStatus: 'DRAFT',
    trustScore: 0,
  })
}

export async function listCredentials(userId: string, role: UserRole) {
  if (role === 'recruiter' || role === 'administrator') {
    return Credential.findAll({
      where: { lifecycleStatus: 'MINTED' },
      include: [{ model: User, as: 'developer', attributes: ['id', 'displayName', 'location'] }],
    })
  }
  const credentials = await Credential.findAll({ where: { developerId: userId } })
  if (credentials.length === 0) return credentials

  const flagCounts = await PeerReview.findAll({
    attributes: ['credentialId', [fn('COUNT', col('id')), 'count']],
    where: { credentialId: credentials.map(c => c.id), status: 'FLAGGED' },
    group: ['credentialId'],
    raw: true,
  }) as unknown as Array<{ credentialId: string; count: string }>

  const by = new Map(flagCounts.map(r => [r.credentialId, Number(r.count)]))
  return credentials.map(c => ({ ...c.toJSON(), flagCount: by.get(c.id) ?? 0 }))
}

export async function getCredential(
  credentialId: string,
  requester: { id: string; role: UserRole }
) {
  const credential = await Credential.findByPk(credentialId, {
    include: [
      { model: EvidenceUrl, as: 'evidenceUrls' },
      { model: GithubScan, as: 'githubScans' },
      { model: User, as: 'developer', attributes: ['id', 'displayName'] },
    ],
  })

  if (!credential) throw new NotFoundError('Credential not found')

  // Developers can view their own, or any credential they are an assigned peer
  // reviewer for. Recruiters see only MINTED.
  if (requester.role === 'developer' && credential.developerId !== requester.id) {
    const assigned = await PeerReview.count({
      where: { credentialId, reviewerId: requester.id },
    })
    if (assigned === 0) throw new ForbiddenError()
  }
  if (requester.role === 'recruiter' && credential.lifecycleStatus !== 'MINTED') {
    throw new NotFoundError('Credential not found')
  }

  const flagged = await PeerReview.findAll({
    where: { credentialId, status: 'FLAGGED' },
    attributes: ['id', 'rationale', 'submittedAt'],
    order: [['submittedAt', 'DESC']],
  })

  return {
    ...credential.toJSON(),
    flagCount: flagged.length,
    flagRationales: flagged.map(f => ({
      id: f.id,
      rationale: f.rationale,
      submittedAt: f.submittedAt,
    })),
  }
}

export async function submitEvidence(
  credentialId: string,
  developerId: string,
  url: string,
  evidenceDate?: string
) {
  const credential = await Credential.findOne({ where: { id: credentialId, developerId } })
  if (!credential) throw new NotFoundError('Credential not found')
  if (['MINTED', 'REVOKED', 'REJECTED'].includes(credential.lifecycleStatus)) {
    throw new ValidationError(`Cannot add evidence to a ${credential.lifecycleStatus} credential`)
  }

  const evidence = await EvidenceUrl.create({
    credentialId,
    url,
    evidenceDate: evidenceDate ? new Date(evidenceDate) : null,
    validationStatus: 'PENDING',
  })

  try {
    await safeEnqueue(
      urlVerificationQueue,
      'verify-url',
      { evidenceUrlId: evidence.id, credentialId, url },
      () => evidence.destroy(),
    )
  } catch {
    throw new ValidationError('Could not schedule URL verification. Please try again.')
  }

  if (credential.lifecycleStatus === 'DRAFT') {
    await credential.update({ lifecycleStatus: 'ACTIVE' })
  }

  return { evidence, message: 'URL submitted — verification in progress' }
}

export async function submitGithubRepo(
  credentialId: string,
  developerId: string,
  repoUrl: string
) {
  const credential = await Credential.findOne({ where: { id: credentialId, developerId } })
  if (!credential) throw new NotFoundError('Credential not found')

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/)
  if (!match) throw new ValidationError('Invalid GitHub repository URL')
  const [, owner, repoName] = match

  const rejection = await preflightSkillMatch(owner, repoName, credential.skill)
  if (rejection) throw new ValidationError(rejection)

  const scan = await GithubScan.create({
    credentialId,
    repoUrl,
    repoName: `${owner}/${repoName}`,
    owner,
    isFork: false,
    scanStatus: 'PENDING',
  })

  try {
    await safeEnqueue(
      githubScanQueue,
      'scan-github',
      { githubScanId: scan.id, credentialId, owner, repo: repoName, skill: credential.skill },
      () => scan.destroy(),
    )
  } catch {
    throw new ValidationError('Could not schedule GitHub scan. Please try again.')
  }

  return { scan, message: 'Repository submitted — scan in progress' }
}

async function loadDeletableCredential(credentialId: string, developerId: string) {
  const credential = await Credential.findOne({ where: { id: credentialId, developerId } })
  if (!credential) throw new NotFoundError('Credential not found')
  if (!['DRAFT', 'ACTIVE'].includes(credential.lifecycleStatus)) {
    throw new ValidationError(
      `Cannot remove items from a ${credential.lifecycleStatus} credential`
    )
  }
  return credential
}

export async function deleteEvidence(
  credentialId: string,
  developerId: string,
  evidenceUrlId: string
) {
  await loadDeletableCredential(credentialId, developerId)
  const row = await EvidenceUrl.findOne({ where: { id: evidenceUrlId, credentialId } })
  if (!row) throw new NotFoundError('Evidence URL not found')
  await row.destroy()
  await calculateTrustScore(credentialId)
}

export async function deleteGithubScan(
  credentialId: string,
  developerId: string,
  scanId: string
) {
  await loadDeletableCredential(credentialId, developerId)
  const row = await GithubScan.findOne({ where: { id: scanId, credentialId } })
  if (!row) throw new NotFoundError('GitHub scan not found')
  await row.destroy()
  await calculateTrustScore(credentialId)
}

export async function deleteCredential(credentialId: string, developerId: string) {
  const credential = await loadDeletableCredential(credentialId, developerId)
  await credential.destroy()
}

export async function submitForReview(credentialId: string, developerId: string) {
  const credential = await Credential.findOne({ where: { id: credentialId, developerId } })
  if (!credential) throw new NotFoundError('Credential not found')

  if (credential.lifecycleStatus !== 'ACTIVE') {
    throw new ValidationError(
      `Only ACTIVE credentials can be submitted for review (current: ${credential.lifecycleStatus})`
    )
  }

  const { score, layer } = await calculateTrustScore(credentialId)
  await credential.update({ trustScore: score, verificationLayer: layer, lifecycleStatus: 'PENDING_REVIEW' })

  await assignPeerReviewers(credentialId, developerId, layer)

  return credential.reload()
}
