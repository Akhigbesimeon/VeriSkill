import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ExternalLink, ShieldCheck, Braces } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import styles from './PublicCredentialPage.module.css'

interface PublicCredential {
  id: string
  skill: string
  verificationLayer: number
  trustScore: number
  lifecycleStatus: string
  tokenId: string | null
  commitHash: string | null
  onChainMintedAt: string | null
  developer: { displayName: string | null }
  verified: boolean
}

function explorerHref(tokenId: string): string | null {
  const explorer = import.meta.env.VITE_EXPLORER_URL as string | undefined
  const contract = import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined
  if (!explorer || !contract) return null
  return `${explorer.replace(/\/$/, '')}/token/${contract}?a=${tokenId}`
}

function TrustBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  const color = pct >= 80 ? 'var(--color-success)' : pct >= 60 ? 'var(--color-accent)' : 'var(--color-warning)'
  return (
    <div className={styles.barWrap} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Trust score">
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.barLabel}>{pct} / 100</span>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className={styles.frame}>
      <div className={styles.container}>
        <Link to="/" className={styles.brand}>VeriSkill</Link>
        {children}
      </div>
    </main>
  )
}

export function PublicCredentialPage() {
  const { id } = useParams<{ id: string }>()
  // Plain axios — this page is intentionally public, so no auth header /
  // refresh-redirect behaviour from `@/lib/api` should apply.
  const { data, isLoading, isError } = useQuery<PublicCredential>({
    queryKey: ['public-verify', id],
    queryFn: async () => {
      const { data } = await axios.get<PublicCredential>(`/api/v1/verify/${id}`)
      return data
    },
    enabled: !!id,
    retry: false,
  })

  if (isLoading) return <Frame><p className={styles.loading}>Loading credential…</p></Frame>
  if (isError || !data) {
    return (
      <Frame>
        <p className={styles.error} role="alert">Credential not found or not yet verified.</p>
      </Frame>
    )
  }

  const chainHref = data.tokenId ? explorerHref(data.tokenId) : null
  const jsonHref  = `/api/v1/verify/public/${data.id}`

  return (
    <Frame>
      <header className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden>
          <ShieldCheck size={28} />
        </div>
        <div className={styles.heroBody}>
          <h1 className={styles.title}>{data.skill}</h1>
          <div className={styles.badges}>
            {data.verified
              ? <Badge variant="success">Verified on-chain</Badge>
              : <Badge variant="default">{data.lifecycleStatus}</Badge>}
            <Badge variant="default">Layer {data.verificationLayer}</Badge>
            {data.tokenId && <Badge variant="success">On-chain #{data.tokenId}</Badge>}
            {chainHref && (
              <a href={chainHref} target="_blank" rel="noopener noreferrer" className={styles.chip}>
                View on-chain <ExternalLink size={12} aria-hidden />
              </a>
            )}
            <a href={jsonHref} target="_blank" rel="noopener noreferrer" className={styles.chip} title="Machine-readable verdict used by ATS integrations">
              <Braces size={12} aria-hidden /> View as JSON
            </a>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader><span className={styles.sectionTitle}>Trust score</span></CardHeader>
        <CardBody>
          <TrustBar score={Math.round(data.trustScore)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><span className={styles.sectionTitle}>Credential</span></CardHeader>
        <CardBody>
          <dl className={styles.grid}>
            {data.developer.displayName && (
              <>
                <dt>Issued to</dt>
                <dd>{data.developer.displayName}</dd>
              </>
            )}
            {data.onChainMintedAt && (
              <>
                <dt>Minted</dt>
                <dd>{new Date(data.onChainMintedAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}</dd>
              </>
            )}
            {data.commitHash && (
              <>
                <dt>Commit hash</dt>
                <dd className={styles.mono}>{data.commitHash}</dd>
              </>
            )}
            <dt>Credential ID</dt>
            <dd className={styles.mono}>{data.id}</dd>
          </dl>
        </CardBody>
      </Card>

      <footer className={styles.footer}>
        <ShieldCheck size={12} aria-hidden /> Verified by VeriSkill
        <span className={styles.footerSep}>·</span>
        <a href={jsonHref} target="_blank" rel="noopener noreferrer">machine-readable verdict</a>
      </footer>
    </Frame>
  )
}
