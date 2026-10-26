import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import styles from './CredentialDetailPage.module.css'

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

  if (isLoading) return <p className={styles.loading}>Loading credential…</p>
  if (isError || !data) {
    return <p className={styles.error} role="alert">Credential not found or not yet verified.</p>
  }

  const href = data.tokenId ? explorerHref(data.tokenId) : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{data.skill}</h1>
          <div className={styles.badges}>
            {data.verified
              ? <Badge variant="success">Verified on-chain</Badge>
              : <Badge variant="default">{data.lifecycleStatus}</Badge>}
            <Badge variant="default">Layer {data.verificationLayer}</Badge>
            {data.tokenId && <Badge variant="success">On-chain #{data.tokenId}</Badge>}
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" className={styles.explorerLink}>
                View on-chain <ExternalLink size={12} aria-hidden />
              </a>
            )}
          </div>
        </div>
      </header>

      <Card>
        <CardHeader><span className={styles.sectionTitle}>Credential</span></CardHeader>
        <CardBody>
          <dl className={styles.publicGrid}>
            {data.developer.displayName && (
              <>
                <dt>Issued to</dt>
                <dd>{data.developer.displayName}</dd>
              </>
            )}
            <dt>Trust score</dt>
            <dd>{Math.round(data.trustScore)} / 100</dd>
            {data.onChainMintedAt && (
              <>
                <dt>Minted</dt>
                <dd>{new Date(data.onChainMintedAt).toLocaleDateString()}</dd>
              </>
            )}
            {data.commitHash && (
              <>
                <dt>Commit hash</dt>
                <dd className={styles.mono}>{data.commitHash}</dd>
              </>
            )}
          </dl>
        </CardBody>
      </Card>
    </div>
  )
}
