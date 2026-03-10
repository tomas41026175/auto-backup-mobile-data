import React from 'react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'
import { History } from './pages/History'

export function App(): React.ReactElement {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppLayout>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings"  element={<Settings />} />
          <Route path="/history"   element={<History />} />
          <Route path="*"          element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppLayout>
    </MemoryRouter>
  )
}
