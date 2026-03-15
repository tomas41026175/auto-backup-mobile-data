import * as path from 'path'
import * as os from 'os'

export interface BinaryPaths {
  idevicepair: string
  ideviceinfo: string
  idevice_id: string
  afcclient: string
}

function binExt(): string {
  return process.platform === 'win32' ? '.exe' : ''
}

function winLibimobiledeviceBase(): string {
  // In dev mode, app is not packaged — use project resources folder.
  // In production, use process.resourcesPath (extraResources lands there).
  try {
    const { app } = require('electron') as typeof import('electron')
    if (!app.isPackaged) {
      return path.join(app.getAppPath(), 'resources', 'win', 'libimobiledevice')
    }
  } catch {
    // Not in Electron context (e.g. tests) — fall through
  }
  return path.join(process.resourcesPath, 'win', 'libimobiledevice')
}

export function resolveBinaryPaths(): BinaryPaths {
  const e = binExt()
  if (process.platform === 'win32') {
    const base = winLibimobiledeviceBase()
    return {
      idevicepair: path.join(base, `idevicepair${e}`),
      ideviceinfo: path.join(base, `ideviceinfo${e}`),
      idevice_id: path.join(base, `idevice_id${e}`),
      afcclient: path.join(base, `afcclient${e}`),
    }
  }
  const base = '/opt/homebrew/bin'
  return {
    idevicepair: path.join(base, 'idevicepair'),
    ideviceinfo: path.join(base, 'ideviceinfo'),
    idevice_id: path.join(base, 'idevice_id'),
    afcclient: path.join(base, 'afcclient'),
  }
}

export function getTempDir(): string {
  return os.tmpdir()
}
