import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldOff, PauseCircle, UserX, UserCheck, UserPlus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import api from '@/lib/api'
import { statusVariant } from '@/lib/credentials'
import styles from './AdminPage.module.css'

interface AdminCredential {
  id: string
  skill: string
  verificationLayer: number
  lifecycleStatus: string
  trustScore: number
  tokenId: string | null
  developer?: { id: string; displayName: string }
}

interface AdminUser {
  id: string
  role: string
  displayName: string
  isActive: boolean
  createdAt: string
  credentialCount: number
  flagsAgainst: number
}

interface AuditEntry {
  id: string
  action: string
  resourceType: string
  resourceId: string
  actorId: string
  createdAt: string
}

interface Analytics {
  usersByRole:         Record<string, number>
  credentialsByStatus: Record<string, number>
  credentialsByLayer:  Record<string, number>
  flaggedPeerReviews:  number
  deactivatedUsers:    number
}

function PageHeader({ title }: { title: string }) {
  return (
    <header className={styles.header}>
      <span className={styles.eyebrow}>Operations</span>
      <h1 className={styles.title}>{title}</h1>
    </header>
  )
}

export function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ['admin-analytics'],
    queryFn: async () => (await api.get<Analytics>('/admin/analytics')).data,
  })

  return (
    <div className={styles.page}>
      <PageHeader title="Analytics" />
      {isLoading || !data ? <p className={styles.loading}>Loading…</p> : (
        <div className={styles.analyticsGrid}>
          <section className={styles.analyticsCard}>
            <h2 className={styles.analyticsTitle}>Users by role</h2>
            <ul className={styles.analyticsList}>
              {Object.entries(data.usersByRole).map(([role, count]) => (
                <li key={role}><span>{role}</span><strong>{count}</strong></li>
              ))}
              <li className={styles.analyticsSub}><span>Deactivated (any role)</span><strong>{data.deactivatedUsers}</strong></li>
            </ul>
          </section>

          <section className={styles.analyticsCard}>
            <h2 className={styles.analyticsTitle}>Credentials by status</h2>
            <ul className={styles.analyticsList}>
              {Object.entries(data.credentialsByStatus).map(([k, v]) => (
                <li key={k}><span>{k}</span><strong>{v}</strong></li>
              ))}
            </ul>
          </section>

          <section className={styles.analyticsCard}>
            <h2 className={styles.analyticsTitle}>Credentials by layer</h2>
            <ul className={styles.analyticsList}>
              {Object.entries(data.credentialsByLayer)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([k, v]) => (
                  <li key={k}><span>Layer {k}</span><strong>{v}</strong></li>
                ))}
            </ul>
          </section>

          <section className={styles.analyticsCard}>
            <h2 className={styles.analyticsTitle}>Moderation signals</h2>
            <ul className={styles.analyticsList}>
              <li><span>Flagged peer reviews</span><strong>{data.flaggedPeerReviews}</strong></li>
              <li><span>Deactivated users</span><strong>{data.deactivatedUsers}</strong></li>
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}

export function AdminCredentialsPage() {
  const qc = useQueryClient()
  const [confirming, setConfirming]   = useState<{ id: string; action: 'suspend' | 'revoke' } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery<AdminCredential[]>({
    queryKey: ['admin-credentials'],
    queryFn: async () => (await api.get<AdminCredential[]>('/admin/credentials')).data,
    staleTime: 0,          // always refetch on mount — expert/peer submits elsewhere update these rows
    refetchOnWindowFocus: true,
  })

  const run = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'revoke' }) =>
      api.post(`/admin/credentials/${id}/${action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-credentials'] })
      qc.invalidateQueries({ queryKey: ['admin-analytics'] })
      setConfirming(null); setActionError(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setActionError(msg ?? 'Action failed. Please try again.')
    },
  })

  const recompute = useMutation({
    mutationFn: (id: string) => api.post<{ score: number; layer: number }>(`/admin/credentials/${id}/recompute`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-credentials'] })
      qc.invalidateQueries({ queryKey: ['admin-analytics'] })
      setActionError(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setActionError(msg ?? 'Recompute failed.')
    },
  })

  const creds = data ?? []

  return (
    <div className={styles.page}>
      <PageHeader title="All Credentials" />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} loading={isFetching} onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {confirming && (
        <div className={styles.confirmBanner} role="alert">
          <p className={styles.confirmText}>
            Confirm <strong>{confirming.action} credential {confirming.id.slice(0, 8)}…</strong>? This action cannot be undone.
          </p>
          {actionError && <p className={styles.confirmError}>{actionError}</p>}
          <div className={styles.confirmActions}>
            <Button
              variant="danger" size="sm" loading={run.isPending}
              onClick={() => run.mutate(confirming)}
            >
              Confirm {confirming.action}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setConfirming(null); setActionError(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? <p className={styles.loading}>Loading…</p> : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Developer</th>
                <th>Skill</th>
                <th>Layer</th>
                <th>Status</th>
                <th>Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {creds.map(c => (
                <tr key={c.id}>
                  <td className={styles.devCell}>
                    <span className={styles.devName}>{c.developer?.displayName ?? '—'}</span>
                  </td>
                  <td className={styles.skillCell}>{c.skill}</td>
                  <td><Badge variant="default">Layer {c.verificationLayer}</Badge></td>
                  <td><Badge variant={statusVariant(c.lifecycleStatus)}>{c.lifecycleStatus}</Badge></td>
                  <td className={styles.scoreCell}>{c.trustScore}</td>
                  <td>
                    <div className={styles.actionRow}>
                      <Button
                        size="sm" variant="ghost"
                        icon={<RefreshCw size={13} />}
                        loading={recompute.isPending && recompute.variables === c.id}
                        onClick={() => recompute.mutate(c.id)}
                      >
                        Recompute
                      </Button>
                      {['ACTIVE', 'MINTED'].includes(c.lifecycleStatus) && (
                        <Button
                          size="sm" variant="secondary"
                          icon={<PauseCircle size={13} />}
                          onClick={() => setConfirming({ id: c.id, action: 'suspend' })}
                        >
                          Suspend
                        </Button>
                      )}
                      {c.lifecycleStatus === 'MINTED' && (
                        <Button
                          size="sm" variant="danger"
                          icon={<ShieldOff size={13} />}
                          onClick={() => setConfirming({ id: c.id, action: 'revoke' })}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {creds.length === 0 && (
                <tr><td colSpan={6} className={styles.emptyRow}>No credentials to show.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function AdminUsersPage() {
  const qc = useQueryClient()
  const [confirming, setConfirming]   = useState<{ id: string; action: 'deactivate' | 'reactivate'; name: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [invite, setInvite] = useState({ email: '', displayName: '', role: 'expert_verifier', password: '' })
  const [inviteError,   setInviteError]   = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  const { data, isLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => (await api.get<AdminUser[]>('/admin/users')).data,
  })

  const createUser = useMutation({
    mutationFn: (payload: typeof invite) => api.post('/admin/users', payload),
    onSuccess: (res: { data: { user: { email: string } } }) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-analytics'] })
      setInviteSuccess(`${res.data.user.email} created. Share the password securely — they can change it after first login.`)
      setInvite({ email: '', displayName: '', role: 'expert_verifier', password: '' })
      setInviteError(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setInviteError(msg ?? 'Could not create user.')
      setInviteSuccess(null)
    },
  })

  const runUser = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'deactivate' | 'reactivate' }) =>
      api.post(`/admin/users/${id}/${action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-analytics'] })
      setConfirming(null); setActionError(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setActionError(msg ?? 'Action failed. Please try again.')
    },
  })

  const handleInvite = (e: FormEvent) => {
    e.preventDefault()
    createUser.mutate(invite)
  }

  const usrs = data ?? []

  return (
    <div className={styles.page}>
      <PageHeader title="Users" />

      <form onSubmit={handleInvite} className={styles.inviteForm}>
        <h2 className={styles.inviteTitle}>Create privileged user</h2>
        <p className={styles.inviteHint}>Developers and recruiters self-register. Use this to add experts, admins, and peer verifiers.</p>
        <div className={styles.inviteGrid}>
          <label className={styles.inviteField}>
            <span>Email</span>
            <input type="email" required value={invite.email}
              onChange={e => setInvite({ ...invite, email: e.target.value })} />
          </label>
          <label className={styles.inviteField}>
            <span>Display name</span>
            <input type="text" required minLength={2} maxLength={100} value={invite.displayName}
              onChange={e => setInvite({ ...invite, displayName: e.target.value })} />
          </label>
          <label className={styles.inviteField}>
            <span>Role</span>
            <select value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}>
              <option value="expert_verifier">Expert verifier</option>
              <option value="peer_verifier">Peer verifier</option>
              <option value="administrator">Administrator</option>
            </select>
          </label>
          <label className={styles.inviteField}>
            <span>Temporary password</span>
            <input type="text" required minLength={8} value={invite.password}
              onChange={e => setInvite({ ...invite, password: e.target.value })}
              placeholder="min 8 chars, 1 uppercase, 1 number" />
          </label>
        </div>
        {inviteError   && <p className={styles.formError}   role="alert">{inviteError}</p>}
        {inviteSuccess && <p className={styles.formSuccess} role="status">{inviteSuccess}</p>}
        <div className={styles.inviteSubmit}>
          <Button type="submit" size="sm" icon={<UserPlus size={14} />} loading={createUser.isPending}>Create user</Button>
        </div>
      </form>

      {confirming && (
        <div className={styles.confirmBanner} role="alert">
          <p className={styles.confirmText}>
            Confirm <strong>{confirming.action} user &ldquo;{confirming.name}&rdquo;</strong>?
            {confirming.action !== 'reactivate' && ' This action cannot be undone.'}
          </p>
          {actionError && <p className={styles.confirmError}>{actionError}</p>}
          <div className={styles.confirmActions}>
            <Button
              variant={confirming.action === 'deactivate' ? 'danger' : 'primary'}
              size="sm" loading={runUser.isPending}
              onClick={() => runUser.mutate(confirming)}
            >
              Confirm {confirming.action}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setConfirming(null); setActionError(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? <p className={styles.loading}>Loading…</p> : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Display name</th>
                <th>Role</th>
                <th>Credentials</th>
                <th>Flags</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usrs.map(u => (
                <tr key={u.id}>
                  <td className={styles.devCell}>
                    <span className={styles.devName}>{u.displayName}</span>
                  </td>
                  <td>{u.role}</td>
                  <td className={styles.scoreCell}>{u.credentialCount}</td>
                  <td className={styles.scoreCell}>{u.flagsAgainst}</td>
                  <td>
                    {u.isActive
                      ? <Badge variant="success">Active</Badge>
                      : <Badge variant="danger">Deactivated</Badge>}
                  </td>
                  <td>
                    <div className={styles.actionRow}>
                      {u.isActive && u.role !== 'administrator' && (
                        <Button
                          size="sm" variant="danger"
                          icon={<UserX size={13} />}
                          onClick={() => setConfirming({ id: u.id, action: 'deactivate', name: u.displayName })}
                        >
                          Deactivate
                        </Button>
                      )}
                      {!u.isActive && (
                        <Button
                          size="sm" variant="secondary"
                          icon={<UserCheck size={13} />}
                          onClick={() => setConfirming({ id: u.id, action: 'reactivate', name: u.displayName })}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {usrs.length === 0 && (
                <tr><td colSpan={6} className={styles.emptyRow}>No users to show.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function AdminAuditLogPage() {
  const { data, isLoading } = useQuery<AuditEntry[]>({
    queryKey: ['audit-logs'],
    queryFn: async () => (await api.get<AuditEntry[]>('/admin/audit-logs')).data,
  })

  const logs = data ?? []

  return (
    <div className={styles.page}>
      <PageHeader title="Audit Log" />
      {isLoading ? <p className={styles.loading}>Loading…</p> : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Action</th>
                <th>Resource</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td><code className={styles.code}>{log.action}</code></td>
                  <td className={styles.dateCell}>
                    {log.resourceType}:{log.resourceId.slice(0, 8)}…
                  </td>
                  <td className={styles.dateCell}>{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={3} className={styles.emptyRow}>No audit entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
