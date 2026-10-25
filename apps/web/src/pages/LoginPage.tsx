import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuthStore, landingPathFor } from '@/store/auth.store'
import { extractErrorMessage } from '@/lib/api'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const { login, isLoading }    = useAuthStore()
  const navigate                = useNavigate()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    try {
      await login(email, password)
      const role = useAuthStore.getState().user?.role
      navigate(landingPathFor(role), { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, 'Login failed. Please check your credentials and try again.'))
    }
  }

  return (
    <AuthLayout>
      <div className={styles.container}>
        <h1 className={styles.heading}>Sign in</h1>
        <p className={styles.sub}>Continue to your verified skill profile.</p>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          {error && (
            <p className={styles.errorMsg} role="alert">{error}</p>
          )}

          <Button type="submit" loading={isLoading} className={styles.submitBtn}>
            Sign in
          </Button>
        </form>

        <p className={styles.switchLink}>
          <Link to="/forgot-password" className={styles.link}>Forgot password?</Link>
        </p>
        <p className={styles.switchLink}>
          New to VeriSkill?{' '}
          <Link to="/register" className={styles.link}>Create an account</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
