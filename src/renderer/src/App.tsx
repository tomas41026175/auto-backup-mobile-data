import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { LayoutDashboard, Settings as SettingsIcon, History as HistoryIcon } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Settings from './pages/Settings'
import { initializeStores, setupIpcListeners } from './stores/app-store'

// ── Nav items definition ──────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '儀表板', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/settings', label: '設定', icon: <SettingsIcon size={18} /> },
  { to: '/history', label: '備份紀錄', icon: <HistoryIcon size={18} /> },
]

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-blue-600 text-white'
      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-100',
  ].join(' ')
}

// ── App Layout ────────────────────────────────────────────────────────────────

function AppLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-900">
      {/* Sidebar (72px on mobile, 192px on md+) */}
      <aside className="flex w-[72px] flex-col items-center gap-1 border-r border-gray-700 bg-gray-900 py-4 md:w-48 md:items-stretch md:px-3">
        {/* App title */}
        <div className="mb-4 flex h-8 items-center justify-center md:justify-start">
          <span className="hidden text-xs font-bold uppercase tracking-wider text-gray-500 md:block">
            Auto Backup
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <span className="shrink-0">{item.icon}</span>
              <span className="hidden md:block">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 32px draggable title bar */}
        <div
          className="flex h-8 shrink-0 items-center justify-end border-b border-gray-700 bg-gray-900 px-2"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <button
            onClick={() => window.electron.ipcRenderer.send('close-window')}
            className="flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:bg-red-500 hover:text-white transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            aria-label="關閉視窗"
          >
            <span className="text-xs leading-none">✕</span>
          </button>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

// ── App root ──────────────────────────────────────────────────────────────────

function App(): React.JSX.Element {
  useEffect(() => {
    initializeStores()
    const cleanup = setupIpcListeners()
    return cleanup
  }, [])

  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  )
}

export default App
