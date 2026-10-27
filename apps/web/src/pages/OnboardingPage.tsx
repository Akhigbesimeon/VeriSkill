import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Users, Award, Scan, Fingerprint, BadgeCheck, Link2, Github, UsersRound } from 'lucide-react'
import styles from './OnboardingPage.module.css'

const LAYERS = [
  {
    num: '01',
    title: 'Self-attestation',
    body: 'Declare the skill you can perform. Timestamped and signed to your wallet — the base every later layer builds on.',
    icon: <Fingerprint size={18} strokeWidth={1.75} />,
  },
  {
    num: '02',
    title: 'URL verified',
    body: 'Links to the work you’re claiming are reachable and come from a recognised provider. Automatic, re-checked monthly.',
    icon: <Link2 size={18} strokeWidth={1.75} />,
  },
  {
    num: '03',
    title: 'GitHub scanned',
    body: 'We read the repo — recency, activity, CI, and how well it matches the skill you’re claiming.',
    icon: <Github size={18} strokeWidth={1.75} />,
  },
  {
    num: '04',
    title: 'Peer verified',
    body: 'A peer who has watched you work signs the claim. The credential becomes mintable on-chain at this layer.',
    icon: <Users size={18} strokeWidth={1.75} />,
  },
  {
    num: '05',
    title: 'Community verified',
    body: 'Three or more weighted peers converge on the same claim. Expert review is auto-queued once you cross this line.',
    icon: <UsersRound size={18} strokeWidth={1.75} />,
  },
  {
    num: '06',
    title: 'Expert verified',
    body: 'A domain expert audits the evidence and signs. The on-chain receipt is finalized — tamper-evident, portable, yours.',
    icon: <ShieldCheck size={18} strokeWidth={1.75} />,
  },
]

const DEVELOPER_POINTS = [
  'Own a portable, verifiable record of what you can actually do.',
  'Signed receipts that recruiters can trust without a referral chase.',
  'Managed or self-custody wallet — no crypto expertise required.',
]

const RECRUITER_POINTS = [
  'Scan a QR code to verify a candidate’s claim in seconds.',
  'See every reviewer, their standing, and the evidence they signed.',
  'Filter by verification layer and trust score, not keywords.',
]

type CardVariant = 'variantCream' | 'variantPaper' | 'variantInk'

interface StackCard {
  num: number
  status: string
  skill: string
  detail: string
  score: number | null
  variant: CardVariant
}

const STACK_CARDS: StackCard[] = [
  { num: 1, variant: 'variantCream', status: 'Draft',     skill: 'TypeScript',          detail: 'Self-attested',       score: null },
  { num: 2, variant: 'variantPaper', status: 'In review', skill: 'React · Production',  detail: '3 peer signatures',   score: 68 },
  { num: 3, variant: 'variantInk',   status: 'Minted',    skill: 'Distributed Systems', detail: '4 expert signatures', score: 92 },
]

const POSITION_CLASS = ['cardBack', 'cardMiddle', 'cardFront'] as const

export function OnboardingPage() {
  // positionOf[i] = position of STACK_CARDS[i]: 0=back, 1=middle, 2=front
  const [positionOf, setPositionOf] = useState<[number, number, number]>([0, 1, 2])

  useEffect(() => {
    // Skip auto-cycle for users who prefer reduced motion.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const id = window.setInterval(() => {
      setPositionOf(prev => [
        (prev[0] + 1) % 3,
        (prev[1] + 1) % 3,
        (prev[2] + 1) % 3,
      ])
    }, 4500)
    return () => window.clearInterval(id)
  }, [])

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

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            Receipts, not r&eacute;sum&eacute;s
          </span>
          <h1 className={styles.heroTitle}>
            Claims are easy. <em>Credentials are signed, timestamped, and impossible to fake.</em>
          </h1>
          <p className={styles.heroLede}>
            VeriSkill replaces the self-written r&eacute;sum&eacute; with a layered trust record. Developers earn skill credentials
            peers and experts have signed off on; recruiters verify them in seconds, without a referral chase.
          </p>

          <div className={styles.heroActions}>
            <Link to="/register" className={styles.ctaPrimary}>
              Create your account
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
            <Link to="/login" className={styles.ctaSecondary}>
              I already have an account
            </Link>
          </div>

          <div className={styles.heroMeta} aria-hidden>
            <span>Wallet required &mdash; managed option available</span>
            <span>On-chain receipts, off-chain simplicity</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-hidden>
          {STACK_CARDS.map((card, i) => (
            <article
              key={card.num}
              className={`${styles.card} ${styles[card.variant]} ${styles[POSITION_CLASS[positionOf[i]]]}`}
            >
              <div className={styles.cardHead}>
                <span className={styles.cardLabel}>Credential &middot; Layer {card.num}</span>
                <span className={styles.cardChip}>{card.status}</span>
              </div>
              <div className={styles.cardSkill}>{card.skill}</div>
              <div className={styles.cardFoot}>
                <div>
                  <span className={styles.cardFootLabel}>Verifiers</span>
                  <span className={styles.cardFootValue}>{card.detail}</span>
                </div>
                {card.score !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <span className={styles.cardFootLabel}>Trust</span>
                    <span className={styles.cardScore}>{card.score}</span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.layers} aria-labelledby="layers-heading">
        <div className={styles.section} style={{ padding: 'var(--space-16) var(--space-10)' }}>
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>How it works</span>
            <h2 id="layers-heading" className={styles.sectionTitle}>
              Six layers of trust, stacked on evidence.
            </h2>
            <p className={styles.sectionLede}>
              Each layer tightens the signal — from your own declaration to a signed expert audit. You move up as the evidence
              and the people around you accumulate.
            </p>
          </header>

          <div className={styles.layerGrid}>
            {LAYERS.map(layer => (
              <article key={layer.num} className={styles.layerCard}>
                <div className={styles.layerHead}>
                  <span className={styles.layerNum}>Layer {layer.num}</span>
                  <span className={styles.layerIcon} aria-hidden>{layer.icon}</span>
                </div>
                <h3 className={styles.layerTitle}>{layer.title}</h3>
                <p className={styles.layerBody}>{layer.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="audience-heading">
        <header className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>Who it&rsquo;s for</span>
          <h2 id="audience-heading" className={styles.sectionTitle}>
            Built for the two sides of the hire.
          </h2>
        </header>

        <div className={styles.audienceGrid}>
          <article className={styles.audienceCard}>
            <span className={styles.audienceEyebrow}>For developers</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span className={styles.layerIcon} aria-hidden><Award size={18} strokeWidth={1.75} /></span>
              <h3 className={styles.audienceTitle}>Prove it once. Carry it everywhere.</h3>
            </div>
            <p className={styles.audienceBody}>
              Build a credential profile that moves with you across employers, borders, and years. The receipts stay valid
              long after the referral chain has moved on.
            </p>
            <ul className={styles.audienceList}>
              {DEVELOPER_POINTS.map(p => <li key={p}>{p}</li>)}
            </ul>
            <Link to="/register" className={styles.audienceCta}>
              Start as a developer
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Link>
          </article>

          <article className={`${styles.audienceCard} ${styles.dark}`}>
            <span className={styles.audienceEyebrow}>For recruiters</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span className={styles.layerIcon} aria-hidden style={{ background: 'rgba(201,195,244,0.15)', color: '#c9c3f4' }}>
                <Scan size={18} strokeWidth={1.75} />
              </span>
              <h3 className={styles.audienceTitle}>Verify a claim in seconds.</h3>
            </div>
            <p className={styles.audienceBody}>
              Skip the referral loop. Scan the credential, see who signed off, read the evidence, and decide. Every
              reviewer brings their own standing to the signature.
            </p>
            <ul className={styles.audienceList}>
              {RECRUITER_POINTS.map(p => <li key={p}>{p}</li>)}
            </ul>
            <Link to="/recruiters" className={styles.audienceCta}>
              Start as a recruiter
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Link>
          </article>
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="cta-heading">
        <span className={styles.eyebrow}>
          <BadgeCheck size={12} strokeWidth={2} aria-hidden />
          Pilot access open
        </span>
        <h2 id="cta-heading" className={styles.sectionTitle} style={{ maxWidth: '20ch' }}>
          Start the record of what you can actually do.
        </h2>
        <p className={styles.sectionLede} style={{ maxWidth: '52ch' }}>
          A couple of details is all it takes to open a credential profile. Verifications come as the work does.
        </p>
        <div className={styles.heroActions}>
          <Link to="/register" className={styles.ctaPrimary}>
            Create your account
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
          <Link to="/login" className={styles.ctaSecondary}>
            Sign in
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerCopy}>VeriSkill</span>
        <span className={styles.footerCopy}>Verifiable &middot; portable &middot; signed</span>
      </footer>
    </div>
  )
}
