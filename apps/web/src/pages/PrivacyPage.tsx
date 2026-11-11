import { Link } from 'react-router-dom'

const pageStyle: React.CSSProperties = {
  minHeight: '100dvh',
  padding: 'var(--space-10) var(--space-8)',
  display: 'flex',
  justifyContent: 'center',
}

const contentStyle: React.CSSProperties = {
  maxWidth: '680px',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
}

const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-muted)',
  letterSpacing: 'var(--tracking-wide)',
  textTransform: 'uppercase',
}

const h1Style: React.CSSProperties = {
  fontSize: '2.5rem',
  fontWeight: 'var(--font-weight-semibold)',
  letterSpacing: 'var(--tracking-tight)',
  lineHeight: 1.1,
}

const h2Style: React.CSSProperties = {
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-semibold)',
  marginTop: 'var(--space-4)',
}

const pStyle: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  fontSize: 'var(--font-size-base)',
  lineHeight: 1.6,
}

export function PrivacyPage() {
  return (
    <main id="main-content" style={pageStyle}>
      <div style={contentStyle}>
        <span style={eyebrow}>Privacy policy</span>
        <h1 style={h1Style}>How VeriSkill handles your data.</h1>
        <p style={pStyle}>
          VeriSkill is a research project built for a dissertation at African Leadership University.
          This page describes what the platform stores, why, and what ends up on a public blockchain.
          Last updated 4 November 2026.
        </p>

        <h2 style={h2Style}>What we store</h2>
        <p style={pStyle}>
          Account information: your email, password hash, role (developer, peer verifier, expert, recruiter, administrator)
          and, if you connect one, your Ethereum wallet address. Credential information: the skill you claim,
          the evidence URLs you submit, the GitHub repository you link, and the trust-score history computed
          by the system.
        </p>

        <h2 style={h2Style}>IP addresses</h2>
        <p style={pStyle}>
          We never store your IP address in plain text. Peer-review requests save a SHA-256 hash of the reviewer&rsquo;s
          IP and an ASN lookup, used only to detect collusion between a developer and their reviewer.
        </p>

        <h2 style={h2Style}>What goes on-chain</h2>
        <p style={pStyle}>
          When a credential is minted on Ethereum Sepolia, only a <code>commitHash</code> of the evidence and
          a <code>skillId</code> are written to the contract, alongside an Ethereum Attestation Service receipt.
          No personal data, email, name or plain-text evidence URL is written on-chain.
        </p>

        <h2 style={h2Style}>Third parties</h2>
        <p style={pStyle}>
          Evidence URLs are fetched from the providers you link (for example Coursera or edX) to verify they resolve.
          GitHub repositories you submit are read through the GitHub API using a read-only token. Infrastructure
          providers that process data on our behalf: Render (API hosting) and Vercel (web hosting). PostgreSQL hosted on a server.
        </p>

        <h2 style={h2Style}>Your rights</h2>
        <p style={pStyle}>
          You can request deletion of your account and off-chain data at any time. On-chain records cannot be deleted;
          a revoked credential is marked as revoked on-chain but the historical transaction remains visible on Sepolia.
          To make a request, use the <Link to="/contact">contact page</Link>.
        </p>

        <p style={{ ...pStyle, marginTop: 'var(--space-6)' }}>
          <Link to="/">Back to home</Link>
        </p>
      </div>
    </main>
  )
}
