import { Link } from 'react-router-dom'

const pageStyle: React.CSSProperties = {
  minHeight: '100dvh',
  padding: 'var(--space-10) var(--space-8)',
  display: 'flex',
  justifyContent: 'center',
}

const contentStyle: React.CSSProperties = {
  maxWidth: '560px',
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

const pStyle: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  fontSize: 'var(--font-size-base)',
  lineHeight: 1.6,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-4) 0',
  borderTop: '1px solid var(--color-border)',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
  letterSpacing: 'var(--tracking-wide)',
  textTransform: 'uppercase',
}

export function ContactPage() {
  return (
    <main id="main-content" style={pageStyle}>
      <div style={contentStyle}>
        <span style={eyebrow}>Contact</span>
        <h1 style={h1Style}>Get in touch.</h1>
        <p style={pStyle}>
          VeriSkill is built and maintained by Akhigbe Simeon Olukayode at African Leadership University.
          For questions, data requests or research enquiries, use one of the channels below.
        </p>

        <div>
          <div style={rowStyle}>
            <span style={labelStyle}>Email</span>
            <a href="mailto:akhigbesimeon2@gmail.com">akhigbesimeon2@gmail.com</a>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Issues &amp; bugs</span>
            <a href="https://github.com/Akhigbesimeon/VeriSkill/issues" target="_blank" rel="noreferrer">
              github.com/Akhigbesimeon/VeriSkill/issues
            </a>
          </div>
          <div style={{ ...rowStyle, borderBottom: '1px solid var(--color-border)' }}>
            <span style={labelStyle}>Supervisor</span>
            <span>Thadee Gatera, African Leadership University</span>
          </div>
        </div>

        <p style={{ ...pStyle, marginTop: 'var(--space-6)' }}>
          <Link to="/">Back to home</Link>
        </p>
      </div>
    </main>
  )
}
