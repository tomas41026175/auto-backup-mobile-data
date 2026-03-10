import React, { useEffect, useState } from 'react'
import { FolderOpen, Wifi, WifiOff } from 'lucide-react'
import { cn, Button } from './ui'

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

interface PathPickerProps {
  value: string
  onChange: (path: string) => void
}

export function PathPicker({ value, onChange }: PathPickerProps): React.ReactElement {
  const [pathStatus, setPathStatus] = useState<PathStatus>('unset')
  const [isValidating, setIsValidating] = useState(false)

  useEffect(() => {
    if (!value) {
      setPathStatus('unset')
      return
    }

    let cancelled = false
    setIsValidating(true)

    window.api
      .invoke('validate-path', value)
      .then((isValid) => {
        if (!cancelled) {
          setPathStatus(isValid ? 'ok' : 'error')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPathStatus('error')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsValidating(false)
        }
      })

    return (): void => {
      cancelled = true
    }
  }, [value])

  async function handleBrowse(): Promise<void> {
    try {
      // 透過 electron dialog IPC 選擇路徑
      // 使用 electron 的 ipcRenderer 直接 invoke（dialog channel 在主程序實作）
      const selectedPath = await window.electron.ipcRenderer.invoke('select-backup-path') as string | null
      if (selectedPath) {
        onChange(selectedPath)
      }
    } catch {
      // 使用者取消選擇，忽略錯誤
    }
  }

  const statusConfig = PATH_STATUS_CONFIG[pathStatus]

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[--color-text-secondary]">目標路徑</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="選擇或輸入備份路徑..."
          className={cn(
            'h-9 flex-1 rounded-lg border bg-[--color-bg-raised] px-3 text-sm text-[--color-text]',
            'placeholder:text-[--color-text-muted]',
            'transition-colors focus:outline-none focus:ring-1',
            pathStatus === 'error'
              ? 'border-[--color-error]/50 focus:ring-[--color-error]/30'
              : 'border-[--color-border] hover:border-[--color-border-strong] focus:border-[--color-primary]/50 focus:ring-[--color-primary]/20',
          )}
        />
        <Button
          variant="secondary"
          size="md"
          icon={<FolderOpen className="h-4 w-4" />}
          onClick={handleBrowse}
          className="shrink-0"
        >
          選擇資料夾
        </Button>
      </div>
      <p
        className={cn(
          'flex items-center gap-1.5 text-xs',
          statusConfig.colorClass,
          isValidating && 'opacity-60',
        )}
      >
        {statusConfig.icon}
        {statusConfig.text}
        {isValidating && ' (驗證中...)'}
      </p>
    </div>
  )
}
