import React, { useState } from 'react'
import {
  FolderOpen,
  Smartphone,
  Wifi,
  WifiOff,
  Trash2,
  ScanLine,
  Search,
  Image,
  Video,
  Scissors,
  FileText,
  Mic,
  Camera,
  Check,
  ChevronDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
} from 'lucide-react'
import { cn, Button, Card, Input, Divider, Badge } from '../components/ui'

// ── Switch ────────────────────────────────────────────────────────────────────

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
}

function Switch({ checked, onChange, id }: SwitchProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]/50',
        'border border-[--color-border-strong]',
        checked ? 'bg-[--color-primary]' : 'bg-[--color-bg-overlay]',
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute top-0.5 inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

// ── Section Title ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[--color-text-muted]">
      {children}
    </h2>
  )
}

// ── Device Card (Paired) — 可展開，內含同步項目設定 ──────────────────────────

interface PairedDevice {
  name: string
  ip: string
  isOnline: boolean
  syncDirection: SyncDirection
  syncTypes: Set<string>
}

interface PairedDeviceCardProps {
  device: PairedDevice
  onToggleSyncType: (typeId: string) => void
  onChangeSyncDirection: (dir: SyncDirection) => void
  onUnpair: () => void
}

function PairedDeviceCard({ device, onToggleSyncType, onChangeSyncDirection, onUnpair }: PairedDeviceCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-[--color-border] bg-[--color-bg-raised]">
      {/* ── 裝置列 ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left',
          'hover:bg-[--color-bg-overlay] transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[--color-primary]/40',
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[--color-primary-subtle]">
          <Smartphone className="h-4 w-4 text-[--color-primary]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[--color-text]">{device.name}</p>
          <p className="truncate text-xs text-[--color-text-muted]">
            {device.syncTypes.size} 個同步項目 · {device.ip}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={device.isOnline ? 'success' : 'default'} dot>
            {device.isOnline ? '線上' : '離線'}
          </Badge>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-[--color-text-muted] transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* ── 展開面板：同步方向 + 同步項目 + 解除配對 ── */}
      {expanded && (
        <div className="border-t border-[--color-border] bg-[--color-bg-surface] px-3 pb-3 pt-3">
          <div className="mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[--color-text-muted]">
              同步方向
            </span>
          </div>
          <SyncDirectionSelector
            value={device.syncDirection}
            onChange={onChangeSyncDirection}
          />
          <div className="my-3 border-t border-[--color-border]" />
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[--color-text-muted]">
              同步項目
            </span>
            <span className="text-xs text-[--color-text-muted]">
              已選 {device.syncTypes.size} / {FILE_TYPES.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {FILE_TYPES.map((item) => (
              <FileTypeChip
                key={item.id}
                item={item}
                selected={device.syncTypes.has(item.id)}
                onToggle={() => onToggleSyncType(item.id)}
              />
            ))}
          </div>
          {device.syncTypes.size === 0 && (
            <p className="mt-2 text-center text-xs text-[--color-warning]">
              請至少選擇一個同步項目
            </p>
          )}
          <div className="mt-3 border-t border-[--color-border] pt-3">
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-3 w-3" />}
              onClick={onUnpair}
            >
              解除配對
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Device Card (Scan Result) ─────────────────────────────────────────────────

interface ScanDevice {
  name: string
  ip: string
}

function ScanDeviceCard({ device }: { device: ScanDevice }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5',
        'border border-[--color-border] bg-[--color-bg-raised]',
        'hover:bg-[--color-bg-overlay] transition-colors',
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[--color-bg-overlay]">
        <Smartphone className="h-4 w-4 text-[--color-text-secondary]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[--color-text]">{device.name}</p>
        <p className="truncate text-xs text-[--color-text-muted]">
          {device.ip} | _companion-link._tcp
        </p>
      </div>
      <Button variant="primary" size="sm">
        配對
      </Button>
    </div>
  )
}

// ── Skeleton Row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[--color-border] bg-[--color-bg-raised] px-3 py-2.5">
      <div className="h-8 w-8 animate-pulse rounded-md bg-[--color-bg-overlay]" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 animate-pulse rounded bg-[--color-bg-overlay]" />
        <div className="h-2.5 w-48 animate-pulse rounded bg-[--color-bg-overlay]" />
      </div>
    </div>
  )
}

// ── Path Status ───────────────────────────────────────────────────────────────

type PathStatus = 'ok' | 'error' | 'unset'

interface PathStatusConfig {
  icon: React.ReactNode
  text: string
  colorClass: string
}

const PATH_STATUS_CONFIG: Record<PathStatus, PathStatusConfig> = {
  ok: {
    icon: <Wifi className="h-3.5 w-3.5" />,
    text: '路徑存在，磁碟可用',
    colorClass: 'text-[--color-success]',
  },
  error: {
    icon: <WifiOff className="h-3.5 w-3.5" />,
    text: '路徑不存在，外接硬碟可能未掛載',
    colorClass: 'text-[--color-warning]',
  },
  unset: {
    icon: null,
    text: '請選擇備份目標路徑',
    colorClass: 'text-[--color-text-muted]',
  },
}

const PATH_STATUS_PREFIX: Record<PathStatus, string> = {
  ok: '✓ ',
  error: '⚠ ',
  unset: '',
}

// ── Sync Direction Selector ───────────────────────────────────────────────────

type SyncDirection = 'mobile-to-pc' | 'pc-to-mobile' | 'bidirectional'

interface SyncDirectionOption {
  id: SyncDirection
  label: string
  sublabel: string
  icon: React.ReactNode
  available: boolean
}

const SYNC_DIRECTIONS: SyncDirectionOption[] = [
  {
    id: 'mobile-to-pc',
    label: 'Mobile → PC',
    sublabel: '備份照片到電腦',
    icon: <ArrowDownToLine className="h-4 w-4" />,
    available: true,
  },
  {
    id: 'pc-to-mobile',
    label: 'PC → Mobile',
    sublabel: '即將推出',
    icon: <ArrowUpFromLine className="h-4 w-4" />,
    available: false,
  },
  {
    id: 'bidirectional',
    label: '雙向同步',
    sublabel: '即將推出',
    icon: <ArrowLeftRight className="h-4 w-4" />,
    available: false,
  },
]

interface SyncDirectionSelectorProps {
  value: SyncDirection
  onChange: (dir: SyncDirection) => void
}

function SyncDirectionSelector({ value, onChange }: SyncDirectionSelectorProps) {
  return (
    <div className="flex gap-1.5">
      {SYNC_DIRECTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => opt.available && onChange(opt.id)}
          aria-pressed={value === opt.id}
          disabled={!opt.available}
          title={!opt.available ? '此功能尚未開放' : undefined}
          className={cn(
            'relative flex flex-1 flex-col items-center gap-1 rounded-lg border py-2.5 transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]/50',
            value === opt.id && opt.available
              ? 'border-[--color-primary] bg-[--color-primary] text-white shadow-[0_0_14px_var(--color-primary-glow)]'
              : opt.available
                ? 'border-[--color-border] bg-[--color-bg-raised] text-[--color-text-secondary] hover:border-[--color-border-strong] hover:text-[--color-text]'
                : 'cursor-not-allowed border-[--color-border] bg-[--color-bg-surface] text-[--color-text-muted] opacity-50',
          )}
        >
          {opt.icon}
          <span className="text-[11px] font-semibold leading-none">{opt.label}</span>
          <span className={cn(
            'text-[10px] leading-none',
            value === opt.id && opt.available ? 'text-white/70' : 'text-[--color-text-muted]',
          )}>
            {opt.sublabel}
          </span>
          {!opt.available && (
            <span className="absolute -right-1 -top-1 rounded-full bg-[--color-bg-overlay] px-1 py-px text-[9px] font-medium text-[--color-text-muted] ring-1 ring-[--color-border]">
              Soon
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── File Type Toggle Chip ─────────────────────────────────────────────────────

interface FileTypeItem {
  id: string
  label: string
  ext: string
  icon: React.ReactNode
}

const FILE_TYPES: FileTypeItem[] = [
  { id: 'photos',       label: '照片',     ext: 'HEIC · JPG',       icon: <Image     className="h-4 w-4" /> },
  { id: 'videos',       label: '影片',     ext: 'MOV · MP4',        icon: <Video     className="h-4 w-4" /> },
  { id: 'screenshots',  label: '截圖',     ext: 'PNG · JPG',        icon: <Camera    className="h-4 w-4" /> },
  { id: 'slowmo',       label: '慢動作',   ext: 'MOV (slow-mo)',    icon: <Scissors  className="h-4 w-4" /> },
  { id: 'documents',    label: '文件',     ext: 'PDF · DOCX · ...',  icon: <FileText  className="h-4 w-4" /> },
  { id: 'voice',        label: '語音備忘', ext: 'M4A',              icon: <Mic       className="h-4 w-4" /> },
]

interface FileTypeChipProps {
  item: FileTypeItem
  selected: boolean
  onToggle: () => void
}

function FileTypeChip({ item, selected, onToggle }: FileTypeChipProps) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'relative flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]/50',
        selected
          ? [
              'border-[--color-primary] bg-[--color-primary]',
              'text-white',
              'shadow-[0_0_16px_var(--color-primary-glow)]',
            ]
          : [
              'border-[--color-border] bg-[--color-bg-raised]',
              'text-[--color-text-muted]',
              'hover:border-[--color-border-strong] hover:bg-[--color-bg-overlay] hover:text-[--color-text-secondary]',
            ],
      )}
    >
      {/* 勾選標記 */}
      <span className={cn(
        'absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full transition-all duration-150',
        selected
          ? 'bg-white/25 text-white opacity-100'
          : 'opacity-0',
      )}>
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>

      {item.icon}
      <span className="text-xs font-semibold leading-none">{item.label}</span>
      <span className={cn(
        'text-[10px] leading-none',
        selected ? 'text-white/70' : 'text-[--color-text-muted]',
      )}>
        {item.ext}
      </span>
    </button>
  )
}

// ── Settings Page ─────────────────────────────────────────────────────────────

export function Settings(): React.ReactElement {
  const [backupPath, setBackupPath] = useState('D:\\Backup\\iPhone')
  const [pathStatus] = useState<PathStatus>('ok')
  const [isScanning, setIsScanning] = useState(false)
  const [scanResults] = useState<ScanDevice[]>([
    { name: 'iPhone 15 Pro', ip: '192.168.1.88' },
    { name: 'MacBook Air', ip: '192.168.1.99' },
  ])
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([
    {
      name: 'iPhone SE (Tomas)',
      ip: '192.168.1.50',
      isOnline: true,
      syncDirection: 'mobile-to-pc',
      syncTypes: new Set(['photos', 'videos', 'screenshots']),
    },
  ])

  function toggleDeviceSyncType(ip: string, typeId: string): void {
    setPairedDevices((prev) =>
      prev.map((d) => {
        if (d.ip !== ip) return d
        const next = new Set(d.syncTypes)
        if (next.has(typeId)) { next.delete(typeId) } else { next.add(typeId) }
        return { ...d, syncTypes: next }
      }),
    )
  }

  function changeDeviceSyncDirection(ip: string, dir: SyncDirection): void {
    setPairedDevices((prev) =>
      prev.map((d) => (d.ip !== ip ? d : { ...d, syncDirection: dir })),
    )
  }

  function unpairDevice(ip: string): void {
    setPairedDevices((prev) => prev.filter((d) => d.ip !== ip))
  }
  const [manualIp, setManualIp] = useState('')
  const [probeStatus, setProbeStatus] = useState<null | 'success' | 'error'>(null)
  const [isProbing, setIsProbing] = useState(false)
  const [autoStart, setAutoStart] = useState(true)
  const [minimizeToTray, setMinimizeToTray] = useState(true)

  function handleScan(): void {
    setIsScanning(true)
    setTimeout(() => setIsScanning(false), 5000)
  }

  function handleProbe(): void {
    if (!manualIp.trim()) return
    setIsProbing(true)
    setProbeStatus(null)
    setTimeout(() => {
      setIsProbing(false)
      setProbeStatus(manualIp.startsWith('192.168') ? 'success' : 'error')
    }, 1500)
  }

  const currentPathStatus = PATH_STATUS_CONFIG[pathStatus]

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[--color-bg-base]">
      <div className="flex flex-col gap-4 p-4">

        {/* ── 區塊 1：備份路徑設定 ──────────────────────────── */}
        <Card>
          <div className="flex flex-col gap-3">
            <SectionTitle>備份路徑設定</SectionTitle>
            <Divider />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[--color-text-secondary]">
                目標路徑
              </label>
              <div className="flex gap-2">
                <input
                  value={backupPath}
                  onChange={(e) => setBackupPath(e.target.value)}
                  readOnly
                  className={cn(
                    'h-9 flex-1 cursor-pointer rounded-lg border bg-[--color-bg-raised] px-3 text-sm text-[--color-text]',
                    'border-[--color-border] hover:border-[--color-border-strong]',
                    'focus:outline-none focus:ring-1 focus:border-[--color-primary]/50 focus:ring-[--color-primary]/20',
                    'transition-colors',
                  )}
                />
                <Button
                  variant="secondary"
                  size="md"
                  icon={<FolderOpen className="h-4 w-4" />}
                  className="shrink-0"
                >
                  選擇資料夾
                </Button>
              </div>
              <p className={cn('flex items-center gap-1.5 text-xs', currentPathStatus.colorClass)}>
                {currentPathStatus.icon}
                {PATH_STATUS_PREFIX[pathStatus]}
                {currentPathStatus.text}
              </p>
            </div>
          </div>
        </Card>

        {/* ── 區塊 2：已配對裝置（含同步項目展開面板） ───────── */}
        <Card>
          <div className="flex flex-col gap-3">
            <SectionTitle>已配對裝置</SectionTitle>
            <Divider />
            {pairedDevices.length === 0 ? (
              <p className="py-2 text-center text-xs text-[--color-text-muted]">
                尚未配對任何裝置。請使用下方「掃描裝置」功能。
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {pairedDevices.map((device) => (
                  <PairedDeviceCard
                    key={device.ip}
                    device={device}
                    onToggleSyncType={(typeId) => toggleDeviceSyncType(device.ip, typeId)}
                    onChangeSyncDirection={(dir) => changeDeviceSyncDirection(device.ip, dir)}
                    onUnpair={() => unpairDevice(device.ip)}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ── 區塊 3：掃描裝置（mDNS）──────────────────────── */}
        <Card>
          <div className="flex flex-col gap-3">
            <SectionTitle>偵測裝置</SectionTitle>
            <Divider />
            <Button
              variant="secondary"
              size="md"
              isLoading={isScanning}
              icon={!isScanning ? <ScanLine className="h-4 w-4" /> : undefined}
              onClick={handleScan}
              className="w-full"
            >
              {isScanning ? '掃描中...' : '掃描 Apple 裝置'}
            </Button>
            {isScanning && (
              <div className="flex flex-col gap-2">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}
            {!isScanning && scanResults.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[--color-text-muted]">偵測到的裝置</p>
                {scanResults.map((device) => (
                  <ScanDeviceCard key={device.ip} device={device} />
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ── 區塊 4：手動新增裝置（Plan B）────────────────── */}
        <Card>
          <div className="flex flex-col gap-3">
            <SectionTitle>手動新增（IP 輸入）</SectionTitle>
            <Divider />
            <p className="text-xs text-[--color-text-muted]">
              當 mDNS 無法偵測時，可手動輸入 iPhone 的 IP 位址
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[--color-text-secondary]">
                IP 位址
              </label>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                    placeholder="192.168.1.50"
                    hint="可在 iPhone 設定 > Wi-Fi 中查看 IP"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleProbe()
                    }}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  isLoading={isProbing}
                  icon={!isProbing ? <Search className="h-4 w-4" /> : undefined}
                  onClick={handleProbe}
                  disabled={!manualIp.trim()}
                  className="mt-px shrink-0"
                >
                  探測
                </Button>
              </div>
            </div>
            {probeStatus === 'success' && (
              <div className="flex items-center justify-between rounded-lg bg-[--color-success-subtle] px-3 py-2">
                <p className="text-xs font-medium text-[--color-success]">
                  探測成功：已找到 Apple 裝置
                </p>
                <Button variant="primary" size="sm">
                  新增為配對裝置
                </Button>
              </div>
            )}
            {probeStatus === 'error' && (
              <p className="text-xs text-[--color-error]">
                未找到裝置或 IP 不正確
              </p>
            )}
          </div>
        </Card>

        {/* ── 區塊 5：一般設定 ──────────────────────────────── */}
        <Card>
          <div className="flex flex-col gap-3">
            <SectionTitle>一般設定</SectionTitle>
            <Divider />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auto-start"
                  className="cursor-pointer text-sm text-[--color-text]"
                >
                  開機自動啟動
                </label>
                <Switch
                  id="auto-start"
                  checked={autoStart}
                  onChange={setAutoStart}
                />
              </div>
              <Divider />
              <div className="flex items-center justify-between">
                <label
                  htmlFor="minimize-to-tray"
                  className="cursor-pointer text-sm text-[--color-text]"
                >
                  最小化至系統匣
                </label>
                <Switch
                  id="minimize-to-tray"
                  checked={minimizeToTray}
                  onChange={setMinimizeToTray}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* ── 頁面底部 ──────────────────────────────────────── */}
        <p className="pb-2 text-center text-xs text-[--color-text-muted]">
          Windows Auto Backup &nbsp;&nbsp; v0.1.0
        </p>

      </div>
    </div>
  )
}
