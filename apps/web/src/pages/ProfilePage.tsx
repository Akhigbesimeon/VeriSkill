import { useEffect, useMemo, useState, FormEvent, ChangeEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Mail, MapPin, Plus, Trash2, Wallet, Check, LogOut, Pencil, X,
  Award, Layers, Activity, Sparkles, Globe,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import api, { extractErrorMessage } from '@/lib/api'
import { shortenAddress, initials } from '@/lib/format'
import { useWalletConnection } from '@/hooks/useWalletConnection'
import { useModalShell } from '@/hooks/useModalShell'
import styles from './ProfilePage.module.css'

interface CredentialSummary {
  id: string
  skill: string
  verificationLayer: number
  lifecycleStatus: string
  trustScore: number
}

const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PENDING_REVIEW: 'Pending review',
  MINTED: 'Minted',
  SUSPENDED: 'Suspended',
  REVOKED: 'Revoked',
  REJECTED: 'Rejected',
}

interface FormValues {
  displayName: string
  bio: string
  location: string
  links: string[]
}

interface FormErrors {
  displayName?: string
  links?: string
}

function linkMeta(url: string): { faviconUrl: string | null; hostname: string } {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    return { faviconUrl: `https://icons.duckduckgo.com/ip3/${host}.ico`, hostname: host }
  } catch {
    return { faviconUrl: null, hostname: url }
  }
}

function FaviconLink({ url }: { url: string }) {
  const { faviconUrl, hostname } = linkMeta(url)
  const [failed, setFailed] = useState(false)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.headerLinkIcon}
      aria-label={hostname}
      title={hostname}
    >
      {faviconUrl && !failed ? (
        <img
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          className={styles.headerLinkFavicon}
          onError={() => setFailed(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <Globe size={16} strokeWidth={1.75} aria-hidden />
      )}
    </a>
  )
}

const URL_RE = /^https?:\/\/.+/i

export function ProfilePage() {
  const { user, updateProfile, loadMe } = useAuthStore()

  const initial: FormValues = useMemo(() => ({
    displayName: user?.displayName ?? '',
    bio:         user?.bio ?? '',
    location:    user?.location ?? '',
    links:       user?.externalLinks && user.externalLinks.length > 0
                 ? [...user.externalLinks]
                 : [''],
  }), [user])

  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [success, setSuccess]   = useState(false)

  const wallet = useWalletConnection()

  const [editOpen, setEditOpen] = useState(false)

  // Pull the freshest profile on mount in case the persisted store is stale.
  useEffect(() => { loadMe() }, [loadMe])
  useEffect(() => { setValues(initial) }, [initial])

  useModalShell(editOpen, () => closeEditModal())

  function closeEditModal() {
    setEditOpen(false)
    setValues(initial)
    setErrors({})
    setApiError(null)
    setSuccess(false)
  }

  const { data: credData, isLoading: credsLoading } = useQuery<CredentialSummary[]>({
    queryKey: ['credentials'],
    queryFn: async () => {
      const { data } = await api.get<CredentialSummary[]>('/credentials')
      return data
    },
  })
  const credentials = credData ?? []

  const strength = useMemo(() => {
    const items = [
      { key: 'bio',       label: 'Add a bio',               done: !!user?.bio?.trim() },
      { key: 'location',  label: 'Set your location',       done: !!user?.location?.trim() },
      { key: 'links',     label: 'Add an external link',    done: (user?.externalLinks?.length ?? 0) > 0 },
      { key: 'wallet',    label: 'Connect a wallet',        done: wallet.hasSelfCustody },
      { key: 'cred',      label: 'Earn your first credential', done: credentials.length > 0 },
    ]
    const completed = items.filter(i => i.done).length
    const percent   = Math.round((completed / items.length) * 100)
    return { items, completed, total: items.length, percent }
  }, [user?.bio, user?.location, user?.externalLinks, wallet.hasSelfCustody, credentials.length])

  const layerBreakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0]
    for (const c of credentials) {
      const idx = Math.min(Math.max(c.verificationLayer - 1, 0), 5)
      counts[idx] += 1
    }
    const max = Math.max(1, ...counts)
    return counts.map((n, i) => ({ layer: i + 1, count: n, pct: Math.round((n / max) * 100) }))
  }, [credentials])

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of credentials) counts.set(c.lifecycleStatus, (counts.get(c.lifecycleStatus) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)
  }, [credentials])

  const topSkills = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of credentials) counts.set(c.skill, (counts.get(c.skill) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [credentials])

  const dirty =
    values.displayName.trim() !== (user?.displayName ?? '') ||
    values.bio.trim()         !== (user?.bio ?? '') ||
    values.location.trim()    !== (user?.location ?? '') ||
    JSON.stringify(values.links.map(l => l.trim()).filter(Boolean)) !==
      JSON.stringify(user?.externalLinks ?? [])

  function onField(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setValues(prev => ({ ...prev, [name]: value }))
    setErrors(prev => ({ ...prev, [name]: undefined }))
    setSuccess(false)
  }

  function onLinkChange(idx: number, value: string) {
    setValues(prev => {
      const next = [...prev.links]
      next[idx] = value
      return { ...prev, links: next }
    })
    setErrors(prev => ({ ...prev, links: undefined }))
    setSuccess(false)
  }

  function addLink() {
    setValues(prev => ({ ...prev, links: [...prev.links, ''] }))
  }

  function removeLink(idx: number) {
    setValues(prev => {
      const next = prev.links.filter((_, i) => i !== idx)
      return { ...prev, links: next.length > 0 ? next : [''] }
    })
    setSuccess(false)
  }

  function validate(): FormErrors {
    const errs: FormErrors = {}
    const name = values.displayName.trim()
    if (name.length < 2 || name.length > 100) {
      errs.displayName = 'Display name must be between 2 and 100 characters.'
    }
    const cleanedLinks = values.links.map(l => l.trim()).filter(Boolean)
    const invalid = cleanedLinks.find(l => !URL_RE.test(l))
    if (invalid) {
      errs.links = `Links must be full URLs starting with http(s):// — "${invalid}" is invalid.`
    }
    return errs
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setApiError(null)
    setSuccess(false)
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setSaving(true)
    try {
      await updateProfile({
        displayName:   values.displayName.trim(),
        bio:           values.bio.trim() || null,
        location:      values.location.trim() || null,
        externalLinks: values.links.map(l => l.trim()).filter(Boolean),
      })
      setSuccess(true)
      setTimeout(() => setEditOpen(false), 600)
    } catch (err) {
      setApiError(extractErrorMessage(err, 'Could not save your profile. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden>{initials(user?.displayName)}</div>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>Profile</span>
          <h1 className={styles.title}>{user?.displayName ?? 'Your profile'}</h1>
          <div className={styles.subMeta}>
            <span className={styles.metaItem}>
              <Mail size={14} strokeWidth={1.75} aria-hidden /> {user?.email}
            </span>
            {user?.location && (
              <>
                <span className={styles.metaDivider} aria-hidden />
                <span className={styles.metaItem}>
                  <MapPin size={14} strokeWidth={1.75} aria-hidden /> {user.location}
                </span>
              </>
            )}
            <span className={styles.metaDivider} aria-hidden />
            <span className={styles.roleBadge}>{user?.role.replace('_', ' ')}</span>
          </div>
          {user?.bio && (
            <p className={styles.headerBio}>{user.bio}</p>
          )}
          {user?.externalLinks && user.externalLinks.length > 0 && (
            <div className={styles.headerLinks}>
              {user.externalLinks.map((url, idx) => (
                <FaviconLink key={idx} url={url} />
              ))}
            </div>
          )}
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil size={14} strokeWidth={1.75} />}
            onClick={() => setEditOpen(true)}
          >
            Edit profile
          </Button>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Account</h2>
          <span className={styles.sectionDesc}>Read-only identity fields managed by VeriSkill.</span>
        </div>
        <div className={styles.readonlyRow}>
          <div className={styles.readonlyField}>
            <span className={styles.readonlyLabel}>Email</span>
            <span className={styles.readonlyValue}>{user?.email}</span>
          </div>
          <div className={styles.readonlyField}>
            <span className={styles.readonlyLabel}>Role</span>
            <span className={styles.readonlyValue}>{user?.role.replace('_', ' ')}</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Analytics</h2>
          <span className={styles.sectionDesc}>Profile completeness and credential composition.</span>
        </div>

        <div className={styles.card}>
          <div className={styles.strengthHead}>
            <div className={styles.strengthLabelGroup}>
              <span className={styles.previewLabel}>Profile strength</span>
              <span className={styles.strengthHint}>
                {strength.completed} of {strength.total} complete
              </span>
            </div>
            <div className={styles.strengthScore}>
              <Sparkles size={14} strokeWidth={1.75} aria-hidden />
              {strength.percent}%
            </div>
          </div>
          <div
            className={styles.strengthBar}
            role="progressbar"
            aria-valuenow={strength.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={styles.strengthBarFill} style={{ width: `${strength.percent}%` }} />
          </div>
          <ul className={styles.strengthList}>
            {strength.items.map(item => (
              <li
                key={item.key}
                className={`${styles.strengthItem} ${item.done ? styles.strengthItemDone : ''}`}
              >
                <span className={styles.strengthCheck} aria-hidden>
                  {item.done ? <Check size={12} strokeWidth={2.5} /> : null}
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.card}>
          <div className={styles.previewLabel}>Credential breakdown</div>

          {credsLoading ? (
            <p className={styles.previewEmpty}>Loading credentials…</p>
          ) : credentials.length === 0 ? (
            <p className={styles.previewEmpty}>No credentials yet. Analytics will appear once you earn one.</p>
          ) : (
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsBlock}>
                <div className={styles.blockHead}>
                  <Layers size={14} strokeWidth={1.75} aria-hidden />
                  <span>By verification layer</span>
                </div>
                <ul className={styles.layerList}>
                  {layerBreakdown.map(row => (
                    <li key={row.layer} className={styles.layerRow}>
                      <span className={styles.layerName}>Layer {row.layer}</span>
                      <div className={styles.layerTrack}>
                        <div
                          className={styles.layerFill}
                          style={{ width: `${row.pct}%` }}
                          aria-hidden
                        />
                      </div>
                      <span className={styles.layerCount}>{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.analyticsBlock}>
                <div className={styles.blockHead}>
                  <Activity size={14} strokeWidth={1.75} aria-hidden />
                  <span>By lifecycle status</span>
                </div>
                <ul className={styles.statusList}>
                  {statusBreakdown.map(row => (
                    <li key={row.status} className={styles.statusRow}>
                      <span className={styles.statusDot} data-status={row.status} aria-hidden />
                      <span className={styles.statusName}>{LIFECYCLE_LABELS[row.status] ?? row.status}</span>
                      <span className={styles.statusCount}>{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`${styles.analyticsBlock} ${styles.analyticsBlockWide}`}>
                <div className={styles.blockHead}>
                  <Award size={14} strokeWidth={1.75} aria-hidden />
                  <span>Top skills</span>
                </div>
                {topSkills.length === 0 ? (
                  <p className={styles.previewEmpty}>No skills tracked yet.</p>
                ) : (
                  <div className={styles.skillChips}>
                    {topSkills.map(s => (
                      <span key={s.skill} className={styles.skillChip}>
                        {s.skill}
                        <span className={styles.skillCount}>{s.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Wallet</h2>
          <span className={styles.sectionDesc}>
            {wallet.hasSelfCustody ? 'Self-custody wallet connected.' : 'Managed by VeriSkill.'}
          </span>
        </div>
        <div className={styles.card}>
          <div className={styles.walletCard}>
            <div className={styles.walletIcon} aria-hidden>
              {wallet.hasSelfCustody ? <Check size={18} /> : <Wallet size={18} />}
            </div>
            <div className={styles.walletBody}>
              <span className={styles.walletName}>
                {wallet.hasSelfCustody ? 'External wallet' : 'Managed wallet'}
              </span>
              <span className={styles.walletMeta}>
                {wallet.hasSelfCustody
                  ? shortenAddress(wallet.address!)
                  : 'VeriSkill securely manages your wallet. Connect your own to self-custody.'}
              </span>
            </div>
            <div className={styles.walletActions}>
              <Button
                variant={wallet.hasSelfCustody ? 'secondary' : 'primary'}
                size="sm"
                icon={<Wallet size={14} strokeWidth={1.75} />}
                onClick={wallet.openConnect}
                disabled={wallet.saving}
              >
                {wallet.hasSelfCustody ? 'Change' : 'Connect wallet'}
              </Button>
              {wallet.hasSelfCustody && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<LogOut size={14} strokeWidth={1.75} />}
                  onClick={wallet.openDisconnect}
                  disabled={wallet.saving}
                >
                  Disconnect
                </Button>
              )}
            </div>
          </div>
          {wallet.error && (
            <div className={`${styles.alert} ${styles.alertError}`} role="alert">{wallet.error}</div>
          )}
        </div>
      </section>

      {editOpen && (
        <div
          className={styles.editOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-title"
          onClick={closeEditModal}
        >
          <div className={styles.editPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.editHead}>
              <div>
                <div id="edit-profile-title" className={styles.editTitle}>Edit profile</div>
                <span className={styles.editSub}>Update how you appear to verifiers and recruiters.</span>
              </div>
              <button
                type="button"
                className={styles.editClose}
                aria-label="Close"
                onClick={closeEditModal}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.editBody} noValidate>
              <div className={styles.row2}>
                <Input
                  label="Display name"
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  value={values.displayName}
                  onChange={onField}
                  error={errors.displayName}
                />
                <Input
                  label="Location"
                  name="location"
                  type="text"
                  placeholder="City, Country"
                  value={values.location}
                  onChange={onField}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="bio" className={styles.label}>Bio</label>
                <textarea
                  id="bio"
                  name="bio"
                  className={styles.textarea}
                  placeholder="A short summary of what you build and the skills you want to prove."
                  value={values.bio}
                  onChange={onField}
                  maxLength={2000}
                />
                <span className={styles.hint}>{values.bio.length} / 2000</span>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>External links</span>
                {values.links.map((link, idx) => (
                  <div key={idx} className={styles.linkRow}>
                    <input
                      type="url"
                      className={styles.linkInput}
                      placeholder="https://github.com/you"
                      value={link}
                      onChange={(e) => onLinkChange(idx, e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => removeLink(idx)}
                      aria-label="Remove link"
                      disabled={values.links.length === 1 && !values.links[0]}
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
                {errors.links && <span className={styles.hint} style={{ color: 'var(--color-danger)' }}>{errors.links}</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<Plus size={14} strokeWidth={2} />}
                  onClick={addLink}
                  className={styles.addLinkBtn}
                  disabled={values.links.length >= 10}
                >
                  Add link
                </Button>
              </div>

              {apiError && <div className={`${styles.alert} ${styles.alertError}`} role="alert">{apiError}</div>}
              {success  && <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">Profile saved.</div>}

              <div className={styles.formFoot}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeEditModal}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={saving} disabled={!dirty}>
                  Save changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {wallet.modals}
    </div>
  )
}
