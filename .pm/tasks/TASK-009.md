---
id: TASK-009
title: Phase 3 — macOS Tray Template Image
status: done
priority: medium
worktree: ".worktrees/TASK-009"
branch: "task/TASK-009"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## 描述

製作符合 macOS menu bar 規範的 Tray Template Image。目前 `resources/` 只有彩色的 `icon.png`，
macOS 需要純黑白的 Template PNG，讓系統能在深色/淺色主題下自動反色顯示。

**前置條件**：TASK-007（tray.ts 已改為 darwin 使用 `iconTemplate.png`）。

## 實作項目

### PNG 規格

| 檔案 | 尺寸 | 用途 |
|------|------|------|
| `resources/iconTemplate.png` | 16×16 px | 一般顯示（@1x） |
| `resources/iconTemplate@2x.png` | 32×32 px | Retina 顯示（@2x） |

**格式要求**：
- 純黑色圖形（#000000）+ alpha 通道
- 不含任何彩色像素
- PNG-24 with alpha
- 檔名以 `Template` 結尾 → Electron 自動識別為 template image，系統自動反色

### 製作方式

從現有 `icon.png`（或 icon 設計稿）轉換：
1. 將圖示形狀填充為純黑色，保留 alpha 通道（透明背景）
2. 輸出 16×16 → `iconTemplate.png`
3. 輸出 32×32 → `iconTemplate@2x.png`

可用工具：Figma、Sketch、Photoshop、GIMP、或 ImageMagick：
```bash
# 轉換現有 icon（保持形狀，改為純黑）
magick resources/icon.png -colorspace Gray -threshold 50% -alpha on \
  -resize 16x16 resources/iconTemplate.png
magick resources/icon.png -colorspace Gray -threshold 50% -alpha on \
  -resize 32x32 resources/iconTemplate@2x.png
```

### 驗證

- macOS 淺色主題：Tray icon 顯示為黑色
- macOS 深色主題：Tray icon 顯示為白色（系統自動反色）
- 圖示在 menu bar 大小下清晰可辨

## 驗收條件

- [ ] `resources/iconTemplate.png`（16×16，純黑白）存在
- [ ] `resources/iconTemplate@2x.png`（32×32，純黑白）存在
- [ ] macOS 淺色主題下 Tray icon 正確顯示
- [ ] macOS 深色主題下 Tray icon 自動反色顯示
- [ ] icon 在 menu bar 尺寸下清晰可辨

## 備註

若現有 `icon.png` 轉換結果不理想，可使用簡單的幾何圖形（圓形 + 箭頭）代替，重點是確認 Template 機制正常運作。

## 參考

- `docs/adr-cross-platform.md` → macOS 個人使用方案 → Phase 3
- `docs/research/cross-platform/03-tray-macos-vs-windows.md`
