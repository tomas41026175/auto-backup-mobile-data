#!/usr/bin/env python3
"""List DCIM media files on iOS device via AFC using pymobiledevice3.
Usage: python list_dcim.py <UDID>
Output: JSON array of paths relative to DCIM (e.g. ["107APPLE/IMG_7048.MOV", ...])
"""
import sys
import json
import asyncio

MEDIA_EXTENSIONS = {
    '.heic', '.jpg', '.jpeg', '.png',
    '.mov', '.mp4', '.m4v',
    '.aae', '.m4a'
}

async def main():
    udid = sys.argv[1]
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.afc import AfcService

    lockdown = await create_using_usbmux(serial=udid)
    afc = AfcService(lockdown)

    files = []
    async for path in afc.dirlist('DCIM', -1):
        name = path.split('/')[-1]
        if name.startswith('.') or '.' not in name:
            continue
        ext = '.' + name.rsplit('.', 1)[-1].lower()
        if ext in MEDIA_EXTENSIONS:
            # Return path relative to DCIM (e.g. "107APPLE/IMG_7048.MOV")
            rel = path[len('DCIM/'):]
            files.append(rel)

    print(json.dumps(files))

if __name__ == '__main__':
    asyncio.run(main())
