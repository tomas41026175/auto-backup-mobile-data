import { useEffect, useState } from 'react'
import { Loader2, X, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import useAppStore from '../stores/app-store'
import type { BackupJob, BackupProgressDetail, BackupCompleteDetail, BackupErrorDetail } from '../../../shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsedTime(startedAt: string): string {
  const elapsedMs = Date.now() - new Date(startedAt).getTime()
  const elapsedSecs = Math.floor(elapsedMs / 1000)
  if (elapsedSecs < 60) return `${elapsedSecs} 秒`
  const mins = Math.floor(elapsedSecs / 60)
  const secs = elapsedSecs % 60
  return `${mins} 分 ${secs} 秒`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs} 秒`
  const mins = Math.floor(secs / 60)
  const remainSecs = secs % 60
  return `${mins} 分 ${remainSecs} 秒`
}

function estimateRemaining(detail: BackupProgressDetail): string {
  if (detail.speed <= 0 || detail.current >= detail.total) return '—'
  const remaining = detail.total - detail.current
  const speedBytesPerSec = detail.speed * 1024 * 1024
  if (speedBytesPerSec <= 0) return '—'
  const remainSecs = Math.ceil(remaining / speedBytesPerSec)
  if (remainSecs < 60) return `${remainSecs} 秒`
  return `${Math.ceil(remainSecs / 60)} 分鐘`
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface BackupProgressContentProps {
  job: BackupJob
  detail: BackupProgressDetail | null
}

function BackupProgressContent({ job, detail }: BackupProgressContentProps): React.JSX.Element {
  const [elapsedText, setElapsedText] = useState<string>(() => formatElapsedTime(job.startedAt))

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedText(formatElapsedTime(job.startedAt))
    }, 1000)
    return (): void => clearInterval(timer)
  }, [job.startedAt])

  const handleCancel = async (): Promise<void> => {
    try {
      await window.api.invoke('cancel-backup', job.deviceId)
    } catch {
      // cancel-backup failure is handled by the main process
    }
  }

  const progressPercent = detail !== null && detail.total > 0
    ? Math.round((detail.current / detail.total) * 100)
    : job.progress

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-blue-400 shrink-0" />
        <span className="flex-1 text-sm font-medium text-blue-300 truncate">
          正在備份 {job.deviceName}
        </span>
        <button
          onClick={handleCancel}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          aria-label="取消備份"
        >
          <X size={12} />
          取消
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-gray-400">
          <span>進度</span>
          <span className="tabular-nums">{progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Detail info */}
      {detail !== null && (
        <div className="flex flex-col gap-1">
          <p className="truncate text-xs text-gray-400" title={detail.fileName}>
            {detail.fileName}
          </p>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="tabular-nums">{detail.speed.toFixed(1)} MB/s</span>
            <span>剩餘 {estimateRemaining(detail)}</span>
          </div>
        </div>
      )}

      {/* Elapsed time */}
      <p className="text-xs text-gray-500">
        已用時間：{elapsedText}
      </p>
    </div>
  )
}

interface BackupCompleteContentProps {
  detail: BackupCompleteDetail
}

function BackupCompleteContent({ detail }: BackupCompleteContentProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-green-500/20 bg-green-500/10 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={16} className="text-green-400 shrink-0" />
        <span className="flex-1 text-sm font-medium text-green-300">備份完成</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center gap-0.5 rounded-lg bg-green-500/10 p-2">
          <span className="text-sm font-semibold text-green-300 tabular-nums">
            {detail.fileCount}
          </span>
          <span className="text-[10px] text-gray-500">個檔案</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 rounded-lg bg-green-500/10 p-2">
          <span className="text-sm font-semibold text-green-300 tabular-nums">
            {formatBytes(detail.totalSize)}
          </span>
          <span className="text-[10px] text-gray-500">總大小</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 rounded-lg bg-green-500/10 p-2">
          <span className="text-sm font-semibold text-green-300 tabular-nums">
            {formatDuration(detail.durationMs)}
          </span>
          <span className="text-[10px] text-gray-500">耗時</span>
        </div>
      </div>
    </div>
  )
}

interface BackupErrorContentProps {
  error: BackupErrorDetail
  onRetry: () => void
}

function BackupErrorContent({ error, onRetry }: BackupErrorContentProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-red-400 shrink-0" />
        <span className="flex-1 text-sm font-medium text-red-300">備份失敗</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{error.message}</p>
      <button
        onClick={onRetry}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
        aria-label="重試備份"
      >
        <RefreshCw size={12} />
        重試
      </button>
    </div>
  )
}

// ── Exported component ────────────────────────────────────────────────────────

interface BackupProgressExportProps {
  onRetry?: () => void
}

export function BackupProgress({ onRetry }: BackupProgressExportProps = {}): React.JSX.Element | null {
  const currentBackup = useAppStore((state) => state.currentBackup)
  const backupProgressDetail = useAppStore((state) => state.backupProgressDetail)
  const backupComplete = useAppStore((state) => state.backupComplete)
  const backupError = useAppStore((state) => state.backupError)

  if (backupError !== null) {
    return <BackupErrorContent error={backupError} onRetry={onRetry ?? ((): void => {})} />
  }

  if (backupComplete !== null) {
    return <BackupCompleteContent detail={backupComplete} />
  }

  if (currentBackup !== null) {
    return <BackupProgressContent job={currentBackup} detail={backupProgressDetail} />
  }

  return null
}

export default BackupProgress
