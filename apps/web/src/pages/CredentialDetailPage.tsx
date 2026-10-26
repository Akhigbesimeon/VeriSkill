import { useState, useEffect, useRef, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { Plus, Send, CheckCircle2, XCircle, Clock, AlertTriangle, ShieldCheck, ChevronDown, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import api from '@/lib/api'
import { statusVariant } from '@/lib/credentials'
import styles from './CredentialDetailPage.module.css'

interface EvidenceUrl {
  id: string
  url: string
  validationStatus: string
  providerTier: number | null
  lastCheckedAt: string | null
}

interface GithubScan {
  id: string
  repoUrl: string
  repoName: string
  scanStatus: string
  healthScore: number
  skillMatchType: string | null
  isFork: boolean | null
  languages: Record<string, number> | null
  frameworks: string[] | null
  healthBreakdown: Record<string, number> | null
  commitCount: number | null
  lastCommitAt: string | null
}

interface Credential {
  id: string
  skill: string
  verificationLayer: number
  lifecycleStatus: string
  trustScore: number
  tokenId: string | null
  evidenceUrls: EvidenceUrl[]
  githubScans: GithubScan[]
  createdAt: string
}

// Official GitHub "Invertocat" mark (github.com/logos). Inlined to avoid adding a dependency.
function GithubLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.69-3.87-1.37-3.87-1.37-.53-1.33-1.29-1.68-1.29-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.04 1.78 2.72 1.26 3.38.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.21-1.49 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.27 5.68.41.35.78 1.04.78 2.1 0 1.52-.01 2.74-.01 3.11 0 .3.2.66.79.55C20.72 21.39 24 17.08 24 12 24 5.65 18.85.5 12 .5z"/>
    </svg>
  )
}

function urlStatusLabel(s: string): string {
  if (s === 'VALID') return 'Valid'
  if (s === 'PENDING') return 'Pending'
  if (['REVOKED', 'CONTENT_CHECK_FAILED', 'DNS_FAILED', 'TIMEOUT'].includes(s)) return 'Failed'
  return s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())
}

function urlStatusIcon(s: string) {
  if (s === 'VALID')   return <CheckCircle2 size={14} color="var(--color-success)" aria-label="Valid" />
  if (s === 'PENDING') return <Clock size={14} color="var(--color-text-secondary)" aria-label="Pending" />
  if (['REVOKED', 'CONTENT_CHECK_FAILED', 'DNS_FAILED', 'TIMEOUT'].includes(s))
    return <XCircle size={14} color="var(--color-danger)" aria-label="Failed" />
  return <AlertTriangle size={14} color="var(--color-warning)" aria-label={s} />
}

function QrShare({ credentialId }: { credentialId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const payload = `veriskill://verify/${credentialId}`

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, payload, { width: 192, margin: 1 })
      .catch(() => setError('Could not render QR code.'))
  }, [payload])

  return (
    <div className={styles.qrShare}>
      <canvas ref={canvasRef} aria-label="Credential verification QR code" />
      <div className={styles.qrShareCopy}>
        <p>
          Recruiters scan this with the VeriSkill mobile app to verify this credential
          on the chain. The QR carries only the credential ID — no personal data.
        </p>
        <div className={styles.qrShareUrl}>{payload}</div>
        {error && <span className={styles.qrError}>{error}</span>}
      </div>
    </div>
  )
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

function RepoRow({ scan, onDelete, deleting }: { scan: GithubScan; onDelete?: () => void; deleting?: boolean }) {
  const [open, setOpen] = useState(false)
  const complete = scan.scanStatus === 'COMPLETE'
  const topLangs = scan.languages
    ? Object.entries(scan.languages).sort(([, a], [, b]) => b - a).slice(0, 3)
    : []
  const healthSignals = scan.healthBreakdown
    ? Object.entries(scan.healthBreakdown).filter(([, v]) => v > 0)
    : []

  return (
    <li className={styles.repoItem}>
      <div className={styles.repoHead}>
        <GithubLogo size={16} />
        <a href={scan.repoUrl} target="_blank" rel="noopener noreferrer" className={styles.repoName} title={scan.repoName}>
          {scan.repoName}
        </a>
        {complete && (
          <Button
            className={styles.repoAction}
            variant="ghost"
            size="sm"
            icon={<ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />}
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
          >
            {open ? 'Hide summary' : 'Summary'}
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className={styles.trashBtn}
            icon={<Trash2 size={14} color="var(--color-danger)" />}
            aria-label={`Remove ${scan.repoName}`}
            loading={deleting}
            onClick={onDelete}
          >{''}</Button>
        )}
      </div>

      <div className={styles.repoMeta}>
        <Badge variant={complete ? 'success' : scan.scanStatus === 'PENDING' ? 'default' : 'danger'}>
          {scan.scanStatus}
        </Badge>
        {complete && (
          <>
            <Badge variant="info">Health {scan.healthScore}/30</Badge>
            {scan.skillMatchType && <Badge variant="accent">Match: {scan.skillMatchType}</Badge>}
          </>
        )}
      </div>

      {complete && open && (
        <div className={styles.summaryPanel}>
          <div className={styles.summaryGrid}>
            {scan.lastCommitAt && (
              <>
                <span className={styles.summaryLabel}>Last commit</span>
                <span className={styles.summaryValue}>{new Date(scan.lastCommitAt).toLocaleDateString()}</span>
              </>
            )}
            {typeof scan.commitCount === 'number' && (
              <>
                <span className={styles.summaryLabel}>Commits</span>
                <span className={styles.summaryValue}>{scan.commitCount.toLocaleString()}</span>
              </>
            )}
            {scan.isFork && (
              <>
                <span className={styles.summaryLabel}>Fork</span>
                <span className={styles.summaryValue}>Forked from another repository</span>
              </>
            )}
            {topLangs.length > 0 && (
              <>
                <span className={styles.summaryLabel}>Languages</span>
                <span className={styles.pillRow}>
                  {topLangs.map(([name, pct]) => (
                    <span key={name} className={styles.pill}><b>{name}</b> {pct}%</span>
                  ))}
                </span>
              </>
            )}
            {scan.frameworks && scan.frameworks.length > 0 && (
              <>
                <span className={styles.summaryLabel}>Frameworks</span>
                <span className={styles.pillRow}>
                  {scan.frameworks.map(f => <span key={f} className={styles.pill}>{f}</span>)}
                </span>
              </>
            )}
            <span className={styles.summaryLabel}>Health signals</span>
            <span className={styles.pillRow}>
              {healthSignals.length === 0
                ? <span className={styles.summaryValue} style={{ color: 'var(--color-text-muted)' }}>None detected</span>
                : healthSignals.map(([k, v]) => <span key={k} className={styles.pill}>{k} <b>+{v}</b></span>)}
            </span>
          </div>
        </div>
      )}
    </li>
  )
}

export function CredentialDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [urlInput, setUrlInput]   = useState('')
  const [urlError, setUrlError]   = useState('')
  const [repoInput, setRepoInput] = useState('')
  const [repoError, setRepoError] = useState('')
  const [pending, setPending] = useState<{ kind: 'evidence' | 'repo'; id: string; label: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: credential, isLoading, isError } = useQuery<Credential>({
    queryKey: ['credential', id],
    queryFn: async () => {
      const { data } = await api.get<Credential>(`/credentials/${id}`)
      return data
    },
    enabled: !!id,
    // Poll while a URL or scan is still being processed in the background.
    refetchInterval: (q) => {
      const c = q.state.data as Credential | undefined
      if (!c) return false
      const pending =
        c.evidenceUrls.some(e => e.validationStatus === 'PENDING') ||
        c.githubScans.some(s => s.scanStatus === 'PENDING')
      return pending ? 3000 : false
    },
  })

  const addEvidence = useMutation({
    mutationFn: (url: string) => api.post(`/credentials/${id}/evidence`, { url }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credential', id] }); setUrlInput('') },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setUrlError(msg ?? 'Failed to submit URL.')
    },
  })

  const addGithub = useMutation({
    mutationFn: (repoUrl: string) => api.post(`/credentials/${id}/github`, { repoUrl }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credential', id] }); setRepoInput('') },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setRepoError(msg ?? 'Failed to submit repository.')
    },
  })

  const removeEvidence = useMutation({
    mutationFn: (evidenceId: string) => api.delete(`/credentials/${id}/evidence/${evidenceId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credential', id] }); setPending(null) },
  })

  const removeGithub = useMutation({
    mutationFn: (scanId: string) => api.delete(`/credentials/${id}/github/${scanId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credential', id] }); setPending(null) },
  })

  const submitForReview = useMutation({
    mutationFn: () => api.post(`/credentials/${id}/submit`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credential', id] }); navigate('/credentials') },
  })

  const removeCredential = useMutation({
    mutationFn: () => api.delete(`/credentials/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credentials'] }); navigate('/credentials') },
  })

  const mint = useMutation({
    mutationFn: () => api.post(`/credentials/${id}/mint`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credential', id] }) },
  })

  const handleAddUrl = (e: FormEvent) => {
    e.preventDefault()
    setUrlError('')
    if (!urlInput.startsWith('https://')) { setUrlError('URL must start with https://'); return }
    addEvidence.mutate(urlInput)
  }

  const handleAddRepo = (e: FormEvent) => {
    e.preventDefault()
    setRepoError('')
    if (!repoInput.includes('github.com')) { setRepoError('Must be a github.com URL'); return }
    addGithub.mutate(repoInput)
  }

  if (isLoading) return <p className={styles.loading}>Loading credential…</p>
  if (isError || !credential) return <p className={styles.error} role="alert">Credential not found.</p>

  const canEdit = ['DRAFT', 'ACTIVE'].includes(credential.lifecycleStatus)
  const canSubmit = credential.lifecycleStatus === 'ACTIVE'
  const canMint =
    credential.verificationLayer >= 4 &&
    credential.lifecycleStatus === 'PENDING_REVIEW' &&
    !credential.tokenId

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{credential.skill}</h1>
          <div className={styles.badges}>
            <Badge variant={statusVariant(credential.lifecycleStatus)}>{credential.lifecycleStatus.replace(/_/g, ' ')}</Badge>
            <Badge variant="default">Layer {credential.verificationLayer}</Badge>
            {credential.tokenId && <Badge variant="success">On-chain #{credential.tokenId}</Badge>}
          </div>
        </div>
        {canMint && (
          <Button
            icon={<ShieldCheck size={16} />}
            loading={mint.isPending}
            onClick={() => mint.mutate()}
          >
            Mint on-chain
          </Button>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            icon={<Trash2 size={16} color="var(--color-danger)" />}
            aria-label="Delete credential"
            onClick={() => setConfirmDelete(true)}
          >{''}</Button>
        )}
      </div>

      <Card>
        <CardHeader><span className={styles.sectionTitle}>Trust Score</span></CardHeader>
        <CardBody>
          <TrustBar score={credential.trustScore} />
        </CardBody>
      </Card>

      {credential.lifecycleStatus === 'MINTED' && (
        <Card>
          <CardHeader><span className={styles.sectionTitle}>Share credential</span></CardHeader>
          <CardBody>
            <QrShare credentialId={credential.id} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <span className={styles.sectionTitle}>Evidence URLs</span>
          <Badge variant="default">{credential.evidenceUrls.length}</Badge>
        </CardHeader>
        <CardBody>
          {credential.evidenceUrls.length === 0 ? (
            <p className={styles.empty}>No URLs submitted yet.</p>
          ) : (
            <ul className={styles.list}>
              {credential.evidenceUrls.map(e => (
                <li key={e.id} className={styles.listItem}>
                  <span className={styles.listIcon}>{urlStatusIcon(e.validationStatus)}</span>
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className={styles.link}>{e.url}</a>
                  <span title={e.validationStatus}>
                    <Badge variant={e.validationStatus === 'VALID' ? 'success' : e.validationStatus === 'PENDING' ? 'default' : 'danger'}>
                      {urlStatusLabel(e.validationStatus)}
                    </Badge>
                  </span>
                  {e.providerTier && <Badge variant="accent">Tier {e.providerTier}</Badge>}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.trashBtn}
                      icon={<Trash2 size={14} color="var(--color-danger)" />}
                      aria-label={`Remove ${e.url}`}
                      loading={removeEvidence.isPending && removeEvidence.variables === e.id}
                      onClick={() => setPending({ kind: 'evidence', id: e.id, label: e.url })}
                    >{''}</Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {['DRAFT', 'ACTIVE'].includes(credential.lifecycleStatus) && (
            <form onSubmit={handleAddUrl} className={styles.addForm}>
              <Input
                label="Add evidence URL"
                type="url"
                placeholder="https://example.com/certificate"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                error={urlError}
              />
              <Button type="submit" size="sm" loading={addEvidence.isPending} icon={<Plus size={14} />}>
                Add URL
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className={styles.sectionTitle}>GitHub Repositories</span>
          <Badge variant="default">{credential.githubScans.length}</Badge>
        </CardHeader>
        <CardBody>
          {credential.githubScans.length === 0 ? (
            <p className={styles.empty}>No repositories scanned yet.</p>
          ) : (
            <ul className={styles.list}>
              {credential.githubScans.map(s => (
                <RepoRow
                  key={s.id}
                  scan={s}
                  onDelete={canEdit ? () => setPending({ kind: 'repo', id: s.id, label: s.repoName }) : undefined}
                  deleting={removeGithub.isPending && removeGithub.variables === s.id}
                />
              ))}
            </ul>
          )}

          {['DRAFT', 'ACTIVE'].includes(credential.lifecycleStatus) && (
            <form onSubmit={handleAddRepo} className={styles.addForm}>
              <Input
                label="Add GitHub repository"
                type="url"
                placeholder="https://github.com/username/repo"
                value={repoInput}
                onChange={e => setRepoInput(e.target.value)}
                error={repoError}
              />
              <Button type="submit" size="sm" loading={addGithub.isPending} icon={<GithubLogo size={14} />}>
                Add Repository
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      {canSubmit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            icon={<Send size={14} />}
            loading={submitForReview.isPending}
            onClick={() => submitForReview.mutate()}
          >
            Submit for Review
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'repo' ? 'Remove repository' : 'Remove evidence URL'}
        message={pending ? `Remove ${pending.label}?` : ''}
        confirmLabel="Remove"
        variant="danger"
        loading={pending?.kind === 'repo' ? removeGithub.isPending : removeEvidence.isPending}
        onConfirm={() => {
          if (!pending) return
          if (pending.kind === 'repo') removeGithub.mutate(pending.id)
          else removeEvidence.mutate(pending.id)
        }}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete credential"
        message={`Delete this ${credential.skill} credential? This also removes any evidence URLs and GitHub scans attached to it.`}
        confirmLabel="Delete"
        variant="danger"
        loading={removeCredential.isPending}
        onConfirm={() => removeCredential.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
