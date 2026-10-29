import { Queue, Worker } from 'bullmq'
import { env } from '../config/env'
import { processEvidenceUrl } from '../services/url-verification.service'
import { scanRepository } from '../services/github-scan.service'

// BullMQ wants a structured connection, not a URL string. Parse once.
// `rediss://` auto-enables TLS, which Upstash requires.
const parsed = new URL(env.REDIS_URL)
const connection = {
  host: parsed.hostname,
  port: Number(parsed.port) || 6379,
  username: parsed.username || undefined,
  password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  tls: parsed.protocol === 'rediss:' ? {} : undefined,
  // BullMQ requires null here — its blocking workers can't tolerate ioredis
  // auto-retrying individual commands.
  maxRetriesPerRequest: null,
}

const queueOpts = { connection }
const workerOpts = { connection, concurrency: 1 }

export const urlVerificationQueue = new Queue<{
  evidenceUrlId: string
  credentialId: string
  url: string
}>('url-verification', queueOpts)

export const githubScanQueue = new Queue<{
  githubScanId: string
  credentialId: string
  owner: string
  repo: string
  skill: Parameters<typeof scanRepository>[3]
}>('github-scan', queueOpts)

// Worker instances live only in the worker process. Kept at module scope so
// closeQueues() can shut them down cleanly.
let urlWorker: Worker | null = null
let githubWorker: Worker | null = null

/**
 * Register job processors. Only the worker process should call this; the API
 * process stays producer-only so a worker crash cannot take down the API.
 */
export function registerWorkers() {
  urlWorker = new Worker(
    'url-verification',
    async (job) => {
      console.log(`[Queue] url-verification — processing ${job.data.url}`)
      await processEvidenceUrl(job.data.evidenceUrlId)
    },
    workerOpts
  )

  githubWorker = new Worker(
    'github-scan',
    async (job) => {
      console.log(`[Queue] github-scan — processing ${job.data.owner}/${job.data.repo}`)
      await scanRepository(
        job.data.githubScanId,
        job.data.owner,
        job.data.repo,
        job.data.skill
      )
    },
    workerOpts
  )

  urlWorker.on('failed', (job, err) => {
    console.error(`[Queue] url-verification failed job=${job?.id}:`, err.message)
  })
  githubWorker.on('failed', (job, err) => {
    console.error(`[Queue] github-scan failed job=${job?.id}:`, err.message)
  })
}

/**
 * Enqueue with a short timeout + rollback. If the enqueue fails or hangs
 * (e.g. serverless Redis idle timeout, network blip), run `onRollback` so
 * the row we just wrote doesn't orphan as a PENDING item nobody will ever
 * process.
 */
export async function safeEnqueue(
  // Queue typing is intentionally loose — callers already know their data shape;
  // BullMQ's generics make a fully-typed helper noisier than the inline version.
  queue: Queue,
  name: string,
  data: unknown,
  onRollback: () => Promise<unknown>,
  timeoutMs = 5_000,
): Promise<void> {
  try {
    await Promise.race([
      queue.add(name, data),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`Enqueue to ${queue.name} timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])
  } catch (err) {
    console.error(`[queue] enqueue to ${queue.name} failed:`, (err as Error).message)
    await onRollback().catch(e => console.error('[queue] rollback failed:', e))
    throw err
  }
}

/** Lifecycle */
export async function initQueues() {
  await urlVerificationQueue.waitUntilReady()
  await githubScanQueue.waitUntilReady()
}

export async function closeQueues() {
  await Promise.all([
    urlVerificationQueue.close(),
    githubScanQueue.close(),
    urlWorker?.close(),
    githubWorker?.close(),
  ])
}
