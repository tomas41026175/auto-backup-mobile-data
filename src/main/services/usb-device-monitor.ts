import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import * as usbLib from 'usb'
import type { UsbDeviceInfo } from '../../shared/types'

const APPLE_VENDOR_ID = 0x05ac
const IDEVICE_ID_PATH = '/opt/homebrew/bin/idevice_id'
const IDEVICEINFO_PATH = '/opt/homebrew/bin/ideviceinfo'

export interface UsbDeviceMonitorEvents {
  'usb-device-connected': (info: UsbDeviceInfo) => void
  'usb-device-disconnected': (udid: string) => void
}

export interface UsbDeviceMonitor extends EventEmitter {
  emit<K extends keyof UsbDeviceMonitorEvents>(
    event: K,
    ...args: Parameters<UsbDeviceMonitorEvents[K]>
  ): boolean
  on<K extends keyof UsbDeviceMonitorEvents>(
    event: K,
    listener: UsbDeviceMonitorEvents[K]
  ): this
  off<K extends keyof UsbDeviceMonitorEvents>(
    event: K,
    listener: UsbDeviceMonitorEvents[K]
  ): this
  destroy(): void
}

// execFile 包裝為 Promise（不用 promisify，確保 mock 可正確替換）
function runCli(path: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(path, args, (err, stdout, stderr) => {
      if (err) {
        reject(err)
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}

// 解析 idevice_id -l 輸出，取得第一個 UDID
function parseUdid(stdout: string): string | null {
  const lines = stdout.trim().split('\n').filter((l) => l.trim().length > 0)
  return lines[0]?.trim() ?? null
}

// 解析 ideviceinfo 輸出，取得指定 key 的值
function parseIdeviceinfoValue(stdout: string, key: string): string {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith(`${key}:`)) {
      return trimmed.slice(key.length + 1).trim()
    }
  }
  return ''
}

async function getUdid(): Promise<string | null> {
  try {
    const { stdout } = await runCli(IDEVICE_ID_PATH, ['-l'])
    return parseUdid(stdout)
  } catch {
    return null
  }
}

async function getDeviceInfo(udid: string): Promise<{ name: string; iosVersion: string }> {
  try {
    const { stdout } = await runCli(IDEVICEINFO_PATH, ['-u', udid])
    const name = parseIdeviceinfoValue(stdout, 'DeviceName')
    const iosVersion = parseIdeviceinfoValue(stdout, 'ProductVersion')
    return { name: name || 'Unknown iPhone', iosVersion: iosVersion || '' }
  } catch {
    return { name: 'Unknown iPhone', iosVersion: '' }
  }
}

function isAppleDevice(device: usbLib.usb.Device): boolean {
  return device.deviceDescriptor.idVendor === APPLE_VENDOR_ID
}

export function createUsbDeviceMonitor(): UsbDeviceMonitor {
  const emitter = new EventEmitter() as UsbDeviceMonitor

  // Track connected Apple USB devices: busNumber-deviceAddress key → udid
  const connectedDevices: Map<string, string> = new Map()

  function deviceKey(device: usbLib.usb.Device): string {
    return `${device.busNumber}-${device.deviceAddress}`
  }

  async function handleAttach(device: usbLib.usb.Device): Promise<void> {
    if (!isAppleDevice(device)) return

    const productId = device.deviceDescriptor.idProduct
    const key = deviceKey(device)

    // Wait briefly for the OS to enumerate the device before calling CLI
    await new Promise<void>((resolve) => setTimeout(resolve, 1500))

    const udid = await getUdid()
    if (!udid) return

    const { name, iosVersion } = await getDeviceInfo(udid)

    connectedDevices.set(key, udid)

    const info: UsbDeviceInfo = { udid, name, iosVersion, productId }
    emitter.emit('usb-device-connected', info)
  }

  function handleDetach(device: usbLib.usb.Device): void {
    if (!isAppleDevice(device)) return

    const key = deviceKey(device)
    const udid = connectedDevices.get(key)
    if (!udid) return

    connectedDevices.delete(key)
    emitter.emit('usb-device-disconnected', udid)
  }

  const attachListener = (device: usbLib.usb.Device): void => {
    handleAttach(device).catch((err: unknown) => {
      console.error('[UsbDeviceMonitor] handleAttach error:', err)
    })
  }

  const detachListener = (device: usbLib.usb.Device): void => {
    handleDetach(device)
  }

  usbLib.usb.on('attach', attachListener)
  usbLib.usb.on('detach', detachListener)

  function destroy(): void {
    usbLib.usb.off('attach', attachListener)
    usbLib.usb.off('detach', detachListener)
    connectedDevices.clear()
    emitter.removeAllListeners()
  }

  emitter.destroy = destroy

  return emitter
}
