// PoC: node-usb hotplug test
// 執行方式: node poc-test.js（在 Electron context 之外先確認基本功能）
const { usb } = require('usb')

const APPLE_VENDOR_ID = 0x05AC

console.log('監聽 USB 事件... 請插入/拔出 iPhone')

usb.on('attach', (device) => {
  if (device.deviceDescriptor.idVendor === APPLE_VENDOR_ID) {
    console.log('✅ iPhone 插入偵測:', {
      vendorId: device.deviceDescriptor.idVendor.toString(16),
      productId: device.deviceDescriptor.idProduct.toString(16)
    })
  }
})

usb.on('detach', (device) => {
  if (device.deviceDescriptor.idVendor === APPLE_VENDOR_ID) {
    console.log('✅ iPhone 拔出偵測')
  }
})

// 列出目前已連接的 USB 裝置
const devices = usb.getDeviceList()
const appleDevices = devices.filter(d => d.deviceDescriptor.idVendor === APPLE_VENDOR_ID)
console.log(`目前已連接 Apple 裝置數: ${appleDevices.length}`)

if (appleDevices.length > 0) {
  appleDevices.forEach((d, i) => {
    console.log(`  裝置 ${i + 1}: vendorId=0x${d.deviceDescriptor.idVendor.toString(16)}, productId=0x${d.deviceDescriptor.idProduct.toString(16)}`)
  })
}

// 保持程序運行以接收事件
console.log('等待事件中（按 Ctrl+C 結束）...')
