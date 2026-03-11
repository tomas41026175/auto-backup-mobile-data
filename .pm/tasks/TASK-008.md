---
id: TASK-008
title: Phase 2 — electron-builder macOS 打包設定完善
status: done
priority: medium
worktree: ".worktrees/TASK-008"
branch: "task/TASK-008"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

完善 electron-builder 的 macOS 打包設定。TASK-006 已加入最簡 `mac` 區塊，本任務補全 Info.plist 擴展與 build script，確保最終 DMG 包含所有必要的 macOS 權限宣告。

**前置條件**：TASK-006（已加入基本 mac 區塊）、TASK-007（platform branch 完成）。

## 實作項目

### `electron-builder.yml` 完整 mac 區塊

```yaml
mac:
  target:
    - target: dmg
      arch: arm64
  identity: null          # 不簽名，個人使用
  icon: resources/icon.png
  extendInfo:
    NSLocalNetworkUsageDescription: Auto Backup 需要存取區域網路以偵測 iPhone（mDNS）
    NSBonjourServices:
      - _companion-link._tcp
```

- `identity: null`：明確不簽名（省略 identity 在某些 electron-builder 版本會嘗試自動找憑證）
- `arch: arm64`：個人 Mac 直接 build arm64，不需 Universal Binary

### `package.json` script

```json
"build:mac": "electron-vite build && electron-builder --mac"
```

### 驗證打包流程

- `npm run build:mac` 成功產出 `.dmg`
- 安裝後確認 `NSLocalNetworkUsageDescription` 出現在系統設定 → 隱私權 → 本地網路
- 確認 App Info.plist 包含正確的 `NSBonjourServices`

## 驗收條件

- [ ] `electron-builder.yml` 包含完整 mac 區塊（identity: null, arm64, extendInfo）
- [ ] `package.json` 有 `build:mac` script
- [ ] `npm run build:mac` 成功產出 `.dmg`
- [ ] 安裝後系統設定可見本地網路存取權限條目
- [ ] App.plist 包含 `NSBonjourServices` 宣告

## 參考

- `docs/adr-cross-platform.md` → macOS 個人使用方案 → Phase 2
- `docs/research/cross-platform/06-electron-builder-macos.md`
