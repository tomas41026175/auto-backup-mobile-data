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
  Usb,
  RefreshCw,
  FolderOpen,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import useAppStore from '../stores/app-store'
import type { FuseStatus } from '../stores/app-store'
import { BackupProgress } from '../components/BackupProgress'
import { WindowsDriversBanner } from '../components/WindowsDriversBanner'
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

// ── macFUSE Banner ────────────────────────────────────────────────────────────

function MacFuseBanner({ fuseStatus }: { fuseStatus: FuseStatus | null }): React.JSX.Element | null {
  if (fuseStatus === null || fuseStatus.approved) return null

  if (!fuseStatus.installed) {
    return (
      <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
        <p className="text-xs leading-relaxed text-red-300">
          USB 備份需要 macFUSE —{' '}
          <a href="#" className="underline hover:text-red-200">
            請安裝 macFUSE
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow-400" />
      <p className="text-xs leading-relaxed text-yellow-300">
        請前往 系統設定 → 隱私權與安全性 核准 macFUSE，以啟用 USB 備份功能
      </p>
    </div>
  )
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

// ── USB Device Banner ─────────────────────────────────────────────────────────

interface UsbDeviceBannerProps {
  deviceName: string
  productVersion: string
}

function UsbDeviceBanner({ deviceName, productVersion }: UsbDeviceBannerProps): React.JSX.Element {
  return (
    <div className="mx-4 mt-3 flex items-center gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2.5">
      <Usb size={14} className="shrink-0 text-blue-400" />
      <div className="flex flex-1 flex-col">
        <span className="text-xs font-medium text-blue-300">{deviceName}</span>
        <span className="text-[10px] text-gray-500">iOS {productVersion} · USB 已連接</span>
      </div>
      <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
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
  isBackingUp: boolean
  onBackup: () => void
  onToggleAutoBackup: () => void
  onOpenFolder: () => void
}

function PairedDeviceCard({
  device,
  isOnline,
  isBackingUp,
  onBackup,
  onToggleAutoBackup,
  onOpenFolder,
}: PairedDeviceCardProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-600 bg-gray-700">
          <Smartphone size={18} className="text-gray-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-100">{device.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
            <span className="text-[10px] text-gray-500">{isOnline ? '線上' : '離線'}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Auto-backup toggle */}
          <button
            onClick={onToggleAutoBackup}
            title={device.autoBackup ? '關閉自動同步' : '開啟自動同步'}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              device.autoBackup
                ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            <RefreshCw size={9} />
            自動
          </button>
          {/* Open folder button */}
          <button
            onClick={onOpenFolder}
            title="打開備份資料夾"
            className="flex items-center justify-center rounded-lg border border-gray-600 bg-gray-700 p-1.5 text-gray-400 hover:bg-gray-600 hover:text-gray-200 transition-colors"
          >
            <FolderOpen size={13} />
          </button>
          {/* Per-device backup button */}
          <button
            onClick={onBackup}
            disabled={!isOnline || isBackingUp}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            {isBackingUp ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            備份
          </button>
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
  const { devices, currentBackup, status, mdnsAvailable, usbDevice, backupError, backupComplete, fuseStatus, windowsDriversStatus } =
    useAppStore(
      useShallow((state) => ({
        devices: state.devices,
        currentBackup: state.currentBackup,
        status: state.status,
        mdnsAvailable: state.mdnsAvailable,
        usbDevice: state.usbDevice,
        backupError: state.backupError,
        backupComplete: state.backupComplete,
        fuseStatus: state.fuseStatus,
        windowsDriversStatus: state.windowsDriversStatus,
      }))
    )

  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState<boolean>(true)
  const [monthlyCount, setMonthlyCount] = useState<number>(0)
  const [lastBackupTime, setLastBackupTime] = useState<string>('無記錄')

  useEffect(() => {
    let cancelled = false

    if (window.electron.process.platform === 'win32') {
      window.api
        .invoke('check-windows-drivers')
        .then((result) => {
          if (!cancelled && result) useAppStore.getState().setWindowsDriversStatus(result)
        })
        .catch(() => {})
    } else {
      window.api
        .invoke('check-macos-fuse')
        .then((result) => {
          if (!cancelled) useAppStore.getState().setFuseStatus(result)
        })
        .catch((err) => {
          console.error('[Dashboard] check-macos-fuse failed:', err)
          if (!cancelled) useAppStore.getState().setFuseStatus(null)
        })
    }

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
          if (r.status !== 'success') return false
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

    return () => {
      cancelled = true
    }
  }, [])

  const handleGoToSettings = (): void => {
    navigate('/settings')
  }

  const pairedDevices: PairedDevice[] = settings?.pairedDevices ?? []
  const isSetup = Boolean(settings?.backupPath) && pairedDevices.length > 0
  const isBackingUp = status === 'backing-up' || currentBackup !== null
  const hasBackupFeedback = backupError !== null || backupComplete !== null || isBackingUp

  const [lastBackupDeviceId, setLastBackupDeviceId] = useState<string | null>(null)

  const handleStartBackup = async (device: PairedDevice): Promise<void> => {
    useAppStore.getState().setBackupError(null)
    useAppStore.getState().setBackupComplete(null)
    setLastBackupDeviceId(device.id)
    const task: BackupTask = {
      deviceId: device.id,
      direction: device.syncDirection,
      syncTypes: device.syncTypes,
    }
    await window.api.invoke('start-backup', task)
  }

  const handleToggleAutoBackup = async (device: PairedDevice): Promise<void> => {
    const newAutoBackup = !device.autoBackup
    await window.api.invoke('update-device-config', {
      deviceId: device.id,
      config: { autoBackup: newAutoBackup },
    })
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            pairedDevices: prev.pairedDevices.map((d) =>
              d.id === device.id ? { ...d, autoBackup: newAutoBackup } : d
            ),
          }
        : prev
    )
  }

  const handleOpenFolder = async (device: PairedDevice): Promise<void> => {
    const backupPath = settings?.backupPath
    if (!backupPath) return
    const folderPath = `${backupPath}\\${device.id}`
    await window.api.invoke('open-backup-folder', folderPath)
  }

  const handleRetry = (): void => {
    const device = pairedDevices.find((d) => d.id === lastBackupDeviceId) ?? pairedDevices[0]
    if (device) void handleStartBackup(device)
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

      {/* macFUSE status banner */}
      {window.electron.process.platform === 'darwin' && <MacFuseBanner fuseStatus={fuseStatus} />}
      {window.electron.process.platform === 'win32' && windowsDriversStatus !== null && (
        <WindowsDriversBanner status={windowsDriversStatus} />
      )}

      {/* USB device connection banner */}
      {usbDevice !== null && (
        <UsbDeviceBanner
          deviceName={usbDevice.deviceName}
          productVersion={usbDevice.productVersion}
        />
      )}

      {!isSetup ? (
        <SetupBanner onGoToSettings={handleGoToSettings} />
      ) : (
        <div className="flex flex-1 flex-col gap-3 p-4">
          {/* Main status card */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
            {isBackingUp && <BackingUpStatusCard />}
            {!isBackingUp && status === 'error' && backupError === null && (
              <ErrorStatusCard onGoToSettings={handleGoToSettings} />
            )}
            {!isBackingUp && (status !== 'error' || backupError !== null) && !isBackingUp && (
              <IdleStatusCard />
            )}
          </div>

          {/* Backup progress / complete / error feedback */}
          {hasBackupFeedback && <BackupProgress onRetry={handleRetry} />}

          {/* Paired devices */}
          <div className="flex flex-col gap-2">
            {pairedDevices.map((device) => {
              const isOnline = devices.some((d) => d.id === device.id)
              const isThisDeviceBacking = isBackingUp && currentBackup?.deviceId === device.id
              return (
                <PairedDeviceCard
                  key={device.id}
                  device={device}
                  isOnline={isOnline}
                  isBackingUp={isThisDeviceBacking}
                  onBackup={() => void handleStartBackup(device)}
                  onToggleAutoBackup={() => void handleToggleAutoBackup(device)}
                  onOpenFolder={() => void handleOpenFolder(device)}
                />
              )
            })}
          </div>

          {/* Quick stats */}
          <QuickStats
            monthlyCount={monthlyCount}
            lastBackupTime={lastBackupTime}
            backupPath={settings?.backupPath ?? ''}
          />
        </div>
      )}
    </div>
  )
}

export default Dashboard
