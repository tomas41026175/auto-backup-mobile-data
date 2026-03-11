import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import React from 'react'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  icon?: React.ReactNode
}

const btnVariant: Record<ButtonVariant, string> = {
  primary:
    'bg-[--color-primary] text-white hover:bg-[--color-primary-hover] shadow-[--shadow-glow] hover:shadow-[0_0_28px_var(--color-primary-glow)]',
  secondary:
    'border border-[--color-border-strong] bg-[--color-bg-raised] text-[--color-text] hover:bg-[--color-bg-overlay] hover:border-[--color-border-strong]',
  ghost: 'text-[--color-text-secondary] hover:bg-[--color-bg-raised] hover:text-[--color-text]',
  danger:
    'bg-[--color-error-subtle] border border-[--color-error]/30 text-[--color-error] hover:bg-[--color-error]/20',
}
const btnSize: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  isLoading,
  icon,
  disabled,
  children,
  className,
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <button
      disabled={disabled ?? isLoading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]/50',
        'disabled:cursor-not-allowed disabled:opacity-40',
        btnVariant[variant],
        btnSize[size],
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}

// ── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'

const badgeStyles: Record<BadgeVariant, string> = {
  default: 'bg-[--color-bg-overlay] text-[--color-text-secondary]',
  primary: 'bg-[--color-primary-subtle] text-[--color-primary]',
  success: 'bg-[--color-success-subtle] text-[--color-success]',
  warning: 'bg-[--color-warning-subtle] text-[--color-warning]',
  error: 'bg-[--color-error-subtle] text-[--color-error]',
  info: 'bg-[--color-info-subtle] text-[--color-info]',
}

interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  children: React.ReactNode
  className?: string
}

export function Badge({
  variant = 'default',
  dot,
  children,
  className,
}: BadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        badgeStyles[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full bg-current',
            variant === 'success' && 'animate-pulse',
          )}
        />
      )}
      {children}
    </span>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  glow?: boolean
}

export function Card({ children, className, onClick, glow }: CardProps): React.ReactElement {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-[--color-border] bg-[--color-bg-surface] p-5 shadow-sm',
        glow && 'border-[--color-primary]/40 shadow-[--shadow-glow]',
        onClick && 'cursor-pointer hover:bg-[--color-bg-raised] transition-colors',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  suffix?: React.ReactNode
}

export function Input({
  label,
  error,
  hint,
  suffix,
  id,
  className,
  ...props
}: InputProps): React.ReactElement {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[--color-text-secondary]">
          {label}
          {props.required && <span className="ml-1 text-[--color-error]">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          id={inputId}
          className={cn(
            'h-9 w-full rounded-lg border bg-[--color-bg-raised] px-3 text-sm text-[--color-text]',
            'placeholder:text-[--color-text-muted]',
            'transition-colors focus:outline-none focus:ring-1',
            error
              ? 'border-[--color-error]/50 focus:ring-[--color-error]/30'
              : 'border-[--color-border] hover:border-[--color-border-strong] focus:border-[--color-primary]/50 focus:ring-[--color-primary]/20',
            suffix && 'pr-10',
            className,
          )}
          aria-invalid={!!error}
          {...props}
        />
        {suffix && (
          <div className="absolute right-2 text-[--color-text-muted]">{suffix}</div>
        )}
      </div>
      {error && <p className="text-xs text-[--color-error]">{error}</p>}
      {hint && !error && <p className="text-xs text-[--color-text-muted]">{hint}</p>}
    </div>
  )
}

// ── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ className }: { className?: string }): React.ReactElement {
  return <div className={cn('h-px bg-[--color-border]', className)} />
}
