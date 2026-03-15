import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { getMainWindow } from '../window-manager'
import type { ICloudSyncStatus } from '../../shared/types'

const IDLE_STATUS: ICloudSyncStatus = {
  state: 'idle',
  current: 0,
  total: 0,
  skipped: 0,
  currentFile: '',
  currentAlbum: '',
  bytesDownloaded: 0
}

export class ICloudSyncManager {
  private child: ChildProcess | null = null
  private status: ICloudSyncStatus = { ...IDLE_STATUS }

  getScriptPath(): string {
    const base = app.isPackaged
      ? process.resourcesPath
      : join(app.getAppPath(), 'resources')
    return join(base, 'icloud_download.py')
  }

  start(appleId: string, password: string, destDir: string, album?: string): void {
    if (this.child) return

    this.status = { ...IDLE_STATUS, state: 'authenticating' }
    this.pushStatus()

    const scriptPath = this.getScriptPath()
    this.child = spawn('python', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] })

    const config = { apple_id: appleId, password, dest_dir: destDir, album: album ?? 'all' }
    this.child.stdin!.write(JSON.stringify(config) + '\n')

    let buffer = ''
    this.child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) this.handleEvent(line.trim())
      }
    })

    this.child.stderr!.on('data', (chunk: Buffer) => {
      console.error('[icloud-sync] stderr:', chunk.toString())
    })

    this.child.on('exit', (code) => {
      console.log('[icloud-sync] exited with code', code)
      this.child = null
    })

    this.child.on('error', (err) => {
      console.error('[icloud-sync] spawn error:', err)
      this.status = { ...this.status, state: 'error', error: err.message }
      this.pushStatus()
      getMainWindow()?.webContents.send('icloud-sync-error', { message: err.message })
      this.child = null
    })
  }

  private handleEvent(line: string): void {
    try {
      const event = JSON.parse(line)
      const win = getMainWindow()
      switch (event.event) {
        case 'status':
          this.status = { ...this.status, state: event.state }
          this.pushStatus()
          break

        case 'resumed':
          // Already have N files from previous run — reflect in skipped count
          this.status = { ...this.status, skipped: event.count }
          this.pushStatus()
          break

        case 'album_list':
          win?.webContents.send('icloud-albums', event.albums)
          break

        case 'album_update':
          win?.webContents.send('icloud-album-update', { name: event.name, count: event.count })
          break

        case 'scanning_album':
          this.status = { ...this.status, state: 'scanning', currentAlbum: event.album }
          this.pushStatus()
          break

        case '2fa_required':
          this.status = { ...this.status, state: 'waiting_2fa' }
          this.pushStatus()
          win?.webContents.send('icloud-sync-2fa-required', event.type ?? 'totp')
          break

        case 'progress':
          this.status = {
            state: 'downloading',
            current: event.current,
            total: event.total,
            skipped: event.skipped ?? 0,
            currentFile: event.filename,
            currentAlbum: event.album,
            bytesDownloaded: event.bytes_downloaded ?? 0
          }
          this.pushStatus()
          break

        case 'complete':
          this.status = {
            state: 'complete',
            current: event.total_downloaded,
            total: event.total_downloaded + (event.total_skipped ?? 0),
            skipped: event.total_skipped ?? 0,
            currentFile: '',
            currentAlbum: '',
            bytesDownloaded: event.bytes_downloaded ?? 0
          }
          this.pushStatus()
          win?.webContents.send('icloud-sync-complete', {
            downloaded: event.total_downloaded,
            skipped: event.total_skipped ?? 0,
            bytesDownloaded: event.bytes_downloaded ?? 0
          })
          break

        case 'file_error':
          // Non-fatal: single file failed, process continues
          win?.webContents.send('icloud-sync-error', { message: event.message })
          break

        case 'error':
          // Fatal: whole process stops
          this.status = { ...this.status, state: 'error', error: event.message }
          this.pushStatus()
          win?.webContents.send('icloud-sync-error', { message: event.message })
          break
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  submitTwoFACode(code: string): void {
    this.child?.stdin?.write(code + '\n')
  }

  cancel(): void {
    this.child?.kill()
    this.child = null
    this.status = { ...IDLE_STATUS }
    this.pushStatus()
  }

  getStatus(): ICloudSyncStatus {
    return this.status
  }

  private pushStatus(): void {
    getMainWindow()?.webContents.send('icloud-sync-progress', this.status)
  }
}
