import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IpcHandlerChannels, IpcListenerChannels } from '../shared/ipc-channels'

type ListenerFn<K extends keyof IpcListenerChannels> = (
  event: IpcRendererEvent,
  ...args: IpcListenerChannels[K]
) => void

type ListenerCleanup = () => void

/**
 * Typed API 封裝，透過 contextBridge 安全暴露給 renderer。
 * - invoke: renderer → main（request/response）
 * - on: 訂閱 main → renderer push 事件，回傳 cleanup 函式
 * - off: 取消訂閱
 */
const api = {
  invoke<K extends keyof IpcHandlerChannels>(
    channel: K,
    ...args: Parameters<IpcHandlerChannels[K]>
  ): Promise<ReturnType<IpcHandlerChannels[K]>> {
    return ipcRenderer.invoke(channel, ...args) as Promise<ReturnType<IpcHandlerChannels[K]>>
  },

  on<K extends keyof IpcListenerChannels>(
    channel: K,
    listener: ListenerFn<K>
  ): ListenerCleanup {
    ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1])
    return (): void => {
      ipcRenderer.off(channel, listener as Parameters<typeof ipcRenderer.on>[1])
    }
  },

  off<K extends keyof IpcListenerChannels>(
    channel: K,
    listener: ListenerFn<K>
  ): void {
    ipcRenderer.off(channel, listener as Parameters<typeof ipcRenderer.on>[1])
  }
}

export type AppApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
