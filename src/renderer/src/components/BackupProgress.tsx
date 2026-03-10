import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import useAppStore from '../stores/app-store'
import type { BackupJob } from '../../../shared/types'

function formatElapsedTime(startedAt: string): string {
  const elapsedMs = Date.now() - new Date(startedAt).getTime()
  const elapsedSecs = Math.floor(elapsedMs / 1000)
  if (elapsedSecs < 60) return `${elapsedSecs} 秒`
  const mins = Math.floor(elapsedSecs / 60)
  const secs = elapsedSecs % 60
  return `${mins} 分 ${secs} 秒`
}

interface BackupProgressProps {
  job: BackupJob
}

function BackupProgressContent({ job }: BackupProgressProps): React.JSX.Element {
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
          <span className="tabular-nums">{job.progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Elapsed time */}
      <p className="text-xs text-gray-500">
        已用時間：{elapsedText}
      </p>
    </div>
  )
}

export function BackupProgress(): React.JSX.Element | null {
  const currentBackup = useAppStore((state) => state.currentBackup)

  if (!currentBackup) {
    return null
  }

  return <BackupProgressContent job={currentBackup} />
}

export default BackupProgress
