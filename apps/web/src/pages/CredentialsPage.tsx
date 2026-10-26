import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PlusCircle, Eye, FileCheck2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import api from '@/lib/api'
import { statusVariant } from '@/lib/credentials'
import styles from './CredentialsPage.module.css'

interface Credential {
  id: string
  skill: string
  verificationLayer: number
  lifecycleStatus: string
  trustScore: number
  createdAt: string
}

function layerVariant(l: number): 'default' | 'info' | 'accent' | 'success' {
  if (l <= 2) return 'default'
  if (l === 3) return 'info'
  if (l <= 5) return 'accent'
  return 'success'
}

export function CredentialsPage() {
  const { user } = useAuthStore()

  const { data, isLoading, isError } = useQuery<Credential[]>({
    queryKey: ['credentials'],
    queryFn: async () => {
      const { data } = await api.get<Credential[]>('/credentials')
      return data
    },
  })

  const credentials = data ?? []

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>Portfolio</span>
          <h1 className={styles.title}>Credentials</h1>
        </div>
        {user?.role === 'developer' && (
          <Link to="/credentials/new">
            <Button icon={<PlusCircle size={16} strokeWidth={1.75} />}>Add credential</Button>
          </Link>
        )}
      </header>

      {isError && (
        <p className={styles.error} role="alert">
          Failed to load credentials. Please try again.
        </p>
      )}

      {isLoading ? (
        <div className={styles.skeleton} aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading credentials</span>
          {[0, 1, 2, 3].map(i => <div key={i} className={styles.skeletonRow} />)}
        </div>
      ) : credentials.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden>
            <FileCheck2 size={24} strokeWidth={1.5} />
          </span>
          <p className={styles.emptyTitle}>No credentials yet</p>
          {user?.role === 'developer' && (
            <p className={styles.emptyHint}>
              Add your first credential to start building your verified skill profile.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Skill</th>
                <th>Layer</th>
                <th>Status</th>
                <th>Trust</th>
                <th>Created</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {credentials.map(c => (
                <tr key={c.id}>
                  <td className={styles.skillCell}>{c.skill}</td>
                  <td><Badge variant={layerVariant(c.verificationLayer)}>Layer {c.verificationLayer}</Badge></td>
                  <td><Badge variant={statusVariant(c.lifecycleStatus)}>{c.lifecycleStatus}</Badge></td>
                  <td className={styles.scoreCell}>{c.trustScore}</td>
                  <td className={styles.dateCell}>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/credentials/${c.id}`}>
                      <Button variant="ghost" size="sm" icon={<Eye size={14} strokeWidth={1.75} />}>View</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
