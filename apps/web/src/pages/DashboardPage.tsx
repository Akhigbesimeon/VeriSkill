import { useQuery } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import { PlusCircle, Award, Layers, Gauge, Wallet, Check, LogOut, ShieldCheck, Users, Flag, UserX } from 'lucide-react'
import { useAuthStore, landingPathFor } from '@/store/auth.store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import api from '@/lib/api'
import { statusVariant } from '@/lib/credentials'
import { shortenAddress } from '@/lib/format'
import { useWalletConnection } from '@/hooks/useWalletConnection'
import styles from './DashboardPage.module.css'

interface Credential {
  id: string
  skill: string
  verificationLayer: number
  lifecycleStatus: string
  trustScore: number
  flagCount?: number
}

interface RecentScan {
  id: string
  skill: string
  verificationLayer: number
  trustScore: number
  developer: { displayName: string | null }
  scannedAt: string
}

export function DashboardPage() {
  const { user } = useAuthStore()
  const isRecruiter = user?.role === 'recruiter'
  const isAdmin     = user?.role === 'administrator'

  // Expert / peer_verifier have their own landing page — bookmark-safe redirect.
  if (user && (user.role === 'expert_verifier' || user.role === 'peer_verifier')) {
    return <Navigate to={landingPathFor(user.role)} replace />
  }

  if (isAdmin) return <AdminDashboardView />

  const wallet = useWalletConnection()

  const { data, isLoading, isError } = useQuery<Credential[]>({
    queryKey: ['credentials'],
    queryFn: async () => {
      const { data } = await api.get<Credential[]>('/credentials')
      return data
    },
    enabled: !isRecruiter,
  })

  const scansQuery = useQuery<RecentScan[]>({
    queryKey: ['verify', 'recent'],
    queryFn: async () => {
      const { data } = await api.get<RecentScan[]>('/verify/recent')
      return data
    },
    enabled: isRecruiter,
  })

  if (isRecruiter) {
    const scans = scansQuery.data ?? []
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.eyebrow}>Overview</span>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.welcome}>
              Welcome back, <strong>{user?.displayName}</strong>. Scan a candidate credential to verify it.
            </p>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Quick actions</h2>
          </div>
          <div className={styles.actionsRow}>
            <Link to="/verify">
              <Button icon={<ShieldCheck size={16} strokeWidth={1.75} />}>Verify a credential</Button>
            </Link>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Recent scans</h2>
            {scans.length > 0 && <span className={styles.sectionMeta}>{scans.length}</span>}
          </div>
          {scansQuery.isError ? (
            <p className={styles.errorMsg} role="alert">Could not load scans.</p>
          ) : scansQuery.isLoading ? (
            <p className={styles.sectionMeta}>Loading…</p>
          ) : scans.length === 0 ? (
            <p className={styles.sectionMeta}>No scans yet.</p>
          ) : (
            <div className={styles.recentList}>
              {scans.map(s => (
                <article key={`${s.id}-${s.scannedAt}`} className={styles.recentCard}>
                  <div className={styles.recentLeft}>
                    <span className={styles.recentSkill}>
                      {s.developer.displayName ?? 'Unknown'} · {s.skill}
                    </span>
                    <div className={styles.recentBadges}>
                      <Badge variant="default">Layer {s.verificationLayer}</Badge>
                      <Badge variant="info">Score {s.trustScore}</Badge>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  const credentials  = data ?? []
  const highestLayer = credentials.length > 0 ? Math.max(...credentials.map(c => c.verificationLayer)) : 0
  const avgTrust     = credentials.length > 0
    ? Math.round(credentials.reduce((s, c) => s + (c.trustScore ?? 0), 0) / credentials.length)
    : 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>Overview</span>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.welcome}>
            Welcome back, <strong>{user?.displayName}</strong>. Here&rsquo;s how your verified skill profile is tracking.
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.walletButtons}>
            <Button
              variant={wallet.hasSelfCustody ? 'secondary' : 'primary'}
              icon={wallet.hasSelfCustody ? <Check size={16} strokeWidth={2} /> : <Wallet size={16} strokeWidth={1.75} />}
              onClick={wallet.openConnect}
              loading={wallet.saving}
              disabled={wallet.saving}
            >
              {wallet.hasSelfCustody ? shortenAddress(wallet.address!) : 'Connect wallet'}
            </Button>
            {wallet.hasSelfCustody && (
              <Button
                variant="ghost"
                size="sm"
                icon={<LogOut size={14} strokeWidth={1.75} />}
                onClick={wallet.openDisconnect}
                disabled={wallet.saving}
                aria-label="Disconnect wallet"
              >
                Disconnect
              </Button>
            )}
          </div>
          {wallet.error && (
            <span className={styles.headerError} role="alert">{wallet.error}</span>
          )}
        </div>
      </header>

      <section className={styles.statsRow} aria-label="Summary statistics">
        <article className={`${styles.statCard} ${styles.statHero}`}>
          <div className={styles.statHead}>
            <span className={styles.statLabel}>Total credentials</span>
            <span className={styles.statIcon} aria-hidden><Award size={18} strokeWidth={1.75} /></span>
          </div>
          <div>
            <div className={styles.statValue}>{isLoading ? '—' : credentials.length}</div>
            <p className={styles.statFoot}>across every verification layer</p>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <span className={styles.statLabel}>Highest layer</span>
            <span className={styles.statIcon} aria-hidden><Layers size={18} strokeWidth={1.75} /></span>
          </div>
          <div>
            <div className={`${styles.statValue} ${styles.statSmall}`}>
              {isLoading ? '—' : highestLayer > 0 ? <Badge variant="accent">Layer {highestLayer}</Badge> : '—'}
            </div>
            <p className={styles.statFoot}>of 6 possible stages</p>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <span className={styles.statLabel}>Avg. trust score</span>
            <span className={styles.statIcon} aria-hidden><Gauge size={18} strokeWidth={1.75} /></span>
          </div>
          <div>
            <div className={styles.statValue}>
              {isLoading ? '—' : credentials.length > 0 ? avgTrust : '—'}
              {!isLoading && credentials.length > 0 && (
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-normal)', marginLeft: 4 }}>/100</span>
              )}
            </div>
            <p className={styles.statFoot}>mean across active credentials</p>
          </div>
        </article>
      </section>

      {isError && (
        <p className={styles.errorMsg} role="alert">
          Could not load credential data. Please refresh the page.
        </p>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Quick actions</h2>
        </div>
        <div className={styles.actionsRow}>
          {user?.role === 'developer' && (
            <Link to="/credentials/new">
              <Button icon={<PlusCircle size={16} strokeWidth={1.75} />}>Add credential</Button>
            </Link>
          )}
          <Link to="/credentials">
            <Button variant="secondary">View all credentials</Button>
          </Link>
        </div>
      </section>

      {credentials.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Recent credentials</h2>
            <span className={styles.sectionMeta}>{credentials.length} total</span>
          </div>
          <div className={styles.recentList}>
            {credentials.slice(0, 3).map(c => (
              <article key={c.id} className={styles.recentCard}>
                <div className={styles.recentLeft}>
                  <span className={styles.recentSkill}>{c.skill}</span>
                  <div className={styles.recentBadges}>
                    <Badge variant="default">Layer {c.verificationLayer}</Badge>
                    <Badge variant={statusVariant(c.lifecycleStatus)}>{c.lifecycleStatus}</Badge>
                    {(c.flagCount ?? 0) > 0 && (
                      <Badge variant="warning">Flagged ({c.flagCount})</Badge>
                    )}
                  </div>
                </div>
                <Link to={`/credentials/${c.id}`}>
                  <Button variant="ghost" size="sm">View</Button>
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {wallet.modals}
    </div>
  )
}

interface Analytics {
  usersByRole:         Record<string, number>
  credentialsByStatus: Record<string, number>
  credentialsByLayer:  Record<string, number>
  flaggedPeerReviews:  number
  deactivatedUsers:    number
}

function AdminDashboardView() {
  const { user } = useAuthStore()
  const { data, isLoading, isError } = useQuery<Analytics>({
    queryKey: ['admin-analytics'],
    queryFn: async () => (await api.get<Analytics>('/admin/analytics')).data,
  })

  const totalUsers       = data ? Object.values(data.usersByRole).reduce((a, b) => a + b, 0) : 0
  const totalCredentials = data ? Object.values(data.credentialsByStatus).reduce((a, b) => a + b, 0) : 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>Overview</span>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.welcome}>
            Welcome back, <strong>{user?.displayName}</strong>. Site-wide operational snapshot.
          </p>
        </div>
      </header>

      <section className={styles.statsRow} aria-label="Summary statistics">
        <article className={`${styles.statCard} ${styles.statHero}`}>
          <div className={styles.statHead}>
            <span className={styles.statLabel}>Total users</span>
            <span className={styles.statIcon} aria-hidden><Users size={18} strokeWidth={1.75} /></span>
          </div>
          <div>
            <div className={styles.statValue}>{isLoading ? '—' : totalUsers}</div>
            <p className={styles.statFoot}>across every active role</p>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <span className={styles.statLabel}>Total credentials</span>
            <span className={styles.statIcon} aria-hidden><Award size={18} strokeWidth={1.75} /></span>
          </div>
          <div>
            <div className={styles.statValue}>{isLoading ? '—' : totalCredentials}</div>
            <p className={styles.statFoot}>in every lifecycle state</p>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <span className={styles.statLabel}>Flagged reviews</span>
            <span className={styles.statIcon} aria-hidden><Flag size={18} strokeWidth={1.75} /></span>
          </div>
          <div>
            <div className={styles.statValue}>{isLoading ? '—' : data?.flaggedPeerReviews ?? 0}</div>
            <p className={styles.statFoot}>awaiting admin attention</p>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <span className={styles.statLabel}>Deactivated users</span>
            <span className={styles.statIcon} aria-hidden><UserX size={18} strokeWidth={1.75} /></span>
          </div>
          <div>
            <div className={styles.statValue}>{isLoading ? '—' : data?.deactivatedUsers ?? 0}</div>
            <p className={styles.statFoot}>revoked site access</p>
          </div>
        </article>
      </section>

      {isError && (
        <p className={styles.errorMsg} role="alert">Could not load analytics. Please refresh the page.</p>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Users by role</h2>
        </div>
        {isLoading ? (
          <p className={styles.sectionMeta}>Loading…</p>
        ) : (
          <div className={styles.recentList}>
            {Object.entries(data?.usersByRole ?? {}).map(([role, count]) => (
              <article key={role} className={styles.recentCard}>
                <div className={styles.recentLeft}>
                  <span className={styles.recentSkill}>{role.replace('_', ' ')}</span>
                  <div className={styles.recentBadges}>
                    <Badge variant="default">{count}</Badge>
                  </div>
                </div>
              </article>
            ))}
            {Object.keys(data?.usersByRole ?? {}).length === 0 && (
              <p className={styles.sectionMeta}>No users yet.</p>
            )}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Quick actions</h2>
        </div>
        <div className={styles.actionsRow}>
          <Link to="/admin"><Button icon={<ShieldCheck size={16} strokeWidth={1.75} />}>Open full analytics panel</Button></Link>
        </div>
      </section>
    </div>
  )
}
