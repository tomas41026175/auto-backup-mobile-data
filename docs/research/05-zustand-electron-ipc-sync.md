# Zustand 在 Electron Renderer/Main Process IPC 狀態同步

> 收集時間：2026-03-10
> 適用版本：Zustand v5.x、Electron 28+、TypeScript 5.x

---

## 目錄

1. [架構總覽](#1-架構總覽)
2. [Zustand Store 基本設定（TypeScript）](#2-zustand-store-基本設定typescript)
3. [Preload Script 設定](#3-preload-script-設定)
4. [Main → Renderer Push 事件模式](#4-main--renderer-push-事件模式)
5. [Renderer → Main Invoke 請求資料模式](#5-renderer--main-invoke-請求資料模式)
6. [視窗開啟時同步初始狀態](#6-視窗開啟時同步初始狀態)
7. [Zustand subscribe 觸發副作用](#7-zustand-subscribe-觸發副作用)
8. [React 元件訂閱 Zustand Store 最佳實踐](#8-react-元件訂閱-zustand-store-最佳實踐)
9. [多個 Store 的組織方式](#9-多個-store-的組織方式)
10. [Zustand v5 重大變更](#10-zustand-v5-重大變更)
11. [現成解決方案參考](#11-現成解決方案參考)
12. [來源連結](#12-來源連結)

---

## 1. 架構總覽

Electron 應用的 IPC 狀態同步核心原則：

```
Main Process（單一真實來源）
    ↑  ipcRenderer.invoke()   ↑  ipcMain.handle()
    ↓  webContents.send()     ↓  ipcRenderer.on()
Renderer Process（Zustand Store 鏡像）
```

**設計原則：**
- Main Process 持有應用狀態的單一真實來源（Single Source of Truth）
- Renderer 透過 `invoke()` 拉取快照作為初始狀態
- Main 透過 `webContents.send()` 主動推送狀態變更
- Renderer 的 Zustand store 作為 Main 狀態的本地鏡像

**IPC 溝通規則（Electron 安全規範）：**
- 禁止直接暴露 `ipcRenderer` 物件給 renderer（因為 Context Isolation）
- 必須透過 `preload.ts` + `contextBridge.exposeInMainWorld()` 建立橋接 API
- IPC 只能傳送 [Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) 相容的物件（不能傳 Class 實例、DOM 物件）

---

## 2. Zustand Store 基本設定（TypeScript）

### 2.1 型別定義

```typescript
// src/renderer/stores/types.ts

// App 狀態型別
export interface AppState {
  backupStatus: 'idle' | 'running' | 'success' | 'error';
  lastBackupTime: string | null;
  progress: number;
}

// App Store Actions
export interface AppActions {
  setBackupStatus: (status: AppState['backupStatus']) => void;
  setProgress: (progress: number) => void;
  syncFromMain: (state: Partial<AppState>) => void;
}

// 完整 App Store 型別
export type AppStore = AppState & AppActions;

// Settings 狀態型別
export interface SettingsState {
  backupPath: string;
  autoBackup: boolean;
  interval: number;
}

export interface SettingsActions {
  setBackupPath: (path: string) => void;
  setAutoBackup: (enabled: boolean) => void;
  syncFromMain: (settings: Partial<SettingsState>) => void;
}

export type SettingsStore = SettingsState & SettingsActions;
```

### 2.2 建立 App Store

```typescript
// src/renderer/stores/app-store.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppStore } from './types';

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    // 初始狀態
    backupStatus: 'idle',
    lastBackupTime: null,
    progress: 0,

    // Actions
    setBackupStatus: (status) =>
      set(() => ({ backupStatus: status })),

    setProgress: (progress) =>
      set(() => ({ progress })),

    // 從 Main Process 同步狀態（批次更新）
    syncFromMain: (state) =>
      set((current) => ({ ...current, ...state })),
  }))
);
```

### 2.3 建立 Settings Store

```typescript
// src/renderer/stores/settings-store.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { SettingsStore } from './types';

export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector((set) => ({
    // 初始狀態（會在 window 開啟時由 IPC 覆蓋）
    backupPath: '',
    autoBackup: false,
    interval: 3600,

    // Actions
    setBackupPath: (backupPath) =>
      set(() => ({ backupPath })),

    setAutoBackup: (autoBackup) =>
      set(() => ({ autoBackup })),

    syncFromMain: (settings) =>
      set((current) => ({ ...current, ...settings })),
  }))
);
```

---

## 3. Preload Script 設定

Preload 是 Main 與 Renderer 的橋接層，必須明確定義每個 IPC 頻道的存取介面。

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// 定義允許的 IPC 頻道（型別安全）
type MainToRendererChannel =
  | 'app:state-updated'
  | 'settings:updated';

type RendererToMainChannel =
  | 'app:get-current-state'
  | 'settings:get-current-state'
  | 'settings:update';

// 暴露給 Renderer 的 API
const electronAPI = {
  // Main → Renderer：監聽 push 事件
  on: (
    channel: MainToRendererChannel,
    callback: (...args: unknown[]) => void
  ) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    // 回傳 cleanup 函式
    return () => ipcRenderer.removeListener(channel, subscription);
  },

  // Renderer → Main：發送請求並等待回應
  invoke: <T>(channel: RendererToMainChannel, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript 型別宣告（供 renderer 使用）
export type ElectronAPI = typeof electronAPI;
```

```typescript
// src/renderer/window.d.ts
import type { ElectronAPI } from '../preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## 4. Main → Renderer Push 事件模式

當 Main Process 狀態發生變更時，主動推送至所有 Renderer。

### 4.1 Main Process：廣播狀態變更

```typescript
// src/main/ipc-handlers.ts
import { BrowserWindow, ipcMain } from 'electron';
import type { AppState } from '../shared/types';

// 工具函式：廣播至所有視窗
function broadcastToAllWindows(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  });
}

// 當備份狀態更新時推送
export function notifyBackupStatusChanged(status: Partial<AppState>): void {
  broadcastToAllWindows('app:state-updated', status);
}
```

### 4.2 Renderer：監聽 Push 並更新 Zustand Store

```typescript
// src/renderer/ipc-listeners.ts
import { useAppStore } from './stores/app-store';
import { useSettingsStore } from './stores/settings-store';
import type { AppState, SettingsState } from '../shared/types';

// 設定 IPC 監聽器，回傳 cleanup 函式
export function setupIpcListeners(): () => void {
  const cleanups: Array<() => void> = [];

  // 監聽 App 狀態更新（Main push）
  const cleanupApp = window.electronAPI.on(
    'app:state-updated',
    (state: Partial<AppState>) => {
      useAppStore.getState().syncFromMain(state);
    }
  );
  cleanups.push(cleanupApp);

  // 監聽 Settings 更新（Main push）
  const cleanupSettings = window.electronAPI.on(
    'settings:updated',
    (settings: Partial<SettingsState>) => {
      useSettingsStore.getState().syncFromMain(settings);
    }
  );
  cleanups.push(cleanupSettings);

  // 回傳統一 cleanup
  return () => cleanups.forEach((cleanup) => cleanup());
}
```

```typescript
// src/renderer/App.tsx（在 React App 根元件掛載時設定）
import React, { useEffect } from 'react';
import { setupIpcListeners } from './ipc-listeners';
import { initializeStores } from './store-initializer';

export function App(): React.JSX.Element {
  useEffect(() => {
    // 1. 取得初始狀態
    initializeStores();

    // 2. 設定 IPC 監聽器
    const cleanup = setupIpcListeners();

    return cleanup; // 元件 unmount 時清除監聽器
  }, []);

  return <>{/* ... */}</>;
}
```

---

## 5. Renderer → Main Invoke 請求資料模式

Renderer 主動向 Main 請求資料，適合需要回傳值的場景。

### 5.1 Main Process：處理 Handle

```typescript
// src/main/ipc-handlers.ts
import { ipcMain } from 'electron';
import { getAppState, updateSettings } from './state-manager';
import type { SettingsState } from '../shared/types';

export function registerIpcHandlers(): void {
  // 處理查詢當前狀態
  ipcMain.handle('app:get-current-state', async () => {
    return getAppState();
  });

  ipcMain.handle('settings:get-current-state', async () => {
    return getSettings();
  });

  // 處理設定更新（Renderer 送來）
  ipcMain.handle(
    'settings:update',
    async (_event, patch: Partial<SettingsState>) => {
      await updateSettings(patch);
      // 更新後廣播至所有視窗
      broadcastToAllWindows('settings:updated', patch);
      return { ok: true };
    }
  );
}
```

### 5.2 Renderer：Invoke 並更新 Store

```typescript
// src/renderer/hooks/use-settings-actions.ts
import { useSettingsStore } from '../stores/settings-store';
import type { SettingsState } from '../../shared/types';

export function useSettingsActions() {
  const syncFromMain = useSettingsStore((state) => state.syncFromMain);

  // 更新設定並同步至 Main
  const updateSettings = async (patch: Partial<SettingsState>): Promise<void> => {
    try {
      await window.electronAPI.invoke<{ ok: boolean }>('settings:update', patch);
      // 樂觀更新本地 store（也可以等 push 事件）
      syncFromMain(patch);
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  return { updateSettings };
}
```

---

## 6. 視窗開啟時同步初始狀態

視窗首次開啟時，必須從 Main Process 拉取當前狀態，避免使用過期的預設值。

### 6.1 實作初始化函式

```typescript
// src/renderer/store-initializer.ts
import { useAppStore } from './stores/app-store';
import { useSettingsStore } from './stores/settings-store';
import type { AppState, SettingsState } from '../shared/types';

export async function initializeStores(): Promise<void> {
  try {
    // 並行請求多個狀態（提升效能）
    const [appState, settings] = await Promise.all([
      window.electronAPI.invoke<AppState>('app:get-current-state'),
      window.electronAPI.invoke<SettingsState>('settings:get-current-state'),
    ]);

    // 批次同步至 Zustand store
    useAppStore.getState().syncFromMain(appState);
    useSettingsStore.getState().syncFromMain(settings);
  } catch (error) {
    console.error('[StoreInitializer] Failed to fetch initial state:', error);
    // 視需求決定是否 fallback 到預設值或顯示錯誤
  }
}
```

### 6.2 在 App 根元件整合

```typescript
// src/renderer/App.tsx
import React, { useEffect, useState } from 'react';
import { setupIpcListeners } from './ipc-listeners';
import { initializeStores } from './store-initializer';

export function App(): React.JSX.Element {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      // 先同步初始狀態，再設定監聽器（避免遺漏 push 事件）
      await initializeStores();
      cleanup = setupIpcListeners();
      setIsInitialized(true);
    };

    init();

    return () => cleanup?.();
  }, []);

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return <>{/* 主要 UI */}</>;
}
```

---

## 7. Zustand subscribe 觸發副作用

`subscribe` 適合在 React 元件外部（如服務層、IPC 層）監聽 store 變化並觸發副作用。

### 7.1 基本 subscribe 用法

```typescript
// 監聽整個 store 變化
const unsubscribe = useAppStore.subscribe((state) => {
  console.log('App state changed:', state);
});

// 清除監聽（例如在 app.on('quit') 時）
unsubscribe();
```

### 7.2 subscribeWithSelector：監聽特定欄位（推薦）

使用 `subscribeWithSelector` middleware 可針對特定狀態片段訂閱，避免不必要的觸發。

```typescript
// src/renderer/stores/app-store.ts（需啟用 subscribeWithSelector middleware）
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set) => ({ /* ... */ }))
);
```

```typescript
// src/renderer/side-effects.ts
import { useAppStore } from './stores/app-store';

export function setupStoreSideEffects(): () => void {
  const cleanups: Array<() => void> = [];

  // 監聽 backupStatus 變化，觸發系統通知
  const unsubStatus = useAppStore.subscribe(
    (state) => state.backupStatus,       // selector：只取關心的欄位
    (status, prevStatus) => {            // listener：新值、舊值
      if (status === 'success' && prevStatus !== 'success') {
        // 觸發系統通知等副作用
        window.electronAPI.invoke('notification:show', {
          title: '備份完成',
          body: '資料已成功備份',
        });
      }
    },
    { equalityFn: Object.is }            // 可選：自訂比較函式
  );
  cleanups.push(unsubStatus);

  return () => cleanups.forEach((fn) => fn());
}
```

**注意事項（參考 Zustand 維護者建議）：**
- 避免在 subscriber 內部呼叫 `set()`，容易造成無限迴圈
- 副作用邏輯優先放在 action 內部直接呼叫，subscribe 用於跨模組的「觀察」場景
- subscribe 的 listener 不在 React 渲染週期內，不需要考慮 stale closure 問題

---

## 8. React 元件訂閱 Zustand Store 最佳實踐

### 8.1 避免不必要 Re-render 的核心規則

**原則：選取最小必要的狀態片段**

```typescript
// ❌ 錯誤：每次 store 任何狀態改變都會 re-render
const state = useAppStore();

// ❌ 錯誤：選取器回傳新物件，每次都觸發 re-render（v5 會拋錯）
const { status, progress } = useAppStore((state) => ({
  status: state.backupStatus,
  progress: state.progress,
}));

// ✅ 正確：分開選取 primitive 值
const status = useAppStore((state) => state.backupStatus);
const progress = useAppStore((state) => state.progress);
```

### 8.2 useShallow：選取多個值時避免參考比較問題

Zustand v5 中，若 selector 回傳物件且每次都建立新參考，**會導致 "Maximum update depth exceeded" 錯誤**。

```typescript
import { useShallow } from 'zustand/react/shallow';

// ✅ 使用 useShallow 包裝物件選取器
const { status, progress } = useAppStore(
  useShallow((state) => ({
    status: state.backupStatus,
    progress: state.progress,
  }))
);

// ✅ 選取 actions 時不需要 useShallow（actions 是穩定參考）
const syncFromMain = useAppStore((state) => state.syncFromMain);
```

### 8.3 靜態選取器（Static Selectors）減少開銷

```typescript
// ✅ 在元件外定義 selector，避免每次 render 重新建立函式
const selectBackupStatus = (state: AppStore) => state.backupStatus;
const selectProgress = (state: AppStore) => state.progress;

function BackupStatusBar(): React.JSX.Element {
  // 穩定的 selector 參考，Zustand 可以優化
  const status = useAppStore(selectBackupStatus);
  const progress = useAppStore(selectProgress);

  return (
    <div>
      <span>{status}</span>
      <progress value={progress} max={100} />
    </div>
  );
}
```

### 8.4 createWithEqualityFn：進階自訂比較（zustand/traditional）

若需要 v4 的 `equalityFn` 行為，使用 `createWithEqualityFn`（從 `zustand/traditional` 匯入）：

```typescript
import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';

// 使用 shallow 作為預設 equality function
export const useSettingsStore = createWithEqualityFn<SettingsStore>(
  (set) => ({ /* ... */ }),
  shallow  // 全域 equality function
);
```

---

## 9. 多個 Store 的組織方式

### 9.1 何時分拆 Store

根據 Zustand 維護者 dai-shi 的建議：

| 情境 | 建議 |
|------|------|
| 兩個領域完全獨立 | 使用多個獨立 store |
| 兩個領域有少量關聯 | 使用單一 store 搭配 slices |
| 需要跨領域的 action | 使用單一 store（協調更容易） |

### 9.2 Slices 模式（單一 Store 分拆）

```typescript
// src/renderer/stores/slices/app-slice.ts
import type { StateCreator } from 'zustand';
import type { RootStore } from '../root-store';

export interface AppSlice {
  backupStatus: 'idle' | 'running' | 'success' | 'error';
  progress: number;
  setBackupStatus: (status: AppSlice['backupStatus']) => void;
  setProgress: (progress: number) => void;
}

export const createAppSlice: StateCreator<
  RootStore,
  [],
  [],
  AppSlice
> = (set) => ({
  backupStatus: 'idle',
  progress: 0,
  setBackupStatus: (backupStatus) => set(() => ({ backupStatus })),
  setProgress: (progress) => set(() => ({ progress })),
});
```

```typescript
// src/renderer/stores/slices/settings-slice.ts
import type { StateCreator } from 'zustand';
import type { RootStore } from '../root-store';

export interface SettingsSlice {
  backupPath: string;
  autoBackup: boolean;
  setBackupPath: (path: string) => void;
  setAutoBackup: (enabled: boolean) => void;
}

export const createSettingsSlice: StateCreator<
  RootStore,
  [],
  [],
  SettingsSlice
> = (set) => ({
  backupPath: '',
  autoBackup: false,
  setBackupPath: (backupPath) => set(() => ({ backupPath })),
  setAutoBackup: (autoBackup) => set(() => ({ autoBackup })),
});
```

```typescript
// src/renderer/stores/root-store.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createAppSlice, type AppSlice } from './slices/app-slice';
import { createSettingsSlice, type SettingsSlice } from './slices/settings-slice';

export type RootStore = AppSlice & SettingsSlice;

export const useRootStore = create<RootStore>()(
  subscribeWithSelector((...args) => ({
    ...createAppSlice(...args),
    ...createSettingsSlice(...args),
  }))
);
```

### 9.3 多個獨立 Store（真正分離時）

若 App 狀態與 Settings 狀態完全獨立，可採用：

```typescript
// src/renderer/stores/index.ts
export { useAppStore } from './app-store';
export { useSettingsStore } from './settings-store';

// 各 store 各自管理自己的 IPC 同步
// 透過 initializeStores() 統一在 App root 初始化
```

---

## 10. Zustand v5 重大變更

### 10.1 摘要表

| 項目 | v4 行為 | v5 行為 | 處理方式 |
|------|---------|---------|---------|
| React 版本 | 支援 React 16+ | 需要 React 18+ | 升級 React |
| TypeScript | 支援 TS 4.0+ | 需要 TS 4.5+ | 升級 TypeScript |
| Default export | 支援 `import create from 'zustand'` | 移除 | 改用具名 import |
| `equalityFn` in `create` | `useStore(selector, shallow)` | 不支援 | 改用 `useShallow` |
| 物件 selector 無 useShallow | 靜默導致多餘 re-render | **拋出 "Maximum update depth exceeded"** | 必須加 `useShallow` |
| Persist middleware | 建立 store 時自動存儲 | 不再自動存儲 | 手動處理初始化 |
| UMD/SystemJS | 支援 | 移除 | 改用 ESM |
| `use-sync-external-store` | 內建 | 改為 peer dependency | 安裝或使用 `zustand/traditional` |

### 10.2 最常見的 Breaking Change：物件選取器

```typescript
// ❌ v4 可正常運作，v5 拋出 "Maximum update depth exceeded"
const { a, b } = useStore((state) => ({ a: state.a, b: state.b }));

// ✅ v5 正確寫法 1：useShallow
import { useShallow } from 'zustand/react/shallow';
const { a, b } = useStore(useShallow((state) => ({ a: state.a, b: state.b })));

// ✅ v5 正確寫法 2：分開選取
const a = useStore((state) => state.a);
const b = useStore((state) => state.b);
```

### 10.3 Import 變更

```typescript
// v4（已棄用）
import create from 'zustand';
import { shallow } from 'zustand';

// v5（正確）
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// v5：需要舊版 equalityFn 行為（相容層）
import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
```

### 10.4 setState replace flag 型別更嚴格

```typescript
// v4：允許（但邏輯上有問題）
store.setState({}, true);

// v5：TypeScript 會報錯，replace=true 必須提供完整狀態
store.setState(completeState, true);
```

---

## 11. 現成解決方案參考

若不想手動管理 IPC 同步，可考慮以下函式庫：

### 11.1 @zubridge/electron（推薦）

> Zutron 的後繼者，API 相容，直接支援 Zustand

- **npm**：`@zubridge/electron`
- **架構**：Main Process 為單一真實來源，Renderer 透過 `useStore` hook 存取（自動同步）
- **支援**：BrowserWindow、BrowserView、WebContentsView
- **action 模式**：支援 thunks、inline actions、Redux-style action objects

```typescript
// 概念用法（詳見官方文件）
import { useStore, useDispatch } from '@zubridge/electron/renderer';

// 讀取狀態
const status = useStore((state) => state.backupStatus);

// 派送 action
const dispatch = useDispatch();
dispatch({ type: 'SET_STATUS', payload: 'running' });
```

### 11.2 state-sync（@statesync/electron + @statesync/zustand）

- 修訂號（revision gate）防止過時更新
- 支援任何狀態管理器（Zustand、Redux、Jotai 等）
- 主要架構：Renderer 拉取快照（poll）+ Main 推送 invalidate

---

## 12. 來源連結

- [Zutron (deprecated) → @zubridge/electron](https://github.com/goosewobbler/zutron)
- [@zubridge/electron - npm](https://www.npmjs.com/package/@zubridge/electron)
- [Zustand Electron Sync Middleware Gist (anis-dr)](https://gist.github.com/anis-dr/5cba43157b87ecab19e59bd8fecca638)
- [How to Sync State Across Electron Windows (state-sync)](https://777genius.github.io/state-sync/examples/electron-any-store)
- [Syncing State between Electron Contexts - Bruno Scheufler](https://brunoscheufler.com/blog/2023-10-29-syncing-state-between-electron-contexts)
- [Electron Inter-Process Communication 官方文件](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron contextBridge 官方文件](https://www.electronjs.org/docs/latest/api/context-bridge)
- [Announcing Zustand v5 - Poimandres](https://pmnd.rs/blog/announcing-zustand-v5)
- [Zustand v5.0.0 Release Notes](https://github.com/pmndrs/zustand/releases/tag/v5.0.0)
- [Zustand v5 Migration Guide](https://github.com/pmndrs/zustand/blob/main/docs/migrations/migrating-to-v5.md)
- [Zustand Selectors & Re-rendering - DeepWiki](https://deepwiki.com/pmndrs/zustand/2.3-selectors-and-re-rendering)
- [Avoid performance issues when using Zustand - DEV Community](https://dev.to/devgrana/avoid-performance-issues-when-using-zustand-12ee)
- [Multiple stores vs slices discussion - Zustand GitHub](https://github.com/pmndrs/zustand/discussions/2496)
- [Side effects in Zustand discussion](https://github.com/pmndrs/zustand/discussions/1384)
- [useShallow vs shallow discussion](https://github.com/pmndrs/zustand/discussions/2203)
- [Zustand TypeScript Guide 2024](https://tillitsdone.com/blogs/zustand-typescript-guide-2024/)
- [Zustand Adoption Guide - LogRocket](https://blog.logrocket.com/zustand-adoption-guide/)
