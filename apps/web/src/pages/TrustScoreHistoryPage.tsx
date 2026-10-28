import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import api from '@/lib/api'
import styles from './TrustScoreHistoryPage.module.css'

interface HistoryEntry {
  id: string
  credentialId: string
  oldScore: string | number
  newScore: string | number
  oldLayer: number
  newLayer: number
  triggerEvent: string
  scoreBreakdown: Record<string, number>
  createdAt: string
}

interface Credential {
  id: string
  skill: string
  trustScore: number
  verificationLayer: number
}

const TRIGGER_LABELS: Record<string, string> = {
  recalculation:            'Score recalculated',
  url_validated:            'URL verified',
  evidence_removed:         'Evidence removed',
  repository_removed:       'Repository removed',
  github_scan_completed:    'GitHub scan completed',
  peer_review_approved:     'Peer review approved',
  peer_review_flagged:      'Peer review flagged',
  expert_review_submitted:  'Expert review submitted',
  submitted_for_review:     'Submitted for review',
  admin_recomputed:         'Admin recomputed',
}

const BREAKDOWN_LABELS: Record<string, string> = {
  selfDeclaration: 'What you claimed',
  urlEvidence:     'Links you provided',
  githubScan:      'Your code we checked',
  peerReview:      'Other devs agreed',
  expertReview:    'An expert confirmed',
}

function labelFor(trigger: string): string {
  return TRIGGER_LABELS[trigger] ?? trigger.replace(/_/g, ' ')
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function TrustScoreHistoryPage() {
  const { id } = useParams<{ id: string }>()

  const credentialQ = useQuery<Credential>({
    queryKey: ['credential', id],
    queryFn: async () => (await api.get<Credential>(`/credentials/${id}`)).data,
    enabled: !!id,
  })

  const historyQ = useQuery<HistoryEntry[]>({
    queryKey: ['credential', id, 'trust-score-history'],
    queryFn: async () => (await api.get<HistoryEntry[]>(`/credentials/${id}/trust-score/history`)).data,
    enabled: !!id,
  })

  const credential = credentialQ.data
  const entries = historyQ.data ?? []

  return (
    <div className={styles.page}>
      <Link to={`/credentials/${id}`} className={styles.back}>
        <ArrowLeft size={14} aria-hidden /> Back to credential
      </Link>

      <header className={styles.header}>
        <span className={styles.eyebrow}>
          {credential?.skill ? `${credential.skill} · Credential` : 'Credential'}
        </span>
        <h1 className={styles.title}>Trust score history</h1>
        <p className={styles.sub}>
          Every event that moved this credential's trust score or verification layer, oldest first.
          Each number below is points out of 100.
        </p>
      </header>

      {historyQ.isError && <p className={styles.error} role="alert">Failed to load history.</p>}

      {historyQ.isLoading ? (
        <p className={styles.loading}>Loading history…</p>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No score changes yet</p>
          <p className={styles.emptyHint}>
            As evidence is verified, scans complete, and reviews are submitted, each change will appear here.
          </p>
        </div>
      ) : (
        <ol className={styles.timeline}>
          {entries.map(entry => <TimelineRow key={entry.id} entry={entry} />)}
        </ol>
      )}
    </div>
  )
}

function TimelineRow({ entry }: { entry: HistoryEntry }) {
  const oldScore = Number(entry.oldScore)
  const newScore = Number(entry.newScore)
  const delta = newScore - oldScore
  const direction: 'up' | 'down' | 'flat' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  const breakdownEntries = entry.scoreBreakdown
    ? Object.entries(entry.scoreBreakdown).filter(([, v]) => Number(v) > 0)
    : []

  return (
    <li className={styles.row}>
      <div className={styles.rail}>
        <span className={[styles.dot, styles[`dot_${direction}`]].join(' ')} aria-hidden />
      </div>

      <div className={styles.card}>
        <div className={styles.rowHead}>
          <span className={styles.when}>{formatWhen(entry.createdAt)}</span>
          <span className={styles.trigger}>{labelFor(entry.triggerEvent)}</span>
        </div>

        <div className={styles.rowMeta}>
          <DeltaBadge direction={direction} delta={delta} oldScore={oldScore} newScore={newScore} />
          {entry.oldLayer !== entry.newLayer ? (
            <Badge variant="info">Layer {entry.oldLayer} → {entry.newLayer}</Badge>
          ) : (
            <Badge variant="default">Layer {entry.newLayer}</Badge>
          )}
        </div>

        {breakdownEntries.length > 0 && (
          <div className={styles.breakdown}>
            {breakdownEntries.map(([key, value]) => (
              <span key={key} className={styles.pill}>
                {BREAKDOWN_LABELS[key] ?? key} <b>{Math.round(Number(value))}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function DeltaBadge({
  direction, delta, oldScore, newScore,
}: { direction: 'up' | 'down' | 'flat'; delta: number; oldScore: number; newScore: number }) {
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus
  const variant = direction === 'up' ? 'success' : direction === 'down' ? 'danger' : 'default'
  const sign = delta > 0 ? '+' : ''
  return (
    <Badge variant={variant}>
      <Icon size={11} aria-hidden style={{ marginRight: 3 }} />
      {Math.round(oldScore)} → {Math.round(newScore)} ({sign}{Math.round(delta)})
    </Badge>
  )
}
