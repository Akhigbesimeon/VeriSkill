import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.middleware'
import { validate } from '../middleware/error.middleware'
import * as CredentialService from '../services/credential.service'
import { TrustScoreHistory } from '../models/TrustScoreHistory'
import { mintCredential, signMintVoucher, confirmMint } from '../services/blockchain.service'
import { z } from 'zod'
import {
  createCredentialSchema as createSchema,
  evidenceUrlSchema as urlSchema,
  githubRepoSchema as repoSchema,
} from '@veriskill/shared'

export const credentialRouter = Router()
credentialRouter.use(authenticate)

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

/**
 * POST /api/v1/credentials/:id/mint — managed-wallet fallback. The backend
 * signs AND submits the on-chain tx on the developer's behalf. Only used
 * for users whose walletType is 'managed'; self-custody users should use
 * the voucher flow below so they sign the tx themselves.
 */
credentialRouter.post('/:id/mint', requireRole('developer'), async (req, res, next) => {
  try {
    const tokenId = await mintCredential(req.params.id, req.user!.id, {
      requireOwnership: req.user!.id,
    })
    res.json({ message: 'Credential minted', tokenId })
  } catch (err) { next(err) }
})

/**
 * POST /api/v1/credentials/:id/mint/voucher — issue an EIP-712 signed voucher
 * the developer takes to their own wallet to mint the credential on-chain
 * themselves. The backend never submits a tx on this path.
 */
credentialRouter.post('/:id/mint/voucher', requireRole('developer'), async (req, res, next) => {
  try {
    const signed = await signMintVoucher(req.params.id, req.user!.id)
    res.json(signed)
  } catch (err) { next(err) }
})

/**
 * POST /api/v1/credentials/:id/mint/confirm — called by the frontend after
 * the developer's wallet broadcasts mintWithVoucher. Verifies the tx on-chain
 * and persists the credential as MINTED.
 */
const confirmSchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid tx hash') })
credentialRouter.post('/:id/mint/confirm', requireRole('developer'), async (req, res, next) => {
  try {
    const { txHash } = validate(confirmSchema, req.body)
    const tokenId = await confirmMint(req.params.id, req.user!.id, txHash)
    res.json({ message: 'Credential minted', tokenId })
  } catch (err) { next(err) }
})
