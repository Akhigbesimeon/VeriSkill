import https from 'https'
import { URL } from 'url'
import * as dns from 'dns/promises'
import { env } from '../config/env'
import { EvidenceUrl, UrlValidationStatus } from '../models/EvidenceUrl'
import { Provider } from '../models/Provider'
import { calculateTrustScore } from './trust-score.service'

// SSRF blocklist — Phase 0 Section 5.
const BLOCKED_CIDRS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^100\.64\./,
  /^0\./,
]

function isBlockedIp(ip: string): boolean {
  return BLOCKED_CIDRS.some(re => re.test(ip))
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return isBlockedIp(hostname)
  return ['localhost', 'metadata.google.internal', '169.254.169.254'].includes(lower)
}

async function assertSafeHostname(hostname: string): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw Object.assign(new Error('SSRF: blocked hostname'), { code: 'BLOCKED' })
  }
  let addresses: string[]
  try {
    addresses = await dns.resolve4(hostname)
  } catch {
    try {
      addresses = await dns.resolve6(hostname)
    } catch {
      throw Object.assign(new Error('DNS resolution failed'), { code: 'DNS_FAILED' })
    }
  }
  for (const ip of addresses) {
    if (isBlockedIp(ip)) {
      throw Object.assign(new Error(`SSRF: blocked IP ${ip}`), { code: 'BLOCKED' })
    }
  }
}

async function matchProvider(hostname: string) {
  const providers = await Provider.findAll({ where: { isActive: true } })
  return providers.find(p => hostname === p.hostname || hostname.endsWith(`.${p.hostname}`)) ?? null
}

interface FetchResult {
  statusCode: number
  finalUrl: string
  redirectCount: number
  bodyPreview: string
  responseSize: number
  contentType: string
}

function fetchWithConstraints(urlStr: string, redirectsLeft: number): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr)

    if (parsed.protocol !== 'https:') {
      return reject(Object.assign(new Error('Non-HTTPS URL'), { code: 'INVALID_SCHEME' }))
    }

    const req = https.get(
      urlStr,
      {
        timeout: env.URL_FETCH_TIMEOUT_MS,
        headers: {
          'User-Agent': 'VeriSkill-Verifier/1.0 (+https://veriskill.rw)',
          // Prefer VC/Open Badge JSON when the provider supports it; fall back to HTML.
          'Accept': 'application/vc+ld+json,application/ld+json;q=0.9,application/json;q=0.8,text/html;q=0.5',
        },
        rejectUnauthorized: true,
      },
      (res) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirectsLeft <= 0) {
            return reject(Object.assign(new Error('Too many redirects'), { code: 'REDIRECT_LOOP' }))
          }
          const location = res.headers.location
          if (!location) return reject(new Error('Redirect without Location header'))
          const nextUrl = new URL(location, urlStr).toString()
          return resolve(fetchWithConstraints(nextUrl, redirectsLeft - 1))
        }

        let body = ''
        let size = 0
        const maxSize = env.URL_FETCH_MAX_RESPONSE_BYTES
        // Buffer 32KB when the response looks like a VC JSON — big enough for
        // signed credential payloads, still bounded.
        const previewCap = (res.headers['content-type'] ?? '').includes('json') ? 32_768 : 2048

        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (body.length < previewCap) body += chunk.toString('utf8')
          if (size > maxSize) res.destroy()
        })

        res.on('end', () => resolve({
          statusCode: res.statusCode ?? 0,
          finalUrl: urlStr,
          redirectCount: env.URL_FETCH_MAX_REDIRECTS - redirectsLeft,
          bodyPreview: body.slice(0, previewCap),
          responseSize: size,
          contentType: (res.headers['content-type'] ?? '').toString(),
        }))

        res.on('error', reject)
      }
    )

    req.on('timeout', () => {
      req.destroy()
      reject(Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' }))
    })

    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOTFOUND') {
        reject(Object.assign(err, { code: 'DNS_FAILED' }))
      } else {
        reject(err)
      }
    })
  })
}

// shortcut: VC/Open Badge structural check only (W3C context + proof block +
// subject), not a full cryptographic verification. Upgrade to
// @digitalcredentials/vc verifyCredential() once we wire a JSON-LD document
// loader and a signature suite. The structural check still rejects obviously-
// fake payloads and beats the keyword heuristic.
const VC_CONTEXTS = [
  'https://www.w3.org/2018/credentials/v1',
  'https://w3id.org/openbadges/v2',
  'https://purl.imsglobal.org/spec/ob/v3p0/context.json',
]

export interface VcCheckResult {
  isCredential: boolean
  cryptoVerified: boolean
  issuer?: string
}

export function checkVerifiableCredential(body: string, contentType: string): VcCheckResult {
  if (!contentType.includes('json')) return { isCredential: false, cryptoVerified: false }

  let parsed: any
  try { parsed = JSON.parse(body) } catch { return { isCredential: false, cryptoVerified: false } }

  const ctx = Array.isArray(parsed['@context']) ? parsed['@context'] : [parsed['@context']]
  const hasVcContext = ctx.some((c: unknown) => typeof c === 'string' && VC_CONTEXTS.includes(c))
  if (!hasVcContext) return { isCredential: false, cryptoVerified: false }

  const hasProof = !!parsed.proof && typeof parsed.proof === 'object'
  const hasSubject = !!parsed.credentialSubject || !!parsed.recipient
  if (!hasProof || !hasSubject) return { isCredential: true, cryptoVerified: false }

  const issuer = typeof parsed.issuer === 'string'
    ? parsed.issuer
    : parsed.issuer?.id ?? parsed.issuer?.url
  return { isCredential: true, cryptoVerified: true, issuer }
}

function contentLooksLikeCertificate(body: string, providerTier?: number): boolean {
  if (providerTier === 1) return true
  const lower = body.toLowerCase()
  const keywords = [
    'certificate', 'certification', 'completed', 'awarded', 'verified',
    'badge', 'credential', 'achievement', 'course', 'programme',
  ]
  return keywords.some(kw => lower.includes(kw))
}

interface VerificationResult {
  status: UrlValidationStatus
  providerTier: 1 | 2 | null
  providerId: string | null
  details: Record<string, unknown>
}

async function verifyUrl(url: string): Promise<VerificationResult> {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return { status: 'INVALID_SCHEME', providerTier: null, providerId: null, details: { error: 'Malformed URL' } }
  }

  if (!url.startsWith('https://')) {
    return { status: 'INVALID_SCHEME', providerTier: null, providerId: null, details: { url } }
  }

  try {
    await assertSafeHostname(hostname)
  } catch (err: unknown) {
    const e = err as { code?: string; message: string }
    if (e.code === 'BLOCKED') return { status: 'BLOCKED', providerTier: null, providerId: null, details: { reason: e.message } }
    if (e.code === 'DNS_FAILED') return { status: 'DNS_FAILED', providerTier: null, providerId: null, details: {} }
    return { status: 'UNVERIFIABLE', providerTier: null, providerId: null, details: { error: e.message } }
  }

  const provider = await matchProvider(hostname)
  const providerTier = (provider?.tier as 1 | 2 | null) ?? null
  const providerId = provider?.id ?? null

  let fetchResult: FetchResult
  try {
    fetchResult = await fetchWithConstraints(url, env.URL_FETCH_MAX_REDIRECTS)
  } catch (err: unknown) {
    const e = err as { code?: string }
    const codeMap: Record<string, UrlValidationStatus> = {
      INVALID_SCHEME: 'INVALID_SCHEME',
      REDIRECT_LOOP: 'REDIRECT_LOOP',
      TIMEOUT: 'TIMEOUT',
      DNS_FAILED: 'DNS_FAILED',
    }
    const status: UrlValidationStatus = codeMap[e.code ?? ''] ?? 'UNVERIFIABLE'
    return { status, providerTier, providerId, details: {} }
  }

  if (fetchResult.statusCode === 401 || fetchResult.statusCode === 403) {
    return { status: 'LOGIN_REQUIRED', providerTier, providerId, details: { statusCode: fetchResult.statusCode } }
  }

  if (fetchResult.statusCode >= 500) {
    return { status: 'UNVERIFIABLE', providerTier, providerId, details: { statusCode: fetchResult.statusCode } }
  }

  const loginIndicators = ['sign in', 'log in', 'login required', 'please sign in']
  const bodyLower = fetchResult.bodyPreview.toLowerCase()
  if (loginIndicators.some(kw => bodyLower.includes(kw)) && fetchResult.statusCode === 200) {
    return { status: 'LOGIN_REQUIRED', providerTier, providerId, details: {} }
  }

  // VC / Open Badge first — strongest signal when the provider returns one.
  const vc = checkVerifiableCredential(fetchResult.bodyPreview, fetchResult.contentType)
  if (vc.cryptoVerified) {
    return {
      status: 'VALID',
      providerTier,
      providerId,
      details: {
        statusCode: fetchResult.statusCode,
        finalUrl: fetchResult.finalUrl,
        redirectCount: fetchResult.redirectCount,
        responseSize: fetchResult.responseSize,
        cryptoVerified: true,
        issuer: vc.issuer,
      },
    }
  }

  if (!contentLooksLikeCertificate(fetchResult.bodyPreview, provider?.tier)) {
    return {
      status: 'CONTENT_CHECK_FAILED',
      providerTier,
      providerId,
      details: { hint: 'No certificate-related content detected', cryptoVerified: false },
    }
  }

  return {
    status: 'VALID',
    providerTier,
    providerId,
    details: {
      statusCode: fetchResult.statusCode,
      finalUrl: fetchResult.finalUrl,
      redirectCount: fetchResult.redirectCount,
      responseSize: fetchResult.responseSize,
      cryptoVerified: false,
    },
  }
}

export async function processEvidenceUrl(evidenceUrlId: string): Promise<void> {
  const evidence = await EvidenceUrl.findByPk(evidenceUrlId)
  if (!evidence) return

  const result = await verifyUrl(evidence.url)

  await evidence.update({
    validationStatus: result.status,
    providerTier: result.providerTier,
    providerId: result.providerId,
    validationResult: result.details,
    lastCheckedAt: new Date(),
  })

  await calculateTrustScore(evidence.credentialId)
}
