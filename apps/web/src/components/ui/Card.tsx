import styles from './Card.module.css'
import { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg'
}

export function Card({ children, padding = 'md', className = '', ...rest }: CardProps) {
  return (
    <div className={[styles.card, styles[padding], className].join(' ')} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={[styles.header, className].join(' ')}>{children}</div>
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={[styles.body, className].join(' ')}>{children}</div>
}
