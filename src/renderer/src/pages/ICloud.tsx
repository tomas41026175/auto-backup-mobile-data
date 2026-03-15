import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  Cloud,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Lock,
  XCircle
} from 'lucide-react'
import type { ICloudAlbum, ICloudSyncStatus } from '../../../shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function stateLabel(state: ICloudSyncStatus['state']): string {
  switch (state) {
    case 'idle': return '閒置'
    case 'authenticating': return '認證中…'
    case 'scanning': return '掃描相簿中…'
    case 'waiting_2fa': return '等待雙重驗證碼'
    case 'downloading': return '下載中'
    case 'complete': return '完成'
    case 'error': return '錯誤'
    default: return state
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
}

function LabeledInput({ label, id, ...rest }: InputProps & { id: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-gray-400">
        {label}
      </label>
      <input
        id={id}
        className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        {...rest}
      />
    </div>
  )
}

interface TwoFADialogProps {
  onSubmit: (code: string) => void
  onCancel: () => void
}

function TwoFADialog({ onSubmit, onCancel }: TwoFADialogProps): React.JSX.Element {
  const [code, setCode] = useState('')

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    if (code.trim().length > 0) onSubmit(code.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-blue-400">
          <Lock size={18} />
          <h3 className="font-semibold">雙重驗證</h3>
        </div>
        <p className="mb-4 text-sm text-gray-400">
          請輸入發送到您裝置的 6 位驗證碼。
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-center text-xl font-mono tracking-widest text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={code.trim().length === 0}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              送出
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const IDLE_STATUS: ICloudSyncStatus = {
  state: 'idle',
  current: 0,
  total: 0,
  skipped: 0,
  currentFile: '',
  currentAlbum: '',
  bytesDownloaded: 0
}

const ALBUMS_STORAGE_KEY = 'icloud-known-albums'

function loadStoredAlbums(): ICloudAlbum[] {
  try {
    const raw = localStorage.getItem(ALBUMS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ICloudAlbum[]) : []
  } catch {
    return []
  }
}

export default function ICloud(): React.JSX.Element {
  const [appleId, setAppleId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [destDir, setDestDir] = useState('')
  const [status, setStatus] = useState<ICloudSyncStatus>(IDLE_STATUS)
  const [albums, setAlbums] = useState<ICloudAlbum[]>(loadStoredAlbums)
  const [selectedAlbum, setSelectedAlbum] = useState('all')
  const [show2FA, setShow2FA] = useState(false)
  const [syncResult, setSyncResult] = useState<{ downloaded: number; skipped: number; bytesDownloaded: number } | null>(null)

  // Keep latest status in a ref so event handlers always see fresh value
  const statusRef = useRef(status)
  statusRef.current = status

  const [isRunning, setIsRunning] = useState(false)
  const isActive = isRunning || status.state === 'authenticating' || status.state === 'scanning' || status.state === 'downloading' || status.state === 'waiting_2fa'

  // On mount: restore current status from main process + load settings
  useEffect(() => {
    window.api.invoke('get-settings').then((s) => {
      if (s?.backupPath) setDestDir(s.backupPath)
      if (s?.icloudAppleId) setAppleId(s.icloudAppleId)
      if (s?.icloudPassword) setPassword(s.icloudPassword)
    }).catch(() => {})

    window.api.invoke('get-icloud-status').then((s) => {
      if (!s) return
      setStatus(s)
      const active = s.state === 'authenticating' || s.state === 'scanning' ||
        s.state === 'downloading' || s.state === 'waiting_2fa'
      setIsRunning(active)
    }).catch(() => {})
  }, [])

  // IPC listeners
  useEffect(() => {
    const offProgress = window.api.on('icloud-sync-progress', (_e, s) => {
      setStatus(s)
    })
    const off2FA = window.api.on('icloud-sync-2fa-required', (_e, _type) => {
      setShow2FA(true)
    })
    const offComplete = window.api.on('icloud-sync-complete', (_e, result) => {
      setSyncResult(result)
      setShow2FA(false)
      setIsRunning(false)
    })
    const offError = window.api.on('icloud-sync-error', (_e, err) => {
      // Only show the error message; don't change running state (may be non-fatal)
      console.warn('[icloud] file error:', err.message)
    })
    const offAlbums = window.api.on('icloud-albums', (_e, list) => {
      setAlbums(list)
      localStorage.setItem(ALBUMS_STORAGE_KEY, JSON.stringify(list))
    })
    const offAlbumUpdate = window.api.on('icloud-album-update', (_e, { name, count }) => {
      setAlbums((prev) => {
        const updated = prev.map((a) => a.name === name ? { ...a, count } : a)
        localStorage.setItem(ALBUMS_STORAGE_KEY, JSON.stringify(updated))
        return updated
      })
    })

    return (): void => {
      offProgress()
      off2FA()
      offComplete()
      offError()
      offAlbums()
      offAlbumUpdate()
    }
  }, [])

  async function handleStart(): Promise<void> {
    if (!appleId.trim() || !password || !destDir) return
    // Persist credentials for next session
    window.api.invoke('save-settings', { icloudAppleId: appleId.trim(), icloudPassword: password })
    setSyncResult(null)
    setAlbums((prev) => prev.map((a) => ({ ...a, count: 0 })))
    setIsRunning(true)
    setStatus({ ...IDLE_STATUS, state: 'authenticating' })
    await window.api.invoke('start-icloud-sync', {
      appleId: appleId.trim(),
      password,
      destDir,
      album: selectedAlbum === 'all' ? undefined : selectedAlbum
    })
  }

  async function handleCancel(): Promise<void> {
    await window.api.invoke('cancel-icloud-sync')
    setShow2FA(false)
    setIsRunning(false)
    setStatus(IDLE_STATUS)
  }

  async function handleSubmit2FA(code: string): Promise<void> {
    setShow2FA(false)
    await window.api.invoke('submit-2fa-code', code)
  }

  async function handlePickFolder(): Promise<void> {
    const picked = await window.api.invoke('select-backup-path')
    if (picked) setDestDir(picked)
  }

  const progressPct =
    status.total > 0 ? Math.round((status.current / status.total) * 100) : 0

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Cloud size={24} className="text-blue-400" />
        <h1 className="text-lg font-semibold text-gray-100">iCloud 照片同步</h1>
      </div>

      {/* Login card */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-300">iCloud 登入</h2>
        <div className="flex flex-col gap-3">
          <LabeledInput
            id="apple-id"
            label="Apple ID"
            type="email"
            placeholder="example@icloud.com"
            value={appleId}
            onChange={(e) => setAppleId(e.target.value)}
            disabled={isActive}
            autoComplete="username"
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="icloud-password" className="text-xs font-medium text-gray-400">密碼</label>
            <div className="relative">
              <input
                id="icloud-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isActive}
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 pr-9 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Destination folder card */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-300">目標資料夾</h2>
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-300">
            {destDir || <span className="text-gray-500">尚未選擇資料夾</span>}
          </div>
          <button
            onClick={handlePickFolder}
            disabled={isActive}
            className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            <FolderOpen size={15} />
            選擇
          </button>
        </div>
      </div>

      {/* Album selector */}
      {albums.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-300">同步相簿</h2>
          <select
            value={selectedAlbum}
            onChange={(e) => setSelectedAlbum(e.target.value)}
            disabled={isActive}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="all">全部相簿</option>
            {albums.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}{a.count > 0 ? ` (${a.count})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Action button */}
      {!isActive ? (
        <button
          onClick={handleStart}
          disabled={!appleId.trim() || !password || !destDir}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          <Download size={16} />
          開始同步
        </button>
      ) : (
        <button
          onClick={handleCancel}
          className="flex items-center justify-center gap-2 rounded-xl border border-red-500 bg-red-500/10 py-3 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <XCircle size={16} />
          取消同步
        </button>
      )}

      {/* Progress card */}
      {status.state !== 'idle' && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">進度</h2>
            <span className="flex items-center gap-1.5 text-xs font-medium">
              {isActive && <Loader2 size={13} className="animate-spin text-blue-400" />}
              {status.state === 'complete' && <CheckCircle2 size={13} className="text-green-400" />}
              {status.state === 'error' && <XCircle size={13} className="text-red-400" />}
              <span className={
                status.state === 'complete' ? 'text-green-400'
                : status.state === 'error' ? 'text-red-400'
                : 'text-blue-400'
              }>
                {stateLabel(status.state)}
              </span>
            </span>
          </div>

          {/* Resume notice */}
          {status.skipped > 0 && status.state !== 'complete' && (
            <p className="mb-3 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
              接續上次進度，已跳過 {status.skipped} 個已下載的檔案
            </p>
          )}

          {/* Progress bar (scanning or downloading) */}
          {(status.state === 'downloading' || status.state === 'scanning') && (
            <div className="mb-3">
              {status.total > 0 ? (
                <>
                  <div className="mb-1 flex justify-between text-xs text-gray-400">
                    <span>
                      {status.current} / {status.total} 個
                      {status.skipped > 0 && <span className="ml-1 text-gray-500">（跳過 {status.skipped}）</span>}
                    </span>
                    <span>{formatBytes(status.bytesDownloaded)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                  <div className="h-2 w-1/3 animate-pulse rounded-full bg-blue-500/60" />
                </div>
              )}
            </div>
          )}

          {/* Current album & file */}
          {(status.currentFile || status.currentAlbum) && (
            <div className="flex flex-col gap-0.5 text-xs text-gray-400">
              {status.currentAlbum && (
                <span>相簿：<span className="text-gray-300">{status.currentAlbum}</span></span>
              )}
              {status.currentFile && status.state === 'downloading' && (
                <span className="truncate">檔案：<span className="text-gray-300">{status.currentFile}</span></span>
              )}
            </div>
          )}

          {/* Error */}
          {status.state === 'error' && status.error && (
            <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {status.error}
            </p>
          )}
        </div>
      )}

      {/* Complete summary */}
      {syncResult && status.state === 'complete' && (
        <div className="rounded-xl border border-green-700/40 bg-green-900/20 p-5">
          <div className="mb-3 flex items-center gap-2 text-green-400">
            <CheckCircle2 size={18} />
            <h2 className="text-sm font-semibold">同步完成</h2>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-300">
            <span>已下載：<strong className="text-white">{syncResult.downloaded}</strong> 個</span>
            <span>已跳過：<strong className="text-white">{syncResult.skipped}</strong> 個</span>
            {'bytesDownloaded' in syncResult && (syncResult as { bytesDownloaded?: number }).bytesDownloaded !== undefined && (
              <span>總大小：<strong className="text-white">{formatBytes((syncResult as { bytesDownloaded: number }).bytesDownloaded)}</strong></span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            檔案位於：目標資料夾 / icloud / 相簿名稱 /
          </p>
        </div>
      )}

      {/* Album list — shown during active sync to display per-album progress */}
      {albums.length > 0 && isActive && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-300">相簿列表</h2>
          <ul className="flex flex-col gap-1">
            {albums.map((album) => (
              <li
                key={album.name}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm odd:bg-gray-700/40 ${status.currentAlbum === album.name ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : ''}`}
              >
                <span className={status.currentAlbum === album.name ? 'text-blue-300' : 'text-gray-200'}>
                  {status.currentAlbum === album.name && <Loader2 size={11} className="mr-1.5 inline animate-spin" />}
                  {album.name}
                </span>
                <span className="text-xs text-gray-400">
                  {album.count > 0 ? `${album.count} 個項目` : '掃描中…'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 2FA dialog */}
      {show2FA && (
        <TwoFADialog
          onSubmit={handleSubmit2FA}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
