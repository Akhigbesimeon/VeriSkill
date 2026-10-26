import { useState, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import api, { extractErrorMessage } from '@/lib/api'
import styles from './LoginPage.module.css'

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/

export function ResetPasswordPage() {
  const [params]                = useSearchParams()
  const token                   = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const navigate                = useNavigate()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    if (!PASSWORD_RE.test(password)) {
      setError('Password must be at least 8 characters, include one uppercase letter and one number.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, newPassword: password })
      navigate('/login', { replace: true, state: { resetSuccess: true } })
    } catch (err) {
      setError(extractErrorMessage(err, 'Reset link is invalid or has expired.'))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout>
        <div className={styles.container}>
          <h1 className={styles.heading}>Reset link missing</h1>
          <p className={styles.sub}>This URL doesn't include a reset token.</p>
          <p className={styles.switchLink}>
            <Link to="/forgot-password" className={styles.link}>Request a new link</Link>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className={styles.container}>
        <h1 className={styles.heading}>Choose a new password</h1>
        <p className={styles.sub}>Pick something you don't use anywhere else.</p>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />

          {error && <p className={styles.errorMsg} role="alert">{error}</p>}

          <Button type="submit" loading={loading} className={styles.submitBtn}>
            Update password
          </Button>
        </form>

        <p className={styles.switchLink}>
          <Link to="/login" className={styles.link}>Back to sign in</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
