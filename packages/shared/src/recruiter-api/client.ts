import {
  publicVerdictSchema, batchResponseSchema,
  type PublicVerdict, type BatchResponse,
} from './schema'

/**
 * Tiny typed client for the VeriSkill recruiter API.
 *
 * Uses the global `fetch` (Node 18+ and all evergreen browsers). Every
 * response is validated against the Zod schema before being returned, so
 * a backend that silently changes shape surfaces as a parse error, not a
 * runtime bug deep in the caller.
 *
 * ```ts
 * const client = new RecruiterApiClient({
 *   baseUrl: 'https://api.veriskill.local',
 *   apiKey:  process.env.VERISKILL_KEY!,
 * })
 * const verdicts = await client.verifyBatch([uuid1, uuid2])
 * ```
 */
export class RecruiterApiClient {
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly fetchFn: typeof fetch

  constructor(opts: {
    baseUrl: string
    apiKey?: string
    fetch?: typeof fetch
  }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.apiKey  = opts.apiKey
    // Allow injection so the test suite can hand in supertest's agent.
    this.fetchFn = opts.fetch ?? fetch
  }

  async verifyOne(id: string): Promise<PublicVerdict> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/verify/public/${id}`)
    if (res.status === 404) {
      // The 404 body is still a verdict (status: NOT_FOUND). Parse it.
      return publicVerdictSchema.parse(await res.json())
    }
    if (!res.ok) throw new Error(`verifyOne failed: HTTP ${res.status}`)
    return publicVerdictSchema.parse(await res.json())
  }

  async verifyBatch(ids: string[]): Promise<BatchResponse> {
    if (!this.apiKey) throw new Error('verifyBatch requires an API key')
    if (ids.length === 0 || ids.length > 50) {
      throw new Error('verifyBatch accepts 1..50 ids per call')
    }
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/verify/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) throw new Error(`verifyBatch failed: HTTP ${res.status}`)
    return batchResponseSchema.parse(await res.json())
  }
}
