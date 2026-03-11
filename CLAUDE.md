# Auto Backup Mobile — 專案規範

## Workflow 規範

### 所有開發任務必須走 spec-work 流程

任何非 trivial 的開發任務（bug fix 除外）都必須先建立 spec 再開始實作：

```bash
/spec-work <任務描述>          # 精簡模式（單功能、需求清楚）
/spec-work --complex-issue    # 複雜模式（跨模組、架構決策、≥5 tasks）
```

**spec 路徑**：`dev-log/{taskId}_{workname}/spec.md`（已納入版控）

- `taskId`：任務 ID，如 `TASK-001`、`T-001`
- `workname`：任務名稱，kebab-case，如 `usb-device-monitor`
- 範例：`dev-log/TASK-001_usb-device-monitor/spec.md`

**Template 選擇**：複製 `dev-log/_templates/` 對應模板使用

| 條件（任一符合） | 使用 |
|----------------|------|
| 影響 ≥ 2 個 Layer（main/preload/renderer/shared） | `spec-complex.md` |
| Task 數量 ≥ 4 | `spec-complex.md` |
| 涉及 node-usb / AFC / mDNS / launchd 整合 | `spec-complex.md` |
| 新增或修改 ≥ 3 個 IPC channel | `spec-complex.md` |
| 其餘（單 Layer、≤ 3 tasks、純 UI 或純 service） | `spec-simple.md` |

#### 例外（可跳過 spec-work）

- 明顯的 typo / console.log 清除 / 小型 bug fix（修改 ≤ 2 個檔案）
- 文件更新（README、docs/）

---

### PR 必須包含 spec 文件連結

PR description 的 `## Summary` 區塊必須包含：

```markdown
**Spec**: [dev-log/{taskId}_{workname}/spec.md](./dev-log/{taskId}_{workname}/spec.md)
```

若任務無對應 spec（例外情境），需在 PR description 說明原因：

```markdown
**Spec**: 不適用 — {說明原因，如：typo fix / doc update}
```

---

## 技術規範

### Electron 架構

- **BrowserWindow 存取**：一律透過 `window-manager.ts` 的 `getMainWindow()`，禁止直接持有 BrowserWindow 快照或使用 `BrowserWindow.getAllWindows()[0]`
- **IPC 型別定義**：集中於 `src/shared/ipc-channels.ts`，使用 `@electron-toolkit/typed-ipc` type map
- **Service 初始化**：在 `src/main/index.ts` bootstrap，透過參數注入，不在 service 內 import index.ts

### 資料

- `electron-conf` 僅限 main process 存取，renderer 透過 IPC 讀寫
- IPC 邊界禁用 `Set`，改為 `Array`（序列化相容）

### 備份核心

- 實際備份走 libimobiledevice CLI（`idevicepair`、`ifuse`），USB + AFC 協定
- mDNS (`bonjour-service`) 用於顯示裝置在線狀態，不直接觸發備份
- 傳輸驗證用 xxHash64（`@node-rs/xxhash`），非 SHA-256

## 相關文件

- [Dev Log Index](./dev-log/index.md) — 所有任務規劃
- [Tech Stack Research](./docs/research/tech-stack/master-index.md) — 技術研究彙整
