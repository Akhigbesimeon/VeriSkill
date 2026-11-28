# Recruiter / ATS API

Machine-usable verification for VeriSkill credentials. Built in response to
panel feedback that recruiters spend seconds on a resume, so manual
verification is unlikely unless it can happen automatically — from an
applicant tracking system (ATS), a sourcing tool, or a link on a CV.

This API is additive. The existing web/mobile verify contract
(`GET /api/v1/verify/:id`) is unchanged.

## Purpose

- **For a CV / QR code.** A single credential ID resolves to a compact JSON
  verdict with no login required. Any recruiter — or any automated system
  they use — can read the verdict in under a second.
- **For an ATS integration.** A batch endpoint accepts up to 50 credential
  IDs per request, authenticated with an API key. One roundtrip verifies a
  whole candidate pipeline in parallel.

## Endpoints

Base URL: `${API_BASE_URL}/api/v1/verify`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/public/:id`    | None     | Compact single-credential verdict, public and cacheable. |
| POST | `/batch`         | API key  | Batch lookup, up to 50 ids. |

## Authentication

The batch endpoint requires an API key sent in the `X-API-Key` header.

Keys are configured server-side in the `RECRUITER_API_KEYS` env var as a
comma-separated list of plaintext secrets. At startup the backend hashes each
one with SHA-256; the incoming header value is hashed with the same algorithm
and compared with `crypto.timingSafeEqual` on the raw digest bytes. The key
plaintext is never logged. The hash is never returned to the caller.

The public GET endpoint requires **no** authentication — it is the endpoint
behind the shareable link / QR code on a CV. Rate limiting still applies
per source IP.

## Request / Response examples

### `GET /public/:id`

```bash
curl -sS \
  https://api.veriskill.local/api/v1/verify/public/00000000-0000-4000-8000-000000000001
```

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "status": "VALID",
  "skill": "TypeScript",
  "layer": 5,
  "trustScore": 82,
  "issuedAt": "2026-01-15T12:00:00.000Z",
  "verifiedAt": "2026-11-27T18:04:12.345Z",
  "onChain": {
    "chain": "sepolia",
    "chainId": 11155111,
    "contractAddress": "0x14032516c8e06CC0530b1BA8F9345B10315b5C4A",
    "tokenId": "42",
    "easAttestationUid": "0xab...cd",
    "txHash": "0xcd...ef"
  }
}
```

Response headers include a weak `ETag` and `Cache-Control: public, max-age=30`.
A repeated poll from the same client can send `If-None-Match` and get a
`304 Not Modified` with no body when the verdict hasn't changed.

### `POST /batch`

```bash
curl -sS -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: your-key-here' \
  -d '{"ids":["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000099"]}' \
  https://api.veriskill.local/api/v1/verify/batch
```

```json
{
  "results": [
    { "id": "00000000-0000-4000-8000-000000000001", "status": "VALID",     "skill": "TypeScript", "layer": 5, "trustScore": 82, "issuedAt": "...", "verifiedAt": "...", "onChain": { ... } },
    { "id": "00000000-0000-4000-8000-000000000099", "status": "NOT_FOUND", "skill": null, "layer": null, "trustScore": null, "issuedAt": null, "verifiedAt": "...", "onChain": null }
  ]
}
```

Results are returned in the **same order** as the input `ids`. Duplicate ids
in a single request are deduplicated server-side (one DB fetch) and expanded
back to the input order in the response.

## Status codes

| Code | When |
|---|---|
| 200 | Found. Body contains the verdict. `status` field tells you which kind. |
| 304 | Conditional GET with matching `If-None-Match`. No body. |
| 400 | Bad credential ID format (not a UUID) on the single-GET route. |
| 401 | Batch route without a valid `X-API-Key`. |
| 404 | Single-GET route, credential unknown or unminted. Body has `status: "NOT_FOUND"`. |
| 422 | Batch body failed Zod validation (wrong types, 0 or >50 ids, bad UUIDs). |
| 429 | Rate limit exceeded. See the `RateLimit-*` response headers. |
| 500 | Unexpected server error. Body has a generic message and a `requestId` for log lookup. |

Error bodies have a uniform shape:

```json
{ "error": "human message", "requestId": "..." }
```

Validation errors additionally include a `details` object with field-level
Zod errors. Stack traces are never returned.

## Rate limits

Per-key (or per-IP on the public GET) fixed window. Defaults:

- Window: 60 seconds (`RECRUITER_API_RATE_LIMIT_WINDOW_MS`)
- Max: 120 requests (`RECRUITER_API_RATE_LIMIT_MAX`)

Each response carries the standard `RateLimit-Limit`, `RateLimit-Remaining`
and `RateLimit-Reset` headers. A 429 response includes
`{"error":"Rate limit exceeded for recruiter API — try again later."}`.

## Caching

`GET /public/:id` returns `Cache-Control: public, max-age=30` and a weak
`ETag` computed over the verdict body (excluding the `verifiedAt` timestamp,
so it reflects state changes, not the clock). Short TTL because a credential
can be suspended or revoked at any time and the recruiter needs to see that
without polling the admin API.

`POST /batch` returns `Cache-Control: private, max-age=30` and an equivalent
`ETag`. Clients that resend the same `ids` array within 30 s should send
`If-None-Match` and short-circuit on 304.

## ATS integration example

A typed client ships from the monorepo at `@veriskill/shared`. It validates
every response against the Zod schema at runtime, so a backend that silently
changes shape surfaces as a parse error, not a bug deep in the ATS.

```ts
import { RecruiterApiClient } from '@veriskill/shared'

const client = new RecruiterApiClient({
  baseUrl: 'https://api.veriskill.local',
  apiKey:  process.env.VERISKILL_KEY!,
})

export async function verifyCandidates(ids: string[]) {
  const { results } = await client.verifyBatch(ids)
  return results.filter(v => v.status === 'VALID')
}
```

Prefer raw `fetch` for the public single-credential GET — no key, no
dependency:

```bash
curl -sS https://api.veriskill.local/api/v1/verify/public/${id}
```

## Contract test

The response shape is enforced from two sides:

- `packages/shared/src/recruiter-api/schema.ts` holds the Zod schema. The
  typed client uses it at runtime. The TypeScript types are inferred from it.
- `apps/backend/tests/{unit,integration}/recruiter-api.test.ts` imports the
  same schema and calls `publicVerdictSchema.parse(response.body)` /
  `batchResponseSchema.parse(response.body)` on every response. If the
  backend ever renames a field or changes a type, the test fails immediately.

To change the response shape intentionally: edit the schema in
`packages/shared`, rebuild shared (`npm run build` in `packages/shared`),
update the backend emission in `apps/backend/src/services/public-verify.service.ts`,
update `docs/openapi.yaml`, and then let the tests confirm every edge is
consistent.

## QR code / shareable link

The public GET is the stable, machine-readable endpoint. For human-facing
QR codes and shared URLs, either of the following works and resolves within
one request:

- `${API_BASE_URL}/api/v1/verify/public/${id}` — returns the JSON verdict.
- `${WEB_BASE_URL}/verify/${id}` — the existing web verification page that
  consumes `GET /api/v1/verify/:id`.

The VeriSkill mobile scanner uses a UUID-matching regex to extract the
credential ID from any scanned string, so either URL is a valid QR payload
and the mobile flow remains unchanged.

## Security notes

- **Private data is never returned.** `email`, `walletAddress`, reviewer
  identities, raw evidence URLs and IP hashes are deliberately excluded from
  every response. The unit test `recruiter-api.test.ts` asserts this with a
  recursive check across the response body.
- **No state leak.** Off-chain lifecycle values that aren't publicly
  meaningful (`DRAFT`, `PENDING_REVIEW`, `APPEALING`, `REJECTED`) all collapse
  to `NOT_FOUND` so the API doesn't expose internal verification state.
- **Constant-time key comparison.** `crypto.timingSafeEqual` on SHA-256
  digests. Short-circuit returns fall out of a plain loop without varying
  with the position of the match.
- **No stack traces.** Error bodies carry a message and a `requestId` only.
- **CORS.** Not configured for cross-origin browsers. ATS integrations call
  this server-to-server with their API key; a frontend that needs the public
  GET from a browser needs an `ALLOWED_ORIGINS` update.
- **Not a secret channel.** Treat the response as public. The whole point
  of the API is that a recruiter without a VeriSkill account can read it.

## Versioning

The URL prefix `/api/v1/` is the version boundary. Backwards-compatible
additions (new optional fields) ship under `/api/v1`. Breaking changes mean
a new `/api/v2`. Clients should ignore unknown response fields.

## Future work (deferred)

- **Webhooks on status change.** When a credential is suspended, unsuspended,
  revoked, or has its layer updated, POST a signed (HMAC-SHA256) event to
  URLs registered against a key. Design sketch:

  ```
  POST <registered_url>
  Content-Type: application/json
  X-Veriskill-Signature: t=<unix_ts>,v1=<hmac_sha256(secret, body)>
  X-Veriskill-Event: credential.suspended | credential.revoked | credential.layer_updated

  { "id": "...", "status": "SUSPENDED", "occurredAt": "...", "layer": 4 }
  ```

  Requires: a `recruiter_api_webhooks` table (key_id, url, secret, enabled);
  an outbound dispatcher with retries/backoff/dead-letter; a wire-up at the
  three state-change code paths. Deferred as a separate task per the Phase 0
  "finish every part the task needs" rule — it is a feature on its own.

- **OpenAPI-driven client codegen.** The `docs/openapi.yaml` spec is a
  starting point; packaging a published `@veriskill/recruiter-client` would
  turn ATS integration into a one-liner.

- **ENS / wallet-address lookup.** Not every ATS has the credential UUID
  on hand. A lookup by developer wallet address or ENS name would be useful,
  but needs product-side decisions about rate limiting and enumeration
  safety first.
