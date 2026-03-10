import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Settings from './pages/Settings'

function Layout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
    `block px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-48 border-r border-gray-200 bg-white p-4 flex flex-col gap-1">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Auto Backup
        </h2>
        <NavLink to="/" end className={navLinkClass}>
          儀表板
        </NavLink>
        <NavLink to="/settings" className={navLinkClass}>
          設定
        </NavLink>
        <NavLink to="/history" className={navLinkClass}>
          備份紀錄
        </NavLink>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}

export default App
