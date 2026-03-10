import React from 'react'

// Electron drag region — not in standard CSSProperties
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}
import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Settings,
  History,
} from 'lucide-react'
import { cn } from '../ui'

interface NavItem {
  path: string
  icon: React.ElementType
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', icon: LayoutDashboard, label: '儀表板' },
  { path: '/settings',  icon: Settings,        label: '設定'   },
  { path: '/history',   icon: History,         label: '歷史'   },
]

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="flex h-full w-full overflow-hidden bg-[--color-bg-base]">
      {/* Sidebar */}
      <aside
        className="flex w-[72px] flex-shrink-0 flex-col items-center bg-[--color-bg-surface] py-3"
        style={{ borderRight: '1px solid var(--color-border)' }}
      >
        {/* App icon */}
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-[--color-primary-subtle]">
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="7" height="7" rx="2" fill="var(--color-primary)" opacity="0.9" />
            <rect x="12" y="3" width="7" height="7" rx="2" fill="var(--color-primary)" opacity="0.5" />
            <rect x="3" y="12" width="7" height="7" rx="2" fill="var(--color-primary)" opacity="0.5" />
            <rect x="12" y="12" width="7" height="7" rx="2" fill="var(--color-primary)" opacity="0.7" />
          </svg>
        </div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col items-center gap-1">
          {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path
            return (
              <button
                key={path}
                aria-label={label}
                title={label}
                onClick={() => navigate(path)}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]/50',
                  isActive
                    ? [
                        'bg-[--color-primary-subtle]',
                        'text-[--color-primary]',
                        'shadow-[0_0_16px_var(--color-primary-glow)]',
                      ]
                    : [
                        'text-[--color-text-muted]',
                        'hover:bg-[--color-bg-raised]',
                        'hover:text-[--color-text-secondary]',
                      ],
                )}
              >
                <Icon size={20} strokeWidth={isActive ? 2 : 1.75} />
              </button>
            )
          })}
        </nav>

        {/* Version */}
        <span
          className="select-none text-center leading-tight text-[--color-text-muted]"
          style={{ fontSize: '10px', letterSpacing: '0.02em' }}
        >
          v0.1.0
        </span>
      </aside>

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Draggable header bar */}
        <header
          className="flex h-8 flex-shrink-0 items-center justify-end px-2 bg-[--color-bg-surface]"
          style={{
            WebkitAppRegion: 'drag',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <button
            aria-label="關閉視窗"
            onClick={() => window.close()}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded text-[--color-text-muted]',
              'transition-colors duration-100',
              'hover:bg-[--color-error-subtle] hover:text-[--color-error]',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[--color-primary]/40',
            )}
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <span className="text-xs leading-none select-none" style={{ fontSize: '13px', lineHeight: 1 }}>
              ×
            </span>
          </button>
        </header>

        {/* Main scrollable content */}
        <main className="flex-1 overflow-y-auto bg-[--color-bg-base]">
          {children}
        </main>
      </div>
    </div>
  )
}
