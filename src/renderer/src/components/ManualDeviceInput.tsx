import React, { useState } from 'react'
import { Search } from 'lucide-react'
import { Button, Input } from './ui'
import type { PairedDevice } from '../../../shared/types'

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/

function isValidIpv4(ip: string): boolean {
  if (!IPV4_REGEX.test(ip)) return false
  return ip.split('.').every((octet) => {
    const num = parseInt(octet, 10)
    return num >= 0 && num <= 255
  })
}

interface ManualDeviceInputProps {
  onDeviceAdded: (device: PairedDevice) => void
}

export function ManualDeviceInput({ onDeviceAdded }: ManualDeviceInputProps): React.ReactElement {
  const [ip, setIp] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [ipError, setIpError] = useState<string | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [probeSuccess, setProbeSuccess] = useState(false)
  const [isProbing, setIsProbing] = useState(false)
  const [pendingDevice, setPendingDevice] = useState<PairedDevice | null>(null)

  function handleIpChange(value: string): void {
    setIp(value)
    setProbeSuccess(false)
    setProbeError(null)
    setPendingDevice(null)
    if (value && !isValidIpv4(value)) {
      setIpError('IP 格式不正確，請輸入正確的 IPv4 位址（例：192.168.1.50）')
    } else {
      setIpError(null)
    }
  }

  async function handleProbe(): Promise<void> {
    if (!ip.trim()) return
    if (!isValidIpv4(ip)) {
      setIpError('IP 格式不正確，請輸入正確的 IPv4 位址（例：192.168.1.50）')
      return
    }

    setIsProbing(true)
    setProbeError(null)
    setProbeSuccess(false)
    setPendingDevice(null)

    try {
      const device = await window.api.invoke('add-device-manual', {
        name: deviceName || `Device (${ip})`,
        ip,
      })
      setPendingDevice(device)
      setProbeSuccess(true)
    } catch {
      setProbeError('探測失敗，請確認 IP 正確且裝置在同一網路')
    } finally {
      setIsProbing(false)
    }
  }

  function handleAddDevice(): void {
    if (!pendingDevice) return
    onDeviceAdded(pendingDevice)
    setIp('')
    setDeviceName('')
    setProbeSuccess(false)
    setPendingDevice(null)
    setIpError(null)
    setProbeError(null)
  }

  const canProbe = ip.trim() !== '' && !ipError && !isProbing

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-(--color-text-muted)">
        如 mDNS 偵測無效，可手動輸入 iPhone 的 IP 位址
      </p>

      <Input
        label="裝置名稱（選填）"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
        placeholder="iPhone 15 Pro"
      />

      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            label="IP 位址"
            value={ip}
            onChange={(e) => handleIpChange(e.target.value)}
            placeholder="192.168.1.50"
            hint="可在 iPhone 設定 > Wi-Fi 中查看 IP"
            error={ipError ?? undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canProbe) {
                void handleProbe()
              }
            }}
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          isLoading={isProbing}
          icon={!isProbing ? <Search className="h-4 w-4" /> : undefined}
          onClick={() => void handleProbe()}
          disabled={!canProbe}
          className="mt-[22px] shrink-0"
        >
          探測
        </Button>
      </div>

      {probeSuccess && (
        <div className="flex items-center justify-between rounded-lg bg-(--color-success-subtle) px-3 py-2">
          <p className="text-xs font-medium text-(--color-success)">探測成功：已找到 Apple 裝置</p>
          <Button variant="primary" size="sm" onClick={handleAddDevice}>
            新增配對裝置
          </Button>
        </div>
      )}

      {probeError && <p className="text-xs text-(--color-error)">{probeError}</p>}
    </div>
  )
}
