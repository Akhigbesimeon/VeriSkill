import { Router, Request, Response, NextFunction } from 'express'
import { Op } from 'sequelize'
import { env } from '../config/env'
import { EvidenceUrl } from '../models/EvidenceUrl'
import { GithubScan } from '../models/GithubScan'
import { Credential } from '../models/Credential'
import { urlVerificationQueue, githubScanQueue } from '../jobs/queues'
import { ApprovedSkill } from '../models/Credential'

/**
 * Internal cron webhook endpoints.
 *
 * Called by Supabase pg_cron on a schedule (ADR-016, see
 * apps/backend/sql/supabase-cron.sql). The caller must present
 * `Authorization: Bearer <CRON_SECRET>` — this is NOT a public API.
 *
 * Why webhooks instead of Bull's repeat scheduler:
 *   - Render free-tier web services sleep after ~15 min idle. Bull's
 *     in-process repeat scheduler stops firing while the dyno is asleep.
 *     An external HTTP ping both wakes the dyno and dispatches the job
 *     in one call. This also doubles as the keep-alive heartbeat.
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

/**
 * POST /internal/cron/url-freshness
 * Monthly check: re-enqueue every evidence URL whose last_checked_at is
 * older than 30 days (or null). Matches the "Monthly URL freshness check"
 * row in docs/ARCHITECTURE.md § Async Jobs.
 */
internalRouter.post('/cron/url-freshness', async (_req, res, next) => {
  try {
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

    res.json({ enqueued: stale.length, cutoff: cutoff.toISOString() })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /internal/cron/github-rescan
 * Quarterly check: re-enqueue every GitHub scan whose last_scanned_at
 * is older than 90 days (or null). Matches the "Quarterly GitHub re-scan"
 * row in docs/ARCHITECTURE.md § Async Jobs.
 */
internalRouter.post('/cron/github-rescan', async (_req, res, next) => {
  try {
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

    res.json({ enqueued: stale.length, cutoff: cutoff.toISOString() })
  } catch (err) {
    next(err)
  }
})
