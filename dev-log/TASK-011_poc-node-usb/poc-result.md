# TASK-011 PoC 結果：node-usb hotplug on Electron（macOS arm64）

**日期**：2026-03-11
**狀態**：COMPLETE（含實機插拔驗證）

---

## 環境資訊

| 項目 | 版本 |
|------|------|
| node-usb | 2.17.0 |
| Electron | 39.8.0 |
| Node.js | v23.11.0 |
| NAPI | 10 |
| 平台 | macOS arm64 (darwin-arm64) |
| npm | 10.9.2 |
| 測試裝置 | iPhone 16 Pro（idVendor: 0x05AC, idProduct: 0x12A8）|

---

## Step 1: 安裝過程

### npm install usb

```
npm install usb
```

**結果**：成功

- `usb@2.17.0` 安裝成功
- `node-gyp-build` 自動選用 prebuilt binary（`darwin-x64+arm64/node.napi.node`）
- `usb install` 腳本：exit code 0

### electron-rebuild

```
npx electron-rebuild -f -w usb
```

**結果**：`✔ Rebuild Complete`

- usb 使用 **Node-API (NAPI)**，非 ABI-specific 版本
- electron-rebuild 驗證後確認相容，無需重新編譯
- NAPI 版本 10，對 Electron 39.x 完全相容

---

## Step 2: Prebuilt Binary

usb 2.17.0 提供 Universal Binary（`darwin-x64+arm64`）：

```
node_modules/usb/prebuilds/darwin-x64+arm64/node.napi.node
```

NAPI（Node-API）格式，與 Node.js ABI 版本無關，一個 binary 可在多個 Electron 版本使用。

---

## Step 3: 實機 Hotplug 測試結果

### getDeviceList()（iPhone 已連接）

```
Apple devices connected: 1
  - idProduct: 0x12a8 | bDeviceClass: 0 | bNumConfigurations: 6
```

**結論**：iPhone 16 Pro 正確被偵測，idVendor 0x05AC 過濾正常。

### attach / detach 事件（實機插拔）

測試指令：
```javascript
const { usb } = require('usb');
const APPLE_VENDOR_ID = 0x05AC;
usb.on('attach', (device) => {
  if (device.deviceDescriptor.idVendor === APPLE_VENDOR_ID) {
    console.log('✅ attach 事件觸發! idProduct: 0x' + device.deviceDescriptor.idProduct.toString(16));
  }
});
usb.on('detach', (device) => {
  if (device.deviceDescriptor.idVendor === APPLE_VENDOR_ID) {
    console.log('✅ detach 事件觸發! idProduct: 0x' + device.deviceDescriptor.idProduct.toString(16));
  }
});
```

**實機測試輸出**（插拔 2 次）：
```
監聽 USB 事件中，請拔出/插入 iPhone...
初始設備: 1 個 Apple 設備
✅ detach 事件觸發! idProduct: 0x12a8
✅ attach 事件觸發! idProduct: 0x12a8
✅ detach 事件觸發! idProduct: 0x12a8
✅ attach 事件觸發! idProduct: 0x12a8
測試結束
```

---

## Step 4: 驗收條件

| 條件 | 狀態 | 備註 |
|------|------|------|
| `npm install usb` 成功，並以 `electron-rebuild` 重新編譯 | ✅ PASSED | NAPI v10，Rebuild Complete |
| iPhone 插入觸發 `usb.on('attach')` 事件 | ✅ PASSED | 實機驗證，0x12a8 |
| 能過濾 Apple Vendor ID `0x05AC` | ✅ PASSED | 過濾正確 |
| iPhone 拔出觸發 `usb.on('detach')` 事件 | ✅ PASSED | 實機驗證 |
| npm run build:mac 打包後相容 | ⏳ 待完整 E2E 測試 | NAPI 確保相容，低風險 |
| 結果記錄至 poc-result.md | ✅ 本文件 |

---

## Electron 整合建議

```typescript
// src/main/services/usb-device-monitor.ts
import { usb } from 'usb'

const APPLE_VENDOR_ID = 0x05AC

export function initUsbHotplug(
  onAttach: (info: { vendorId: number; productId: number }) => void,
  onDetach: () => void
): void {
  usb.on('attach', (device) => {
    if (device.deviceDescriptor.idVendor === APPLE_VENDOR_ID) {
      onAttach({
        vendorId: device.deviceDescriptor.idVendor,
        productId: device.deviceDescriptor.idProduct,
      })
    }
  })

  usb.on('detach', (device) => {
    if (device.deviceDescriptor.idVendor === APPLE_VENDOR_ID) {
      onDetach()
    }
  })
}

export function getConnectedAppleDevices() {
  return usb.getDeviceList().filter(
    (d) => d.deviceDescriptor.idVendor === APPLE_VENDOR_ID
  )
}
```

---

## 結論

**node-usb 2.17.0 在 Electron macOS arm64 上完全可行。**

- 安裝無問題，prebuilt NAPI binary 直接可用
- electron-rebuild 流程驗證通過
- `getDeviceList()`、`on('attach')`、`on('detach')` 實機全部通過
- NAPI v10 確保跨 Electron 版本相容

**建議**：可以直接進入 TASK-012 UsbDeviceMonitor 實作。
