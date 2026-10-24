import styles from './AppShell.module.css'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileCheck2, Users, ShieldCheck,
  LogOut, ChevronRight, Star, BarChart3, FileText, History
} from 'lucide-react'
import { useAuthStore, Role } from '@/store/auth.store'
import { initials } from '@/lib/format'
import { ReactNode } from 'react'

const NAV_ITEMS: { to: string; label: string; icon: ReactNode; roles: Role[] }[] = [
  { to: '/dashboard',          label: 'Dashboard',   icon: <LayoutDashboard size={18} strokeWidth={1.75} />,  roles: ['developer', 'administrator'] },
  { to: '/credentials',        label: 'Credentials', icon: <FileCheck2 size={18} strokeWidth={1.75} />,       roles: ['developer', 'recruiter'] },
  { to: '/reviews',            label: 'Reviews',     icon: <Star size={18} strokeWidth={1.75} />,             roles: ['developer', 'peer_verifier', 'expert_verifier'] },
  { to: '/reviews/history',    label: 'Past reviews', icon: <History size={18} strokeWidth={1.75} />,         roles: ['developer', 'peer_verifier', 'expert_verifier'] },
  { to: '/verify',             label: 'Verify',      icon: <ShieldCheck size={18} strokeWidth={1.75} />,      roles: ['recruiter'] },
  { to: '/admin',              label: 'Analytics',   icon: <BarChart3 size={18} strokeWidth={1.75} />,        roles: ['administrator'] },
  { to: '/admin/credentials',  label: 'Credentials', icon: <FileCheck2 size={18} strokeWidth={1.75} />,       roles: ['administrator'] },
  { to: '/admin/users',        label: 'Users',       icon: <Users size={18} strokeWidth={1.75} />,            roles: ['administrator'] },
  { to: '/admin/audit',        label: 'Audit log',   icon: <FileText size={18} strokeWidth={1.75} />,         roles: ['administrator'] },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleNav = NAV_ITEMS.filter(item => user && item.roles.includes(user.role))

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Main navigation">
        <div className={styles.brand}>
          <span className={styles.brandName}>VeriSkill</span>
        </div>

        <p className={styles.navLabel}>Workspace</p>

        <ul className={styles.navList} role="list">
          {visibleNav.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/admin' || item.to === '/reviews'}
                className={({ isActive }) =>
                  [styles.navItem, isActive ? styles.navItemActive : ''].join(' ')
                }
              >
                <span className={styles.navIcon} aria-hidden>{item.icon}</span>
                <span>{item.label}</span>
                <ChevronRight size={14} className={styles.chevron} aria-hidden />
              </NavLink>
            </li>
          ))}
        </ul>

        <div className={styles.sidebarFooter}>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              [styles.userInfo, styles.userInfoLink, isActive ? styles.userInfoActive : ''].join(' ')
            }
            aria-label="View profile"
          >
            <span className={styles.userAvatar} aria-hidden>{initials(user?.displayName)}</span>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{user?.displayName}</span>
              <span className={styles.userRole}>{user?.role.replace('_', ' ')}</span>
            </div>
          </NavLink>
          <button
            onClick={handleLogout}
            className={styles.logoutBtn}
            aria-label="Sign out"
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden />
            <span>Sign out</span>
          </button>
        </div>
      </nav>

      <main className={styles.main} id="main-content">
        {children}
      </main>
    </div>
  )
}
