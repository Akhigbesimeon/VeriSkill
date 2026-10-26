import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Flag, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { RATING_LABELS } from '@/lib/credentials'
import styles from './ReviewsPage.module.css'

interface PastPeerReview {
  id: string
  credentialId: string
  status: 'SUBMITTED' | 'FLAGGED'
  decision: 'APPROVE' | 'FLAG' | null
  rationale: string | null
  submittedAt: string | null
  credential?: { skill: string; verificationLayer: number }
}

interface PastExpertReview {
  id: string
  credentialId: string
  status: 'SUBMITTED'
  confidenceRating: number | null
  notes: string | null
  submittedAt: string | null
  credential?: { skill: string; verificationLayer: number }
}

export function PastReviewsPage() {
  const role = useAuthStore(s => s.user?.role)
  if (role === 'expert_verifier') return <PastExpertReviewsView />
  return <PastPeerReviewsView />
}

function formatSubmitted(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function PastPeerReviewsView() {
  const { data, isLoading, isError } = useQuery<PastPeerReview[]>({
    queryKey: ['peer-reviews', 'history'],
    queryFn: async () => (await api.get<PastPeerReview[]>('/peer-reviews/history')).data,
  })

  const reviews = data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>History</span>
        <h1 className={styles.title}>Past reviews</h1>
        <p className={styles.sub}>Reviews you have already submitted, most recent first.</p>
      </header>

      {isError && <p className={styles.error} role="alert">Failed to load reviews.</p>}

      {isLoading ? (
        <p className={styles.loading}>Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No past reviews</p>
          <p className={styles.emptyHint}>Reviews you submit will appear here.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {reviews.map(r => (
            <Card key={r.id}>
              <CardHeader>
                <div className={styles.reviewMeta}>
                  <span className={styles.reviewSkill}>{r.credential?.skill ?? 'Credential'}</span>
                  <div className={styles.reviewBadges}>
                    <Badge variant="default">Layer {r.credential?.verificationLayer ?? '?'}</Badge>
                    {r.decision === 'APPROVE'
                      ? <Badge variant="success"><CheckCircle2 size={11} aria-hidden style={{ marginRight: 3 }} />Approved</Badge>
                      : <Badge variant="danger"><Flag size={11} aria-hidden style={{ marginRight: 3 }} />Flagged</Badge>}
                    <Badge variant="default">{formatSubmitted(r.submittedAt)}</Badge>
                  </div>
                </div>
                <div className={styles.reviewActions}>
                  <Link to={`/credentials/${r.credentialId}`}>
                    <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />}>
                      View evidence
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              {r.rationale && (
                <CardBody>
                  <p>{r.rationale}</p>
                </CardBody>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function PastExpertReviewsView() {
  const { data, isLoading, isError } = useQuery<PastExpertReview[]>({
    queryKey: ['expert-reviews', 'history'],
    queryFn: async () => (await api.get<PastExpertReview[]>('/expert-reviews/history')).data,
  })

  const reviews = data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>History</span>
        <h1 className={styles.title}>Past reviews</h1>
        <p className={styles.sub}>Expert ratings you have already submitted, most recent first.</p>
      </header>

      {isError && <p className={styles.error} role="alert">Failed to load reviews.</p>}

      {isLoading ? (
        <p className={styles.loading}>Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No past reviews</p>
          <p className={styles.emptyHint}>Ratings you submit will appear here.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {reviews.map(r => (
            <Card key={r.id}>
              <CardHeader>
                <div className={styles.reviewMeta}>
                  <span className={styles.reviewSkill}>{r.credential?.skill ?? 'Credential'}</span>
                  <div className={styles.reviewBadges}>
                    <Badge variant="default">Layer {r.credential?.verificationLayer ?? '?'}</Badge>
                    {r.confidenceRating && (
                      <Badge variant={r.confidenceRating >= 3 ? 'success' : 'warning'}>
                        {r.confidenceRating} · {RATING_LABELS[r.confidenceRating]}
                      </Badge>
                    )}
                    <Badge variant="default">{formatSubmitted(r.submittedAt)}</Badge>
                  </div>
                </div>
                <div className={styles.reviewActions}>
                  <Link to={`/credentials/${r.credentialId}`}>
                    <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />}>
                      View evidence
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              {r.notes && (
                <CardBody>
                  <p>{r.notes}</p>
                </CardBody>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
