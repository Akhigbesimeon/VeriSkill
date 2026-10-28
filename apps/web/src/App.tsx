import { lazy, Suspense } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'

const OnboardingPage     = lazy(() => import('@/pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })))
const LoginPage          = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })))
const RegisterPage       = lazy(() => import('@/pages/RegisterPage').then(m => ({ default: m.RegisterPage })))
const RecruitersPage     = lazy(() => import('@/pages/RecruitersPage').then(m => ({ default: m.RecruitersPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage  = lazy(() => import('@/pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const DashboardPage      = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const CredentialsPage    = lazy(() => import('@/pages/CredentialsPage').then(m => ({ default: m.CredentialsPage })))
const NewCredentialPage  = lazy(() => import('@/pages/NewCredentialPage').then(m => ({ default: m.NewCredentialPage })))
const CredentialDetailPage = lazy(() => import('@/pages/CredentialDetailPage').then(m => ({ default: m.CredentialDetailPage })))
const TrustScoreHistoryPage = lazy(() => import('@/pages/TrustScoreHistoryPage').then(m => ({ default: m.TrustScoreHistoryPage })))
const ReviewsPage        = lazy(() => import('@/pages/ReviewsPage').then(m => ({ default: m.ReviewsPage })))
const PastReviewsPage    = lazy(() => import('@/pages/PastReviewsPage').then(m => ({ default: m.PastReviewsPage })))
const VerifyPage         = lazy(() => import('@/pages/VerifyPage').then(m => ({ default: m.VerifyPage })))
const PublicCredentialPage = lazy(() => import('@/pages/PublicCredentialPage').then(m => ({ default: m.PublicCredentialPage })))
const AdminAnalyticsPage   = lazy(() => import('@/pages/admin.pages').then(m => ({ default: m.AdminAnalyticsPage })))
const AdminCredentialsPage = lazy(() => import('@/pages/admin.pages').then(m => ({ default: m.AdminCredentialsPage })))
const AdminUsersPage       = lazy(() => import('@/pages/admin.pages').then(m => ({ default: m.AdminUsersPage })))
const AdminAuditLogPage    = lazy(() => import('@/pages/admin.pages').then(m => ({ default: m.AdminAuditLogPage })))
const ProfilePage        = lazy(() => import('@/pages/ProfilePage').then(m => ({ default: m.ProfilePage })))

function PageFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '240px',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--font-size-sm)',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
      }}
    >
      Loading
    </div>
  )
}

function NotFoundPage() {
  return (
    <main
      id="main-content"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-8)',
      }}
    >
      <div style={{ maxWidth: '440px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            letterSpacing: 'var(--tracking-wide)',
          }}
        >
          404 · page not found
        </span>
        <h1
          style={{
            fontSize: '3rem',
            fontWeight: 'var(--font-weight-semibold)',
            letterSpacing: 'var(--tracking-tight)',
            lineHeight: 1.05,
          }}
        >
          This page doesn&rsquo;t exist.
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)' }}>
          The link may be broken, or the page may have moved. Head back to your dashboard to continue.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', marginTop: 'var(--space-2)' }}>
          <Link
            to="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: 'var(--space-3) var(--space-5)',
              background: 'var(--color-text-primary)',
              color: 'var(--color-text-inverse)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
            }}
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<OnboardingPage />} />

        <Route path="/login"            element={<LoginPage />} />
        <Route path="/register"         element={<RegisterPage />} />
        <Route path="/recruiters"       element={<RecruitersPage />} />
        <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
        <Route path="/reset-password"   element={<ResetPasswordPage />} />
        <Route path="/verify/:id"       element={<PublicCredentialPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppShell><DashboardPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/credentials"
          element={
            <ProtectedRoute>
              <AppShell><CredentialsPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/credentials/new"
          element={
            <ProtectedRoute roles={['developer']}>
              <AppShell><NewCredentialPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/credentials/:id"
          element={
            <ProtectedRoute>
              <AppShell><CredentialDetailPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/credentials/:id/trust-score"
          element={
            <ProtectedRoute>
              <AppShell><TrustScoreHistoryPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reviews"
          element={
            <ProtectedRoute roles={['developer', 'peer_verifier', 'expert_verifier']}>
              <AppShell><ReviewsPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reviews/history"
          element={
            <ProtectedRoute roles={['developer', 'peer_verifier', 'expert_verifier']}>
              <AppShell><PastReviewsPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/verify"
          element={
            <ProtectedRoute roles={['recruiter']}>
              <AppShell><VerifyPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['administrator']}>
              <AppShell><AdminAnalyticsPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/credentials"
          element={
            <ProtectedRoute roles={['administrator']}>
              <AppShell><AdminCredentialsPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute roles={['administrator']}>
              <AppShell><AdminUsersPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute roles={['administrator']}>
              <AppShell><AdminAuditLogPage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppShell><ProfilePage /></AppShell>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
