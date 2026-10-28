import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.middleware'
import { validate } from '../middleware/error.middleware'
import * as CredentialService from '../services/credential.service'
import { ApprovedSkill } from '../models/Credential'
import { TrustScoreHistory } from '../models/TrustScoreHistory'
import { mintCredential } from '../services/blockchain.service'

export const credentialRouter = Router()
credentialRouter.use(authenticate)

const APPROVED_SKILLS: [ApprovedSkill, ...ApprovedSkill[]] = [
  'JavaScript','TypeScript','Python','Java','Kotlin','Swift',
  'Go','Rust','C','C#','PHP','Ruby','Solidity',
  'HTML','CSS','SQL',
  'React','Node.js','Git','Docker',
  'Kubernetes','AWS','Terraform',
]

const createSchema = z.object({
  skill: z.enum(APPROVED_SKILLS),
})

const urlSchema = z.object({
  url: z.string().url().startsWith('https://', 'URL must be HTTPS'),
  evidenceDate: z.string().date().optional(),
})

const repoSchema = z.object({
  repoUrl: z.string().url().includes('github.com', { message: 'Must be a GitHub URL' }),
})

/** POST /api/v1/credentials — create a new credential (DRAFT) */
credentialRouter.post('/', requireRole('developer'), async (req, res, next) => {
  try {
    const { skill } = validate(createSchema, req.body)
    const credential = await CredentialService.createCredential(req.user!.id, skill)
    res.status(201).json(credential)
  } catch (err) { next(err) }
})

/** GET /api/v1/credentials — list caller's own credentials */
credentialRouter.get('/', async (req, res, next) => {
  try {
    const credentials = await CredentialService.listCredentials(req.user!.id, req.user!.role)
    res.json(credentials)
  } catch (err) { next(err) }
})

/** GET /api/v1/credentials/:id — get single credential */
credentialRouter.get('/:id', async (req, res, next) => {
  try {
    const credential = await CredentialService.getCredential(req.params.id, req.user!)
    res.json(credential)
  } catch (err) { next(err) }
})

/** GET /api/v1/credentials/:id/trust-score/history — append-only timeline of score changes */
credentialRouter.get('/:id/trust-score/history', async (req, res, next) => {
  try {
    // Reuse the ownership/role check — throws 403/404 if the caller can't see this credential.
    await CredentialService.getCredential(req.params.id, req.user!)
    const history = await TrustScoreHistory.findAll({
      where: { credentialId: req.params.id },
      order: [['createdAt', 'ASC']],
    })
    res.json(history)
  } catch (err) { next(err) }
})

/** POST /api/v1/credentials/:id/evidence — submit a URL evidence item */
credentialRouter.post('/:id/evidence', requireRole('developer'), async (req, res, next) => {
  try {
    const { url, evidenceDate } = validate(urlSchema, req.body)
    const result = await CredentialService.submitEvidence(
      req.params.id, req.user!.id, url, evidenceDate
    )
    res.status(201).json(result)
  } catch (err) { next(err) }
})

/** POST /api/v1/credentials/:id/github — submit a GitHub repo for scanning */
credentialRouter.post('/:id/github', requireRole('developer'), async (req, res, next) => {
  try {
    const { repoUrl } = validate(repoSchema, req.body)
    const result = await CredentialService.submitGithubRepo(req.params.id, req.user!.id, repoUrl)
    res.status(201).json(result)
  } catch (err) { next(err) }
})

/** DELETE /api/v1/credentials/:id/evidence/:evidenceId — remove an evidence URL */
credentialRouter.delete('/:id/evidence/:evidenceId', requireRole('developer'), async (req, res, next) => {
  try {
    await CredentialService.deleteEvidence(req.params.id, req.user!.id, req.params.evidenceId)
    res.status(204).end()
  } catch (err) { next(err) }
})

/** DELETE /api/v1/credentials/:id/github/:scanId — remove a GitHub scan */
credentialRouter.delete('/:id/github/:scanId', requireRole('developer'), async (req, res, next) => {
  try {
    await CredentialService.deleteGithubScan(req.params.id, req.user!.id, req.params.scanId)
    res.status(204).end()
  } catch (err) { next(err) }
})

/** DELETE /api/v1/credentials/:id — delete a credential draft (DRAFT or ACTIVE) */
credentialRouter.delete('/:id', requireRole('developer'), async (req, res, next) => {
  try {
    await CredentialService.deleteCredential(req.params.id, req.user!.id)
    res.status(204).end()
  } catch (err) { next(err) }
})

/** POST /api/v1/credentials/:id/submit — submit for peer review */
credentialRouter.post('/:id/submit', requireRole('developer'), async (req, res, next) => {
  try {
    const credential = await CredentialService.submitForReview(req.params.id, req.user!.id)
    res.json(credential)
  } catch (err) { next(err) }
})

/** POST /api/v1/credentials/:id/mint — developer mints their own credential once Layer ≥ 4 */
credentialRouter.post('/:id/mint', requireRole('developer'), async (req, res, next) => {
  try {
    const tokenId = await mintCredential(req.params.id, req.user!.id, {
      requireOwnership: req.user!.id,
    })
    res.json({ message: 'Credential minted', tokenId })
  } catch (err) { next(err) }
})
