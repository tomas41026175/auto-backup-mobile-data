# electron-vite + TailwindCSS v4 + React + TypeScript 專案初始化研究

> 研究日期：2025-03
> 適用版本：electron-vite ^5.0.0、TailwindCSS ^4.x、React ^19.x、TypeScript ^5.x

---

## 目錄

1. [環境需求](#1-環境需求)
2. [使用 CLI 建立專案](#2-使用-cli-建立專案)
3. [專案結構](#3-專案結構)
4. [tsconfig 多組設定](#4-tsconfig-多組設定)
5. [electron.vite.config.ts 典型配置](#5-electronviteconfigts-典型配置)
6. [TailwindCSS v4 安裝（@tailwindcss/vite 方式）](#6-tailwindcss-v4-安裝tailwindcssvite-方式)
7. [整合後完整 electron.vite.config.ts](#7-整合後完整-electronviteconfigts)
8. [vitest.config.ts 設定](#8-vitestconfigts-設定)
9. [已知坑與 Breaking Changes](#9-已知坑與-breaking-changes)
10. [package.json scripts 參考](#10-packagejson-scripts-參考)
11. [來源連結](#11-來源連結)

---

## 1. 環境需求

| 工具 | 最低版本 |
|------|---------|
| Node.js | 20.19+ 或 22.12+ |
| Vite | 5.0+ |
| electron-vite | ^5.0.0 |
| Electron | ^39.x（2025 最新） |
| TailwindCSS | ^4.x |

---

## 2. 使用 CLI 建立專案

### 標準方式

```bash
npm create @quick-start/electron@latest
```

互動式選擇：
- 輸入專案名稱
- 選擇框架：`react`
- 選擇 TypeScript 變體：`react-ts`

### 直接指定模板

```bash
npm create @quick-start/electron@latest my-app -- --template react-ts
```

可用模板：`vanilla`、`vue`、`react`、`svelte`、`solid`（每種都有 JS / TS 版本）。

### 安裝依賴並啟動

```bash
cd my-app
npm install
npm run dev
```

---

## 3. 專案結構

```
my-app/
├── build/                    # electron-builder 資源（icon 等）
├── resources/                # 應用程式靜態資源
├── src/
│   ├── main/
│   │   └── index.ts          # Electron 主程序入口
│   ├── preload/
│   │   └── index.ts          # Preload script
│   └── renderer/
│       ├── src/
│       │   ├── assets/
│       │   │   └── main.css  # 全域 CSS（放 TailwindCSS import）
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── index.html        # Renderer 入口 HTML
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
└── package.json
```

**入口點自動偵測規則：**
- Main：`src/main/{index|main}.{js|ts|mjs|cjs}`
- Preload：`src/preload/{index|preload}.{js|ts|mjs|cjs}`
- Renderer：`src/renderer/index.html`

---

## 4. tsconfig 多組設定

electron-vite 使用三個 tsconfig 檔案分別處理不同執行環境，統一繼承自 `@electron-toolkit/tsconfig`。

### 4.1 tsconfig.json（根配置，只定義 references）

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

> `files: []` 確保根 tsconfig 本身不直接編譯任何檔案，所有編譯由子配置負責。

### 4.2 tsconfig.node.json（主程序 + Preload + 建置工具）

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "src/main/**/*",
    "src/preload/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"],
    "moduleResolution": "bundler"
  }
}
```

**說明：**
- `include` 涵蓋 `electron.vite.config.*`（建置設定本身也需要型別檢查）
- `types: ["electron-vite/node"]` 提供 `electron-vite` 專用的 Node 端型別
- `moduleResolution: "bundler"` 是解決 TailwindCSS v4 模組解析問題的關鍵（見第 9 節）

### 4.3 tsconfig.web.json（Renderer / 瀏覽器端）

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/src/env.d.ts",
    "src/renderer/src/**/*",
    "src/renderer/src/**/*.tsx",
    "src/preload/*.d.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/src/*"]
    }
  }
}
```

**說明：**
- 繼承 `@electron-toolkit/tsconfig/tsconfig.web.json`，內含 `lib: ["ESNext", "DOM", "DOM.Iterable"]`
- `jsx: "react-jsx"` 啟用 React 17+ 的新 JSX transform（無需 import React）
- `paths` 設定 `@renderer/*` alias，對應 `electron.vite.config.ts` 中的 resolve.alias

### 4.4 @electron-toolkit/tsconfig 基礎配置（供參考）

`@electron-toolkit/tsconfig/tsconfig.json`（基礎）：

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

---

## 5. electron.vite.config.ts 典型配置

### 官方模板預設（無 TailwindCSS）

```typescript
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
```

### 三個 process 的內建預設值

| 配置項 | main | preload | renderer |
|--------|------|---------|----------|
| target | Node（對應 Electron 版本） | Node（對應 Electron 版本） | Chrome（對應 Electron 版本） |
| outDir | `out/main` | `out/preload` | `out/renderer` |
| entry | `src/main/index.ts` | `src/preload/index.ts` | `src/renderer/index.html` |
| format | `cjs` / `es` | `cjs` / `es` | — |
| env prefix | `MAIN_VITE_` | `PRELOAD_VITE_` | `RENDERER_VITE_` |

---

## 6. TailwindCSS v4 安裝（@tailwindcss/vite 方式）

### v4 與 v3 的根本差異

| 項目 | v3（舊版） | v4（新版） |
|------|-----------|-----------|
| 整合方式 | PostCSS plugin | Vite 專用 plugin |
| CSS 入口語法 | `@tailwind base; @tailwind components; @tailwind utilities;` | `@import "tailwindcss";` |
| 設定檔 | `tailwind.config.js`（必需） | 無需設定檔（零配置） |
| autoprefixer | 需手動加入 | 自動處理 |
| postcss-import | 需手動加入 | 自動處理 |

### 安裝步驟

#### Step 1：安裝套件

```bash
npm install tailwindcss @tailwindcss/vite
```

> **注意：** v4 不需要安裝 `postcss`、`autoprefixer`、`postcss-import`。

#### Step 2：在 electron.vite.config.ts 加入 plugin（只加在 renderer）

```typescript
import tailwindcss from '@tailwindcss/vite'

// 加入 renderer.plugins
renderer: {
  plugins: [react(), tailwindcss()]
}
```

#### Step 3：修改 CSS 入口檔案

`src/renderer/src/assets/main.css`（或 `index.css`）：

```css
@import "tailwindcss";

/* 其餘自訂樣式 */
```

#### Step 4：確認 main.tsx 引入 CSS

```typescript
// src/renderer/src/main.tsx
import './assets/main.css'
```

---

## 7. 整合後完整 electron.vite.config.ts

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      react(),
      tailwindcss()   // TailwindCSS v4 只在 renderer 啟用
    ]
  }
})
```

**說明：**
- `externalizeDepsPlugin()` 讓 main 和 preload 不打包 Node.js built-in modules
- `tailwindcss()` 只放在 `renderer` 的 plugins，不放在 main 或 preload

---

## 8. vitest.config.ts 設定

electron-vite 專案中 Vitest 需要獨立配置，因為 `electron.vite.config.ts` 的結構（三個 process）與 Vitest 期望的單一 Vite config 不相容。

### 建立獨立的 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',  // 或 'jsdom'，需另行安裝
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
})
```

### 安裝測試環境

```bash
# 選擇其中一個
npm install -D happy-dom        # 速度較快，輕量
npm install -D jsdom            # 更接近真實瀏覽器環境
```

### 測試環境選擇建議

| 環境 | 特點 | 適用場景 |
|------|------|---------|
| `happy-dom` | 速度快、輕量 | 單元測試、快速迭代 |
| `jsdom` | 更完整的 DOM 實作 | 需要完整 DOM API 的整合測試 |

### 測試 setup 檔案（可選）

`src/test/setup.ts`：

```typescript
import '@testing-library/jest-dom'
```

安裝：

```bash
npm install -D @testing-library/react @testing-library/jest-dom
```

### 多環境配置（進階）

如需同時測試 main process（Node 環境）與 renderer（DOM 環境）：

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        // Renderer 測試（需要 DOM）
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
          environment: 'happy-dom',
        },
      },
      {
        // Main process 測試（Node 環境）
        test: {
          name: 'main',
          include: ['src/main/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
```

---

## 9. 已知坑與 Breaking Changes

### 9.1 TailwindCSS v4 Breaking Changes（從 v3 升級）

#### CSS 語法改變（最常見錯誤）

```css
/* v3 寫法 — v4 中無效 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* v4 正確寫法 */
@import "tailwindcss";
```

#### 移除 tailwind.config.js（零配置）

v4 預設不需要 `tailwind.config.js`。如需使用舊版設定檔，必須在 CSS 中顯式引入：

```css
@config "../../tailwind.config.js";
@import "tailwindcss";
```

> **注意：** `corePlugins`、`safelist`、`separator` 選項在 v4 已移除，無法在設定檔中使用。

#### Utility 重命名

| v3 | v4 |
|----|----|
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `blur-sm` | `blur-xs` |
| `rounded-sm` | `rounded-xs` |
| `ring`（3px） | `ring-3` |
| `outline-none` | `outline-hidden` |

#### Important modifier 語法改變

```html
<!-- v3 -->
<div class="!flex !bg-red-500 hover:!bg-red-600">

<!-- v4 -->
<div class="flex! bg-red-500! hover:bg-red-600!">
```

#### 自訂 utilities 語法改變

```css
/* v3 */
@layer utilities {
  .tab-4 { tab-size: 4; }
}

/* v4 */
@utility tab-4 {
  tab-size: 4;
}
```

#### PostCSS 設定改變

```javascript
// v3 postcss.config.js
export default {
  plugins: { tailwindcss: {} }
}

// v4 postcss.config.js（若仍用 PostCSS，非 Vite plugin 方式）
export default {
  plugins: { "@tailwindcss/postcss": {} }
}
```

> **建議：** 在 electron-vite 專案中使用 `@tailwindcss/vite` plugin，完全不需要 PostCSS 設定。

### 9.2 electron-vite + TailwindCSS v4 整合已知問題

#### 問題 1：moduleResolution 導致模組解析失敗

**錯誤訊息：**
```
Cannot find module '@tailwindcss/vite' under the current moduleResolution setting
```

**原因：** `tsconfig.node.json` 未明確設定 `moduleResolution`。

**解決方法：** 在 `tsconfig.node.json` 的 `compilerOptions` 中加入：

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

來源：[electron-vite Issue #741](https://github.com/alex8088/electron-vite/issues/741)

#### 問題 2：@utility 指令在 dev 模式下不生效

**現象：** 自訂的 `@utility` 指令在 `electron-vite dev` 模式下無效，但 `build` / `preview` 正常。

**原因：** `@tailwindcss/vite` plugin 在使用 Vite `config.root` 選項時，dev 模式下的 HMR 有已知 bug。

**狀態：** 此問題在 [tailwindcss Issue #18760](https://github.com/tailwindlabs/tailwindcss/issues/18760) 中持續追蹤。

**暫時解決：** 避免在 dev 模式下使用 `@utility` 指令，改用 Tailwind 標準 class。

#### 問題 3：瀏覽器支援限制

TailwindCSS v4 要求：
- Safari 16.4+
- Chrome 111+
- Firefox 128+

Electron 必須使用足夠新的 Chromium 版本。Electron 28+ 的 Chromium 版本符合要求。

### 9.3 electron-vite 專案特定注意事項

#### tailwindcss plugin 只能放在 renderer

```typescript
// 正確 ✓
renderer: {
  plugins: [react(), tailwindcss()]
}

// 錯誤 ✗（main 和 preload 是 Node 環境，不需要 CSS 處理）
main: {
  plugins: [tailwindcss()]
}
```

#### env 變數前綴

三個 process 有不同的 env 前綴，`.env` 中的變數只有加對前綴才能在對應 process 存取：

```
MAIN_VITE_*      → 僅 main process 可存取
PRELOAD_VITE_*   → 僅 preload 可存取
RENDERER_VITE_*  → 僅 renderer 可存取
```

---

## 10. package.json scripts 參考

官方模板的完整 scripts（來自最新 react-ts 模板）：

```json
{
  "scripts": {
    "format": "prettier --write .",
    "lint": "eslint --cache .",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "start": "electron-vite preview",
    "dev": "electron-vite dev",
    "build": "npm run typecheck && electron-vite build",
    "build:unpack": "npm run build && electron-builder --dir",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "electron-vite build && electron-builder --mac",
    "build:linux": "electron-vite build && electron-builder --linux"
  }
}
```

---

## 11. 來源連結

- [electron-vite 官方文件 - Getting Started](https://electron-vite.org/guide/)
- [electron-vite 官方文件 - Configuration](https://electron-vite.org/config/)
- [electron-vite 官方文件 - TypeScript](https://electron-vite.org/guide/typescript)
- [electron-vite react-ts 官方模板（GitHub）](https://github.com/alex8088/quick-start/tree/master/packages/create-electron/playground/react-ts)
- [electron-vite/electron-vite-react boilerplate](https://github.com/electron-vite/electron-vite-react)
- [TailwindCSS v4 安裝文件](https://tailwindcss.com/docs)
- [TailwindCSS v4 升級指南](https://tailwindcss.com/docs/upgrade-guide)
- [TailwindCSS v4 發布公告](https://tailwindcss.com/blog/tailwindcss-v4)
- [@tailwindcss/vite on npm](https://www.npmjs.com/package/@tailwindcss/vite)
- [electron-vite Issue #741：TailwindCSS v4 migration](https://github.com/alex8088/electron-vite/issues/741)
- [tailwindcss Issue #18760：@utility 指令在 dev 模式問題](https://github.com/tailwindlabs/tailwindcss/issues/18760)
- [@electron-toolkit/tsconfig（npm）](https://www.npmjs.com/package/@electron-toolkit/tsconfig)
- [electron-vite + shadcn 設定指南（DEV Community）](https://dev.to/nedwize/how-to-add-shadcn-to-an-electron-vite-project-dn)
- [Vitest 設定文件](https://vitest.dev/config/)
- [maxzz/electron-vite-2025（April 2025 範例）](https://github.com/maxzz/electron-vite-2025)
