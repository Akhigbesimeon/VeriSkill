import { Link } from 'react-router-dom'
import { ArrowLeft, Smartphone } from 'lucide-react'
import styles from './OnboardingPage.module.css'

export function RecruitersPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="Primary">
        <Link to="/" className={styles.brand}>
          <span>VeriSkill</span>
        </Link>
        <div className={styles.navActions}>
          <Link to="/login" className={styles.navLink}>Sign in</Link>
          <Link to="/register" className={styles.navCta}>Get started</Link>
        </div>
      </nav>

      <section className={styles.finalCta} aria-labelledby="recruiters-heading">
        <span className={styles.eyebrow}>
          <Smartphone size={12} strokeWidth={2} aria-hidden />
          For recruiters
        </span>
        <h1 id="recruiters-heading" className={styles.sectionTitle} style={{ maxWidth: '22ch' }}>
          Recruiters sign up on the VeriSkill mobile app.
        </h1>
        <p className={styles.sectionLede} style={{ maxWidth: '52ch' }}>
          Scanning credentials, reading signatures, and verifying claims live on your phone. Download the
          mobile app to create your recruiter account and start verifying in seconds.
        </p>
        <div className={styles.heroActions}>
          <Link to="/" className={styles.ctaSecondary}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            Back to home
          </Link>
        </div>
      </section>
    </div>
  )
}
