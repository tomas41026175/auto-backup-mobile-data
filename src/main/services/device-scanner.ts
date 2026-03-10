import { EventEmitter } from 'events'
import { Bonjour, type Browser, type Service } from 'bonjour-service'
import * as net from 'net'
import type { Device } from '../../shared/types'
import type { SettingsStore } from './settings-store'

const MDNS_SERVICE_TYPE = '_companion-link._tcp'
const DEVICE_DEBOUNCE_MS = 30_000
const SCAN_INTERVAL_MS = 60_000
const MDNS_SELF_TEST_TIMEOUT_MS = 5_000
const TCP_PING_TIMEOUT_MS = 3_000
const TCP_PING_PORT = 62078

export interface DeviceScannerEvents {
  'device-found': (device: Device) => void
  'device-lost': (deviceId: string) => void
  'device-stable-online': (device: Device) => void
  'mdns-status': (available: boolean) => void
}

export interface DeviceScanner extends EventEmitter {
  emit<K extends keyof DeviceScannerEvents>(event: K, ...args: Parameters<DeviceScannerEvents[K]>): boolean
  on<K extends keyof DeviceScannerEvents>(event: K, listener: DeviceScannerEvents[K]): this
  off<K extends keyof DeviceScannerEvents>(event: K, listener: DeviceScannerEvents[K]): this
  scan(): Promise<Device[]>
  destroy(): void
  get mdnsAvailable(): boolean
}

function serviceToDevice(service: Service): Device {
  const ip = service.addresses?.[0] ?? service.host
  return {
    id: `mdns-${service.name}`,
    name: service.name,
    ip,
    serviceType: service.type,
    paired: false
  }
}

export function createDeviceScanner(settingsStore: SettingsStore): DeviceScanner {
  // GC 防護：全域宣告 Bonjour 實例
  let bonjourInstance: Bonjour | null = null
  let browser: Browser | null = null
  let scanInterval: ReturnType<typeof setInterval> | null = null
  let isMdnsAvailable = false

  // debounce timers: deviceId → timer
  const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  // 已通知 Set（裝置離線後清除）
  const notifiedDevices: Set<string> = new Set()
  // 目前已發現的裝置
  const discoveredDevices: Map<string, Device> = new Map()

  const emitter = new EventEmitter() as DeviceScanner

  function isPairedDevice(deviceId: string): boolean {
    const settings = settingsStore.getSettings()
    return settings.pairedDevices.some((d) => d.id === deviceId)
  }

  function handleDeviceUp(device: Device): void {
    discoveredDevices.set(device.id, device)
    emitter.emit('device-found', device)

    // 只對已配對裝置做 debounce 和通知
    if (!isPairedDevice(device.id)) return

    // 清除舊 timer
    const existing = debounceTimers.get(device.id)
    if (existing !== undefined) {
      clearTimeout(existing)
    }

    // 30 秒 debounce
    const timer = setTimeout(() => {
      debounceTimers.delete(device.id)

      // 每次上線只觸發一次通知
      if (notifiedDevices.has(device.id)) return
      notifiedDevices.add(device.id)
      emitter.emit('device-stable-online', device)
    }, DEVICE_DEBOUNCE_MS)

    debounceTimers.set(device.id, timer)
  }

  function handleDeviceDown(deviceId: string): void {
    discoveredDevices.delete(deviceId)
    emitter.emit('device-lost', deviceId)

    // 裝置離線：清除 debounce timer，清除已通知記錄
    const timer = debounceTimers.get(deviceId)
    if (timer !== undefined) {
      clearTimeout(timer)
      debounceTimers.delete(deviceId)
    }
    notifiedDevices.delete(deviceId)
  }

  async function testMdnsAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const testBonjour = new Bonjour()
      let resolved = false

      const testBrowser = testBonjour.find({ type: '_companion-link._tcp' }, () => {
        if (!resolved) {
          resolved = true
          testBrowser.stop()
          testBonjour.destroy()
          resolve(true)
        }
      })

      // 同時廣播自身用於測試
      testBonjour.publish({ name: 'mdns-self-test', type: '_companion-link._tcp', port: 62078 })

      setTimeout(() => {
        if (!resolved) {
          resolved = true
          testBrowser.stop()
          testBonjour.destroy()
          resolve(false)
        }
      }, MDNS_SELF_TEST_TIMEOUT_MS)
    })
  }

  async function start(): Promise<void> {
    // mDNS 自我檢測
    isMdnsAvailable = await testMdnsAvailability()
    emitter.emit('mdns-status', isMdnsAvailable)

    // 初始化 Bonjour（GC 防護：賦值給模組層級變數）
    bonjourInstance = new Bonjour()

    // 被動監聽
    browser = bonjourInstance.find({ type: MDNS_SERVICE_TYPE }, (service: Service) => {
      const device = serviceToDevice(service)
      handleDeviceUp(device)
    })

    browser.on('down', (service: Service) => {
      const deviceId = `mdns-${service.name}`
      handleDeviceDown(deviceId)
    })

    // 主動 query（每 60 秒）
    scanInterval = setInterval(() => {
      browser?.update()
      pingManualDevices()
    }, SCAN_INTERVAL_MS)

    // 立即 ping 手動配對裝置
    pingManualDevices()
  }

  function pingManualDevices(): void {
    const settings = settingsStore.getSettings()
    // 手動配對裝置：有 ip 但非 mDNS 來源（不在 discoveredDevices 中）
    const manualDevices = settings.pairedDevices.filter(
      (d) => d.ip && !discoveredDevices.has(d.id)
    )

    manualDevices.forEach((pairedDevice) => {
      tcpPing(pairedDevice.ip, TCP_PING_PORT, TCP_PING_TIMEOUT_MS)
        .then((reachable) => {
          if (reachable) {
            const device: Device = {
              id: pairedDevice.id,
              name: pairedDevice.name,
              ip: pairedDevice.ip,
              serviceType: 'tcp',
              paired: true
            }
            handleDeviceUp(device)
          } else {
            if (discoveredDevices.has(pairedDevice.id)) {
              handleDeviceDown(pairedDevice.id)
            }
          }
        })
        .catch(() => {
          if (discoveredDevices.has(pairedDevice.id)) {
            handleDeviceDown(pairedDevice.id)
          }
        })
    })
  }

  function tcpPing(ip: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect(port, ip)
      let done = false

      const finish = (result: boolean): void => {
        if (done) return
        done = true
        socket.destroy()
        resolve(result)
      }

      socket.setTimeout(timeoutMs)
      socket.on('connect', () => finish(true))
      socket.on('error', () => finish(false))
      socket.on('timeout', () => finish(false))
    })
  }

  async function scan(): Promise<Device[]> {
    browser?.update()
    // 等待 3 秒收集結果
    await new Promise<void>((resolve) => setTimeout(resolve, 3_000))
    return Array.from(discoveredDevices.values())
  }

  function destroy(): void {
    if (scanInterval !== null) {
      clearInterval(scanInterval)
      scanInterval = null
    }
    debounceTimers.forEach((timer) => clearTimeout(timer))
    debounceTimers.clear()

    browser?.stop()
    browser = null

    bonjourInstance?.destroy()
    bonjourInstance = null
  }

  // 定義 getter
  Object.defineProperty(emitter, 'mdnsAvailable', {
    get: () => isMdnsAvailable
  })

  emitter.scan = scan
  emitter.destroy = destroy

  // 啟動
  start().catch((err: unknown) => {
    console.error('[DeviceScanner] start error:', err)
  })

  return emitter
}
