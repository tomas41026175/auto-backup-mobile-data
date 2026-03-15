import { AlertTriangle } from 'lucide-react'
import type { WindowsDriverStatus } from '../../../shared/types'

interface Props {
  status: WindowsDriverStatus
}

export function WindowsDriversBanner({ status }: Props): React.JSX.Element | null {
  const issues: React.JSX.Element[] = []

  if (!status.appleMobileDevice) {
    issues.push(
      <span key="amds">
        需要 Apple Devices App —{' '}
        <a
          href="ms-windows-store://pdp/?ProductId=9NP83LWLPZ9K"
          className="underline hover:text-red-200"
        >
          從 Microsoft Store 安裝
        </a>
      </span>
    )
  }

  if (!status.libimobiledevice) {
    issues.push(
      <span key="lib">應用程式檔案不完整，請重新安裝</span>
    )
  }

  if (issues.length === 0) return null

  return (
    <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
      <div className="flex flex-col gap-1">
        {issues.map((issue, i) => (
          <p key={i} className="text-xs leading-relaxed text-red-300">{issue}</p>
        ))}
      </div>
    </div>
  )
}
