import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wifi,
  Smartphone,
  HardDrive,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Play,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import useAppStore from '../stores/app-store'
import { BackupProgress } from '../components/BackupProgress'
import type { Settings, BackupTask, PairedDevice } from '../../../shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLastBackup(completedAt: string | undefined): string {
  if (!completedAt) return '無記錄'
  const diffMs = Date.now() - new Date(completedAt).getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  if (diffHours < 1) return '剛才'
  if (diffHours < 24) return `${Math.floor(diffHours)} 小時前`
  return `${Math.floor(diffHours / 24)} 天前`
}

// ── mDNS Banner ───────────────────────────────────────────────────────────────

function MdnsBanner({ mdnsAvailable }: { mdnsAvailable: boolean }): React.JSX.Element | null {
  if (mdnsAvailable) {
    return (
      <div className="flex items-center gap-1.5 px-4 pt-3">
        <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
        <span className="text-xs text-gray-400">自動偵測已啟用</span>
      </div>
    )
  }

  return (
    <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow-400" />
      <p className="text-xs leading-relaxed text-yellow-300">
        自動偵測不可用 — 請前往設定頁手動新增裝置或檢查防火牆
      </p>
    </div>
  )
}

// ── Setup Banner ──────────────────────────────────────────────────────────────

function SetupBanner({ onGoToSettings }: { onGoToSettings: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gray-700 bg-gray-800">
        <Smartphone size={28} className="text-gray-400" />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-gray-200">尚未完成設定</p>
        <p className="text-xs text-gray-500">
          請先設定備份路徑並配對裝置，才能開始使用
        </p>
      </div>
      <button
        onClick={onGoToSettings}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
      >
        前往設定
      </button>
    </div>
  )
}

// ── Idle Status Card ──────────────────────────────────────────────────────────

function IdleStatusCard(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-24 w-24 animate-pulse rounded-full bg-blue-500/10" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10">
          <Wifi size={28} className="text-blue-400" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium text-gray-300">待命中</p>
        <p className="text-xs text-gray-500">等待 iPhone 連線</p>
      </div>
    </div>
  )
}

// ── Backing Up Status Card ────────────────────────────────────────────────────

function BackingUpStatusCard(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-24 w-24 animate-pulse rounded-full bg-blue-500/10" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10">
          <Loader2 size={28} className="animate-spin text-blue-400" />
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-200">正在備份</p>
    </div>
  )
}

// ── Error Status Card ─────────────────────────────────────────────────────────

function ErrorStatusCard({ onGoToSettings }: { onGoToSettings: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
        <AlertTriangle size={28} className="text-red-400" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-semibold text-red-400">備份路徑不可用</p>
        <p className="text-xs text-gray-500">請至設定頁重新選擇</p>
      </div>
      <button
        onClick={onGoToSettings}
        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
      >
        前往設定
      </button>
    </div>
  )
}

// ── Paired Device Card ────────────────────────────────────────────────────────

interface PairedDeviceCardProps {
  device: PairedDevice
  isOnline: boolean
}

function PairedDeviceCard({ device, isOnline }: PairedDeviceCardProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/60 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-700">
        <Smartphone size={18} className="text-gray-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-100">{device.name}</p>
        <p className="text-xs text-gray-500">{device.ip}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-300">
          已配對
        </span>
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
          <span className="text-[10px] text-gray-500">{isOnline ? '線上' : '離線'}</span>
        </div>
      </div>
    </div>
  )
}

// ── Quick Stats ───────────────────────────────────────────────────────────────

interface QuickStatsProps {
  monthlyCount: number
  lastBackupTime: string
  backupPath: string
}

function QuickStats({ monthlyCount, lastBackupTime, backupPath }: QuickStatsProps): React.JSX.Element {
  const stats = [
    {
      label: '本月備份',
      value: `${monthlyCount} 次`,
      icon: <CheckCircle2 size={12} className="text-green-400" />,
    },
    {
      label: '最後備份',
      value: lastBackupTime,
      icon: <Clock size={12} className="text-gray-400" />,
    },
    {
      label: '備份路徑',
      value: backupPath || '未設定',
      icon: <HardDrive size={12} className="text-gray-400" />,
    },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/60">
      <div className="flex">
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex flex-1">
            {i > 0 && <div className="w-px self-stretch bg-gray-700" />}
            <div className="flex flex-1 flex-col items-center gap-1 px-2 py-3">
              <div className="flex items-center gap-1">
                {stat.icon}
                <span className="text-[10px] text-gray-500">{stat.label}</span>
              </div>
              <span className="max-w-full truncate text-sm font-semibold text-gray-200 tabular-nums">
                {stat.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dashboard Page ────────────────────────────────────────────────────────────

function Dashboard(): React.JSX.Element {
  const navigate = useNavigate()
  const { devices, currentBackup, status, mdnsAvailable } = useAppStore(
    useShallow((state) => ({
      devices: state.devices,
      currentBackup: state.currentBackup,
      status: state.status,
      mdnsAvailable: state.mdnsAvailable,
    }))
  )

  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState<boolean>(true)
  const [monthlyCount, setMonthlyCount] = useState<number>(0)
  const [lastBackupTime, setLastBackupTime] = useState<string>('無記錄')

  useEffect(() => {
    window.api
      .invoke('get-settings')
      .then((s) => {
        setSettings(s)
      })
      .catch(() => {
        setSettings(null)
      })
      .finally(() => {
        setSettingsLoading(false)
      })

    window.api
      .invoke('get-history')
      .then((records) => {
        const now = new Date()
        const thisMonthCount = records.filter((r) => {
          const d = new Date(r.completedAt)
          return (
            d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
          )
        }).length
        setMonthlyCount(thisMonthCount)

        const latest = records.reduce<string | null>((prev, r) => {
          if (!prev) return r.completedAt
          return r.completedAt > prev ? r.completedAt : prev
        }, null)
        setLastBackupTime(formatLastBackup(latest ?? undefined))
      })
      .catch(() => {
        setMonthlyCount(0)
        setLastBackupTime('無記錄')
      })
  }, [])

  const handleGoToSettings = (): void => {
    navigate('/settings')
  }

  const pairedDevices: PairedDevice[] = settings?.pairedDevices ?? []
  const isSetup = Boolean(settings?.backupPath) && pairedDevices.length > 0
  const isBackingUp = status === 'backing-up' || currentBackup !== null

  const handleStartBackup = async (): Promise<void> => {
    if (pairedDevices.length === 0) return
    const firstDevice = pairedDevices[0]
    const task: BackupTask = {
      deviceId: firstDevice.id,
      direction: firstDevice.syncDirection,
      syncTypes: firstDevice.syncTypes,
    }
    await window.api.invoke('start-backup', task)
  }

  if (settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900">
        <span className="text-sm text-gray-500">載入中...</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gray-900">
      <MdnsBanner mdnsAvailable={mdnsAvailable} />

      {!isSetup ? (
        <SetupBanner onGoToSettings={handleGoToSettings} />
      ) : (
        <div className="flex flex-1 flex-col gap-3 p-4">
          {/* Main status card */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
            {isBackingUp && <BackingUpStatusCard />}
            {!isBackingUp && status === 'error' && (
              <ErrorStatusCard onGoToSettings={handleGoToSettings} />
            )}
            {!isBackingUp && status !== 'error' && <IdleStatusCard />}
          </div>

          {/* Backup progress */}
          {isBackingUp && <BackupProgress />}

          {/* Paired devices */}
          <div className="flex flex-col gap-2">
            {pairedDevices.map((device) => {
              const isOnline = devices.some((d) => d.id === device.id)
              return (
                <PairedDeviceCard key={device.id} device={device} isOnline={isOnline} />
              )
            })}
          </div>

          {/* Quick stats */}
          <QuickStats
            monthlyCount={monthlyCount}
            lastBackupTime={lastBackupTime}
            backupPath={settings?.backupPath ?? ''}
          />

          {/* Start backup button */}
          {!isBackingUp && (
            <button
              onClick={handleStartBackup}
              disabled={pairedDevices.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <Play size={15} />
              立即備份
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default Dashboard
