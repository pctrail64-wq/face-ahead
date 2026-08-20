/**
 * Tailwind component library — shared primitives.
 * No external UI deps; styled entirely with Tailwind + the design tokens
 * from tailwind.config.js.
 */
import { useState, useRef, useEffect, type ReactNode, type InputHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes } from 'react'

export const cx = (...classes: (string | undefined | false)[]) =>
  classes.filter(Boolean).join(' ')

export function Button({ className, variant = 'primary', size = 'md', disabled, children, onClick, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  const base = 'inline-flex items-center justify-center rounded-[6px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-brand hover:bg-brand/90 text-ink',
    secondary: 'bg-panel hover:bg-panel/80 text-ink border border-line',
    ghost: 'bg-transparent hover:bg-line/20 text-muted',
    danger: 'bg-bad hover:bg-bad/90 text-ink',
  }
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Input({ className, label, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-muted">{label}</label>}
      <input
        className={cx(
          'w-full rounded-[6px] bg-panel/50 border border-line px-3 py-2 text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand/40',
          error && 'border-bad',
          className,
        )}
        {...rest}
      />
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  )
}

export function TextArea({ className, label, error, ...rest }: InputHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-muted">{label}</label>}
      <textarea
        rows={3}
        className={cx(
          'w-full rounded-[6px] bg-panel/50 border border-line px-3 py-2 text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand/40 resize-y',
          error && 'border-bad',
          className,
        )}
        {...rest}
      />
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  )
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div className={cx('rounded-[8px] bg-panel p-4 shadow-card', className)} {...rest}>
      {children}
    </div>
  )
}

export function Badge({ children, color = 'default', size = 'sm' }: { children: ReactNode; color?: 'default' | 'brand' | 'green' | 'red' | 'amber' | 'muted'; size?: 'sm' | 'md' }) {
  const colors = {
    default: 'bg-line/20 text-muted',
    brand: 'bg-brand/20 text-brand',
    green: 'bg-good/20 text-good',
    red: 'bg-bad/20 text-bad',
    amber: 'bg-warn/20 text-warn',
    muted: 'bg-line/10 text-muted',
  }
  const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-sm' }
  return <span className={'inline-flex items-center rounded-full font-medium ' + colors[color] + ' ' + sizes[size]}>{children}</span>
}

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sz = { sm: 16, md: 24, lg: 32 }
  return (
    <svg width={sz[size]} height={sz[size]} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4" />
    </svg>
  )
}

export function Modal({ children, onClose, title, className }: { children: ReactNode; onClose: () => void; title?: string; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm" onClick={onClose}>
      <div className={cx('max-w-lg w-full rounded-[8px] bg-ink text-ink p-6 shadow-glow', className)} onClick={(e) => e.stopPropagation()}>
        {title && <h2 className="text-lg font-semibold mb-4">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Progress({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={cx('h-2 w-full rounded-full bg-line/20 overflow-hidden', className)}>
      <div className="h-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Thumb({ src, alt = '', className, onClick }: { src?: string | null; alt?: string; className?: string; onClick?: () => void }) {
  if (!src) return <div className="flex items-center justify-center text-muted bg-line/10 rounded-[6px] h-48">No image</div>
  return (
    <img
      src={src}
      alt={alt}
      onClick={onClick}
      className={cx('rounded-[6px] object-cover cursor-pointer hover:opacity-90 transition-opacity', className)}
    />
  )
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const m = window.matchMedia(query)
    setMatches(m.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    m.addEventListener?.('change', onChange)
    return () => m.removeEventListener?.('change', onChange)
  }, [query])
  return matches
}

export function formatUnits(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
