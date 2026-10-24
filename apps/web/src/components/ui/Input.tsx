import styles from './Input.module.css'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = '', ...rest }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className={styles.field}>
        <label htmlFor={inputId} className={styles.label}>{label}</label>
        <input
          ref={ref}
          id={inputId}
          className={[styles.input, error ? styles.inputError : '', className].join(' ')}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        {hint && !error && <p id={`${inputId}-hint`} className={styles.hint}>{hint}</p>}
        {error && <p id={`${inputId}-error`} className={styles.error} role="alert">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
