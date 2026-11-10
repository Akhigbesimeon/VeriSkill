import { Router, Request, Response, NextFunction } from 'express'
import { Op } from 'sequelize'
import { env } from '../config/env'
import { EvidenceUrl } from '../models/EvidenceUrl'
import { GithubScan } from '../models/GithubScan'
import { Credential } from '../models/Credential'
import { urlVerificationQueue, githubScanQueue } from '../jobs/queues'
import { ApprovedSkill } from '../models/Credential'

/**
 * Internal cron jobs — scheduled in-process by node-cron (see server.ts).
 * The HTTP endpoints stay available for manual triggering via
 * `curl -H "Authorization: Bearer <CRON_SECRET>" -X POST ...`.
 */
export const internalRouter = Router()

function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || token !== env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

internalRouter.use(requireCronSecret)

export async function runUrlFreshnessJob() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const stale = await EvidenceUrl.findAll({
    where: {
      [Op.or]: [
        { lastCheckedAt: null },
        { lastCheckedAt: { [Op.lt]: cutoff } },
      ],
    },
    attributes: ['id', 'credentialId', 'url'],
  })

  for (const row of stale) {
    await urlVerificationQueue.add(
      'verify-url',
      { evidenceUrlId: row.id, credentialId: row.credentialId, url: row.url },
      { attempts: 2, backoff: { type: 'exponential', delay: 5_000 } },
    )
  }

  return { enqueued: stale.length, cutoff: cutoff.toISOString() }
}

export async function runGithubRescanJob() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const stale = await GithubScan.findAll({
    where: {
      [Op.or]: [
        { lastScannedAt: null },
        { lastScannedAt: { [Op.lt]: cutoff } },
      ],
    },
    include: [{ model: Credential, as: 'credential', attributes: ['skill'] }],
  })

  for (const row of stale) {
    const skill = (row as GithubScan & { credential?: { skill: ApprovedSkill } })
      .credential?.skill
    if (!skill) continue
    await githubScanQueue.add(
      'scan-github',
      {
        githubScanId: row.id,
        credentialId: row.credentialId,
        owner: row.owner,
        repo: row.repoName.split('/').pop() ?? '',
        skill,
      },
      { attempts: 2, backoff: { type: 'exponential', delay: 10_000 } },
    )
  }

  return { enqueued: stale.length, cutoff: cutoff.toISOString() }
}

internalRouter.post('/cron/url-freshness', async (_req, res, next) => {
  try { res.json(await runUrlFreshnessJob()) } catch (err) { next(err) }
})

internalRouter.post('/cron/github-rescan', async (_req, res, next) => {
  try { res.json(await runGithubRescanJob()) } catch (err) { next(err) }
})
