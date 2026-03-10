import { useState, type ReactNode } from 'react'
import {
  Wifi,
  Smartphone,
  HardDrive,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { cn, Badge, Button, Card, Progress, Divider } from '../components/ui'

type BackupStatus = 'idle' | 'backing-up' | 'error'

interface PairedDevice {
  name: string
  ip: string
  isOnline: boolean
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MdnsBanner({ mdnsAvailable }: { mdnsAvailable: boolean }) {
  if (mdnsAvailable) {
    return (
      <div className="flex justify-center px-4 pt-3">
        <Badge variant="success" dot>
          自動偵測已啟用
        </Badge>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'mx-4 mt-3 flex items-start gap-2.5 rounded-lg px-3 py-2.5',
        'bg-[--color-warning-subtle] border border-[--color-warning]/20',
      )}
    >
      <AlertTriangle
        className="mt-0.5 shrink-0 text-[--color-warning]"
        size={14}
      />
      <p className="text-xs leading-relaxed text-[--color-warning]">
        自動偵測不可用 — 請前往設定頁手動新增裝置或檢查防火牆
      </p>
    </div>
  )
}

// ── Status Card: Idle ─────────────────────────────────────────────────────────

function IdleStatusCard() {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Animated glow orb */}
      <div className="relative flex items-center justify-center">
        {/* Outer glow ring */}
        <div
          className="absolute h-24 w-24 animate-pulse rounded-full"
          style={{
            background:
              'radial-gradient(circle, var(--color-primary-glow) 0%, transparent 70%)',
          }}
        />
        {/* Icon circle */}
        <div
          className={cn(
            'relative flex h-16 w-16 items-center justify-center rounded-full',
            'bg-[--color-primary-subtle] border border-[--color-primary]/20',
            'shadow-[0_0_20px_var(--color-primary-glow)]',
          )}
        >
          <Wifi size={28} className="text-[--color-primary]" />
        </div>
      </div>

      {/* Status text */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium text-[--color-text-secondary]">
          偵測中...
        </p>
        <p className="text-xs text-[--color-text-muted]">等待 iPhone 連線</p>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-4 text-xs text-[--color-text-muted]">
        <span className="flex items-center gap-1">
          <Clock size={11} />
          最後備份：2 小時前
        </span>
        <span className="text-[--color-border-strong]">│</span>
        <span>下一次：自動</span>
      </div>
    </div>
  )
}

// ── Status Card: Backing Up ───────────────────────────────────────────────────

function BackingUpStatusCard({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Spinning loader orb */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute h-24 w-24 rounded-full animate-pulse"
          style={{
            background:
              'radial-gradient(circle, var(--color-primary-glow) 0%, transparent 70%)',
          }}
        />
        <div
          className={cn(
            'relative flex h-16 w-16 items-center justify-center rounded-full',
            'bg-[--color-primary-subtle] border border-[--color-primary]/30',
            'shadow-[0_0_28px_var(--color-primary-glow)]',
          )}
        >
          <Loader2 size={28} className="animate-spin text-[--color-primary]" />
        </div>
      </div>

      {/* Status text */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-semibold text-[--color-text]">正在備份</p>
        <p className="text-xs text-[--color-text-secondary]">
          iPhone SE (Tomas)
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full px-4">
        <Progress value={progress} animated />
      </div>

      {/* Transfer details */}
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-xs text-[--color-text-secondary]">
          已傳輸：1.2 GB / 3.4 GB
        </p>
        <p className="text-xs text-[--color-text-muted]">剩餘時間：約 5 分鐘</p>
      </div>
    </div>
  )
}

// ── Status Card: Error ────────────────────────────────────────────────────────

function ErrorStatusCard({ onGoToSettings }: { onGoToSettings: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Error icon */}
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full',
          'bg-[--color-error-subtle] border border-[--color-error]/20',
        )}
      >
        <AlertTriangle size={28} className="text-[--color-error]" />
      </div>

      {/* Error text */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-semibold text-[--color-error]">
          備份路徑不可用
        </p>
        <p className="text-xs text-[--color-text-muted]">
          請至設定頁重新選擇
        </p>
      </div>

      {/* CTA */}
      <Button variant="danger" size="sm" onClick={onGoToSettings}>
        前往設定
      </Button>
    </div>
  )
}

// ── Main Status Card ──────────────────────────────────────────────────────────

function MainStatusCard({
  status,
  progress,
  onGoToSettings,
}: {
  status: BackupStatus
  progress: number
  onGoToSettings: () => void
}) {
  const isGlowing = status === 'idle' || status === 'backing-up'

  return (
    <Card glow={isGlowing} className="flex flex-col gap-0">
      {status === 'idle' && <IdleStatusCard />}
      {status === 'backing-up' && (
        <BackingUpStatusCard progress={progress} />
      )}
      {status === 'error' && (
        <ErrorStatusCard onGoToSettings={onGoToSettings} />
      )}
    </Card>
  )
}

// ── Paired Device Card ────────────────────────────────────────────────────────

function PairedDeviceCard({
  device,
  onGoToSettings,
}: {
  device: PairedDevice | null
  onGoToSettings: () => void
}) {
  if (!device) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-1">
          <Smartphone size={24} className="text-[--color-text-muted]" />
          <p className="text-xs text-[--color-text-muted]">
            尚未配對任何裝置
          </p>
          <Button variant="secondary" size="sm" onClick={onGoToSettings}>
            前往設定配對裝置
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        {/* Device icon */}
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            'bg-[--color-bg-raised] border border-[--color-border-strong]',
          )}
        >
          <Smartphone size={18} className="text-[--color-text-secondary]" />
        </div>

        {/* Device info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[--color-text]">
            {device.name}
          </p>
          <p className="text-xs text-[--color-text-muted]">{device.ip}</p>
        </div>

        {/* Badges */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="primary">已配對</Badge>
          {device.isOnline ? (
            <Badge variant="success" dot>
              線上
            </Badge>
          ) : (
            <Badge variant="default" dot>
              離線
            </Badge>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Quick Stats ───────────────────────────────────────────────────────────────

interface StatItem {
  label: string
  value: string
  icon: ReactNode
}

function QuickStats() {
  const stats: StatItem[] = [
    {
      label: '本月備份',
      value: '3 次',
      icon: <CheckCircle2 size={12} className="text-[--color-success]" />,
    },
    {
      label: '最後備份',
      value: '2 小時前',
      icon: <Clock size={12} className="text-[--color-text-muted]" />,
    },
    {
      label: '備份路徑',
      value: 'D:\\Backup',
      icon: <HardDrive size={12} className="text-[--color-text-muted]" />,
    },
  ]

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex">
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex flex-1">
            {i > 0 && (
              <div className="w-px self-stretch bg-[--color-border]" />
            )}
            <div className="flex flex-1 flex-col items-center gap-1 px-2 py-3">
              <div className="flex items-center gap-1">
                {stat.icon}
                <span className="text-[10px] text-[--color-text-muted]">
                  {stat.label}
                </span>
              </div>
              <span className="text-sm font-semibold text-[--color-text] tabular-nums">
                {stat.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Status Toggle (dev helper) ────────────────────────────────────────────────

function StatusToggle({
  status,
  onChange,
}: {
  status: BackupStatus
  onChange: (s: BackupStatus) => void
}) {
  const options: BackupStatus[] = ['idle', 'backing-up', 'error']
  const labels: Record<BackupStatus, string> = {
    idle: '待命',
    'backing-up': '備份中',
    error: '錯誤',
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-[--color-bg-raised] p-1">
      {options.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-all duration-150',
            status === s
              ? 'bg-[--color-primary] text-white shadow-sm'
              : 'text-[--color-text-muted] hover:text-[--color-text]',
          )}
        >
          {labels[s]}
        </button>
      ))}
    </div>
  )
}

// ── Dashboard Page ────────────────────────────────────────────────────────────

export function Dashboard() {
  const [status, setStatus] = useState<BackupStatus>('idle')
  const [mdnsAvailable] = useState(true)
  const [progress] = useState(35)

  const pairedDevice: PairedDevice = {
    name: 'iPhone SE (Tomas)',
    ip: '192.168.1.50',
    isOnline: true,
  }

  const handleGoToSettings = () => {
    // Navigation will be wired up when router is added
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[--color-bg-base]">
      {/* mDNS banner */}
      <MdnsBanner mdnsAvailable={mdnsAvailable} />

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Main status card */}
        <MainStatusCard
          status={status}
          progress={progress}
          onGoToSettings={handleGoToSettings}
        />

        {/* Paired device */}
        <PairedDeviceCard
          device={pairedDevice}
          onGoToSettings={handleGoToSettings}
        />

        {/* Quick stats */}
        <QuickStats />

        <Divider />

        {/* Dev: status toggle */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[--color-text-muted]">
            預覽狀態切換
          </p>
          <StatusToggle status={status} onChange={setStatus} />
        </div>
      </div>
    </div>
  )
}
