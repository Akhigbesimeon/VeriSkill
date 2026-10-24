import styles from './Button.module.css'
import { Loader2 } from 'lucide-react'
import { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[styles.btn, styles[variant], styles[size], className].join(' ')}
    >
      {loading ? (
        <Loader2 size={16} className={styles.spinner} aria-hidden />
      ) : icon ? (
        <span className={styles.icon} aria-hidden>{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  )
}
