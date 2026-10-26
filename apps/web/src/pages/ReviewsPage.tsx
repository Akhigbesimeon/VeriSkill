import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Flag, Clock, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import api from ''
import { useAuthStore } from '@/store/auth.store'
import { RATING_LABELS } from '@/lib/credentials'
import styles from './ReviewsPage.module.css'

interface PeerReview {
  id: string
  credentialId: string
  status: string
  assignedAt: string
  expiresAt: string
  credential?: {
    skill: string
    verificationLayer: number
  }
}

export function ReviewsPage() {
  const role = useAuthStore(s => s.user?.role)
  if (role === 'expert_verifier') return <ExpertReviewsView />
  return <PeerReviewsView />
}

function PeerReviewsView() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [decision, setDecision] = useState<'APPROVE' | 'FLAG'>('APPROVE')
  const [rationale, setRationale] = useState('')
  const [formError, setFormError] = useState('')

  const { data, isLoading, isError } = useQuery<PeerReview[]>({
    queryKey: ['peer-reviews'],
    queryFn: async () => {
      const { data } = await api.get<PeerReview[]>('/peer-reviews')
      return data
    },
  })

  const submitReview = useMutation({
    mutationFn: ({ id, decision, rationale }: { id: string; decision: string; rationale: string }) =>
      api.post(`/peer-reviews/${id}/submit`, { decision, rationale }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['peer-reviews'] })
      setExpanded(null)
      setRationale('')
      setFormError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setFormError(msg ?? 'Submission failed. Please try again.')
    },
  })

  const handleSubmit = (id: string, e: FormEvent) => {
    e.preventDefault()
    if (rationale.trim().length < 20) {
      setFormError('Rationale must be at least 20 characters.')
      return
    }
    setFormError('')
    submitReview.mutate({ id, decision, rationale })
  }

  const reviews = data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Assigned to you</span>
        <h1 className={styles.title}>Peer reviews</h1>
        <p className={styles.sub}>Reviews waiting for your assessment. Complete each one before its deadline.</p>
      </header>

      {isError && <p className={styles.error} role="alert">Failed to load reviews.</p>}

      {isLoading ? (
        <p className={styles.loading}>Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No pending reviews</p>
          <p className={styles.emptyHint}>You have no reviews assigned at the moment.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {reviews.map(r => {
            const isOpen    = expanded === r.id
            const expires   = new Date(r.expiresAt)
            const daysLeft  = Math.ceil((expires.getTime() - Date.now()) / 86_400_000)
            const isExpiring = daysLeft <= 1

            return (
              <Card key={r.id}>
                <CardHeader>
                  <div className={styles.reviewMeta}>
                    <span className={styles.reviewSkill}>{r.credential?.skill ?? 'Credential'}</span>
                    <div className={styles.reviewBadges}>
                      <Badge variant="default">Layer {r.credential?.verificationLayer ?? '?'}</Badge>
                      <Badge variant={isExpiring ? 'danger' : 'warning'}>
                        <Clock size={11} aria-hidden style={{ marginRight: 3 }} />
                        {daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`}
                      </Badge>
                    </div>
                  </div>
                  <div className={styles.reviewActions}>
                    <Link to={`/credentials/${r.credentialId}`}>
                      <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />}>
                        View evidence
                      </Button>
                    </Link>
                    {!isOpen ? (
                      <Button
                        size="sm"
                        onClick={() => { setExpanded(r.id); setDecision('APPROVE'); setRationale(''); setFormError('') }}
                      >
                        Review
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardBody>
                    <form onSubmit={e => handleSubmit(r.id, e)} className={styles.form} noValidate>
                      <div className={styles.decisionRow} role="group" aria-label="Decision">
                        <label className={[styles.decisionBtn, decision === 'APPROVE' ? styles.approve : ''].join(' ')}>
                          <input type="radio" name={`decision-${r.id}`} value="APPROVE"
                            checked={decision === 'APPROVE'} onChange={() => setDecision('APPROVE')} className="sr-only" />
                          <CheckCircle2 size={16} aria-hidden />
                          <span>Approve</span>
                        </label>
                        <label className={[styles.decisionBtn, decision === 'FLAG' ? styles.flag : ''].join(' ')}>
                          <input type="radio" name={`decision-${r.id}`} value="FLAG"
                            checked={decision === 'FLAG'} onChange={() => setDecision('FLAG')} className="sr-only" />
                          <Flag size={16} aria-hidden />
                          <span>Flag concern</span>
                        </label>
                      </div>

                      <div className={styles.rationaleField}>
                        <label htmlFor={`rationale-${r.id}`} className={styles.rationaleLabel}>
                          Rationale <span className={styles.charCount}>{rationale.length} / 2000</span>
                        </label>
                        <textarea
                          id={`rationale-${r.id}`}
                          className={styles.textarea}
                          placeholder="Explain your decision with specific observations (min. 20 characters)…"
                          value={rationale}
                          onChange={e => setRationale(e.target.value)}
                          maxLength={2000}
                          rows={4}
                          required
                        />
                        {formError && <p className={styles.formError} role="alert">{formError}</p>}
                      </div>

                      <Button type="submit" loading={submitReview.isPending}>Submit Review</Button>
                    </form>
                  </CardBody>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface ExpertReview {
  id: string
  credentialId: string
  status: string
  assignedAt: string
  confidenceRating: number | null
  notes: string | null
  credential?: { skill: string; verificationLayer: number }
}

function ExpertReviewsView() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rating, setRating] = useState<number>(3)
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const { data, isLoading, isError } = useQuery<ExpertReview[]>({
    queryKey: ['expert-reviews'],
    queryFn: async () => {
      const { data } = await api.get<ExpertReview[]>('/expert-reviews')
      return data
    },
  })

  const submitReview = useMutation({
    mutationFn: ({ id, confidenceRating, notes }: { id: string; confidenceRating: number; notes: string }) =>
      api.post(`/expert-reviews/${id}/submit`, { confidenceRating, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expert-reviews'] })
      setExpanded(null)
      setNotes('')
      setFormError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setFormError(msg ?? 'Submission failed. Please try again.')
    },
  })

  const handleSubmit = (id: string, e: FormEvent) => {
    e.preventDefault()
    if (notes.trim().length < 20) {
      setFormError('Notes must be at least 20 characters.')
      return
    }
    setFormError('')
    submitReview.mutate({ id, confidenceRating: rating, notes })
  }

  const reviews = data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Assigned to you</span>
        <h1 className={styles.title}>Expert reviews</h1>
        <p className={styles.sub}>Rate credentials on a 1–5 scale with written notes. A rating of 3 or higher lifts the credential to Layer 6.</p>
      </header>

      {isError && <p className={styles.error} role="alert">Failed to load reviews.</p>}

      {isLoading ? (
        <p className={styles.loading}>Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No pending reviews</p>
          <p className={styles.emptyHint}>You have no expert reviews assigned at the moment.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {reviews.map(r => {
            const isOpen = expanded === r.id
            return (
              <Card key={r.id}>
                <CardHeader>
                  <div className={styles.reviewMeta}>
                    <span className={styles.reviewSkill}>{r.credential?.skill ?? 'Credential'}</span>
                    <div className={styles.reviewBadges}>
                      <Badge variant="default">Layer {r.credential?.verificationLayer ?? '?'}</Badge>
                    </div>
                  </div>
                  <div className={styles.reviewActions}>
                    <Link to={`/credentials/${r.credentialId}`}>
                      <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />}>
                        View evidence
                      </Button>
                    </Link>
                    {!isOpen ? (
                      <Button
                        size="sm"
                        onClick={() => { setExpanded(r.id); setRating(3); setNotes(''); setFormError('') }}
                      >
                        Review
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardBody>
                    <form onSubmit={e => handleSubmit(r.id, e)} className={styles.form} noValidate>
                      <div className={styles.decisionRow} role="radiogroup" aria-label="Confidence rating">
                        {[1, 2, 3, 4, 5].map(n => (
                          <label
                            key={n}
                            className={[styles.decisionBtn, rating === n ? styles.approve : ''].join(' ')}
                          >
                            <input
                              type="radio"
                              name={`rating-${r.id}`}
                              value={n}
                              checked={rating === n}
                              onChange={() => setRating(n)}
                              className="sr-only"
                            />
                            <span>{n} · {RATING_LABELS[n]}</span>
                          </label>
                        ))}
                      </div>

                      <div className={styles.rationaleField}>
                        <label htmlFor={`notes-${r.id}`} className={styles.rationaleLabel}>
                          Notes <span className={styles.charCount}>{notes.length} / 2000</span>
                        </label>
                        <textarea
                          id={`notes-${r.id}`}
                          className={styles.textarea}
                          placeholder="Explain your rating with specific observations (min. 20 characters)…"
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          maxLength={2000}
                          rows={4}
                          required
                        />
                        {formError && <p className={styles.formError} role="alert">{formError}</p>}
                      </div>

                      <Button type="submit" loading={submitReview.isPending}>Submit Review</Button>
                    </form>
                  </CardBody>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
