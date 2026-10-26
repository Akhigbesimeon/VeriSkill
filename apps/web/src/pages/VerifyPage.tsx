import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import api from '@/lib/api'
import styles from './VerifyPage.module.css'

interface MintedCredential {
  id: string
  skill: string
  verificationLayer: number
  trustScore: number
  tokenId: string
  onChainMintedAt: string
  developer?: {
    id: string
    displayName: string
    location: string | null
  }
}

function trustLabel(score: number): string {
  if (score >= 90) return 'Expert verified'
  if (score >= 80) return 'Community verified'
  if (score >= 60) return 'Peer verified'
  if (score >= 40) return 'GitHub verified'
  if (score >= 20) return 'URL verified'
  return 'Self declared'
}

function trustVariant(score: number): 'success' | 'accent' | 'info' | 'default' {
  if (score >= 80) return 'success'
  if (score >= 60) return 'accent'
  if (score >= 40) return 'info'
  return 'default'
}

export function VerifyPage() {
  const { data, isLoading, isError } = useQuery<MintedCredential[]>({
    queryKey: ['minted-credentials'],
    queryFn: async () => {
      const { data } = await api.get<MintedCredential[]>('/credentials')
      return data
    },
  })

  const credentials = data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Public ledger</span>
        <h1 className={styles.title}>Verified credentials</h1>
        <p className={styles.sub}>Credentials minted on-chain and verified by the VeriSkill network. Receipts, not claims.</p>
      </header>

      {isError && <p className={styles.error} role="alert">Failed to load credentials.</p>}

      {isLoading ? (
        <p className={styles.loading}>Loading verified credentials…</p>
      ) : credentials.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No verified credentials yet</p>
          <p className={styles.emptyHint}>Credentials appear here once they reach Layer 4 and are minted on-chain.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Developer</th>
                <th>Skill</th>
                <th>Layer</th>
                <th>Trust Score</th>
                <th>Confidence</th>
                <th>Minted</th>
                <th>Token</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map(c => (
                <tr key={c.id}>
                  <td className={styles.devCell}>
                    <span className={styles.devName}>{c.developer?.displayName ?? '—'}</span>
                    {c.developer?.location && (
                      <span className={styles.devLocation}>{c.developer.location}</span>
                    )}
                  </td>
                  <td className={styles.skillCell}>{c.skill}</td>
                  <td><Badge variant="accent">Layer {c.verificationLayer}</Badge></td>
                  <td>
                    <span className={styles.score} style={{
                      color: c.trustScore >= 80 ? 'var(--color-success)'
                           : c.trustScore >= 60 ? 'var(--color-accent)'
                           : 'var(--color-warning)'
                    }}>
                      {c.trustScore}
                    </span>
                  </td>
                  <td><Badge variant={trustVariant(c.trustScore)}>{trustLabel(c.trustScore)}</Badge></td>
                  <td className={styles.dateCell}>
                    {c.onChainMintedAt ? new Date(c.onChainMintedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className={styles.tokenCell}>
                    <code className={styles.token}>#{c.tokenId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card className={styles.legendCard}>
        <CardHeader><span className={styles.legendTitle}>Confidence Levels</span></CardHeader>
        <CardBody>
          <div className={styles.legendGrid}>
            {[
              { range: '90–100', label: 'Expert verified', variant: 'success' as const },
              { range: '80–90',  label: 'Community verified (3+ peers)', variant: 'success' as const },
              { range: '60–80',  label: 'Peer verified (1–2 peers)', variant: 'accent' as const },
              { range: '40–60',  label: 'GitHub repo scanned', variant: 'info' as const },
              { range: '20–40',  label: 'URL evidence checked', variant: 'default' as const },
            ].map(row => (
              <div key={row.range} className={styles.legendRow}>
                <Badge variant={row.variant}>{row.range}</Badge>
                <span className={styles.legendLabel}>{row.label}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
