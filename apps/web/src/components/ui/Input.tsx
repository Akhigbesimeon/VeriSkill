import styles from './Input.module.css'
import { InputHTMLAttributes, forwardRef, useState } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  /** Opt out of the automatic show/hide toggle shown for type="password". */
  noPasswordToggle?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = '', type, noPasswordToggle, ...rest }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
    const isPassword = type === 'password'
    const showToggle = isPassword && !noPasswordToggle
    const [revealed, setRevealed] = useState(false)
    const effectiveType = showToggle && revealed ? 'text' : type

    return (
      <div className={styles.field}>
        <label htmlFor={inputId} className={styles.label}>{label}</label>
        <div className={styles.inputWrap}>
          <input
            ref={ref}
            id={inputId}
            type={effectiveType}
            className={[
              styles.input,
              error ? styles.inputError : '',
              showToggle ? styles.inputWithToggle : '',
              className,
            ].join(' ')}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...rest}
          />
          {showToggle && (
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setRevealed(r => !r)}
              aria-label={revealed ? 'Hide password' : 'Show password'}
              aria-pressed={revealed}
              tabIndex={0}
            >
              {revealed ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.17-6.17" />
                  <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.17 4.19" />
                  <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          )}
        </div>
        {hint && !error && <p id={`${inputId}-hint`} className={styles.hint}>{hint}</p>}
        {error && <p id={`${inputId}-error`} className={styles.error} role="alert">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
