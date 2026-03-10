import React, { useState } from 'react'
import {
  Smartphone,
  ScanLine,
  Trash2,
  ChevronDown,
  Image,
  Video,
  Camera,
  Scissors,
  FileText,
  Mic,
  Check,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
} from 'lucide-react'
import { cn, Button } from './ui'
import type { Device, PairedDevice, SyncDirection, SyncFileType } from '../../../shared/types'

// ── Sync Direction Selector ───────────────────────────────────────────────────

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

function SyncDirectionSelector({ value, onChange }: SyncDirectionSelectorProps): React.ReactElement {
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
          <span
            className={cn(
              'text-[10px] leading-none',
              value === opt.id && opt.available ? 'text-white/70' : 'text-[--color-text-muted]',
            )}
          >
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

// ── File Type Chip ────────────────────────────────────────────────────────────

interface FileTypeItem {
  id: SyncFileType
  label: string
  ext: string
  icon: React.ReactNode
}

const FILE_TYPES: FileTypeItem[] = [
  { id: 'photos', label: '照片', ext: 'HEIC · JPG', icon: <Image className="h-4 w-4" /> },
  { id: 'videos', label: '影片', ext: 'MOV · MP4', icon: <Video className="h-4 w-4" /> },
  { id: 'screenshots', label: '截圖', ext: 'PNG · JPG', icon: <Camera className="h-4 w-4" /> },
  {
    id: 'slowmo',
    label: '慢動作',
    ext: 'MOV (slow-mo)',
    icon: <Scissors className="h-4 w-4" />,
  },
  {
    id: 'documents',
    label: '文件',
    ext: 'PDF · DOCX · ...',
    icon: <FileText className="h-4 w-4" />,
  },
  { id: 'voice', label: '語音備忘', ext: 'M4A', icon: <Mic className="h-4 w-4" /> },
]

interface FileTypeChipProps {
  item: FileTypeItem
  selected: boolean
  onToggle: () => void
}

function FileTypeChip({ item, selected, onToggle }: FileTypeChipProps): React.ReactElement {
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
      <span
        className={cn(
          'absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full transition-all duration-150',
          selected ? 'bg-white/25 text-white opacity-100' : 'opacity-0',
        )}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      {item.icon}
      <span className="text-xs font-semibold leading-none">{item.label}</span>
      <span className={cn('text-[10px] leading-none', selected ? 'text-white/70' : 'text-[--color-text-muted]')}>
        {item.ext}
      </span>
    </button>
  )
}

// ── Skeleton Row ──────────────────────────────────────────────────────────────

function SkeletonRow(): React.ReactElement {
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

// ── Paired Device Card ────────────────────────────────────────────────────────

interface PairedDeviceCardProps {
  device: PairedDevice
  onToggleSyncType: (typeId: SyncFileType) => void
  onChangeSyncDirection: (dir: SyncDirection) => void
  onUnpair: () => void
  isUnpairing: boolean
}

function PairedDeviceCard({
  device,
  onToggleSyncType,
  onChangeSyncDirection,
  onUnpair,
  isUnpairing,
}: PairedDeviceCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const syncTypesSet = new Set<SyncFileType>(device.syncTypes)

  return (
    <div className="overflow-hidden rounded-lg border border-[--color-border] bg-[--color-bg-raised]">
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
            {device.syncTypes.length} 個同步項目 · {device.ip}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ChevronDown
            className={cn(
              'h-4 w-4 text-[--color-text-muted] transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[--color-border] bg-[--color-bg-surface] px-3 pb-3 pt-3">
          <div className="mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[--color-text-muted]">
              同步方向
            </span>
          </div>
          <SyncDirectionSelector value={device.syncDirection} onChange={onChangeSyncDirection} />
          <div className="my-3 border-t border-[--color-border]" />
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[--color-text-muted]">
              同步項目
            </span>
            <span className="text-xs text-[--color-text-muted]">
              已選 {device.syncTypes.length} / {FILE_TYPES.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {FILE_TYPES.map((item) => (
              <FileTypeChip
                key={item.id}
                item={item}
                selected={syncTypesSet.has(item.id)}
                onToggle={() => onToggleSyncType(item.id)}
              />
            ))}
          </div>
          {device.syncTypes.length === 0 && (
            <p className="mt-2 text-center text-xs text-[--color-warning]">請至少選擇一個同步項目</p>
          )}
          <div className="mt-3 border-t border-[--color-border] pt-3">
            <Button
              variant="danger"
              size="sm"
              icon={!isUnpairing ? <Trash2 className="h-3 w-3" /> : undefined}
              isLoading={isUnpairing}
              onClick={onUnpair}
              disabled={isUnpairing}
            >
              解除配對
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Scan Device Card ──────────────────────────────────────────────────────────

interface ScanDeviceCardProps {
  device: Device
  onPair: (device: Device) => void
  isPairing: boolean
}

function ScanDeviceCard({ device, onPair, isPairing }: ScanDeviceCardProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5',
        'border border-[--color-border] bg-[--color-bg-raised]',
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[--color-bg-overlay]">
        <Smartphone className="h-4 w-4 text-[--color-text-secondary]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[--color-text]">{device.name}</p>
        <p className="truncate text-xs text-[--color-text-muted]">
          {device.ip} · {device.serviceType}
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        isLoading={isPairing}
        onClick={() => onPair(device)}
      >
        配對
      </Button>
    </div>
  )
}

// ── Device List ───────────────────────────────────────────────────────────────

const SCAN_TIMEOUT_MS = 10000

interface DeviceListProps {
  pairedDevices: PairedDevice[]
  onDevicePaired: (device: PairedDevice) => void
  onDeviceUnpaired: (deviceId: string) => void
  onSyncTypesChanged: (deviceId: string, syncTypes: Set<SyncFileType>) => void
  onSyncDirectionChanged: (deviceId: string, syncDirection: SyncDirection) => void
}

export function DeviceList({
  pairedDevices,
  onDevicePaired,
  onDeviceUnpaired,
  onSyncTypesChanged,
  onSyncDirectionChanged,
}: DeviceListProps): React.ReactElement {
  const [isScanning, setIsScanning] = useState(false)
  const [scanResults, setScanResults] = useState<Device[]>([])
  const [scanTimedOut, setScanTimedOut] = useState(false)
  const [pairingDeviceId, setPairingDeviceId] = useState<string | null>(null)
  const [unpairingDeviceId, setUnpairingDeviceId] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  async function handleScan(): Promise<void> {
    setIsScanning(true)
    setScanTimedOut(false)
    setScanResults([])
    setScanError(null)

    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      setIsScanning(false)
      setScanTimedOut(true)
    }, SCAN_TIMEOUT_MS)

    try {
      const devices = await window.api.invoke('scan-devices')
      clearTimeout(timeoutId)
      if (!timedOut) {
        const pairedIds = new Set(pairedDevices.map((d) => d.id))
        setScanResults(devices.filter((d) => !pairedIds.has(d.id)))
        setIsScanning(false)
      }
    } catch {
      clearTimeout(timeoutId)
      if (!timedOut) {
        setScanError('掃描失敗，請重試')
        setIsScanning(false)
      }
    }
  }

  async function handlePair(device: Device): Promise<void> {
    setPairingDeviceId(device.id)
    try {
      const paired = await window.api.invoke('pair-device', device)
      onDevicePaired(paired)
      setScanResults((prev) => prev.filter((d) => d.id !== device.id))
    } catch {
      // 配對失敗，保留在列表中
    } finally {
      setPairingDeviceId(null)
    }
  }

  async function handleUnpair(deviceId: string): Promise<void> {
    setUnpairingDeviceId(deviceId)
    try {
      await window.api.invoke('unpair-device', deviceId)
      onDeviceUnpaired(deviceId)
    } catch {
      // 解除配對失敗
    } finally {
      setUnpairingDeviceId(null)
    }
  }

  async function handleSyncTypesChange(deviceId: string, syncTypes: Set<SyncFileType>): Promise<void> {
    try {
      const syncTypesArray = Array.from(syncTypes)
      await window.api.invoke('update-device-config', {
        deviceId,
        config: { syncTypes: syncTypesArray },
      })
      onSyncTypesChanged(deviceId, syncTypes)
    } catch {
      // 更新失敗
    }
  }

  async function handleSyncDirectionChange(deviceId: string, syncDirection: SyncDirection): Promise<void> {
    try {
      await window.api.invoke('update-device-config', {
        deviceId,
        config: { syncDirection },
      })
      onSyncDirectionChanged(deviceId, syncDirection)
    } catch {
      // 更新失敗
    }
  }

  const pairedDeviceIds = new Set(pairedDevices.map((d) => d.id))

  return (
    <div className="flex flex-col gap-3">
      {pairedDevices.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[--color-text-muted]">已配對裝置</p>
          {pairedDevices.map((device) => (
            <PairedDeviceCard
              key={device.id}
              device={device}
              isUnpairing={unpairingDeviceId === device.id}
              onToggleSyncType={(typeId) => {
                const current = new Set<SyncFileType>(device.syncTypes)
                if (current.has(typeId)) {
                  current.delete(typeId)
                } else {
                  current.add(typeId)
                }
                void handleSyncTypesChange(device.id, current)
              }}
              onChangeSyncDirection={(dir) => void handleSyncDirectionChange(device.id, dir)}
              onUnpair={() => {
                if (unpairingDeviceId !== device.id) {
                  void handleUnpair(device.id)
                }
              }}
            />
          ))}
        </div>
      )}

      <Button
        variant="secondary"
        size="md"
        isLoading={isScanning}
        icon={!isScanning ? <ScanLine className="h-4 w-4" /> : undefined}
        onClick={() => void handleScan()}
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

      {scanTimedOut && (
        <p className="text-center text-xs text-[--color-text-muted]">
          未偵測到裝置，試試手動輸入 IP
        </p>
      )}

      {scanError && <p className="text-center text-xs text-[--color-error]">{scanError}</p>}

      {!isScanning && scanResults.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[--color-text-muted]">偵測到的裝置</p>
          {scanResults
            .filter((d) => !pairedDeviceIds.has(d.id))
            .map((device) => (
              <ScanDeviceCard
                key={device.id}
                device={device}
                onPair={(d) => void handlePair(d)}
                isPairing={pairingDeviceId === device.id}
              />
            ))}
        </div>
      )}
    </div>
  )
}
