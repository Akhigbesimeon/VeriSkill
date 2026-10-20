import Queue, { QueueOptions } from 'bull'
import { env } from '../config/env'
import { processEvidenceUrl } from '../services/url-verification.service'
import { scanRepository } from '../services/github-scan.service'

/** Bull options */
const queueOptions: QueueOptions = {
  redis: {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  },
}

/** Queue instances */
export const urlVerificationQueue = new Queue<{
  evidenceUrlId: string
  credentialId: string
  url: string
}>('url-verification', env.REDIS_URL, queueOptions)

export const githubScanQueue = new Queue<{
  githubScanId: string
  credentialId: string
  owner: string
  repo: string
  skill: Parameters<typeof scanRepository>[3]
}>('github-scan', env.REDIS_URL, queueOptions)

/** Workers */
urlVerificationQueue.process('verify-url', 1, async (job) => {
  console.log(`[Queue] url-verification — processing ${job.data.url}`)
  await processEvidenceUrl(job.data.evidenceUrlId)
})

githubScanQueue.process('scan-github', 1, async (job) => {
  console.log(`[Queue] github-scan — processing ${job.data.owner}/${job.data.repo}`)
  await scanRepository(
    job.data.githubScanId,
    job.data.owner,
    job.data.repo,
    job.data.skill
  )
})

/** Error handlers */
urlVerificationQueue.on('failed', (job, err) => {
  console.error(`[Queue] url-verification failed job=${job.id}:`, err.message)
})

githubScanQueue.on('failed', (job, err) => {
  console.error(`[Queue] github-scan failed job=${job.id}:`, err.message)
})

/** Lifecycle */
export async function initQueues() {
  await urlVerificationQueue.isReady()
  await githubScanQueue.isReady()
}

export async function closeQueues() {
  await urlVerificationQueue.close()
  await githubScanQueue.close()
}
