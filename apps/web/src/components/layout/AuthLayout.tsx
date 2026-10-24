import styles from './AuthLayout.module.css'
import { ReactNode } from 'react'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          <span>VeriSkill</span>
        </div>
        {children}
      </div>
      <aside className={styles.aside} aria-hidden>
        <p className={styles.asideHeader}>Receipts, not r&eacute;sum&eacute;s</p>
        <blockquote className={styles.quote}>
          <p>
            Claims are easy. <em>Credentials are signed, timestamped, and impossible to fake.</em>
          </p>
        </blockquote>
        <div className={styles.asideFooter}>
          <span className={styles.asideFooterLabel}>Field note</span>
          <span>VeriSkill &mdash; verifiable skill</span>
        </div>
      </aside>
    </div>
  )
}
