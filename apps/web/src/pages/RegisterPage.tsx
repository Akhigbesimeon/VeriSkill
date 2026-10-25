import { useState, FormEvent, ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/auth.store'
import { extractErrorMessage } from '@/lib/api'
import styles from './RegisterPage.module.css'

interface FormValues {
  displayName: string
  email: string
  password: string
}

interface FormErrors {
  displayName?: string
  email?: string
  password?: string
}

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {}
  if (!values.displayName.trim()) errors.displayName = 'Display name is required.'
  if (!values.email.trim())       errors.email = 'Email is required.'
  if (!PASSWORD_RE.test(values.password)) {
    errors.password = 'Password must be at least 8 characters, include one uppercase letter and one number.'
  }
  return errors
}

export function RegisterPage() {
  const [values, setValues] = useState<FormValues>({
    displayName: '',
    email: '',
    password: '',
  })
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [apiError, setApiError]       = useState<string | null>(null)
  const { register, isLoading }       = useAuthStore()
  const navigate                      = useNavigate()

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setValues(prev => ({ ...prev, [name]: value }))
    setFieldErrors(prev => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setApiError(null)
    const errors = validate(values)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    try {
      await register({
        displayName: values.displayName,
        email:       values.email,
        password:    values.password,
        role:        'developer',
        walletType:  'managed',
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setApiError(extractErrorMessage(err, 'Registration failed. Please try again.'))
    }
  }

  return (
    <AuthLayout>
      <div className={styles.container}>
        <h1 className={styles.heading}>Create your account</h1>
        <p className={styles.sub}>A couple of details to start building your verified skill profile.</p>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <Input
            label="Display Name"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            value={values.displayName}
            onChange={handleChange}
            error={fieldErrors.displayName}
          />

          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={handleChange}
            error={fieldErrors.email}
          />

          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={values.password}
            onChange={handleChange}
            error={fieldErrors.password}
            hint="Minimum 8 characters, one uppercase letter, one number"
          />

          {apiError && (
            <p className={styles.errorMsg} role="alert">{apiError}</p>
          )}

          <Button type="submit" loading={isLoading} className={styles.submitBtn}>
            Create account
          </Button>
        </form>

        <p className={styles.switchLink}>
          Already have an account?{' '}
          <Link to="/login" className={styles.link}>Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
