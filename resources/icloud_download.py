#!/usr/bin/env python3
"""
iCloud Photos downloader — communicates via JSON lines on stdin/stdout.

Protocol:
  stdin:  line 1 = JSON config, subsequent lines = 2FA code (if needed)
  stdout: JSON event lines (album_list, scanning_album, 2fa_required, progress, complete, error)

Resume: saves .icloud_sync_state.json in dest_dir to track downloaded files.
"""

import json
import os
import sys
import time

STATE_FILE = '.icloud_sync_state.json'
STATE_SAVE_INTERVAL = 10  # save state every N downloads


def write_event(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def load_state(dest_dir: str) -> set:
    """Load set of already-downloaded relative paths from state file."""
    path = os.path.join(dest_dir, STATE_FILE)
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
            return set(data.get('downloaded', []))
        except Exception:
            pass
    return set()


def save_state(dest_dir: str, downloaded_set: set) -> None:
    path = os.path.join(dest_dir, STATE_FILE)
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump({'downloaded': list(downloaded_set)}, f)
    except Exception:
        pass


def main() -> None:
    # ── Read config from stdin (first line) ───────────────────────────────────
    try:
        raw = sys.stdin.readline()
        config = json.loads(raw.strip())
    except Exception as exc:
        write_event({"event": "error", "message": f"Failed to read config: {exc}"})
        sys.exit(1)

    apple_id: str = config.get("apple_id", "")
    password: str = config.get("password", "")
    dest_dir: str = config.get("dest_dir", "")
    album_filter: str = config.get("album", "all")

    if not apple_id or not password or not dest_dir:
        write_event({"event": "error", "message": "Missing required config fields"})
        sys.exit(1)

    # Always store under dest_dir/icloud/
    dest_dir = os.path.join(dest_dir, 'icloud')
    os.makedirs(dest_dir, exist_ok=True)

    # ── Import pyicloud ───────────────────────────────────────────────────────
    try:
        from pyicloud import PyiCloudService
    except ImportError:
        write_event({"event": "error", "message": "pyicloud is not installed. Run: pip install pyicloud"})
        sys.exit(1)

    # ── Authenticate ──────────────────────────────────────────────────────────
    write_event({"event": "status", "state": "authenticating"})
    try:
        api = PyiCloudService(apple_id, password)
    except Exception as exc:
        write_event({"event": "error", "message": f"Authentication failed: {exc}"})
        sys.exit(1)

    # ── Handle 2FA ────────────────────────────────────────────────────────────
    if api.requires_2fa:
        write_event({"event": "2fa_required", "type": "totp"})
        try:
            code = sys.stdin.readline().strip()
            result = api.validate_2fa_code(code)
            if not result:
                write_event({"event": "error", "message": "Invalid 2FA code"})
                sys.exit(1)
        except Exception as exc:
            write_event({"event": "error", "message": f"2FA failed: {exc}"})
            sys.exit(1)

    elif getattr(api, "requires_2sa", False):
        fa_type = "sms"
        try:
            devices = api.trusted_devices
            if devices:
                api.send_verification_code(devices[0])
        except Exception:
            pass
        write_event({"event": "2fa_required", "type": fa_type})
        try:
            code = sys.stdin.readline().strip()
            device = api.trusted_devices[0] if api.trusted_devices else {}
            result = api.verify_verification_code(device, code)
            if not result:
                write_event({"event": "error", "message": "Invalid 2FA code"})
                sys.exit(1)
        except Exception as exc:
            write_event({"event": "error", "message": f"2FA failed: {exc}"})
            sys.exit(1)

    # ── Load resume state ─────────────────────────────────────────────────────
    downloaded_set = load_state(dest_dir)
    resumed_count = len(downloaded_set)
    if resumed_count > 0:
        write_event({"event": "resumed", "count": resumed_count})

    # ── Quick album listing (no per-album count to avoid slow API calls) ───────
    write_event({"event": "status", "state": "scanning"})
    try:
        albums_list = list(api.photos.albums)
    except Exception as exc:
        write_event({"event": "error", "message": f"Failed to list albums: {exc}"})
        sys.exit(1)

    album_names = [a.title for a in albums_list]
    write_event({"event": "album_list", "albums": [{"name": n, "count": 0} for n in album_names]})

    # ── Scan albums and download ──────────────────────────────────────────────
    total_discovered = 0
    downloaded = 0
    skipped = 0
    bytes_downloaded = 0
    since_last_save = 0

    for album in albums_list:
        album_name = album.title
        if album_filter != "all" and album_name != album_filter:
            continue

        write_event({"event": "scanning_album", "album": album_name})

        album_photo_count = 0
        try:
            for photo in album.photos:
                try:
                    filename = photo.filename
                    size = getattr(photo, 'size', 0) or 0
                except Exception:
                    continue

                total_discovered += 1
                album_photo_count += 1
                rel_path = f"{album_name}/{filename}"
                dest_path = os.path.join(dest_dir, album_name, filename)

                # Skip if already in resume state OR file exists with matching size
                already_done = rel_path in downloaded_set
                file_exists = os.path.exists(dest_path) and os.path.getsize(dest_path) == size
                if already_done or file_exists:
                    skipped += 1
                    write_event({
                        "event": "progress",
                        "current": downloaded + skipped,
                        "total": total_discovered,
                        "skipped": skipped,
                        "downloaded": downloaded,
                        "filename": filename,
                        "album": album_name,
                        "bytes_downloaded": bytes_downloaded,
                        "resuming": already_done and not file_exists
                    })
                    # Add to state even if skipped-by-file (keep state consistent)
                    downloaded_set.add(rel_path)
                    continue

                # Create album directory
                try:
                    os.makedirs(os.path.join(dest_dir, album_name), exist_ok=True)
                except Exception as exc:
                    write_event({"event": "file_error", "message": f"mkdir failed: {exc}"})
                    continue

                # Download — pyicloud 2.x returns bytes directly
                try:
                    data = photo.download()
                    if data is None:
                        write_event({"event": "file_error", "message": f"No download URL for {filename}"})
                        continue
                    with open(dest_path, 'wb') as f:
                        f.write(data)
                    bytes_written = len(data)
                    downloaded += 1
                    bytes_downloaded += bytes_written
                    downloaded_set.add(rel_path)
                    since_last_save += 1
                    if since_last_save >= STATE_SAVE_INTERVAL:
                        save_state(dest_dir, downloaded_set)
                        since_last_save = 0
                except Exception as exc:
                    write_event({"event": "file_error", "message": f"Download failed for {filename}: {exc}"})
                    continue

                write_event({
                    "event": "progress",
                    "current": downloaded + skipped,
                    "total": total_discovered,
                    "skipped": skipped,
                    "downloaded": downloaded,
                    "filename": filename,
                    "album": album_name,
                    "bytes_downloaded": bytes_downloaded,
                    "resuming": False
                })
        except Exception as exc:
            write_event({"event": "file_error", "message": f"Album scan error ({album_name}): {exc}"})
            continue

        # Send actual count after album is fully scanned
        write_event({"event": "album_update", "name": album_name, "count": album_photo_count})

    # ── Final state save ──────────────────────────────────────────────────────
    save_state(dest_dir, downloaded_set)

    write_event({
        "event": "complete",
        "total_downloaded": downloaded,
        "total_skipped": skipped,
        "bytes_downloaded": bytes_downloaded
    })


if __name__ == "__main__":
    main()
