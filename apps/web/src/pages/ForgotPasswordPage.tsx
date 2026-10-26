import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import api, { extractErrorMessage } from '@/lib/api'
import styles from './LoginPage.module.css'

export function ForgotPasswordPage() {
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSubmitted(true)
    } catch (err) {
      setError(extractErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className={styles.container}>
        <h1 className={styles.heading}>Forgot password?</h1>
        <p className={styles.sub}>
          Enter the email on your account. If it matches, we'll send you a link to pick a new password.
        </p>

        {submitted ? (
          <p className={styles.sub} role="status">
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
            The link expires in 1 hour.
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />

            {error && <p className={styles.errorMsg} role="alert">{error}</p>}

            <Button type="submit" loading={loading} className={styles.submitBtn}>
              Send reset link
            </Button>
          </form>
        )}

        <p className={styles.switchLink}>
          Remembered it?{' '}
          <Link to="/login" className={styles.link}>Back to sign in</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
