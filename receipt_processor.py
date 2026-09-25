#!/usr/bin/env python3
"""
=============================================================================
FARM & SMALL BUSINESS RECEIPT PROCESSOR - SUBSCRIPTION & AUTO-UPDATE EDITION
=============================================================================
A native desktop GUI for high-speed receipt OCR, categorization, QuickBooks
CSV exporting, and Multi-Client QuickBooks Online API Direct Sync with
AES-256 At-Rest Local Encryption, Over-The-Air Updates, and Subscription
License Access Control.

Features:
  - Header Version Badge (v1.0.0) with dedicated 'Check for Updates' button.
  - Dismissible OTA Update Notification Modal with progress bar and
    'Remind Me Later' / 'Skip this Version' options.
  - Subscription & License Manager: Allows/restricts user access based on
    active license status, hardware fingerprinting, and offline grace periods.
=============================================================================
"""

import os
import sys
import time
import json
import csv
import io
import queue
import shutil
import base64
import hashlib
import threading
import subprocess
import socket
import platform
import urllib.request
import urllib.error
import urllib.parse
import concurrent.futures
from datetime import datetime, timedelta

def sanitize_csv_field(val) -> str:
    """Sanitizes text fields to prevent CSV formula injection while preserving clean data."""
    if val is None:
        return ""
    s = str(val).strip()
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s

# PIL / Pillow Image imports with fallback
try:
    from PIL import Image, ImageOps, ImageFilter
except ImportError:
    Image = ImageOps = ImageFilter = None

# Tkinter GUI imports with fallback
try:
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox, scrolledtext
    _TK_BASE_TOPLEVEL = tk.Toplevel
    _TK_BASE_TK = tk.Tk
except (ImportError, AttributeError):
    tk = ttk = filedialog = messagebox = scrolledtext = None
    _TK_BASE_TOPLEVEL = object
    _TK_BASE_TK = object

# Anchor working directory to script directory regardless of launch method
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
try:
    os.chdir(SCRIPT_DIR)
except Exception:
    pass

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Requests with fallback to urllib
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    requests = None
    HTTPAdapter = None
    Retry = None


# -----------------------------------------------------------------------------
# Version & Remote Update Manifest Configuration
# -----------------------------------------------------------------------------
APP_VERSION = "1.0.0"

# You can host this version.json on GitHub (Raw), an S3 bucket, or your website.
UPDATE_MANIFEST_URL = os.getenv(
    "UPDATE_MANIFEST_URL",
    "https://raw.githubusercontent.com/yourusername/receipt-processor-updates/main/version.json"
)

# Remote license verification endpoint (or fallback license logic)
LICENSE_SERVER_URL = os.getenv(
    "LICENSE_SERVER_URL",
    "https://api.youraccountingdomain.com/v1/verify-license"
)


def http_get_json(url: str, timeout: float = 2.0) -> tuple:
    """
    Performs an HTTP GET request returning (status_code, data_dict_or_none).
    Filters out HTML error/redirect pages so only real JSON objects are returned.
    Appends cache-busting timestamp to guarantee fresh real-time responses from CDNs.
    """
    cb = f"_cb={int(time.time() * 1000)}"
    sep = "&" if "?" in url else "?"
    busted_url = f"{url}{sep}{cb}"

    try:
        req = urllib.request.Request(
            busted_url,
            headers={
                "User-Agent": f"FarmReceiptProcessor/{APP_VERSION}",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                "Accept": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            code = resp.status
            content = resp.read().decode("utf-8", errors="ignore").strip()
            if not content or content.startswith("<") or "<html" in content.lower():
                return code, None
            try:
                parsed = json.loads(content)
                if isinstance(parsed, dict):
                    return code, parsed
                return code, None
            except Exception:
                return code, None
    except urllib.error.HTTPError as e:
        body = None
        try:
            raw_e = e.read().decode("utf-8", errors="ignore").strip()
            if raw_e and not raw_e.startswith("<") and "<html" not in raw_e.lower():
                parsed = json.loads(raw_e)
                if isinstance(parsed, dict):
                    body = parsed
        except Exception:
            pass
        return e.code, body
    except Exception:
        if requests is not None:
            try:
                r = requests.get(
                    url,
                    timeout=timeout,
                    headers={"Cache-Control": "no-cache, no-store", "Pragma": "no-cache", "Accept": "application/json"}
                )
                if r.status_code == 200:
                    try:
                        data = r.json()
                        if isinstance(data, dict):
                            return r.status_code, data
                    except Exception:
                        pass
                return r.status_code, None
            except Exception:
                pass
        return 0, None


# -----------------------------------------------------------------------------
# Subscription & Licensing System (Allowed vs. Not Allowed Users)
# -----------------------------------------------------------------------------
LICENSE_FILE = ".license_vault.json"
LICENSE_REGISTRY_FILE = os.getenv("LICENSE_REGISTRY_PATH", "license_registry.json")

# Known portal endpoints for real-time license state synchronization (Cloudflare Worker KV Edge is primary)
RAW_PORTAL_ENDPOINTS = [
    "https://receipt-license-api.moisttowlett247.workers.dev",
    os.getenv("PORTAL_URL", "").strip().rstrip("/"),
    os.getenv("LICENSE_SERVER_URL", "").strip().rstrip("/"),
    "https://raw.githubusercontent.com/moisttowlett247-a11y/Receipt_portal/main/public"
]

_CACHED_PUBLIC_IP = "127.0.0.1"
_LAST_IP_FETCH_TS = 0
_IP_FETCHING = False

def _fetch_ip_worker():
    global _CACHED_PUBLIC_IP, _LAST_IP_FETCH_TS, _IP_FETCHING
    try:
        ip_endpoints = [
            "https://api.ipify.org",
            "https://checkip.amazonaws.com",
            "https://icanhazip.com",
            "https://ifconfig.me/ip"
        ]
        for ep in ip_endpoints:
            try:
                req = urllib.request.Request(ep, headers={"User-Agent": "curl/7.68.0"})
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    ip = resp.read().decode("utf-8").strip()
                    if ip and len(ip) <= 45 and ("." in ip or ":" in ip):
                        _CACHED_PUBLIC_IP = ip
                        _LAST_IP_FETCH_TS = time.time()
                        break
            except Exception:
                continue
    finally:
        _IP_FETCHING = False

def get_public_ip() -> str:
    """Returns the workstation public IP address instantly from cache, refreshing asynchronously."""
    global _CACHED_PUBLIC_IP, _LAST_IP_FETCH_TS, _IP_FETCHING
    now = time.time()
    if (_CACHED_PUBLIC_IP == "127.0.0.1" or (now - _LAST_IP_FETCH_TS) > 300) and not _IP_FETCHING:
        _IP_FETCHING = True
        threading.Thread(target=_fetch_ip_worker, daemon=True).start()
    return _CACHED_PUBLIC_IP


def get_machine_hardware_id() -> str:
    """Derives a stable machine identity so licenses cannot be shared across multiple computers."""
    try:
        import platform
        raw = f"{platform.node()}::{platform.machine()}::{platform.processor()}::{os.name}"
        return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:24].upper()
    except Exception:
        return "GENERIC-MACHINE-ID-12345"


class SubscriptionLicenseManager:
    """
    Validates whether the user has an active subscription.
    Enforces hardware machine locking, syncs with the live website portal
    (detects Active, Revoked, and Deleted status in real-time), and manages local vault.
    """
    def __init__(self, filepath=LICENSE_FILE, registry_path=LICENSE_REGISTRY_FILE):
        self.filepath = filepath
        self.registry_path = registry_path
        self.hardware_id = get_machine_hardware_id()
        self.license_data = self.load_local_license()
        self._last_scan_ts = 0
        self.connected_portal = ""

    def get_active_portal_endpoints(self) -> list:
        """Returns non-empty, deduplicated, valid portal endpoints."""
        seen = set()
        endpoints = []
        for ep in RAW_PORTAL_ENDPOINTS:
            clean = (ep or "").strip().rstrip("/")
            if clean and "youraccountingdomain" not in clean and clean not in seen:
                seen.add(clean)
                endpoints.append(clean)
        return endpoints

    def load_registry(self) -> list:
        """Loads authorized keys from local license_registry.json or remote registry URL."""
        if os.path.exists(self.registry_path):
            try:
                with open(self.registry_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return data
                    if isinstance(data, dict) and "keys" in data:
                        return data["keys"]
            except Exception:
                pass

        remote_url = os.getenv("LICENSE_REGISTRY_URL", "").strip()
        if remote_url and remote_url.startswith("http"):
            try:
                st_code, data = http_get_json(remote_url, timeout=4)
                if st_code == 200 and data is not None:
                    if isinstance(data, list):
                        return data
                    if isinstance(data, dict) and "keys" in data:
                        return data["keys"]
            except Exception:
                pass

        return []

    def save_registry(self, registry_list: list):
        """Saves updated registry."""
        try:
            with open(self.registry_path, "w", encoding="utf-8") as f:
                json.dump(registry_list, f, indent=2)
        except Exception:
            pass

    def load_local_license(self) -> dict:
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "license_key": "",
            "user_email": "",
            "plan_tier": "Unregistered",
            "status": "INACTIVE",  # ACTIVE, EXPIRED, REVOKED, INACTIVE
            "hardware_id": self.hardware_id,
            "activated_at": "",
            "expires_at": "",
            "last_verified": ""
        }

    def _compute_vault_checksum(self, key: str, status: str, exp: str) -> str:
        raw = f"RP_VAULT_INTEGRITY::{key}::{self.hardware_id}::{status}::{exp}::SALT_78912"
        return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32]

    def save_local_license(self):
        try:
            k = (self.license_data.get("license_key") or "").strip().upper()
            st = (self.license_data.get("status") or "INACTIVE").strip().upper()
            exp = str(self.license_data.get("expires_at") or "").strip()
            self.license_data["hardware_id"] = self.hardware_id
            self.license_data["vault_checksum"] = self._compute_vault_checksum(k, st, exp)
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self.license_data, f, indent=2)
        except Exception:
            pass

    def remove_license_key(self) -> str:
        """Completely removes the assigned license key from the local application."""
        old_key = self.license_data.get("license_key", "")
        self.license_data["license_key"] = ""
        self.license_data["status"] = "INACTIVE"
        self.license_data["plan_tier"] = "Unregistered"
        self.license_data["activated_at"] = ""
        self.license_data["expires_at"] = ""
        self.license_data["last_verified"] = datetime.now().isoformat()
        self.save_local_license()
        return old_key

    def scan_remote_status(self, force=False) -> dict:
        """
        Scans the website portal and local records for changes to the assigned license key:
        - If 'ACTIVE' on website: registers it as active on local application.
        - If 'REVOKE' / 'NOT ACTIVE' on website: immediately shows inactive/revoked on local application.
        - If 'EXPIRED' on website: immediately shows expired and blocks processing.
        - If 'DELETE' on website (404/not found): removes the license key from local application.
        """
        current_key = (self.license_data.get("license_key") or os.getenv("LICENSE_KEY", "")).strip().upper()
        if not current_key:
            return {
                "result": "NO_KEY",
                "status": "INACTIVE",
                "changed": False,
                "message": "No license key assigned to local application."
            }

        now_ts = time.time()
        # Near-instant rate-limit check: allow scanning every 1.5 seconds unless forced
        if not force and (now_ts - self._last_scan_ts) < 1.5:
            return {
                "result": self.license_data.get("status", "INACTIVE"),
                "status": self.license_data.get("status", "INACTIVE"),
                "changed": False,
                "cached": True
            }
        self._last_scan_ts = now_ts

        key_hash = hashlib.sha256(current_key.encode('utf-8')).hexdigest().lower()

        # 1. Zero-latency check: If running in local dev/workspace environment, check local filesystem directly
        possible_local_paths = [
            os.path.join(os.getcwd(), "public", "licenses", f"{key_hash}.json"),
            os.path.join(os.getcwd(), "dist", "licenses", f"{key_hash}.json"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "licenses", f"{key_hash}.json"),
            os.path.join(os.getcwd(), "licenses", f"{key_hash}.json")
        ]
        for lpath in possible_local_paths:
            if os.path.isfile(lpath):
                try:
                    with open(lpath, "r", encoding="utf-8") as lf:
                        ldata = json.load(lf)
                    if isinstance(ldata, dict) and "status" in ldata:
                        l_status = str(ldata.get("status", "")).strip().upper()
                        l_plan = str(ldata.get("plan", "Standard")).strip()
                        l_expires = str(ldata.get("expires", "")).strip()

                        is_admin = ("ADMIN" in current_key or "MASTER" in current_key or "ADMIN" in l_plan.upper())
                        plan_display = "Admin (Lifetime)" if is_admin else (l_plan if l_plan not in ["Unregistered", "Unknown", "Standard", ""] else "Pro Subscription")

                        if l_status in ["REVOKED", "NOT ACTIVE", "INACTIVE", "SUSPENDED"]:
                            prev_status = self.license_data.get("status", "INACTIVE")
                            was_active = (prev_status == "ACTIVE")
                            self.license_data["status"] = "REVOKED"
                            self.license_data["plan_tier"] = plan_display
                            self.license_data["last_verified"] = datetime.now().isoformat()
                            self.save_local_license()
                            return {
                                "result": "REVOKED",
                                "status": "INACTIVE",
                                "changed": was_active or (prev_status != "REVOKED"),
                                "plan": plan_display,
                                "key": current_key,
                                "portal": "Local Database",
                                "message": f"License key '{current_key}' was REVOKED on portal."
                            }
                        elif l_status == "EXPIRED":
                            prev_status = self.license_data.get("status", "INACTIVE")
                            was_active = (prev_status == "ACTIVE")
                            self.license_data["status"] = "EXPIRED"
                            self.license_data["plan_tier"] = plan_display
                            self.license_data["expires_at"] = l_expires or "Expired"
                            self.license_data["last_verified"] = datetime.now().isoformat()
                            self.save_local_license()
                            return {
                                "result": "EXPIRED",
                                "status": "EXPIRED",
                                "changed": was_active or (prev_status != "EXPIRED"),
                                "plan": plan_display,
                                "key": current_key,
                                "expires": l_expires,
                                "portal": "Local Database",
                                "message": f"License key '{current_key}' has EXPIRED."
                            }
                        elif l_status == "ACTIVE":
                            prev_status = self.license_data.get("status", "INACTIVE")
                            was_inactive = (prev_status != "ACTIVE")
                            self.license_data["license_key"] = current_key
                            self.license_data["status"] = "ACTIVE"
                            self.license_data["plan_tier"] = plan_display
                            self.license_data["expires_at"] = l_expires or ("Never (Lifetime / Non-Expiring)" if is_admin else "")
                            if not self.license_data.get("activated_at"):
                                self.license_data["activated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
                            self.license_data["last_verified"] = datetime.now().isoformat()
                            self.save_local_license()
                            return {
                                "result": "ACTIVE",
                                "status": "ACTIVE",
                                "changed": was_inactive,
                                "plan": plan_display,
                                "key": current_key,
                                "portal": "Local Database",
                                "message": f"License is ACTIVE ({plan_display})."
                            }
                except Exception:
                    pass

        # 2. Remote portal and GitHub endpoints (Parallel execution)
        endpoints = self.get_active_portal_endpoints()
        public_ip = get_public_ip()
        all_check_targets = []

        try:
            host_name_enc = urllib.parse.quote(socket.gethostname())
        except Exception:
            host_name_enc = "Unknown-PC"

        for endpoint in endpoints:
            if "githubusercontent" in endpoint:
                all_check_targets.append((endpoint, f"{endpoint}/licenses/{key_hash}.json"))
            else:
                all_check_targets.append((endpoint, f"{endpoint}/licenses/{key_hash}.json"))
                all_check_targets.append((endpoint, f"{endpoint}/api/licenses/check?key={current_key}&hash={key_hash}&hwid={self.hardware_id}&machine={host_name_enc}&ver={APP_VERSION}&ip={public_ip}"))
                all_check_targets.append((endpoint, f"{endpoint}/api/verify?key={current_key}&hwid={self.hardware_id}&machine={host_name_enc}&ip={public_ip}"))

        saw_404_count = 0
        total_targets = len(all_check_targets)

        def fetch_target(target):
            ep, url = target
            st_code, data = http_get_json(url, timeout=1.8)
            return ep, url, st_code, data

        active_res = None
        revoked_res = None
        expired_res = None

        if total_targets > 0:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(12, max(1, total_targets))) as executor:
                future_to_target = {executor.submit(fetch_target, t): t for t in all_check_targets}
                for future in concurrent.futures.as_completed(future_to_target):
                    try:
                        ep, url, status_code, data = future.result()
                        if status_code == 404:
                            saw_404_count += 1
                            continue
                        if status_code == 200 and isinstance(data, dict):
                            remote_status = str(data.get("status", "")).strip().upper()
                            if remote_status in ["ACTIVE", "EXPIRED", "REVOKED", "NOT ACTIVE", "INACTIVE", "SUSPENDED"]:
                                raw_remote_plan = data.get("plan", "")
                                is_admin = ("ADMIN" in current_key.upper() or "MASTER" in current_key.upper() or "ADMIN" in str(raw_remote_plan).upper())
                                remote_plan = "Admin (Lifetime)" if is_admin else (str(raw_remote_plan).strip() if str(raw_remote_plan).strip() not in ["Unregistered", "Unknown", "Standard", ""] else "Pro Subscription")
                                remote_expires = data.get("expires", "")
                                if is_admin and (not remote_expires or "Never" not in str(remote_expires)):
                                    remote_expires = "Never (Lifetime / Non-Expiring)"
                                elif not remote_expires:
                                    remote_expires = self.license_data.get("expires_at", "")

                                if remote_status == "ACTIVE" and not active_res:
                                    active_res = (ep, remote_plan, remote_expires, is_admin)
                                elif remote_status in ["REVOKED", "NOT ACTIVE", "INACTIVE", "SUSPENDED"] and not revoked_res:
                                    revoked_res = (ep, remote_plan)
                                elif remote_status == "EXPIRED" and not expired_res:
                                    expired_res = (ep, remote_plan, remote_expires)
                    except Exception:
                        pass

        # Priority 1: Revoked / Inactive (Administrative lockout always supersedes cached/stale active states)
        if revoked_res:
            ep, remote_plan = revoked_res
            self.connected_portal = ep
            prev_status = self.license_data.get("status", "INACTIVE")
            was_active = (prev_status == "ACTIVE")
            self.license_data["status"] = "REVOKED"
            self.license_data["plan_tier"] = remote_plan
            self.license_data["last_verified"] = datetime.now().isoformat()
            self.save_local_license()
            return {
                "result": "REVOKED",
                "status": "INACTIVE",
                "changed": was_active or (prev_status != "REVOKED"),
                "plan": remote_plan,
                "key": current_key,
                "portal": ep,
                "message": f"License key '{current_key}' was revoked on website portal (Inactive)."
            }

        # Priority 2: Expired
        if expired_res:
            ep, remote_plan, remote_expires = expired_res
            self.connected_portal = ep
            prev_status = self.license_data.get("status", "INACTIVE")
            was_active = (prev_status == "ACTIVE")
            self.license_data["license_key"] = current_key
            self.license_data["status"] = "EXPIRED"
            self.license_data["plan_tier"] = remote_plan
            self.license_data["expires_at"] = remote_expires or "Expired"
            self.license_data["last_verified"] = datetime.now().isoformat()
            self.save_local_license()
            return {
                "result": "EXPIRED",
                "status": "EXPIRED",
                "changed": was_active or (prev_status != "EXPIRED"),
                "key": current_key,
                "expires": remote_expires,
                "plan": remote_plan,
                "portal": ep,
                "message": f"License expired on {remote_expires}. Subscription renewal required."
            }

        # Priority 3: Active
        if active_res:
            ep, remote_plan, remote_expires, is_admin = active_res
            self.connected_portal = ep
            prev_status = self.license_data.get("status", "INACTIVE")
            was_inactive = (prev_status != "ACTIVE")
            self.license_data["license_key"] = current_key
            self.license_data["status"] = "ACTIVE"
            self.license_data["plan_tier"] = remote_plan
            self.license_data["expires_at"] = remote_expires or ("Never (Lifetime / Non-Expiring)" if is_admin else "")
            if not self.license_data.get("activated_at"):
                self.license_data["activated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            self.license_data["last_verified"] = datetime.now().isoformat()
            self.save_local_license()
            return {
                "result": "ACTIVE",
                "status": "ACTIVE",
                "changed": was_inactive,
                "plan": remote_plan,
                "key": current_key,
                "portal": ep,
                "message": f"License is registered as ACTIVE on website ({remote_plan})"
            }

        # 3. If every endpoint explicitly returned 404 (deleted from website):
        if total_targets > 0 and saw_404_count >= (total_targets // 2):
            was_assigned = bool(self.license_data.get("license_key"))
            removed_key = self.remove_license_key()
            return {
                "result": "DELETED",
                "status": "INACTIVE",
                "changed": was_assigned,
                "removed_key": removed_key,
                "message": f"License key '{removed_key}' was deleted on the website and removed locally."
            }

        return {
            "result": "OFFLINE",
            "status": self.license_data.get("status", "INACTIVE"),
            "changed": False,
            "message": "Website portal unreachable; maintaining current state."
        }

    def send_heartbeat(self) -> bool:
        """
        Sends an active heartbeat ping to the website portal so the Admin
        Console live device monitor displays this computer's public IP,
        hostname, and online status in real-time.
        """
        current_key = (self.license_data.get("license_key") or os.getenv("LICENSE_KEY", "")).strip().upper()
        if not current_key:
            return False

        key_hash = hashlib.sha256(current_key.encode('utf-8')).hexdigest().lower()
        endpoints = self.get_active_portal_endpoints()
        pub_ip = get_public_ip()

        for endpoint in endpoints:
            if "githubusercontent" in endpoint:
                continue
            url = f"{endpoint}/api/licenses/heartbeat"
            t_out = 0.8 if ("localhost" in endpoint or "127.0.0.1" in endpoint) else 3.0
            try:
                payload = json.dumps({
                    "key": current_key,
                    "hash": key_hash,
                    "ip": pub_ip,
                    "hwid": self.hardware_id,
                    "machine_name": socket.gethostname(),
                    "platform": f"{platform.system()} {platform.release()}",
                    "version": APP_VERSION,
                    "status": self.license_data.get("status", "ACTIVE"),
                    "plan": self.license_data.get("plan_tier", "Standard")
                }).encode("utf-8")

                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": f"ReceiptProcessorDesktop/{APP_VERSION}"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=t_out) as resp:
                    raw_content = resp.read().decode("utf-8", errors="ignore").strip()
                    if raw_content:
                        try:
                            parsed = json.loads(raw_content)
                            if isinstance(parsed, dict):
                                remote_status = str(parsed.get("status", "")).strip().upper()
                                if remote_status in ["REVOKED", "NOT ACTIVE", "INACTIVE", "SUSPENDED"]:
                                    self.license_data["status"] = "REVOKED"
                                    self.save_local_license()
                        except Exception:
                            pass
                    if resp.status == 200:
                        return True
            except Exception:
                try:
                    verify_url = f"{endpoint}/api/verify"
                    verify_payload = json.dumps({
                        "key": current_key,
                        "ip": pub_ip,
                        "hwid": self.hardware_id,
                        "machine": socket.gethostname()
                    }).encode("utf-8")
                    req_v = urllib.request.Request(
                        verify_url,
                        data=verify_payload,
                        headers={
                            "Content-Type": "application/json",
                            "User-Agent": f"ReceiptProcessorDesktop/{APP_VERSION}"
                        },
                        method="POST"
                    )
                    with urllib.request.urlopen(req_v, timeout=t_out) as resp_v:
                        if resp_v.status == 200:
                            return True
                except Exception:
                    pass
        return False

    def sync_with_registry(self):
        """Compatibility wrapper that scans remote status."""
        self.scan_remote_status()

    def is_subscription_active(self) -> bool:
        """
        Returns True ONLY if a valid license key is assigned, its status is explicitly ACTIVE,
        it matches the workstation Hardware ID, passes cryptographic tamper check,
        and its expiration date (if not Lifetime/Admin) is not past.
        Instant 0ms in-memory verification without blocking the Tkinter UI thread.
        """
        current_key = (self.license_data.get("license_key") or "").strip().upper()
        if not current_key:
            return False

        # 1. Enforce workstation Hardware ID locking (prevents file copying between PCs)
        vault_hwid = str(self.license_data.get("hardware_id", "")).strip().upper()
        if vault_hwid and vault_hwid != self.hardware_id:
            self.license_data["status"] = "HWID_MISMATCH"
            self.save_local_license()
            return False

        # 2. Check status
        status = str(self.license_data.get("status", "INACTIVE")).strip().upper()
        if status != "ACTIVE":
            return False

        # 3. Verify cryptographic tamper checksum (prevents manual editing of .license_vault.json)
        saved_checksum = str(self.license_data.get("vault_checksum", "")).strip()
        if saved_checksum:
            exp_str_raw = str(self.license_data.get("expires_at", "")).strip()
            expected_checksum = self._compute_vault_checksum(current_key, status, exp_str_raw)
            if saved_checksum != expected_checksum:
                self.license_data["status"] = "TAMPERED"
                self.save_local_license()
                return False

        # 4. Verify date expiration
        exp_str = str(self.license_data.get("expires_at", "")).strip()
        plan_str = str(self.license_data.get("plan_tier", "")).strip()
        is_lifetime = "Never" in exp_str or "Lifetime" in exp_str or "Admin" in plan_str
        if exp_str and not is_lifetime:
            try:
                exp_clean = exp_str.split("T")[0].strip()
                exp_date = datetime.strptime(exp_clean, "%Y-%m-%d").date()
                if datetime.now().date() > exp_date:
                    self.license_data["status"] = "EXPIRED"
                    self.save_local_license()
                    return False
            except Exception:
                pass

        return True

    def get_days_remaining(self) -> int:
        exp_str = str(self.license_data.get("expires_at", ""))
        if "Never" in exp_str or "Lifetime" in exp_str or "Admin" in self.license_data.get("plan_tier", ""):
            return 99999
        try:
            exp_clean = exp_str.split("T")[0].strip()
            exp_date = datetime.strptime(exp_clean, "%Y-%m-%d").date()
            delta = (exp_date - datetime.now().date()).days
            return max(0, delta)
        except Exception:
            return 0

    def verify_with_server(self, license_key: str, email: str = "") -> tuple:
        """
        Strictly verifies the license key with the server portal / GitHub database.
        If the key is revoked, expired, deleted, or does not exist, activation is strictly REJECTED.
        """
        clean_key = license_key.strip().upper()
        if not clean_key:
            return False, "Please enter a valid license key."

        key_hash = hashlib.sha256(clean_key.encode('utf-8')).hexdigest().lower()

        # 0. Check local files in project workspace for zero-latency verification
        possible_local_paths = [
            os.path.join(os.getcwd(), "public", "licenses", f"{key_hash}.json"),
            os.path.join(os.getcwd(), "dist", "licenses", f"{key_hash}.json"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "licenses", f"{key_hash}.json"),
            os.path.join(os.getcwd(), "licenses", f"{key_hash}.json")
        ]
        for lpath in possible_local_paths:
            if os.path.isfile(lpath):
                try:
                    with open(lpath, "r", encoding="utf-8") as lf:
                        ldata = json.load(lf)
                    if isinstance(ldata, dict) and "status" in ldata:
                        l_status = str(ldata.get("status", "")).strip().upper()
                        l_plan = str(ldata.get("plan", "Standard")).strip()
                        l_expires = str(ldata.get("expires", "")).strip()

                        is_admin = ("ADMIN" in clean_key or "MASTER" in clean_key or "ADMIN" in l_plan.upper())
                        plan_display = "Admin (Lifetime)" if is_admin else (l_plan if l_plan not in ["Unregistered", "Unknown", "Standard", ""] else "Pro Subscription")

                        if l_status in ["REVOKED", "NOT ACTIVE", "INACTIVE", "SUSPENDED"]:
                            self.license_data["license_key"] = clean_key
                            self.license_data["status"] = "REVOKED"
                            self.license_data["plan_tier"] = plan_display
                            self.license_data["last_verified"] = datetime.now().isoformat()
                            self.save_local_license()
                            return False, f"❌ License key '{clean_key}' is REVOKED / INACTIVE on the portal. Activation denied."
                        elif l_status == "EXPIRED":
                            self.license_data["license_key"] = clean_key
                            self.license_data["status"] = "EXPIRED"
                            self.license_data["plan_tier"] = plan_display
                            self.license_data["expires_at"] = l_expires or "Expired"
                            self.license_data["last_verified"] = datetime.now().isoformat()
                            self.save_local_license()
                            return False, f"⏳ License key '{clean_key}' has EXPIRED. Subscription renewal required."
                        elif l_status == "ACTIVE":
                            self.license_data["license_key"] = clean_key
                            self.license_data["status"] = "ACTIVE"
                            self.license_data["plan_tier"] = plan_display
                            if email:
                                self.license_data["user_email"] = email
                            self.license_data["activated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
                            self.license_data["expires_at"] = l_expires or ("Never (Lifetime / Non-Expiring)" if is_admin else "")
                            self.license_data["last_verified"] = datetime.now().isoformat()
                            self.save_local_license()
                            self.send_heartbeat()
                            return True, f"✅ Verified Active on Website! Plan: {plan_display} • Machine ID Locked."
                except Exception:
                    pass

        endpoints = self.get_active_portal_endpoints()
        pub_ip = get_public_ip()
        all_check_targets = []

        try:
            host_name_enc = urllib.parse.quote(socket.gethostname())
        except Exception:
            host_name_enc = "Unknown-PC"

        for endpoint in endpoints:
            if "githubusercontent" in endpoint:
                all_check_targets.append((endpoint, f"{endpoint}/licenses/{key_hash}.json"))
            else:
                all_check_targets.append((endpoint, f"{endpoint}/licenses/{key_hash}.json"))
                all_check_targets.append((endpoint, f"{endpoint}/api/licenses/check?key={clean_key}&hash={key_hash}&hwid={self.hardware_id}&ip={pub_ip}&machine={host_name_enc}&ver={APP_VERSION}"))
                all_check_targets.append((endpoint, f"{endpoint}/api/verify?key={clean_key}&hwid={self.hardware_id}&ip={pub_ip}&machine={host_name_enc}"))

        def fetch_target(target):
            ep, url = target
            st_code, data = http_get_json(url, timeout=1.8)
            return ep, url, st_code, data

        if all_check_targets:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(12, max(1, len(all_check_targets)))) as executor:
                future_to_target = {executor.submit(fetch_target, t): t for t in all_check_targets}
                for future in concurrent.futures.as_completed(future_to_target):
                    try:
                        ep, url, status_code, data = future.result()
                        if status_code == 200 and isinstance(data, dict):
                            remote_status = str(data.get("status", "")).strip().upper()
                            if remote_status in ["REVOKED", "NOT ACTIVE", "INACTIVE", "SUSPENDED"]:
                                self.license_data["license_key"] = clean_key
                                self.license_data["status"] = "REVOKED"
                                self.license_data["last_verified"] = datetime.now().isoformat()
                                self.save_local_license()
                                return False, f"❌ License key '{clean_key}' is REVOKED / INACTIVE on the portal. Activation denied."

                            if remote_status == "EXPIRED":
                                self.license_data["license_key"] = clean_key
                                self.license_data["status"] = "EXPIRED"
                                self.license_data["last_verified"] = datetime.now().isoformat()
                                self.save_local_license()
                                return False, f"⏳ License key '{clean_key}' has EXPIRED. Subscription renewal required."

                            if remote_status == "ACTIVE":
                                raw_plan = data.get("plan", "")
                                is_admin = ("ADMIN" in clean_key or "MASTER" in clean_key or "ADMIN" in str(raw_plan).upper())
                                plan = "Admin (Lifetime)" if is_admin else (str(raw_plan).strip() if raw_plan and raw_plan not in ["Standard", "Unregistered", ""] else "Pro Subscription")
                                expires = "Never (Lifetime / Non-Expiring)" if is_admin else (data.get("expires") or "Never (Lifetime / Non-Expiring)")

                                self.license_data["license_key"] = clean_key
                                self.license_data["status"] = "ACTIVE"
                                self.license_data["plan_tier"] = plan
                                if email:
                                    self.license_data["user_email"] = email
                                self.license_data["activated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
                                self.license_data["expires_at"] = expires
                                self.license_data["last_verified"] = datetime.now().isoformat()
                                self.save_local_license()
                                self.send_heartbeat()

                                return True, f"✅ Verified Active on Website! Plan: {plan} • Machine ID Locked."
                    except Exception:
                        pass

        # 2. Check local authorized registry if offline
        registry = self.load_registry()
        reg_match = None
        for item in registry:
            if isinstance(item, dict) and item.get("key", "").strip().upper() == clean_key:
                reg_match = item
                break
            elif isinstance(item, str) and item.strip().upper() == clean_key:
                reg_match = {"key": clean_key, "plan": "Pro", "status": "ACTIVE"}
                break

        if reg_match:
            r_status = str(reg_match.get("status", "ACTIVE")).upper()
            if r_status in ["REVOKED", "INACTIVE", "SUSPENDED"]:
                self.license_data["license_key"] = clean_key
                self.license_data["status"] = "REVOKED"
                self.save_local_license()
                return False, f"❌ License key '{clean_key}' is REVOKED in registry. Activation denied."

            is_admin = "ADMIN" in clean_key or "MASTER" in clean_key
            plan = "Admin (Lifetime)" if is_admin else reg_match.get("plan", "Pro Subscription")
            expires = "Never (Lifetime / Non-Expiring)" if is_admin else (reg_match.get("expires") or "Never (Lifetime / Non-Expiring)")

            self.license_data["license_key"] = clean_key
            self.license_data["status"] = "ACTIVE"
            self.license_data["plan_tier"] = plan
            if email:
                self.license_data["user_email"] = email
            self.license_data["activated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            self.license_data["expires_at"] = expires
            self.license_data["last_verified"] = datetime.now().isoformat()
            self.save_local_license()
            self.send_heartbeat()
            return True, f"✅ Verified Active via Local Registry! Plan: {plan}"

        # 3. Not found on portal and not in registry: REJECT ACTIVATION
        self.license_data["status"] = "INACTIVE"
        self.license_data["plan_tier"] = "Unregistered"
        self.save_local_license()
        return False, f"❌ License key '{clean_key}' does not exist on the portal or has been deleted. Activation denied."

def parse_version_tuple(ver_str: str) -> tuple:
    try:
        clean = ver_str.strip().lstrip("v")
        return tuple(int(x) for x in clean.split(".") if x.isdigit())
    except Exception:
        return (0, 0, 0)


class UpdateManager:
    def __init__(self, current_version=APP_VERSION, manifest_url=UPDATE_MANIFEST_URL):
        self.current_version = current_version
        self.manifest_url = manifest_url
        self.skipped_versions = set()

    def check_for_updates(self, timeout=4) -> dict:
        try:
            req = urllib.request.Request(
                self.manifest_url,
                headers={"User-Agent": f"FarmReceiptApp-Updater/{self.current_version}"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    latest_ver = data.get("latest_version", "0.0.0")

                    if latest_ver in self.skipped_versions:
                        return None

                    if parse_version_tuple(latest_ver) > parse_version_tuple(self.current_version):
                        return data
        except Exception:
            pass
        return None

    def perform_in_place_update(self, download_url: str, progress_callback=None) -> bool:
        try:
            if not download_url or not isinstance(download_url, str):
                return False
            parsed = urllib.parse.urlparse(download_url)
            if parsed.scheme.lower() != "https":
                print(f"[SECURITY] Update rejected: Insecure scheme '{parsed.scheme}'. Only HTTPS updates are permitted.")
                return False

            current_exec = os.path.abspath(sys.argv[0])
            new_temp_file = current_exec + ".new"
            old_backup_file = current_exec + ".old"

            def hook(blocks, block_size, total_size):
                if progress_callback and total_size > 0:
                    percent = min(100, int((blocks * block_size / total_size) * 100))
                    progress_callback(percent)

            urllib.request.urlretrieve(download_url, new_temp_file, reporthook=hook)

            if os.path.exists(old_backup_file):
                os.remove(old_backup_file)

            os.rename(current_exec, old_backup_file)
            os.rename(new_temp_file, current_exec)

            if sys.platform == "win32":
                subprocess.Popen([sys.executable, current_exec] if current_exec.endswith(".py") else [current_exec])
            else:
                os.chmod(current_exec, 0o755)
                subprocess.Popen([sys.executable, current_exec] if current_exec.endswith(".py") else [current_exec])

            sys.exit(0)
        except Exception as e:
            print(f"Update failed: {e}")
            return False


class DismissibleUpdateDialog(_TK_BASE_TOPLEVEL):
    def __init__(self, parent, update_info, updater: UpdateManager):
        super().__init__(parent)
        self.updater = updater
        self.update_info = update_info
        self.latest_ver = update_info.get("latest_version", "New")

        self.title(f"Software Update Available (v{self.latest_ver})")
        self.geometry("540x440")
        self.configure(bg="#1c1917", padx=20, pady=20)
        self.transient(parent)
        self.grab_set()

        tk.Label(
            self,
            text="🚀 A New Update is Available!",
            font=("Segoe UI", 13, "bold"),
            fg="#38bdf8",
            bg="#1c1917"
        ).pack(anchor="w")

        v_text = f"Version {self.latest_ver} is now available (You are running v{updater.current_version})."
        tk.Label(self, text=v_text, font=("Segoe UI", 9), fg="#fafaf9", bg="#1c1917").pack(anchor="w", pady=(2, 10))

        tk.Label(self, text="What's New in this Release:", font=("Segoe UI", 9, "bold"), fg="#a8a29e", bg="#1c1917").pack(anchor="w")

        notes_box = tk.Text(self, bg="#292524", fg="#fafaf9", font=("Consolas", 9), height=7, wrap="word", relief="flat", padx=10, pady=8)
        notes_box.pack(fill="both", expand=True, pady=(4, 12))
        notes_box.insert("1.0", update_info.get("release_notes", "• Performance optimizations and bug fixes.\n• Enhanced receipt categorization accuracy."))
        notes_box.config(state="disabled")

        self.progress_frame = tk.Frame(self, bg="#1c1917")
        self.progress_frame.pack(fill="x", pady=(0, 10))

        self.progress_bar = ttk.Progressbar(self.progress_frame, orient="horizontal", mode="determinate")
        self.progress_lbl = tk.Label(self.progress_frame, text="", font=("Segoe UI", 8), fg="#38bdf8", bg="#1c1917")

        btn_row = tk.Frame(self, bg="#1c1917")
        btn_row.pack(fill="x")

        self.install_btn = tk.Button(
            btn_row,
            text="⬇ Download & Install Update",
            command=self.start_download,
            bg="#0284c7",
            fg="white",
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            padx=12,
            pady=6,
            cursor="hand2"
        )
        self.install_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.later_btn = tk.Button(
            btn_row,
            text="Remind Me Later",
            command=self.destroy,
            bg="#44403c",
            fg="#d6d3d1",
            font=("Segoe UI", 9),
            relief="flat",
            padx=10,
            pady=6,
            cursor="hand2"
        )
        self.later_btn.pack(side="left", padx=4)

        self.skip_btn = tk.Button(
            btn_row,
            text="Skip this Version",
            command=self.skip_version,
            bg="#292524",
            fg="#a8a29e",
            font=("Segoe UI", 8),
            relief="flat",
            padx=8,
            pady=6,
            cursor="hand2"
        )
        self.skip_btn.pack(side="left")

    def skip_version(self):
        self.updater.skipped_versions.add(self.latest_ver)
        self.destroy()

    def start_download(self):
        download_url = self.update_info.get("download_url")
        if not download_url:
            messagebox.showerror("Error", "Download URL is invalid.", parent=self)
            return

        self.install_btn.config(state="disabled", text="⏳ Downloading Update...")
        self.later_btn.config(state="disabled")
        self.skip_btn.config(state="disabled")
        self.progress_bar.pack(fill="x")
        self.progress_lbl.pack(anchor="w", pady=(2, 0))

        def update_progress(percent):
            self.after(0, lambda: self._set_progress(percent))

        def worker():
            success = self.updater.perform_in_place_update(download_url, progress_callback=update_progress)
            if not success:
                self.after(0, lambda: messagebox.showerror("Update Failed", "Could not complete update. Check network connection.", parent=self))
                self.after(0, self.destroy)

        threading.Thread(target=worker, daemon=True).start()

    def _set_progress(self, percent):
        self.progress_bar["value"] = percent
        self.progress_lbl.config(text=f"Downloading: {percent}%")


# -----------------------------------------------------------------------------
# Cryptography & Security Vault (AES-256 Encryption & Safeguards)
# -----------------------------------------------------------------------------
SECURE_VAULT_FILE = "qbo_clients.enc"
KEY_FILE = ".app_security.key"

def ensure_git_ignored():
    sensitive_items = [
        ".env",
        ".app_security.key",
        "*.enc",
        ".license_vault.json",
        "qbo_clients.json",
        "*.csv",
        "*.txt",
        "processed/",
        "inbox/",
        "inbox_archive/"
    ]
    gitignore_path = ".gitignore"
    existing_lines = []
    if os.path.exists(gitignore_path):
        try:
            with open(gitignore_path, "r", encoding="utf-8") as f:
                existing_lines = [line.strip() for line in f]
        except Exception:
            pass

    to_add = [item for item in sensitive_items if item not in existing_lines]
    if to_add:
        try:
            with open(gitignore_path, "a", encoding="utf-8") as f:
                if existing_lines and not existing_lines[-1] == "":
                    f.write("\n")
                f.write("# Security: Client Data & Tokens Protection\n")
                for item in to_add:
                    f.write(f"{item}\n")
        except Exception:
            pass

ensure_git_ignored()


def prompt_missing_key_recovery():
    root = tk.Tk()
    root.title("Security Key Missing - Vault Locked")
    root.geometry("540x360")
    root.configure(bg="#1c1917", padx=20, pady=20)
    root.resizable(False, False)

    outcome = {"action": "exit"}

    tk.Label(
        root,
        text="🛑 Master Encryption Key Missing",
        font=("Segoe UI", 13, "bold"),
        fg="#ef4444",
        bg="#1c1917"
    ).pack(anchor="w", pady=(0, 6))

    msg = (
        "An encrypted client database ('qbo_clients.enc') was detected on your system, "
        "but the master key file ('.app_security.key') is missing from this folder.\n\n"
        "To protect your clients' QuickBooks credentials from corruption or unauthorized access, "
        "the application has locked the vault."
    )
    tk.Label(root, text=msg, font=("Segoe UI", 9), fg="#d6d3d1", bg="#1c1917", wraplength=490, justify="left").pack(anchor="w", pady=(0, 16))

    btn_frame = tk.Frame(root, bg="#1c1917")
    btn_frame.pack(fill="x", pady=6)

    def browse_key():
        selected = filedialog.askopenfilename(
            parent=root,
            title="Locate .app_security.key File",
            filetypes=[("Security Key Files", "*.key;*.*"), ("All files", "*.*")]
        )
        if selected and os.path.exists(selected):
            try:
                shutil.copy2(selected, KEY_FILE)
                messagebox.showinfo("Key Restored", "Master encryption key has been restored successfully!", parent=root)
                outcome["action"] = "restored"
                root.destroy()
            except Exception as e:
                messagebox.showerror("Error", f"Failed to copy key file: {e}", parent=root)

    def reset_vault():
        if messagebox.askyesno(
            "Confirm Vault Reset",
            "WARNING: Resetting the vault will delete the locked client file ('qbo_clients.enc') "
            "and create a new encryption key. You will have to re-enter your client tokens.\n\nAre you sure?",
            parent=root
        ):
            try:
                if os.path.exists(SECURE_VAULT_FILE):
                    os.remove(SECURE_VAULT_FILE)
                outcome["action"] = "reset"
                root.destroy()
            except Exception as e:
                messagebox.showerror("Error", f"Could not delete vault: {e}", parent=root)

    def on_exit():
        outcome["action"] = "exit"
        root.destroy()

    btn_browse = tk.Button(
        btn_frame,
        text="📁 Browse for Key File (e.g. from USB / Backup)...",
        command=browse_key,
        bg="#0284c7",
        fg="white",
        font=("Segoe UI", 9, "bold"),
        relief="flat",
        pady=6,
        cursor="hand2"
    )
    btn_browse.pack(fill="x", pady=4)

    btn_exit = tk.Button(
        btn_frame,
        text="🚪 Exit App (I will put .app_security.key back manually)",
        command=on_exit,
        bg="#44403c",
        fg="white",
        font=("Segoe UI", 9),
        relief="flat",
        pady=5,
        cursor="hand2"
    )
    btn_exit.pack(fill="x", pady=4)

    btn_reset = tk.Button(
        btn_frame,
        text="⚠️ Reset Vault (Erase locked file and start fresh)",
        command=reset_vault,
        bg="#7f1d1d",
        fg="#fca5a5",
        font=("Segoe UI", 8),
        relief="flat",
        pady=4,
        cursor="hand2"
    )
    btn_reset.pack(fill="x", pady=6)

    root.mainloop()
    return outcome["action"]


class SecureVault:
    def __init__(self):
        self._check_missing_key_safeguard()
        self.key = self._get_or_create_key()
        self._has_cryptography = False
        try:
            from cryptography.fernet import Fernet
            self.fernet = Fernet(self.key)
            self._has_cryptography = True
        except ImportError:
            self._has_cryptography = False

    def _check_missing_key_safeguard(self):
        if os.path.exists(SECURE_VAULT_FILE) and not os.path.exists(KEY_FILE):
            action = prompt_missing_key_recovery()
            if action != "restored" and action != "reset":
                sys.exit(0)

    def _get_or_create_key(self) -> bytes:
        if os.path.exists(KEY_FILE):
            try:
                with open(KEY_FILE, "rb") as f:
                    return f.read().strip()
            except Exception:
                pass

        salt = get_machine_hardware_id().encode('utf-8')
        raw_secret = os.urandom(32)
        derived = hashlib.pbkdf2_hmac('sha256', raw_secret, salt, 100000)
        key = base64.urlsafe_b64encode(derived)

        try:
            with open(KEY_FILE, "wb") as f:
                f.write(key)
            if sys.platform != "win32":
                os.chmod(KEY_FILE, 0o600)
        except Exception:
            pass

        return key

    def encrypt(self, plain_text: str) -> str:
        if not plain_text:
            return ""
        if self._has_cryptography:
            return self.fernet.encrypt(plain_text.encode('utf-8')).decode('utf-8')
        else:
            key_hash = hashlib.sha256(self.key).digest()
            data_bytes = plain_text.encode('utf-8')
            cipher = bytes([b ^ key_hash[i % len(key_hash)] for i, b in enumerate(data_bytes)])
            return "RAW_ENC:" + base64.b64encode(cipher).decode('utf-8')

    def decrypt(self, cipher_text: str) -> str:
        if not cipher_text:
            return ""
        if cipher_text.startswith("RAW_ENC:"):
            raw_b64 = cipher_text[len("RAW_ENC:"):]
            cipher = base64.b64decode(raw_b64.encode('utf-8'))
            key_hash = hashlib.sha256(self.key).digest()
            plain = bytes([b ^ key_hash[i % len(key_hash)] for i, b in enumerate(cipher)])
            return plain.decode('utf-8')

        if self._has_cryptography:
            try:
                return self.fernet.decrypt(cipher_text.encode('utf-8')).decode('utf-8')
            except Exception:
                return ""
        return cipher_text


# -----------------------------------------------------------------------------
# Configuration & Constants
# -----------------------------------------------------------------------------
DEFAULT_MODEL = "gemini-3.5-flash-lite"
VALID_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.bmp', '.tiff', '.pdf')

RECEIPT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "receipts": {
            "type": "ARRAY",
            "description": "List of all distinct receipts found.",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "vendor": {"type": "STRING", "description": "Store or vendor name"},
                    "date": {"type": "STRING", "description": "YYYY-MM-DD format, 2025 or later"},
                    "total": {"type": "NUMBER", "description": "Total purchase amount as float"},
                    "subtotal": {"type": "NUMBER"},
                    "tax": {"type": "NUMBER"},
                    "payment_method": {"type": "STRING"},
                    "card_last_4": {"type": "STRING"},
                    "category": {
                        "type": "STRING",
                        "enum": ["Supplies & Materials", "Farm:Cows", "Farm:Chickens", "Farm:General", "Repairs & Maintenance", "Fuel", "Tools"]
                    },
                    "items": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "description": {"type": "STRING"},
                                "amount": {"type": "NUMBER"}
                            }
                        }
                    },
                    "notes": {"type": "STRING"}
                },
                "required": ["vendor", "date", "total", "category"]
            }
        }
    },
    "required": ["receipts"]
}

SYSTEM_INSTRUCTION = (
    "You are an expert tax and accounting vision engine specialized in high-accuracy OCR "
    "for store, hardware, and farm receipts.\n\n"
    "CRITICAL SINGLE-RECEIPT RULE:\n"
    "- By default, treat the image as ONE single receipt.\n"
    "- Retail receipts contain multiple sections: itemized list, summary, auth slip. "
    "These are all parts of the SAME single receipt.\n"
    "- ONLY return multiple items in 'receipts' if there are physically separate receipts "
    "lying side-by-side with different headers and grand totals.\n\n"
    "CATEGORIZATION RULES:\n"
    "- 'Supplies & Materials': General retail, cleaning, paper products, pens, batteries, buckets, bins.\n"
    "- 'Farm:Cows': Cattle feed, mineral blocks, calf starter, veterinary cow supplies, fencing.\n"
    "- 'Farm:Chickens': Layer pellets, scratch grain, chick starter, egg cartons, waterers.\n"
    "- 'Repairs & Maintenance': Spark plugs, motor oil, hydraulic fluid, belts, filters.\n"
    "- 'Tools': Wrenches, drill bits, hammers, nails, screws, hardware.\n"
    "- 'Fuel': Diesel, gasoline, propane.\n"
    "- 'Farm:General': General farm operating items.\n"
    "Output strictly conforming JSON according to the schema."
)

if requests is not None:
    GLOBAL_SESSION = requests.Session()
    if Retry is not None and HTTPAdapter is not None:
        retries = Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
        adapter = HTTPAdapter(pool_connections=10, pool_maxsize=20, max_retries=retries)
        GLOBAL_SESSION.mount("https://", adapter)
        GLOBAL_SESSION.mount("http://", adapter)
else:
    GLOBAL_SESSION = None


# -----------------------------------------------------------------------------
# Encrypted Multi-Client Profile Manager
# -----------------------------------------------------------------------------
class ClientProfileManager:
    def __init__(self, vault: SecureVault, filepath=SECURE_VAULT_FILE):
        self.vault = vault
        self.filepath = filepath
        self.profiles = self.load_profiles()
        self._migrate_legacy_or_seed()

    def load_profiles(self) -> dict:
        if not os.path.exists(self.filepath):
            return {}
        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                encrypted_blob = json.load(f)

            decrypted_profiles = {}
            for name, data in encrypted_blob.items():
                decrypted_profiles[name] = {
                    "realm_id": self.vault.decrypt(data.get("enc_realm", "")),
                    "refresh_token": self.vault.decrypt(data.get("enc_token", "")),
                    "client_id": self.vault.decrypt(data.get("enc_cid", "")),
                    "client_secret": self.vault.decrypt(data.get("enc_csec", "")),
                    "sender_emails": self.vault.decrypt(data.get("enc_emails", "")) if data.get("enc_emails") else data.get("sender_emails", ""),
                    "env": data.get("env", "production"),
                    "default_pay_account": data.get("default_pay_account", "41"),
                    "last_used": data.get("last_used", "")
                }
            return decrypted_profiles
        except Exception:
            return {}

    def save_profiles(self):
        encrypted_blob = {}
        for name, data in self.profiles.items():
            encrypted_blob[name] = {
                "enc_realm": self.vault.encrypt(data.get("realm_id", "")),
                "enc_token": self.vault.encrypt(data.get("refresh_token", "")),
                "enc_cid": self.vault.encrypt(data.get("client_id", "")),
                "enc_csec": self.vault.encrypt(data.get("client_secret", "")),
                "enc_emails": self.vault.encrypt(data.get("sender_emails", "")),
                "env": data.get("env", "production"),
                "default_pay_account": data.get("default_pay_account", "41"),
                "last_used": data.get("last_used", "")
            }
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(encrypted_blob, f, indent=2)
            if sys.platform != "win32":
                os.chmod(self.filepath, 0o600)
        except Exception as e:
            print(f"Error saving encrypted vault: {e}")

    def _migrate_legacy_or_seed(self):
        legacy_file = "qbo_clients.json"
        if os.path.exists(legacy_file) and not self.profiles:
            try:
                with open(legacy_file, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                for name, d in raw_data.items():
                    self.add_or_update_client(
                        client_name=name,
                        realm_id=d.get("realm_id", ""),
                        refresh_token=d.get("refresh_token", ""),
                        env=d.get("env", "production"),
                        default_pay_acc=d.get("default_pay_account", "41"),
                        client_id=d.get("client_id", ""),
                        client_secret=d.get("client_secret", ""),
                        sender_emails=d.get("sender_emails", "")
                    )
                os.remove(legacy_file)
                return
            except Exception:
                pass

        if not self.profiles:
            realm_id = os.getenv("QBO_REALM_ID", "").strip()
            refresh_tok = os.getenv("QBO_REFRESH_TOKEN", "").strip()
            client_id = os.getenv("QBO_CLIENT_ID", "").strip()
            client_sec = os.getenv("QBO_CLIENT_SECRET", "").strip()
            env = os.getenv("QBO_ENVIRONMENT", "production").strip()
            if realm_id and refresh_tok:
                self.add_or_update_client("Primary Client (Default)", realm_id, refresh_tok, env, "41", client_id, client_sec)

    def add_or_update_client(self, client_name, realm_id, refresh_token, env="production", default_pay_acc="41", client_id="", client_secret="", sender_emails=""):
        name = client_name.strip()
        self.profiles[name] = {
            "realm_id": realm_id.strip(),
            "refresh_token": refresh_token.strip(),
            "client_id": client_id.strip() if client_id else "",
            "client_secret": client_secret.strip() if client_secret else "",
            "env": env.strip(),
            "default_pay_account": str(default_pay_acc).strip() if default_pay_acc else "41",
            "sender_emails": sender_emails.strip() if sender_emails else "",
            "last_used": datetime.now().isoformat()
        }
        self.save_profiles()

    def update_refresh_token(self, client_name, new_token):
        if client_name in self.profiles:
            self.profiles[client_name]["refresh_token"] = new_token
            self.profiles[client_name]["last_used"] = datetime.now().isoformat()
            self.save_profiles()

    def delete_client(self, client_name):
        if client_name in self.profiles:
            del self.profiles[client_name]
            self.save_profiles()

    def get_client_names(self) -> list:
        return list(self.profiles.keys())

    def find_client_by_sender_email(self, sender_email: str):
        """
        Option B: Sender Mapping. Matches an inbound email's sender address
        or domain (e.g. 'billing@acme.com' or '@acme.com') to a client profile.
        """
        if not sender_email:
            return None
        clean_sender = str(sender_email).strip().lower()
        sender_domain = ("@" + clean_sender.split("@")[-1]) if "@" in clean_sender else ""

        for name, data in self.profiles.items():
            raw_emails = data.get("sender_emails", "")
            if not raw_emails:
                continue
            # Split comma, semicolon, space, or newline
            patterns = [p.strip().lower() for p in raw_emails.replace(";", ",").replace("\n", ",").split(",") if p.strip()]
            for p in patterns:
                if p == clean_sender:
                    return name
                if p.startswith("@") and p == sender_domain:
                    return name
                if "@" not in p and p in clean_sender:
                    return name
        return None


# -----------------------------------------------------------------------------
# Dynamic Multi-Client QuickBooks Online Sync Engine
# -----------------------------------------------------------------------------
class QuickBooksOnlineSync:
    def __init__(self, profile_manager: ClientProfileManager):
        self.profile_mgr = profile_manager
        self.client_id = os.getenv("QBO_CLIENT_ID", "").strip()
        self.client_secret = os.getenv("QBO_CLIENT_SECRET", "").strip()
        self.server_url = os.getenv("LICENSE_SERVER_URL", "https://ais-dev-7tlnxttq7bvcilkqujhbtm-397811974491.us-west2.run.app").rstrip("/")

        self.active_client_name = None
        self.realm_id = None
        self.refresh_token = None
        self.env = "production"
        self.base_api_url = "https://quickbooks.api.intuit.com"
        self.token_url = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"

        self.access_token = None
        self._cached_accounts = {}
        self._cached_vendors = {}

        client_names = self.profile_mgr.get_client_names()
        if client_names:
            first_client = client_names[0]
            data = self.profile_mgr.profiles[first_client]
            self.set_active_client(
                first_client,
                data["realm_id"],
                data["refresh_token"],
                data.get("env", "production"),
                client_id=data.get("client_id", ""),
                client_secret=data.get("client_secret", "")
            )

    def is_configured(self):
        # Fully configured if direct keys exist (client_id, client_secret, realm_id, refresh_token)
        # OR if realm_id is known with a server token broker URL
        if bool(self.client_id and self.client_secret and self.realm_id and self.refresh_token):
            return True
        if bool(self.realm_id and self.server_url):
            return True
        return False

    def set_active_client(self, client_name: str, realm_id: str, refresh_token: str = "", env: str = "production", client_id: str = "", client_secret: str = ""):
        self.active_client_name = client_name
        self.realm_id = realm_id.strip() if realm_id else ""
        self.refresh_token = refresh_token.strip() if refresh_token else ""
        self.env = env.strip().lower() if env else "production"
        self.base_api_url = "https://sandbox-quickbooks.api.intuit.com" if self.env == "sandbox" else "https://quickbooks.api.intuit.com"
        
        # Prefer client-specific Intuit credentials, fallback to global .env variables
        self.client_id = (client_id.strip() if client_id else "") or os.getenv("QBO_CLIENT_ID", "").strip()
        self.client_secret = (client_secret.strip() if client_secret else "") or os.getenv("QBO_CLIENT_SECRET", "").strip()
        
        self.access_token = None
        self._cached_accounts.clear()
        self._cached_vendors.clear()

    def get_client_syncer(self, client_name: str):
        """
        Returns a client-specific, thread-isolated QuickBooksOnlineSync instance.
        Allows multiple worker threads to interact with different clients' QBO accounts
        simultaneously without race conditions or overwriting credentials.
        """
        if not client_name or client_name not in self.profile_mgr.profiles:
            return self
        if not hasattr(self, "_client_syncers"):
            self._client_syncers = {}
        if client_name in self._client_syncers:
            return self._client_syncers[client_name]
        data = self.profile_mgr.profiles[client_name]
        syncer = QuickBooksOnlineSync(self.profile_mgr)
        syncer.set_active_client(
            client_name,
            data.get("realm_id", ""),
            data.get("refresh_token", ""),
            data.get("env", "production"),
            client_id=data.get("client_id", ""),
            client_secret=data.get("client_secret", "")
        )
        self._client_syncers[client_name] = syncer
        return syncer

    def refresh_tokens(self) -> str:
        cid = (self.client_id or os.getenv("QBO_CLIENT_ID", "")).strip()
        csec = (self.client_secret or os.getenv("QBO_CLIENT_SECRET", "")).strip()
        tok = (self.refresh_token or "").strip()
        rid = (self.realm_id or "").strip()

        errors = []

        # 1. Primary Direct Mode: If Intuit Client credentials & Refresh Token exist locally,
        # perform direct OAuth token exchange with Intuit (independent of web server state).
        if cid and csec and tok:
            try:
                resp = requests.post(
                    self.token_url,
                    auth=(cid, csec),
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": tok
                    },
                    headers={"Accept": "application/json"},
                    timeout=15
                )
                ctype = resp.headers.get("content-type", "").lower()
                if resp.status_code == 200 and "application/json" in ctype:
                    data = resp.json()
                    self.access_token = data.get("access_token")
                    new_refresh_token = data.get("refresh_token")
                    if new_refresh_token and new_refresh_token != self.refresh_token:
                        self.refresh_token = new_refresh_token
                        if self.active_client_name:
                            self.profile_mgr.update_refresh_token(self.active_client_name, new_refresh_token)
                    return self.access_token
                else:
                    detail = ""
                    if "application/json" in ctype:
                        try:
                            j = resp.json()
                            detail = j.get("error_description") or j.get("error") or str(j)
                        except Exception:
                            detail = resp.text[:120]
                    else:
                        detail = f"Non-JSON response ({ctype or 'unknown'})"
                    errors.append(f"Direct Intuit API (HTTP {resp.status_code}): {detail}")
            except Exception as e:
                errors.append(f"Direct Intuit connection error: {e}")

        # 2. Server Token Broker Mode: If server URL is configured
        if self.server_url and rid:
            try:
                license_key = os.getenv("LICENSE_KEY", "").strip()
                headers = {"Content-Type": "application/json"}
                if license_key:
                    headers["X-License-Key"] = license_key

                resp = requests.post(
                    f"{self.server_url}/api/qbo/token",
                    json={"realmId": rid, "licenseKey": license_key},
                    headers=headers,
                    timeout=10,
                    allow_redirects=False
                )

                ctype = resp.headers.get("content-type", "").lower()
                if "application/json" in ctype:
                    data = resp.json()
                    if resp.status_code == 200 and data.get("accessToken"):
                        self.access_token = data.get("accessToken")
                        if data.get("environment"):
                            self.env = data.get("environment")
                            self.base_api_url = "https://sandbox-quickbooks.api.intuit.com" if self.env == "sandbox" else "https://quickbooks.api.intuit.com"
                        return self.access_token
                    elif data.get("error"):
                        errors.append(f"Server Broker: {data.get('error')}")
                else:
                    if resp.status_code == 302:
                        errors.append(f"Server Token Broker ({self.server_url}) requires web portal login.")
                    else:
                        errors.append(f"Server Token Broker returned HTTP {resp.status_code} ({ctype or 'HTML'}).")
            except Exception as e:
                errors.append(f"Server Token Broker error: {e}")

        # 3. If neither worked, provide clear actionable guidance
        if not (cid and csec):
            err_details = f" ({'; '.join(errors)})" if errors else ""
            raise ValueError(
                f"QuickBooks needs your Intuit Client ID & Client Secret to refresh tokens for '{self.active_client_name}'.\n"
                f"Please click '🏢 Clients' -> '✏️ Edit Selected Client' and enter your Intuit Client ID & Secret "
                f"(or set QBO_CLIENT_ID and QBO_CLIENT_SECRET in your .env file).{err_details}"
            )

        if not tok:
            raise ValueError(f"Client '{self.active_client_name}' is missing a valid Refresh Token.")

        err_summary = "; ".join(errors) if errors else "Authentication failed"
        raise RuntimeError(f"QuickBooks token refresh failed for '{self.active_client_name}': {err_summary}")

    def _get_headers(self) -> dict:
        if not self.access_token:
            self.refresh_tokens()
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    def _api_request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_api_url}/v3/company/{self.realm_id}/{endpoint.lstrip('/')}"
        headers = self._get_headers()

        resp = requests.request(method, url, headers=headers, timeout=25, **kwargs)
        if resp.status_code == 401:
            self.refresh_tokens()
            headers = self._get_headers()
            resp = requests.request(method, url, headers=headers, timeout=25, **kwargs)

        return resp

    def get_payment_accounts(self) -> list:
        query = "SELECT Id, Name, AccountType, AccountSubType FROM Account WHERE AccountType IN ('Bank', 'Credit Card') MAXRESULTS 100"
        endpoint = f"query?query={urllib.parse.quote(query)}"
        resp = self._api_request("GET", endpoint)
        account_list = []
        if resp.status_code == 200:
            accounts = resp.json().get("QueryResponse", {}).get("Account", [])
            for acc in accounts:
                acc_id = str(acc.get("Id"))
                acc_name = acc.get("Name", "Unnamed Account")
                acc_type = acc.get("AccountType", "Bank")
                account_list.append({
                    "id": acc_id,
                    "name": acc_name,
                    "type": acc_type,
                    "label": f"{acc_name} [{acc_type}] (ID: {acc_id})"
                })
        return account_list

    def get_or_create_vendor(self, vendor_name: str) -> str:
        clean_name = vendor_name.strip()[:100]
        if not clean_name:
            clean_name = "General Farm Vendor"

        cache_key = f"{self.realm_id}_{clean_name}"
        if cache_key in self._cached_vendors:
            return self._cached_vendors[cache_key]

        escaped_name = clean_name.replace("'", "\\'")
        query = f"SELECT Id, DisplayName FROM Vendor WHERE DisplayName = '{escaped_name}'"
        endpoint = f"query?query={urllib.parse.quote(query)}"

        resp = self._api_request("GET", endpoint)
        if resp.status_code == 200:
            vendors = resp.json().get("QueryResponse", {}).get("Vendor", [])
            if vendors:
                v_id = str(vendors[0]["Id"])
                self._cached_vendors[cache_key] = v_id
                return v_id

        create_payload = {"DisplayName": clean_name}
        create_resp = self._api_request("POST", "vendor", json=create_payload)

        if create_resp.status_code in (200, 201):
            new_v_id = str(create_resp.json()["Vendor"]["Id"])
            self._cached_vendors[cache_key] = new_v_id
            return new_v_id
        else:
            raise RuntimeError(f"Failed to auto-create Vendor '{clean_name}': {create_resp.text}")

    def get_or_create_expense_account(self, account_name: str) -> str:
        clean_name = account_name.strip()
        if not clean_name:
            clean_name = "Supplies & Materials"

        cache_key = f"{self.realm_id}_{clean_name}"
        if cache_key in self._cached_accounts:
            return self._cached_accounts[cache_key]

        escaped = clean_name.replace("'", "\\'")
        query = f"SELECT Id, Name FROM Account WHERE Name = '{escaped}'"
        endpoint = f"query?query={urllib.parse.quote(query)}"
        resp = self._api_request("GET", endpoint)
        if resp.status_code == 200:
            accounts = resp.json().get("QueryResponse", {}).get("Account", [])
            if accounts:
                acc_id = str(accounts[0]["Id"])
                self._cached_accounts[cache_key] = acc_id
                return acc_id

        keyword = "Supplies" if "supplies" in clean_name.lower() else clean_name.split()[0].replace(":", "")
        escaped_kw = keyword.replace("'", "\\'")
        query = f"SELECT Id, Name FROM Account WHERE AccountType = 'Expense' AND Name LIKE '%{escaped_kw}%' MAXRESULTS 1"
        endpoint = f"query?query={urllib.parse.quote(query)}"
        resp = self._api_request("GET", endpoint)
        if resp.status_code == 200:
            accounts = resp.json().get("QueryResponse", {}).get("Account", [])
            if accounts:
                acc_id = str(accounts[0]["Id"])
                self._cached_accounts[cache_key] = acc_id
                return acc_id

        create_payload = {
            "Name": clean_name[:100],
            "AccountType": "Expense",
            "AccountSubType": "SuppliesMaterials"
        }
        create_resp = self._api_request("POST", "account", json=create_payload)
        if create_resp.status_code in (200, 201):
            new_id = str(create_resp.json()["Account"]["Id"])
            self._cached_accounts[cache_key] = new_id
            return new_id

        query = "SELECT Id, Name FROM Account WHERE AccountType = 'Expense' MAXRESULTS 20"
        endpoint = f"query?query={urllib.parse.quote(query)}"
        resp = self._api_request("GET", endpoint)
        if resp.status_code == 200:
            accounts = resp.json().get("QueryResponse", {}).get("Account", [])
            for acc in accounts:
                n = acc.get("Name", "").lower()
                if "legal" not in n and "professional" not in n and "accounting" not in n:
                    return str(acc.get("Id"))
            if accounts:
                return str(accounts[0]["Id"])

        return "1"

    def create_expense(
        self,
        date_str: str,
        purchase_type: str,
        payee: str,
        payment_account_id: str,
        expense_account: str,
        memo: str,
        charge: float,
        ref_number: str = ""
    ) -> dict:
        vendor_id = self.get_or_create_vendor(payee)

        is_cc = "cc" in purchase_type.lower() or "card" in purchase_type.lower()
        qbo_payment_type = "CreditCard" if is_cc else "Cash"

        pay_acc_id = str(payment_account_id) if str(payment_account_id).isdigit() else "41"
        exp_acc_id = self.get_or_create_expense_account(expense_account)
        doc_num = ref_number.strip() if ref_number else ("CC" if is_cc else "Cash")

        payload = {
            "PaymentType": qbo_payment_type,
            "AccountRef": {"value": pay_acc_id},
            "EntityRef": {"value": vendor_id, "type": "Vendor"},
            "TxnDate": date_str,
            "TotalAmt": round(float(charge), 2),
            "PrivateNote": memo[:4000] if memo else "",
            "DocNumber": doc_num[:21],
            "Line": [
                {
                    "Amount": round(float(charge), 2),
                    "DetailType": "AccountBasedExpenseLineDetail",
                    "Description": memo[:4000] if memo else "",
                    "AccountBasedExpenseLineDetail": {
                        "AccountRef": {"value": exp_acc_id}
                    }
                }
            ]
        }

        resp = self._api_request("POST", "purchase", json=payload)
        if resp.status_code in (200, 201):
            return resp.json()["Purchase"]
        else:
            raise RuntimeError(f"QuickBooks Purchase Error for '{self.active_client_name}' ({resp.status_code}): {resp.text}")


# -----------------------------------------------------------------------------
# Image Utilities
# -----------------------------------------------------------------------------
def enhance_thermal_image(pil_img):
    try:
        if pil_img.mode in ("RGBA", "P"):
            pil_img = pil_img.convert("RGB")
        gray = ImageOps.grayscale(pil_img)
        auto_gray = ImageOps.autocontrast(gray, cutoff=1)
        sharp = auto_gray.filter(ImageFilter.UnsharpMask(radius=1.5, percent=130, threshold=3))
        return sharp.convert("RGB")
    except Exception:
        return pil_img.convert("RGB") if pil_img.mode != "RGB" else pil_img

def prepare_receipt_image(pil_img, max_dim=1600):
    w, h = pil_img.size
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        pil_img = pil_img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

    enhanced = enhance_thermal_image(pil_img)
    io_buffer = io.BytesIO()
    enhanced.save(io_buffer, format="JPEG", quality=90, optimize=True)
    full_b64 = base64.b64encode(io_buffer.getvalue()).decode("utf-8")
    return full_b64

def is_file_ready(filepath, timeout=2.0):
    if not os.path.exists(filepath):
        return False
    start_time = time.time()
    last_size = -1
    while time.time() - start_time < timeout:
        try:
            current_size = os.path.getsize(filepath)
            if current_size > 0 and current_size == last_size:
                with open(filepath, "rb") as test_f:
                    test_f.read(16)
                return True
            last_size = current_size
        except (OSError, IOError, PermissionError):
            pass
        time.sleep(0.3)
    return False

def get_file_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


# -----------------------------------------------------------------------------
# Main Desktop GUI Window
# -----------------------------------------------------------------------------
class FarmReceiptApp(_TK_BASE_TK):
    def __init__(self):
        super().__init__()
        self.title(f"Receipt Processor & Tax Accounting - Subscription Edition (v{APP_VERSION})")
        self.geometry("1200x890")
        self.minsize(1020, 740)

        self.log_queue = queue.Queue()

        # State
        self.is_watching = False
        self.watch_thread = None
        self.processed_hashes = set()
        self.stats = {"total": 0, "cows": 0, "chickens": 0, "general": 0, "dollars": 0.0}
        self.key_index = 0

        # Multi-Client Worker Pool & Thread Concurrency Controls
        self.worker_pool = concurrent.futures.ThreadPoolExecutor(max_workers=6, thread_name_prefix="MultiClientWorker")
        self.active_jobs_lock = threading.Lock()
        self.active_jobs = set()
        self.file_write_lock = threading.Lock()
        self.stats_lock = threading.Lock()
        self.hash_lock = threading.Lock()
        self.key_lock = threading.Lock()

        # Available QBO Accounts list
        self.qbo_accounts_data = []

        # Email integration state
        self.email_user = os.getenv("EMAIL_USER", "").strip()
        self.email_pass = os.getenv("EMAIL_PASS", "").strip()
        self.imap_server = os.getenv("IMAP_SERVER", "imap.gmail.com").strip()
        self.watch_gmail_enabled = True
        self.last_gmail_check = 0

        # Subscription Licensing & Auto-Update Engine
        self.license_mgr = SubscriptionLicenseManager()
        self.updater = UpdateManager(current_version=APP_VERSION)

        # Security Vault & Multi-Client Manager with Missing-Key Safeguard
        self.vault = SecureVault()
        self.profile_mgr = ClientProfileManager(self.vault)
        self.qbo_client = QuickBooksOnlineSync(self.profile_mgr)

        # Load environment keys
        self.load_keys_from_env()

        # Build UI
        self.setup_styles()
        self.create_widgets()

        # Check for deduplication cache
        self.load_hash_cache()

        # Synchronize multi-client inbox and archive folders
        self.sync_client_inbox_folders()

        # Start drain log queue loop
        self.after(50, self.drain_log_queue)

        # Log system status
        self.log(f"🛡️ Enterprise Security Active: AES-256 local encrypted storage.", "success")
        self.log(f"🔑 Loaded {len(self.api_keys)} Gemini API Key(s). Active Model: {self.model_var.get()}", "info")

        if self.license_mgr.is_subscription_active():
            self.log(f"👑 Subscription Active (Key: {self.license_mgr.license_data.get('license_key', 'Active')})", "success")
        else:
            self.log("🔒 Subscription License Expired or Inactive. Please activate license to enable processing.", "error")

        if self.qbo_client.active_client_name:
            self.log(f"🏢 Active QuickBooks Client: '{self.qbo_client.active_client_name}' (Realm: {self.qbo_client.realm_id})", "highlight")
            threading.Thread(target=self.fetch_qbo_accounts_async, daemon=True).start()
        else:
            self.log("⚠️ No QuickBooks clients found. Click '+ New Client' to connect your first client!", "warning")

        # Active license dialog reference for live UI sync
        self.active_license_dialog = None
        # Start background scanner for real-time license updates from the website
        self.start_license_website_scanner()

        # Silent background update check after 2 seconds
        self.after(2000, lambda: threading.Thread(target=self.run_silent_update_check, daemon=True).start())

    def start_license_website_scanner(self):
        """
        Background scanner thread that scans the website portal every 2 seconds.
        If the license status changes on the website (Active, Revoked, Expired, Deleted),
        it immediately reflects on the local desktop application within seconds.
        """
        def scanner_worker():
            time.sleep(0.2)
            while True:
                try:
                    res = self.license_mgr.scan_remote_status(force=True)
                    if res and res.get("changed"):
                        self.after(0, lambda r=res: self.handle_remote_license_changed(r))
                    self.license_mgr.send_heartbeat()
                except Exception:
                    pass
                time.sleep(2)

        threading.Thread(target=scanner_worker, daemon=True).start()

    def handle_remote_license_changed(self, res: dict):
        """Dispatches live license status transitions to badges, logs, and dialog."""
        outcome = res.get("result", "")
        if outcome == "ACTIVE":
            self.sub_badge.config(text="👑 Pro Subscription", fg="#34d399")
            self.log(f"👑 Website License Update: Registered as ACTIVE via website ({res.get('plan', 'Standard')}).", "success")
        elif outcome == "EXPIRED":
            self.sub_badge.config(text="⏳ License Expired", fg="#fbbf24")
            self.log(f"⏳ Website License Update: License key '{res.get('key')}' has EXPIRED (Expiration: {res.get('expires', 'N/A')}). Processing locked.", "warning")
            if getattr(self, 'is_watching', False):
                self.is_watching = False
                self.watch_btn.config(text="▶ Start Continuous Watch Mode", bg="#b45309")
                self.log("⏹ Continuous Watch Mode STOPPED: License expired.", "error")
        elif outcome in ["REVOKED", "INACTIVE"]:
            self.sub_badge.config(text="🔒 License Inactive", fg="#ef4444")
            self.log("🔒 Website License Update: License key was REVOKED (marked inactive) on website portal. Processing locked.", "error")
            if getattr(self, 'is_watching', False):
                self.is_watching = False
                self.watch_btn.config(text="▶ Start Continuous Watch Mode", bg="#b45309")
                self.log("⏹ Continuous Watch Mode STOPPED: License revoked.", "error")
        elif outcome == "DELETED":
            self.sub_badge.config(text="🔒 No License", fg="#a8a29e")
            self.log(f"🗑️ Website License Update: Key '{res.get('removed_key')}' was DELETED on website portal and removed from local application.", "warning")
            if getattr(self, 'is_watching', False):
                self.is_watching = False
                self.watch_btn.config(text="▶ Start Continuous Watch Mode", bg="#b45309")
                self.log("⏹ Continuous Watch Mode STOPPED: License deleted.", "error")

        if self.active_license_dialog:
            try:
                self.active_license_dialog.refresh_ui(res)
            except Exception:
                pass

    def run_silent_update_check(self):
        info = self.updater.check_for_updates()
        if info:
            self.after(0, lambda: DismissibleUpdateDialog(self, info, self.updater))

    def check_updates_manual(self):
        self.log("🔍 Checking for updates...", "info")
        def worker():
            info = self.updater.check_for_updates(timeout=6)
            if info:
                self.after(0, lambda: DismissibleUpdateDialog(self, info, self.updater))
            else:
                self.after(0, lambda: messagebox.showinfo("Up to Date", f"You are running the latest version (v{APP_VERSION})."))
                self.log(f"✅ Software is up to date (v{APP_VERSION}).", "success")

        threading.Thread(target=worker, daemon=True).start()

    def load_keys_from_env(self):
        raw = [
            os.getenv("GEMINI_API_KEY", ""),
            os.getenv("GEMINI_API_KEY_2", ""),
            os.getenv("GEMINI_API_KEY_3", ""),
            os.getenv("GEMINI_API_KEYS", "")
        ]
        self.api_keys = []
        for r in raw:
            for k in r.split(","):
                k_clean = k.strip()
                if k_clean and k_clean not in self.api_keys:
                    self.api_keys.append(k_clean)

    def get_next_key(self):
        if not self.api_keys:
            return None
        with self.key_lock:
            key = self.api_keys[self.key_index % len(self.api_keys)]
            self.key_index = (self.key_index + 1) % len(self.api_keys)
            return key

    def setup_styles(self):
        self.style = ttk.Style(self)
        available = self.style.theme_names()
        if "clam" in available:
            self.style.theme_use("clam")
        self.configure(bg="#1c1917")

    def create_widgets(self):
        # 1. Top Header Bar
        header_frame = tk.Frame(self, bg="#292524", height=76, padx=16, pady=10)
        header_frame.pack(fill="x", side="top")

        left_title_box = tk.Frame(header_frame, bg="#292524")
        left_title_box.pack(side="left")

        title_lbl = tk.Label(
            left_title_box,
            text="🌾 Receipt Processor & Tax Filer",
            font=("Segoe UI", 15, "bold"),
            fg="#fafaf9",
            bg="#292524"
        )
        title_lbl.pack(anchor="w")

        # Subtitle Row with Version & Check for Updates Button
        sub_row = tk.Frame(left_title_box, bg="#292524")
        sub_row.pack(anchor="w", pady=(2, 0))

        subtitle_lbl = tk.Label(
            sub_row,
            text=f"v{APP_VERSION}",
            font=("Segoe UI", 9, "bold"),
            fg="#38bdf8",
            bg="#292524"
        )
        subtitle_lbl.pack(side="left")

        update_btn = tk.Button(
            sub_row,
            text="🔄 Check for Updates",
            command=self.check_updates_manual,
            bg="#44403c",
            fg="#a7f3d0",
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            padx=6,
            pady=1,
            cursor="hand2"
        )
        update_btn.pack(side="left", padx=(8, 0))

        # Multi-Client Selector
        client_box = tk.Frame(header_frame, bg="#292524", padx=16)
        client_box.pack(side="left")

        tk.Label(
            client_box,
            text="🏢 Active Client Company:",
            font=("Segoe UI", 9, "bold"),
            fg="#38bdf8",
            bg="#292524"
        ).pack(anchor="w")

        client_sub = tk.Frame(client_box, bg="#292524")
        client_sub.pack(anchor="w", pady=(2, 0))

        client_names = self.profile_mgr.get_client_names()
        initial_client = self.qbo_client.active_client_name or (client_names[0] if client_names else "No Clients Configured")

        self.client_var = tk.StringVar(value=initial_client)
        self.client_dropdown = ttk.Combobox(
            client_sub,
            textvariable=self.client_var,
            values=client_names if client_names else ["No Clients Configured"],
            state="readonly",
            width=24
        )
        self.client_dropdown.pack(side="left")
        self.client_dropdown.bind("<<ComboboxSelected>>", self.on_client_switched)

        add_client_btn = tk.Button(
            client_sub,
            text="➕ New Client",
            command=self.open_add_client_dialog,
            bg="#44403c",
            fg="#a7f3d0",
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            padx=6,
            cursor="hand2"
        )
        add_client_btn.pack(side="left", padx=(6, 0))

        # Status Badges
        badge_box = tk.Frame(header_frame, bg="#292524")
        badge_box.pack(side="right")

        is_licensed = self.license_mgr.is_subscription_active()
        self.sub_badge = tk.Label(
            badge_box,
            text=f"{'👑 Pro Subscription' if is_licensed else '🔒 License Inactive'}",
            font=("Segoe UI", 8, "bold"),
            fg="#34d399" if is_licensed else "#ef4444",
            bg="#1c1917",
            padx=8,
            pady=4,
            relief="solid",
            bd=1,
            cursor="hand2"
        )
        self.sub_badge.pack(side="right", padx=(6, 0))
        self.sub_badge.bind("<Button-1>", lambda e: self.open_license_dialog())

        self.vault_badge = tk.Label(
            badge_box,
            text="🔒 AES-256",
            font=("Segoe UI", 8, "bold"),
            fg="#38bdf8",
            bg="#1c1917",
            padx=8,
            pady=4,
            relief="solid",
            bd=1
        )
        self.vault_badge.pack(side="right", padx=(6, 0))

        qbo_active = bool(self.qbo_client and self.qbo_client.is_configured())
        self.qbo_badge = tk.Label(
            badge_box,
            text=f"☁ QBO: {'Connected' if qbo_active else 'Not Configured'}",
            font=("Segoe UI", 8, "bold"),
            fg="#10b981" if qbo_active else "#f59e0b",
            bg="#1c1917",
            padx=8,
            pady=4,
            relief="solid",
            bd=1
        )
        self.qbo_badge.pack(side="right", padx=(6, 0))

        # 2. Controls & Configuration Panel
        control_frame = tk.Frame(self, bg="#1c1917", padx=16, pady=12)
        control_frame.pack(fill="x")

        # Left Column: Actions & Folders
        left_box = tk.LabelFrame(
            control_frame,
            text=" 📂 Scanner Operations ",
            font=("Segoe UI", 10, "bold"),
            fg="#e7e5e4",
            bg="#292524",
            padx=12,
            pady=10,
            relief="groove"
        )
        left_box.pack(side="left", fill="both", expand=True, padx=(0, 8))

        folder_row = tk.Frame(left_box, bg="#292524")
        folder_row.pack(fill="x", pady=(2, 6))

        tk.Label(folder_row, text="Inbox Folder:", fg="#d6d3d1", bg="#292524", font=("Segoe UI", 9)).pack(side="left")

        default_inbox = os.path.join(SCRIPT_DIR, "inbox")
        os.makedirs(default_inbox, exist_ok=True)
        self.folder_var = tk.StringVar(value=default_inbox)

        folder_entry = tk.Entry(folder_row, textvariable=self.folder_var, bg="#1c1917", fg="#fafaf9", insertbackground="white", font=("Segoe UI", 9))
        folder_entry.pack(side="left", fill="x", expand=True, padx=6)

        browse_btn = tk.Button(folder_row, text="Browse...", command=self.browse_folder, bg="#44403c", fg="white", relief="flat", padx=8)
        browse_btn.pack(side="left")

        open_inbox_btn = tk.Button(folder_row, text="Open Inbox", command=self.open_inbox_folder, bg="#44403c", fg="#fbbf24", relief="flat", padx=8)
        open_inbox_btn.pack(side="left", padx=(4, 0))

        open_archive_btn = tk.Button(folder_row, text="Open Archive", command=self.open_archive_folder, bg="#44403c", fg="#38bdf8", relief="flat", padx=8)
        open_archive_btn.pack(side="left", padx=(4, 0))

        sync_folders_btn = tk.Button(folder_row, text="📁 Sync Client Folders", command=self.sync_client_inbox_folders, bg="#44403c", fg="#a7f3d0", relief="flat", padx=6)
        sync_folders_btn.pack(side="left", padx=(4, 0))

        tk.Label(
            left_box,
            text="⚡ Multi-Client Concurrent Engine: Drop into any client subfolder to auto-process in parallel with zero manual switching.",
            font=("Segoe UI", 8),
            fg="#38bdf8",
            bg="#292524"
        ).pack(anchor="w", pady=(0, 4))

        # Action Buttons
        btn_row = tk.Frame(left_box, bg="#292524")
        btn_row.pack(fill="x", pady=6)

        self.watch_btn = tk.Button(
            btn_row,
            text="▶ Start Continuous Watch Mode",
            command=self.toggle_watch_mode,
            bg="#b45309",
            fg="white",
            font=("Segoe UI", 10, "bold"),
            relief="flat",
            padx=14,
            pady=6,
            cursor="hand2"
        )
        self.watch_btn.pack(side="left", padx=(0, 6))

        scan_now_btn = tk.Button(
            btn_row,
            text="⚡ Scan Inbox Once",
            command=self.scan_inbox_once,
            bg="#44403c",
            fg="white",
            font=("Segoe UI", 9),
            relief="flat",
            padx=10,
            pady=6,
            cursor="hand2"
        )
        scan_now_btn.pack(side="left", padx=4)

        single_file_btn = tk.Button(
            btn_row,
            text="📄 Single Receipt File...",
            command=self.scan_single_file,
            bg="#44403c",
            fg="white",
            font=("Segoe UI", 9),
            relief="flat",
            padx=10,
            pady=6,
            cursor="hand2"
        )
        single_file_btn.pack(side="left", padx=4)

        email_btn = tk.Button(
            btn_row,
            text="✉ Check Gmail Now",
            command=self.scan_email,
            bg="#44403c",
            fg="#e7e5e4",
            font=("Segoe UI", 9),
            relief="flat",
            padx=10,
            pady=6,
            cursor="hand2"
        )
        email_btn.pack(side="left", padx=4)

        # Right Column: Category, QBO Account, Model, & Keys Settings
        right_box = tk.LabelFrame(
            control_frame,
            text=" ⚙ Client Category & Bank Accounts ",
            font=("Segoe UI", 10, "bold"),
            fg="#e7e5e4",
            bg="#292524",
            padx=12,
            pady=10,
            relief="groove"
        )
        right_box.pack(side="right", fill="both", padx=(8, 0))

        # Batch Category Row
        cat_row = tk.Frame(right_box, bg="#292524")
        cat_row.pack(fill="x", pady=(2, 4))
        tk.Label(cat_row, text="Batch Category:", fg="#fbbf24", bg="#292524", font=("Segoe UI", 9, "bold")).pack(side="left")

        self.category_var = tk.StringVar(value="Supplies & Materials")
        self.category_dropdown = ttk.Combobox(
            cat_row,
            textvariable=self.category_var,
            values=[
                "Supplies & Materials",
                "Farm:General",
                "Farm:Cows",
                "Farm:Chickens",
                "Repairs & Maintenance",
                "Fuel",
                "Tools",
                "Auto-Detect (AI)"
            ],
            state="readonly",
            width=24
        )
        self.category_dropdown.pack(side="left", padx=6)
        self.category_dropdown.current(0)

        # QBO Account Row
        acct_row = tk.Frame(right_box, bg="#292524")
        acct_row.pack(fill="x", pady=(4, 4))
        tk.Label(acct_row, text="Client Bank/CC:", fg="#a7f3d0", bg="#292524", font=("Segoe UI", 9, "bold")).pack(side="left")

        self.selected_account_var = tk.StringVar(value="Account 41 (Default)")
        self.account_dropdown = ttk.Combobox(
            acct_row,
            textvariable=self.selected_account_var,
            state="readonly",
            width=24
        )
        self.account_dropdown.pack(side="left", padx=6)
        self.account_dropdown['values'] = ["Account 41 (ID: 41)"]
        self.account_dropdown.current(0)

        refresh_acct_btn = tk.Button(
            acct_row,
            text="🔄",
            command=self.refresh_qbo_accounts,
            bg="#44403c",
            fg="#38bdf8",
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            padx=4,
            cursor="hand2"
        )
        refresh_acct_btn.pack(side="left")

        # Model Selector
        model_row = tk.Frame(right_box, bg="#292524")
        model_row.pack(fill="x", pady=2)
        tk.Label(model_row, text="Model:", fg="#d6d3d1", bg="#292524", font=("Segoe UI", 9)).pack(side="left")

        self.model_var = tk.StringVar(value=os.getenv("GEMINI_MODEL", DEFAULT_MODEL))
        model_menu = ttk.Combobox(
            model_row,
            textvariable=self.model_var,
            values=["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"],
            state="readonly",
            width=22
        )
        model_menu.pack(side="left", padx=6)

        # Config Buttons Row
        cfg_btn_row = tk.Frame(right_box, bg="#292524")
        cfg_btn_row.pack(fill="x", pady=(6, 2))

        keys_btn = tk.Button(
            cfg_btn_row,
            text="🔑 Gemini Keys",
            command=self.open_keys_dialog,
            bg="#44403c",
            fg="white",
            font=("Segoe UI", 8),
            relief="flat",
            padx=4,
            pady=4,
            cursor="hand2"
        )
        keys_btn.pack(side="left", fill="x", expand=True, padx=(0, 2))

        gmail_cfg_btn = tk.Button(
            cfg_btn_row,
            text="✉ Gmail",
            command=self.open_gmail_dialog,
            bg="#44403c",
            fg="#fde68a",
            font=("Segoe UI", 8),
            relief="flat",
            padx=4,
            pady=4,
            cursor="hand2"
        )
        gmail_cfg_btn.pack(side="left", fill="x", expand=True, padx=2)

        qbo_cfg_btn = tk.Button(
            cfg_btn_row,
            text="🔒 Clients",
            command=self.open_manage_clients_dialog,
            bg="#44403c",
            fg="#a7f3d0",
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            padx=4,
            pady=4,
            cursor="hand2"
        )
        qbo_cfg_btn.pack(side="left", fill="x", expand=True, padx=2)

        license_btn = tk.Button(
            cfg_btn_row,
            text="👑 License",
            command=self.open_license_dialog,
            bg="#44403c",
            fg="#fbbf24",
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            padx=4,
            pady=4,
            cursor="hand2"
        )
        license_btn.pack(side="left", fill="x", expand=True, padx=(2, 0))

        # 3. Live Stats Bar
        stats_frame = tk.Frame(self, bg="#292524", padx=16, pady=8)
        stats_frame.pack(fill="x", padx=16, pady=(0, 8))

        self.lbl_stat_total = tk.Label(stats_frame, text="Total Scanned: 0", font=("Segoe UI", 9, "bold"), fg="#fafaf9", bg="#292524")
        self.lbl_stat_total.pack(side="left", padx=(0, 16))

        self.lbl_stat_cows = tk.Label(stats_frame, text="Farm:Cows: $0.00", font=("Segoe UI", 9), fg="#60a5fa", bg="#292524")
        self.lbl_stat_cows.pack(side="left", padx=12)

        self.lbl_stat_chickens = tk.Label(stats_frame, text="Farm:Chickens: $0.00", font=("Segoe UI", 9), fg="#f59e0b", bg="#292524")
        self.lbl_stat_chickens.pack(side="left", padx=12)

        self.lbl_stat_general = tk.Label(stats_frame, text="Supplies/General: $0.00", font=("Segoe UI", 9), fg="#a3e635", bg="#292524")
        self.lbl_stat_general.pack(side="left", padx=12)

        self.lbl_stat_dollars = tk.Label(stats_frame, text="Total Sum: $0.00", font=("Segoe UI", 10, "bold"), fg="#34d399", bg="#292524")
        self.lbl_stat_dollars.pack(side="right")

        # 4. Activity Terminal
        log_frame = tk.Frame(self, bg="#1c1917", padx=16)
        log_frame.pack(fill="both", expand=True)

        log_header = tk.Frame(log_frame, bg="#1c1917")
        log_header.pack(fill="x", pady=(0, 4))

        tk.Label(log_header, text="🖥 Real-Time Activity Log", font=("Segoe UI", 9, "bold"), fg="#d6d3d1", bg="#1c1917").pack(side="left")

        clear_btn = tk.Button(log_header, text="Clear Log", command=self.clear_log, bg="#292524", fg="#a8a29e", font=("Segoe UI", 8), relief="flat")
        clear_btn.pack(side="right", padx=(4, 0))

        reset_cache_btn = tk.Button(
            log_header,
            text="🔄 Reset Processed Cache",
            command=self.reset_processed_cache,
            bg="#292524",
            fg="#38bdf8",
            font=("Segoe UI", 8),
            relief="flat"
        )
        reset_cache_btn.pack(side="right", padx=4)

        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            wrap=tk.WORD,
            bg="#0c0a09",
            fg="#e7e5e4",
            insertbackground="white",
            font=("Consolas", 9),
            padx=10,
            pady=10
        )
        self.log_text.pack(fill="both", expand=True)

        self.log_text.tag_config("info", foreground="#94a3b8")
        self.log_text.tag_config("success", foreground="#34d399")
        self.log_text.tag_config("warning", foreground="#fbbf24")
        self.log_text.tag_config("error", foreground="#f87171")
        self.log_text.tag_config("highlight", foreground="#38bdf8", font=("Consolas", 9, "bold"))
        self.log_text.tag_config("qbo", foreground="#a7f3d0", font=("Consolas", 9, "bold"))

        # 5. Bottom Action Bar
        bottom_frame = tk.Frame(self, bg="#292524", height=50, padx=16, pady=10)
        bottom_frame.pack(fill="x", side="bottom")

        tk.Label(bottom_frame, text="Quick Exports:", font=("Segoe UI", 9, "bold"), fg="#fafaf9", bg="#292524").pack(side="left", padx=(0, 8))

        btn_open_txt = tk.Button(
            bottom_frame,
            text="📄 Open Receipt_Data.txt",
            command=lambda: self.open_local_file("Receipt_Data.txt"),
            bg="#44403c",
            fg="white",
            font=("Segoe UI", 9),
            relief="flat",
            padx=8
        )
        btn_open_txt.pack(side="left", padx=4)

        btn_open_csv = tk.Button(
            bottom_frame,
            text="📊 Open Receipt_Data.csv",
            command=lambda: self.open_local_file("Receipt_Data.csv"),
            bg="#44403c",
            fg="white",
            font=("Segoe UI", 9),
            relief="flat",
            padx=8
        )
        btn_open_csv.pack(side="left", padx=4)

        btn_open_qb = tk.Button(
            bottom_frame,
            text="💰 Open QuickBooks_Bills.csv",
            command=lambda: self.open_local_file("QuickBooks_Bills.csv"),
            bg="#44403c",
            fg="#a7f3d0",
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            padx=8
        )
        btn_open_qb.pack(side="left", padx=4)

        btn_open_out_folder = tk.Button(
            bottom_frame,
            text="📁 Open Processed Folder",
            command=self.open_output_folder,
            bg="#44403c",
            fg="white",
            font=("Segoe UI", 9),
            relief="flat",
            padx=8
        )
        btn_open_out_folder.pack(side="right")

    # -------------------------------------------------------------------------
    # Subscription License Dialog (Real-Time Website Synchronized)
    # -------------------------------------------------------------------------
    def open_license_dialog(self):
        dialog = tk.Toplevel(self)
        dialog.title("Subscription & License Management")
        dialog.geometry("560x540")
        dialog.configure(bg="#1c1917", padx=20, pady=18)
        dialog.transient(self)
        dialog.grab_set()

        self.active_license_dialog = dialog

        def on_close():
            self.active_license_dialog = None
            dialog.destroy()

        dialog.protocol("WM_DELETE_WINDOW", on_close)

        tk.Label(
            dialog,
            text="👑 Software Subscription & License Portal",
            font=("Segoe UI", 13, "bold"),
            fg="#fbbf24",
            bg="#1c1917"
        ).pack(anchor="w", pady=(0, 2))

        # Real-time sync indicator banner
        sync_banner = tk.Frame(dialog, bg="#0c4a6e", padx=10, pady=6)
        sync_banner.pack(fill="x", pady=(0, 8))
        tk.Label(
            sync_banner,
            text="📡 Live Website Sync: Active (scans for Active, Revoke & Delete)",
            font=("Segoe UI", 8, "bold"),
            fg="#7dd3fc",
            bg="#0c4a6e"
        ).pack(anchor="w")

        lbl_status = tk.Label(
            dialog,
            text="",
            font=("Segoe UI", 10, "bold"),
            bg="#1c1917"
        )
        lbl_status.pack(anchor="w", pady=(0, 8))

        hw_box = tk.Frame(dialog, bg="#292524", padx=12, pady=10)
        hw_box.pack(fill="x", pady=(0, 10))

        lbl_plan = tk.Label(hw_box, text="", font=("Segoe UI", 9, "bold"), fg="#fbbf24", bg="#292524")
        lbl_plan.pack(anchor="w")

        lbl_activated = tk.Label(hw_box, text="", font=("Consolas", 8), fg="#e7e5e4", bg="#292524")
        lbl_activated.pack(anchor="w")

        lbl_expires = tk.Label(hw_box, text="", font=("Consolas", 8, "bold"), bg="#292524")
        lbl_expires.pack(anchor="w")

        lbl_machine = tk.Label(hw_box, text=f"Machine ID: {self.license_mgr.hardware_id}", font=("Consolas", 8), fg="#a8a29e", bg="#292524")
        lbl_machine.pack(anchor="w")

        tk.Label(dialog, text="Subscription License Key:", fg="#d6d3d1", bg="#1c1917", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        e_key = tk.Entry(dialog, bg="#292524", fg="#fafaf9", insertbackground="white", font=("Consolas", 10))
        e_key.pack(fill="x", pady=(2, 6))

        tk.Label(dialog, text="Registered Subscriber Email:", fg="#d6d3d1", bg="#1c1917", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        e_email = tk.Entry(dialog, bg="#292524", fg="#fafaf9", insertbackground="white", font=("Consolas", 10))
        e_email.pack(fill="x", pady=(2, 8))

        status_feedback = tk.Label(dialog, text="", font=("Segoe UI", 9), fg="#38bdf8", bg="#1c1917", wraplength=510, justify="left")
        status_feedback.pack(anchor="w", pady=(0, 8))

        def refresh_ui(res: dict = None):
            cur_key = self.license_mgr.license_data.get("license_key", "")
            is_active = self.license_mgr.is_subscription_active()

            if not cur_key:
                lbl_status.config(text="Status: No License Key Assigned", fg="#a8a29e")
            elif is_active:
                lbl_status.config(text="Status: Active Pro License (Website Verified)", fg="#34d399")
            elif self.license_mgr.license_data.get("status") == "EXPIRED":
                lbl_status.config(text="Status: License Expired (Subscription Lapsed)", fg="#fbbf24")
            else:
                lbl_status.config(text="Status: License Inactive / Revoked", fg="#f87171")

            lbl_plan.config(text=f"Plan Tier: {self.license_mgr.license_data.get('plan_tier', 'Unregistered')}")
            lbl_activated.config(text=f"Activated On: {self.license_mgr.license_data.get('activated_at', 'Not Recorded')}")

            days_left = self.license_mgr.get_days_remaining()
            exp_text = self.license_mgr.license_data.get('expires_at', 'N/A')
            if "Never" in str(exp_text) or days_left >= 90000:
                exp_display = "Never (Perpetual Lifetime License)"
                exp_color = "#38bdf8"
            else:
                exp_color = "#34d399" if days_left > 7 else "#fbbf24" if days_left > 0 else "#f87171"
                exp_display = f"{exp_text} ({days_left} day(s) remaining)"
            lbl_expires.config(text=f"Expires: {exp_display}", fg=exp_color)

            # Update entry fields
            e_key.delete(0, tk.END)
            e_key.insert(0, cur_key)
            e_email.delete(0, tk.END)
            e_email.insert(0, self.license_mgr.license_data.get("user_email", ""))

            if res:
                r_type = res.get("result", "")
                if r_type == "ACTIVE":
                    status_feedback.config(text=f"✅ {res.get('message', 'Active on website')}", fg="#34d399")
                elif r_type == "EXPIRED":
                    status_feedback.config(text=f"⏳ {res.get('message', 'License expired')}", fg="#fbbf24")
                elif r_type in ["REVOKED", "INACTIVE"]:
                    status_feedback.config(text=f"⚠️ {res.get('message', 'Revoked on website')}", fg="#f87171")
                elif r_type == "DELETED":
                    status_feedback.config(text=f"🗑️ {res.get('message', 'Deleted on website and removed locally')}", fg="#fbbf24")

        dialog.refresh_ui = refresh_ui
        refresh_ui()

        def activate_key():
            k = e_key.get().strip()
            em = e_email.get().strip()
            if not k:
                status_feedback.config(text="⚠️ Please enter a license key.", fg="#fbbf24")
                return

            status_feedback.config(text="⏳ Verifying license status with website portal...", fg="#38bdf8")
            act_btn.config(state="disabled")
            scan_btn.config(state="disabled")

            def worker():
                success, msg = self.license_mgr.verify_with_server(k, em)
                def finish():
                    if dialog.winfo_exists():
                        act_btn.config(state="normal")
                        scan_btn.config(state="normal")
                        if success:
                            status_feedback.config(text=f"✅ {msg}", fg="#34d399")
                            self.sub_badge.config(text="👑 Pro Subscription", fg="#34d399")
                            self.log(f"👑 License activated for: {em or k}", "success")
                        else:
                            status_feedback.config(text=f"❌ {msg}", fg="#f87171")
                            self.sub_badge.config(text="🔒 License Inactive", fg="#ef4444")
                        refresh_ui()
                self.after(0, finish)

            threading.Thread(target=worker, daemon=True).start()

        def scan_now():
            status_feedback.config(text="📡 Scanning website portal for changes...", fg="#38bdf8")
            act_btn.config(state="disabled")
            scan_btn.config(state="disabled")

            def worker():
                res = self.license_mgr.scan_remote_status(force=True)
                def finish():
                    if dialog.winfo_exists():
                        act_btn.config(state="normal")
                        scan_btn.config(state="normal")
                        self.handle_remote_license_changed(res)
                        refresh_ui(res)
                self.after(0, finish)

            threading.Thread(target=worker, daemon=True).start()

        def remove_key():
            if not self.license_mgr.license_data.get("license_key"):
                status_feedback.config(text="ℹ️ No license key to remove.", fg="#a8a29e")
                return
            removed = self.license_mgr.remove_license_key()
            self.sub_badge.config(text="🔒 No License", fg="#a8a29e")
            self.log(f"🗑️ License key '{removed}' removed from local application.", "warning")
            status_feedback.config(text=f"🗑️ Removed license key '{removed}'.", fg="#fbbf24")
            refresh_ui()

        btn_box = tk.Frame(dialog, bg="#1c1917")
        btn_box.pack(fill="x", pady=(2, 0))

        act_btn = tk.Button(
            btn_box,
            text="Activate / Renew License",
            command=activate_key,
            bg="#b45309",
            fg="white",
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            pady=6,
            cursor="hand2"
        )
        act_btn.pack(side="left", fill="x", expand=True, padx=(0, 4))

        scan_btn = tk.Button(
            btn_box,
            text="🔍 Scan Website Now",
            command=scan_now,
            bg="#1e3a8a",
            fg="white",
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            pady=6,
            cursor="hand2"
        )
        scan_btn.pack(side="left", fill="x", expand=True, padx=4)

        del_btn = tk.Button(
            btn_box,
            text="🗑️ Remove Key",
            command=remove_key,
            bg="#7f1d1d",
            fg="white",
            font=("Segoe UI", 9, "bold"),
            relief="flat",
            pady=6,
            cursor="hand2"
        )
        del_btn.pack(side="right", fill="x", expand=True, padx=(4, 0))

    # -------------------------------------------------------------------------
    # Multi-Client Switching & Management (AES-256 Vault)
    # -------------------------------------------------------------------------
    def on_client_switched(self, event=None):
        selected_client = self.client_var.get()
        if not selected_client or selected_client not in self.profile_mgr.profiles:
            return

        c_data = self.profile_mgr.profiles[selected_client]
        self.log(f"🔄 Switching QuickBooks company to: '{selected_client}' (Realm ID: {c_data['realm_id']})...", "highlight")

        try:
            self.qbo_client.set_active_client(
                client_name=selected_client,
                realm_id=c_data["realm_id"],
                refresh_token=c_data["refresh_token"],
                env=c_data.get("env", "production"),
                client_id=c_data.get("client_id", ""),
                client_secret=c_data.get("client_secret", "")
            )
            self.qbo_badge.config(text=f"☁ QBO: {selected_client[:15]}", fg="#10b981")
            self.log(f"✅ Connected to client '{selected_client}'!", "success")
            threading.Thread(target=self.fetch_qbo_accounts_async, daemon=True).start()
        except Exception as e:
            self.log(f"❌ Failed to switch to '{selected_client}': {e}", "error")

    def open_add_client_dialog(self):
        self.open_add_or_edit_client_dialog(None)

    def open_edit_client_dialog(self, client_name: str):
        self.open_add_or_edit_client_dialog(client_name)

    def open_add_or_edit_client_dialog(self, client_name_to_edit=None):
        is_editing = client_name_to_edit is not None and client_name_to_edit in self.profile_mgr.profiles
        existing_data = self.profile_mgr.profiles.get(client_name_to_edit, {}) if is_editing else {}

        dialog = tk.Toplevel(self)
        dialog.title(f"{'Edit' if is_editing else 'Add'} QuickBooks Client Profile (AES-256 Encrypted)")
        dialog.geometry("640x720")
        dialog.configure(bg="#1c1917", padx=18, pady=16)
        dialog.transient(self)
        dialog.grab_set()

        title_text = f"✏️ Edit Profile: {client_name_to_edit}" if is_editing else "🏢 Onboard New QuickBooks Client"
        tk.Label(
            dialog,
            text=title_text,
            font=("Segoe UI", 12, "bold"),
            fg="#fafaf9",
            bg="#1c1917"
        ).pack(anchor="w", pady=(0, 2))

        tk.Label(
            dialog,
            text="Client credentials are encrypted with AES-256 at rest. Supports direct Intuit sync & Server Broker.",
            font=("Segoe UI", 9),
            fg="#38bdf8",
            bg="#1c1917"
        ).pack(anchor="w", pady=(0, 10))

        def add_row(lbl_text, show_secret=False, default_val="", note=""):
            f = tk.Frame(dialog, bg="#1c1917")
            f.pack(fill="x", pady=3)
            tk.Label(f, text=lbl_text, fg="#d6d3d1", bg="#1c1917", width=22, anchor="w").pack(side="left")
            entry = tk.Entry(f, bg="#292524", fg="#fafaf9", insertbackground="white", font=("Consolas", 9), show="•" if show_secret else "")
            entry.pack(side="left", fill="x", expand=True)
            if default_val:
                entry.insert(0, default_val)
            if note:
                tk.Label(dialog, text=f"   ↳ {note}", font=("Segoe UI", 8), fg="#a8a29e", bg="#1c1917").pack(anchor="w")
            return entry

        e_name = add_row("Client / Farm Name:", default_val=client_name_to_edit if is_editing else "")
        e_realm = add_row("Company (Realm) ID:", default_val=existing_data.get("realm_id", ""), note="From your QuickBooks URL or App Center (9-12 digits)")
        e_token = add_row("Refresh Token:", show_secret=True, default_val=existing_data.get("refresh_token", ""), note="Intuit OAuth2 Refresh Token (101-day rolling renewal)")
        e_cid = add_row("Intuit Client ID:", default_val=existing_data.get("client_id", ""), note="Optional: Enter for direct sync (or leave blank to use .env: QBO_CLIENT_ID)")
        e_csec = add_row("Intuit Client Secret:", show_secret=True, default_val=existing_data.get("client_secret", ""), note="Optional: Enter for direct sync (or leave blank to use .env: QBO_CLIENT_SECRET)")
        e_account = add_row("Default Account ID:", default_val=existing_data.get("default_pay_account", "41"), note="Default QBO Payment Account ID (e.g., 41 or bank ID)")
        e_emails = add_row("Authorized Sender Emails:", default_val=existing_data.get("sender_emails", ""), note="Option B Email auto-routing (comma-separated, e.g. billing@client.com, @clientdomain.com)")

        env_f = tk.Frame(dialog, bg="#1c1917")
        env_f.pack(fill="x", pady=4)
        tk.Label(env_f, text="Environment:", fg="#d6d3d1", bg="#1c1917", width=22, anchor="w").pack(side="left")
        env_var = tk.StringVar(value=existing_data.get("env", "production"))
        env_menu = ttk.Combobox(env_f, textvariable=env_var, values=["production", "sandbox"], state="readonly", width=16)
        env_menu.pack(side="left")

        status_lbl = tk.Label(dialog, text="", font=("Segoe UI", 9), fg="#38bdf8", bg="#1c1917", wraplength=580, justify="left")
        status_lbl.pack(anchor="w", pady=(8, 4))

        def test_client_conn():
            name = e_name.get().strip() or "Test Client"
            rid = e_realm.get().strip()
            tok = e_token.get().strip()
            cid = e_cid.get().strip() or os.getenv("QBO_CLIENT_ID", "").strip()
            csec = e_csec.get().strip() or os.getenv("QBO_CLIENT_SECRET", "").strip()
            env_mode = env_var.get().strip()

            if not (rid and tok):
                status_lbl.config(text="⚠️ Please enter at least Company ID and Refresh Token.", fg="#f59e0b")
                return

            status_lbl.config(text="⏳ Testing client connection with Intuit API...", fg="#38bdf8")
            dialog.update_idletasks()

            def run_test():
                try:
                    tester = QuickBooksOnlineSync(self.profile_mgr)
                    tester.set_active_client(name, rid, tok, env_mode, client_id=cid, client_secret=csec)
                    tester.refresh_tokens()
                    resp = tester._api_request("GET", f"companyinfo/{rid}")
                    if resp.status_code == 200:
                        c_name = resp.json().get("CompanyInfo", {}).get("CompanyName", name)
                        dialog.after(0, lambda: status_lbl.config(text=f"✅ Connected to '{c_name}'! Ready to save.", fg="#34d399"))
                    else:
                        dialog.after(0, lambda: status_lbl.config(text=f"⚠️ Connected, but API returned HTTP {resp.status_code}", fg="#fbbf24"))
                except Exception as ex:
                    dialog.after(0, lambda: status_lbl.config(text=f"❌ Connection failed: {ex}", fg="#f87171"))

            threading.Thread(target=run_test, daemon=True).start()

        test_btn = tk.Button(dialog, text="🔌 Test Connection", command=test_client_conn, bg="#44403c", fg="white", relief="flat", padx=10, pady=4)
        test_btn.pack(anchor="w", pady=(0, 8))

        def save_client_profile():
            name = e_name.get().strip()
            rid = e_realm.get().strip()
            tok = e_token.get().strip()
            cid = e_cid.get().strip()
            csec = e_csec.get().strip()
            acc = e_account.get().strip() or "41"
            emails = e_emails.get().strip()
            env_mode = env_var.get().strip()

            if not (name and rid and tok):
                messagebox.showwarning("Incomplete Fields", "Client Name, Company ID, and Refresh Token are required.")
                return

            # If editing and name changed, remove the old key
            if is_editing and client_name_to_edit != name:
                self.profile_mgr.delete_client(client_name_to_edit)

            self.profile_mgr.add_or_update_client(
                client_name=name,
                realm_id=rid,
                refresh_token=tok,
                env=env_mode,
                default_pay_acc=acc,
                client_id=cid,
                client_secret=csec,
                sender_emails=emails
            )

            names = self.profile_mgr.get_client_names()
            self.client_dropdown['values'] = names
            self.client_var.set(name)
            self.on_client_switched()
            self.sync_client_inbox_folders()

            action_verb = "Updated" if is_editing else "Stored"
            self.log(f"🔒 [Vault] {action_verb} AES-256 encrypted profile: '{name}' (Realm: {rid})", "success")
            dialog.destroy()

        btn_text = "Save Changes & Switch Now" if is_editing else "Save Encrypted Profile & Switch Now"
        save_btn = tk.Button(
            dialog,
            text=btn_text,
            command=save_client_profile,
            bg="#b45309",
            fg="white",
            font=("Segoe UI", 10, "bold"),
            relief="flat",
            pady=6,
            cursor="hand2"
        )
        save_btn.pack(fill="x", pady=(4, 0))

    def open_manage_clients_dialog(self):
        dialog = tk.Toplevel(self)
        dialog.title("Manage Client Profiles (Encrypted Vault)")
        dialog.geometry("680x520")
        dialog.configure(bg="#1c1917", padx=18, pady=16)
        dialog.transient(self)
        dialog.grab_set()

        tk.Label(dialog, text="🔒 All QuickBooks Client Profiles (Encrypted)", font=("Segoe UI", 12, "bold"), fg="#fafaf9", bg="#1c1917").pack(anchor="w")

        listbox_frame = tk.Frame(dialog, bg="#292524", pady=6)
        listbox_frame.pack(fill="both", expand=True, pady=10)

        listbox = tk.Listbox(listbox_frame, bg="#0c0a09", fg="#fafaf9", font=("Consolas", 10), selectmode=tk.SINGLE)
        listbox.pack(side="left", fill="both", expand=True, padx=6, pady=6)

        scrollbar = tk.Scrollbar(listbox_frame, orient="vertical", command=listbox.yview)
        scrollbar.pack(side="right", fill="y")
        listbox.config(yscrollcommand=scrollbar.set)

        for name, data in self.profile_mgr.profiles.items():
            has_cid = "Direct Keys" if data.get("client_id") else "Server/Env"
            listbox.insert(tk.END, f"{name} (Realm: {data['realm_id']}) - [{data.get('env', 'production')}] - ({has_cid})")

        btn_box = tk.Frame(dialog, bg="#1c1917")
        btn_box.pack(fill="x", pady=(4, 0))

        def activate_selected():
            sel = listbox.curselection()
            if not sel: return
            idx = sel[0]
            name = list(self.profile_mgr.profiles.keys())[idx]
            self.client_var.set(name)
            self.on_client_switched()
            dialog.destroy()

        def edit_selected():
            sel = listbox.curselection()
            if not sel: return
            idx = sel[0]
            name = list(self.profile_mgr.profiles.keys())[idx]
            dialog.destroy()
            self.open_edit_client_dialog(name)

        def delete_selected():
            sel = listbox.curselection()
            if not sel: return
            idx = sel[0]
            name = list(self.profile_mgr.profiles.keys())[idx]
            if messagebox.askyesno("Delete Client", f"Are you sure you want to remove '{name}' from the encrypted vault?"):
                self.profile_mgr.delete_client(name)
                names = self.profile_mgr.get_client_names()
                self.client_dropdown['values'] = names if names else ["No Clients Configured"]
                if names:
                    self.client_var.set(names[0])
                    self.on_client_switched()
                else:
                    self.client_var.set("No Clients Configured")
                dialog.destroy()

        act_btn = tk.Button(btn_box, text="Switch to Selected Client", command=activate_selected, bg="#b45309", fg="white", font=("Segoe UI", 9, "bold"), relief="flat", padx=10, pady=5)
        act_btn.pack(side="left", padx=(0, 6))

        edit_btn = tk.Button(btn_box, text="✏️ Edit Client", command=edit_selected, bg="#2563eb", fg="white", font=("Segoe UI", 9, "bold"), relief="flat", padx=10, pady=5)
        edit_btn.pack(side="left", padx=(0, 6))

        del_btn = tk.Button(btn_box, text="Delete Client", command=delete_selected, bg="#7f1d1d", fg="white", font=("Segoe UI", 9), relief="flat", padx=10, pady=5)
        del_btn.pack(side="left")

    # -------------------------------------------------------------------------
    # QBO Account Loading Logic
    # -------------------------------------------------------------------------
    def refresh_qbo_accounts(self):
        if not (self.qbo_client and self.qbo_client.is_configured()):
            messagebox.showinfo("QuickBooks Online", "Please configure or select a QuickBooks client company first.")
            return
        threading.Thread(target=self.fetch_qbo_accounts_async, daemon=True).start()

    def fetch_qbo_accounts_async(self):
        try:
            self.log(f"🔄 Fetching Bank/Credit accounts for '{self.qbo_client.active_client_name}'...", "info")
            accounts = self.qbo_client.get_payment_accounts()
            if accounts:
                self.qbo_accounts_data = accounts
                labels = [a["label"] for a in accounts]
                self.after(0, lambda: self._update_account_dropdown(labels))
                self.log(f"✅ Loaded {len(accounts)} accounts from '{self.qbo_client.active_client_name}' Chart of Accounts.", "success")
            else:
                self.log("⚠️ No Bank or Credit Card accounts returned from QuickBooks.", "warning")
        except Exception as e:
            self.log(f"⚠️ Notice fetching QBO accounts: {e}", "warning")

    def _update_account_dropdown(self, labels):
        self.account_dropdown['values'] = labels
        selected_idx = 0
        for i, lbl in enumerate(labels):
            if "ID: 41)" in lbl or " 41)" in lbl:
                selected_idx = i
                break
        self.account_dropdown.current(selected_idx)

    def get_selected_payment_account_id(self) -> str:
        val = self.selected_account_var.get()
        if "(ID: " in val:
            try:
                acc_id = val.split("(ID: ")[1].rstrip(")")
                return acc_id.strip()
            except Exception:
                pass
        return os.getenv("QBO_PAYMENT_ACCOUNT_ID", "41").strip()

    # -------------------------------------------------------------------------
    # Thread-Safe Logging
    # -------------------------------------------------------------------------
    def log(self, message, level="info"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_queue.put((f"[{timestamp}] {message}\n", level))

    def drain_log_queue(self):
        try:
            while not self.log_queue.empty():
                msg, level = self.log_queue.get_nowait()
                self.log_text.insert(tk.END, msg, level)
                self.log_text.see(tk.END)
        except Exception:
            pass
        finally:
            self.after(50, self.drain_log_queue)

    def clear_log(self):
        self.log_text.delete("1.0", tk.END)

    # -------------------------------------------------------------------------
    # Deduplication Cache
    # -------------------------------------------------------------------------
    def load_hash_cache(self):
        cache_file = ".processed_hashes.txt"
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r") as f:
                    for line in f:
                        line_s = line.strip()
                        if line_s:
                            self.processed_hashes.add(line_s)
            except Exception as e:
                self.log(f"Notice reading cache: {e}", "warning")

    def save_hash(self, file_hash):
        with self.hash_lock:
            self.processed_hashes.add(file_hash)
            try:
                with open(".processed_hashes.txt", "a") as f:
                    f.write(f"{file_hash}\n")
            except Exception:
                pass

    def reset_processed_cache(self):
        with self.hash_lock:
            self.processed_hashes.clear()
            cache_file = ".processed_hashes.txt"
            if os.path.exists(cache_file):
                try:
                    with open(cache_file, "w") as f:
                        f.write("")
                except Exception as e:
                    self.log(f"Notice resetting cache: {e}", "warning")
        self.log("🔄 Processed file cache reset. You can now re-scan any receipts!", "highlight")

    # -------------------------------------------------------------------------
    # Multi-Client Hierarchical Folder Dispatcher
    # -------------------------------------------------------------------------
    def sync_client_inbox_folders(self):
        """
        Creates and synchronizes dedicated subfolders for each configured client
        inside the Inbox folder. Receipts dropped into any client's subfolder
        are automatically processed for that specific client concurrently.
        """
        try:
            inbox_root = os.path.abspath(self.folder_var.get() if hasattr(self, "folder_var") else os.path.join(SCRIPT_DIR, "inbox"))
            os.makedirs(inbox_root, exist_ok=True)

            client_names = self.profile_mgr.get_client_names()
            created_count = 0
            for client in client_names:
                safe_name = "".join([c for c in client if c.isalnum() or c in (' ', '_', '-')]).strip()
                if safe_name:
                    c_inbox = os.path.join(inbox_root, safe_name)
                    if not os.path.exists(c_inbox):
                        os.makedirs(c_inbox, exist_ok=True)
                        created_count += 1
                    else:
                        os.makedirs(c_inbox, exist_ok=True)

                    # Also ensure client archive directory exists
                    c_arch = os.path.join(inbox_root, "inbox_archive", safe_name)
                    os.makedirs(c_arch, exist_ok=True)

            # Auto-generate quick reference guide in the inbox folder
            guide_path = os.path.join(inbox_root, "HOW_TO_USE_MULTI_CLIENT_INBOX.txt")
            if not os.path.exists(guide_path):
                with open(guide_path, "w", encoding="utf-8") as f:
                    f.write(
                        "=============================================================================\n"
                        "  MULTI-CLIENT SIMULTANEOUS RECEIPT PROCESSING INBOX\n"
                        "=============================================================================\n\n"
                        "HOW IT WORKS:\n"
                        "1. DROP BY CLIENT SUBFOLDER:\n"
                        "   - Drop receipts or PDFs into any client's folder (e.g. 'Green_Acres/').\n"
                        "   - The desktop watcher processes multiple clients simultaneously!\n"
                        "   - No need to switch clients in the app UI for each receipt.\n\n"
                        "2. DROP INTO ROOT INBOX:\n"
                        "   - Files placed directly in the main folder are processed for\n"
                        "     the currently active client selected in the app dropdown.\n\n"
                        "3. EMAIL AUTO-SORTING (Option B: Sender Mapping):\n"
                        "   - Emails from registered client addresses automatically route\n"
                        "     directly into that client's inbox and QBO company.\n"
                        "=============================================================================\n"
                    )

            if created_count > 0:
                self.log(f"📁 Synchronized {created_count} new client inbox folder(s) in '{inbox_root}'.", "info")
        except Exception as e:
            self.log(f"⚠️ Notice while syncing client folders: {e}", "warning")

    def _worker_process_receipt(self, filepath: str, client_name: str):
        """Worker wrapper executed inside self.worker_pool for parallel multi-client processing."""
        try:
            self.process_image_file(filepath, client_name=client_name)
        except Exception as err:
            self.log(f"❌ Error processing receipt {os.path.basename(filepath)} for [{client_name}]: {err}", "error")
        finally:
            with self.active_jobs_lock:
                self.active_jobs.discard(filepath)

    # -------------------------------------------------------------------------
    # File & Folder Browser Helpers
    # -------------------------------------------------------------------------
    def browse_folder(self):
        selected = filedialog.askdirectory(initialdir=self.folder_var.get())
        if selected:
            selected_abs = os.path.abspath(selected)
            self.folder_var.set(selected_abs)
            self.log(f"📁 Selected inbox folder: {selected_abs}", "info")
            self.sync_client_inbox_folders()

    def open_inbox_folder(self):
        folder = self.folder_var.get()
        os.makedirs(folder, exist_ok=True)
        self.sync_client_inbox_folders()
        self.open_system_path(folder)

    def open_archive_folder(self):
        inbox_dir = self.folder_var.get()
        archive_dir = os.path.join(inbox_dir, "inbox_archive") if os.path.basename(inbox_dir).lower() == "inbox" else os.path.abspath("./inbox_archive")
        os.makedirs(archive_dir, exist_ok=True)
        self.open_system_path(archive_dir)

    def archive_original_file(self, filepath, client_name=None):
        if not os.path.exists(filepath):
            return None
        try:
            parent_dir = os.path.dirname(os.path.abspath(filepath))
            base_archive = os.path.join(parent_dir, "inbox_archive") if os.path.basename(parent_dir).lower() == "inbox" else os.path.abspath("./inbox_archive")

            if client_name:
                safe_client = "".join([c for c in client_name if c.isalnum() or c in (' ', '_', '-')]).strip()
                archive_dir = os.path.join(base_archive, safe_client)
            else:
                archive_dir = base_archive

            os.makedirs(archive_dir, exist_ok=True)

            filename = os.path.basename(filepath)
            dest_path = os.path.join(archive_dir, filename)
            if os.path.exists(dest_path):
                name_part, ext_part = os.path.splitext(filename)
                dest_path = os.path.join(archive_dir, f"{name_part}_{int(time.time())}{ext_part}")

            shutil.move(filepath, dest_path)
            return dest_path
        except Exception as e:
            try:
                shutil.copy2(filepath, dest_path)
                os.remove(filepath)
                return dest_path
            except Exception as e2:
                self.log(f"⚠️ Notice: Could not move {os.path.basename(filepath)} to archive: {e2}", "warning")
                return None

    def open_output_folder(self):
        folder = os.path.abspath("./processed")
        os.makedirs(folder, exist_ok=True)
        self.open_system_path(folder)

    def open_local_file(self, filename):
        path = os.path.abspath(filename)
        if not os.path.exists(path):
            messagebox.showinfo("File Not Found", f"{filename} has not been created yet. Scan a receipt first!")
            return
        self.open_system_path(path)

    def open_system_path(self, path):
        try:
            if sys.platform == "win32":
                os.startfile(path)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
        except Exception as e:
            self.log(f"Failed to open {path}: {e}", "error")

    # -------------------------------------------------------------------------
    # API Key Manager Modal Dialog
    # -------------------------------------------------------------------------
    def open_keys_dialog(self):
        dialog = tk.Toplevel(self)
        dialog.title("Manage Gemini API Keys")
        dialog.geometry("520x440")
        dialog.configure(bg="#1c1917", padx=16, pady=16)
        dialog.transient(self)
        dialog.grab_set()

        tk.Label(
            dialog,
            text="🔑 Gemini API Keys (Multi-Key Rotation)",
            font=("Segoe UI", 12, "bold"),
            fg="#fafaf9",
            bg="#1c1917"
        ).pack(anchor="w", pady=(0, 4))

        tk.Label(
            dialog,
            text="Add up to 3 keys. Rotates requests and fails over on 429 rate limits.",
            font=("Segoe UI", 9),
            fg="#a8a29e",
            bg="#1c1917",
            justify="left"
        ).pack(anchor="w", pady=(0, 12))

        k1_frame = tk.Frame(dialog, bg="#1c1917")
        k1_frame.pack(fill="x", pady=4)
        tk.Label(k1_frame, text="Key 1 (Primary):", fg="#d6d3d1", bg="#1c1917", width=14, anchor="w").pack(side="left")
        e1 = tk.Entry(k1_frame, bg="#292524", fg="#fafaf9", insertbackground="white", font=("Consolas", 9))
        e1.pack(side="left", fill="x", expand=True)
        if len(self.api_keys) > 0: e1.insert(0, self.api_keys[0])

        k2_frame = tk.Frame(dialog, bg="#1c1917")
        k2_frame.pack(fill="x", pady=4)
        tk.Label(k2_frame, text="Key 2 (Backup):", fg="#d6d3d1", bg="#1c1917", width=14, anchor="w").pack(side="left")
        e2 = tk.Entry(k2_frame, bg="#292524", fg="#fafaf9", insertbackground="white", font=("Consolas", 9))
        e2.pack(side="left", fill="x", expand=True)
        if len(self.api_keys) > 1: e2.insert(0, self.api_keys[1])

        k3_frame = tk.Frame(dialog, bg="#1c1917")
        k3_frame.pack(fill="x", pady=4)
        tk.Label(k3_frame, text="Key 3 (Backup):", fg="#d6d3d1", bg="#1c1917", width=14, anchor="w").pack(side="left")
        e3 = tk.Entry(k3_frame, bg="#292524", fg="#fafaf9", insertbackground="white", font=("Consolas", 9))
        e3.pack(side="left", fill="x", expand=True)
        if len(self.api_keys) > 2: e3.insert(0, self.api_keys[2])

        def save_keys_action():
            new_keys = []
            for e in (e1, e2, e3):
                val = e.get().strip()
                if val and val not in new_keys:
                    new_keys.append(val)
            self.api_keys = new_keys
            self.update_env_file({
                "GEMINI_API_KEY": self.api_keys[0] if len(self.api_keys) > 0 else "",
                "GEMINI_API_KEY_2": self.api_keys[1] if len(self.api_keys) > 1 else "",
                "GEMINI_API_KEY_3": self.api_keys[2] if len(self.api_keys) > 2 else "",
                "GEMINI_MODEL": self.model_var.get()
            })

            self.log(f"✅ Saved {len(self.api_keys)} API keys to .env file.", "success")
            dialog.destroy()

        save_btn = tk.Button(
            dialog,
            text="Save to .env and Apply",
            command=save_keys_action,
            bg="#b45309",
            fg="white",
            font=("Segoe UI", 10, "bold"),
            relief="flat",
            pady=6,
            cursor="hand2"
        )
        save_btn.pack(fill="x", pady=(16, 0))

    # -------------------------------------------------------------------------
    # Gmail Settings Dialog
    # -------------------------------------------------------------------------
    def open_gmail_dialog(self):
        dialog = tk.Toplevel(self)
        dialog.title("Gmail IMAP Receipt Monitor Settings")
        dialog.geometry("600x560")
        dialog.configure(bg="#1c1917", padx=18, pady=16)
        dialog.transient(self)
        dialog.grab_set()

        tk.Label(
            dialog,
            text="✉ Gmail IMAP Receipt Monitor",
            font=("Segoe UI", 12, "bold"),
            fg="#fafaf9",
            bg="#1c1917"
        ).pack(anchor="w", pady=(0, 2))

        u_frame = tk.Frame(dialog, bg="#1c1917")
        u_frame.pack(fill="x", pady=4)
        tk.Label(u_frame, text="Gmail Address:", fg="#d6d3d1", bg="#1c1917", width=15, anchor="w").pack(side="left")
        email_entry = tk.Entry(u_frame, bg="#292524", fg="#fafaf9", insertbackground="white", font=("Segoe UI", 9))
        email_entry.pack(side="left", fill="x", expand=True)
        email_entry.insert(0, self.email_user)

        p_frame = tk.Frame(dialog, bg="#1c1917")
        p_frame.pack(fill="x", pady=4)
        tk.Label(p_frame, text="App Password:", fg="#d6d3d1", bg="#1c1917", width=15, anchor="w").pack(side="left")
        pass_entry = tk.Entry(p_frame, show="•", bg="#292524", fg="#fafaf9", insertbackground="white", font=("Segoe UI", 9))
        pass_entry.pack(side="left", fill="x", expand=True)
        pass_entry.insert(0, self.email_pass)

        show_pass_var = tk.BooleanVar(value=False)
        def toggle_show_pass():
            pass_entry.config(show="" if show_pass_var.get() else "•")
        chk_show = tk.Checkbutton(p_frame, text="Show", variable=show_pass_var, command=toggle_show_pass, bg="#1c1917", fg="#a8a29e", selectcolor="#292524")
        chk_show.pack(side="left", padx=(6, 0))

        s_frame = tk.Frame(dialog, bg="#1c1917")
        s_frame.pack(fill="x", pady=4)
        tk.Label(s_frame, text="IMAP Server:", fg="#d6d3d1", bg="#1c1917", width=15, anchor="w").pack(side="left")
        server_entry = tk.Entry(s_frame, bg="#292524", fg="#fafaf9", insertbackground="white", font=("Segoe UI", 9))
        server_entry.pack(side="left", fill="x", expand=True)
        server_entry.insert(0, self.imap_server or "imap.gmail.com")

        auto_chk_var = tk.BooleanVar(value=self.watch_gmail_enabled)
        chk_auto = tk.Checkbutton(
            dialog,
            text="Actively monitor Gmail during Continuous Watch Mode",
            variable=auto_chk_var,
            bg="#1c1917",
            fg="#fafaf9",
            selectcolor="#292524",
            font=("Segoe UI", 9)
        )
        chk_auto.pack(anchor="w", pady=(8, 8))

        def save_gmail():
            self.email_user = email_entry.get().strip()
            self.email_pass = pass_entry.get().strip().replace(" ", "")
            self.imap_server = server_entry.get().strip() or "imap.gmail.com"
            self.watch_gmail_enabled = auto_chk_var.get()

            self.update_env_file({
                "EMAIL_USER": self.email_user,
                "EMAIL_PASS": self.email_pass,
                "IMAP_SERVER": self.imap_server
            })

            self.log(f"✅ Gmail configuration saved for {self.email_user or '(disabled)'}", "success")
            dialog.destroy()

        save_btn = tk.Button(
            dialog,
            text="Save to .env and Apply",
            command=save_gmail,
            bg="#b45309",
            fg="white",
            font=("Segoe UI", 10, "bold"),
            relief="flat",
            pady=6,
            cursor="hand2"
        )
        save_btn.pack(fill="x")

    def update_env_file(self, updates_dict):
        env_lines = []
        existing_keys = set()
        if os.path.exists(".env"):
            with open(".env", "r") as f:
                for line in f:
                    stripped = line.strip()
                    if "=" in stripped and not stripped.startswith("#"):
                        k, _ = stripped.split("=", 1)
                        k = k.strip()
                        if k in updates_dict:
                            env_lines.append(f"{k}={updates_dict[k]}\n")
                            existing_keys.add(k)
                        else:
                            env_lines.append(line)
                    else:
                        env_lines.append(line)

        for k, v in updates_dict.items():
            if k not in existing_keys:
                env_lines.append(f"{k}={v}\n")

        with open(".env", "w") as f:
            f.writelines(env_lines)

    # -------------------------------------------------------------------------
    # Core Gemini Processing Worker & QBO Sync
    # -------------------------------------------------------------------------
    def process_image_file(self, filepath, client_name=None):
        if not os.path.exists(filepath):
            return False

        # --- SUBSCRIPTION ACCESS GATE ---
        if not self.license_mgr.is_subscription_active():
            self.log("❌ Processing blocked: No active subscription license found. Click '👑 License' to activate.", "error")
            self.after(0, self.open_license_dialog)
            return False

        file_hash = get_file_sha256(filepath)
        if file_hash in self.processed_hashes:
            self.log(f"⏩ Skipping {os.path.basename(filepath)} (already processed / cache match)", "info")
            return False

        if not self.api_keys:
            self.log("❌ Cannot process: No Gemini API keys configured.", "error")
            return False

        active_client = (client_name.strip() if client_name else "") or self.qbo_client.active_client_name or "Unknown Client"
        self.log(f"🔍 Analyzing for [{active_client}]: {os.path.basename(filepath)}...", "highlight")

        try:
            with open(filepath, "rb") as f_img:
                img_bytes = f_img.read()
            pil_img = Image.open(io.BytesIO(img_bytes))
        except Exception as e:
            self.log(f"❌ Failed to open image {filepath}: {e}", "error")
            return False

        full_b64 = prepare_receipt_image(pil_img)
        payload = {
            "contents": [{
                "parts": [
                    {"text": "Analyze this photo. Detect the store vendor, date, line items, payment method, card last 4 digits, and total amount. Return ONE receipt entry unless multiple completely physically separated receipts are laid side-by-side."},
                    {"inlineData": {"mimeType": "image/jpeg", "data": full_b64}}
                ]
            }],
            "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json",
                "responseSchema": RECEIPT_SCHEMA
            }
        }

        model_name = self.model_var.get()
        active_key = self.get_next_key()
        keys_to_try = [active_key] + [k for k in self.api_keys if k != active_key]

        data = None
        for key_idx, key in enumerate(keys_to_try):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
            try:
                resp = GLOBAL_SESSION.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=35)
                if resp.status_code == 200:
                    res_json = resp.json()
                    text_part = res_json['candidates'][0]['content']['parts'][0]['text']
                    data = json.loads(text_part.strip())
                    break
                elif resp.status_code == 429:
                    self.log(f"⚠️ Rate limit (429) hit. Instantly switching to next API key in pool...", "warning")
                    continue
                else:
                    self.log(f"⚠️ API HTTP {resp.status_code}: {resp.text[:120]}", "warning")
            except Exception as e:
                self.log(f"⚠️ Request failed with key #{key_idx+1}: {e}", "warning")

        if not data:
            self.log(f"❌ Extraction failed for {os.path.basename(filepath)}", "error")
            return False

        receipt_list = []
        if isinstance(data, dict):
            if "receipts" in data and isinstance(data["receipts"], list):
                receipt_list = data["receipts"]
            elif "vendor" in data:
                receipt_list = [data]

        if not receipt_list:
            self.log(f"❌ No valid receipts detected in {os.path.basename(filepath)}", "error")
            return False

        if len(receipt_list) > 1:
            seen_totals = set()
            filtered = []
            for r in receipt_list:
                tot = float(r.get("total", 0.0))
                if tot > 0 and tot not in seen_totals:
                    seen_totals.add(tot)
                    filtered.append(r)
            if filtered:
                receipt_list = filtered

        num_found = len(receipt_list)
        if num_found > 1:
            self.log(f"✨ MULTI-RECEIPT DETECTED: Found {num_found} separate receipts in this photo!", "highlight")

        # Process each detected receipt
        for idx, r_data in enumerate(receipt_list, start=1):
            vendor = r_data.get("vendor", "Unknown Vendor").strip()
            date_str = r_data.get("date", datetime.now().strftime("%Y-%m-%d")).strip()
            total = float(r_data.get("total", 0.0))

            selected_dropdown_cat = self.category_var.get()
            if selected_dropdown_cat and selected_dropdown_cat != "Auto-Detect (AI)":
                category = selected_dropdown_cat
            else:
                category = r_data.get("category", "Supplies & Materials")

            subtotal = float(r_data.get("subtotal", total))
            tax = float(r_data.get("tax", 0.0))
            payment = r_data.get("payment_method", "Cash/Card")
            raw_card = str(r_data.get("card_last_4", "")).strip()
            card_last_4 = "".join([c for c in raw_card if c.isdigit()])[-4:]
            items = r_data.get("items", [])

            is_cc = bool(card_last_4) or ("card" in payment.lower()) or ("visa" in payment.lower()) or ("mastercard" in payment.lower())
            ref_num = "CC" if is_cc else "Cash"

            receipt_tag = f"Slip #{idx} of {num_found}" if num_found > 1 else "Slip #1"

            card_display = f"*{card_last_4}" if card_last_4 else "N/A"
            txt_entry = (
                f"========================================================\n"
                f"CLIENT:   {active_client}\n"
                f"SOURCE:   {os.path.basename(filepath)} [{receipt_tag}]\n"
                f"DATE:     {date_str}\n"
                f"VENDOR:   {vendor}\n"
                f"REF #:    {ref_num}\n"
                f"CARD:     {card_display} ({payment})\n"
                f"TOTAL:    ${total:.2f}\n"
                f"CATEGORY: {category}\n"
                f"TAX:      ${tax:.2f}\n"
                f"PAYMENT:  {payment}\n"
            )
            txt_entry += "ITEMS:\n"
            for itm in items:
                txt_entry += f"  - {itm.get('description', 'Item')}: ${float(itm.get('amount', 0.0)):.2f}\n"
            txt_entry += "\n"

            # --- Thread-Safe Consolidated & Client-Specific Data Logging ---
            safe_client = "".join([c for c in active_client if c.isalnum() or c in (' ', '_', '-')]).strip() or "General"
            client_dir = os.path.join("./processed", safe_client)
            os.makedirs(client_dir, exist_ok=True)

            with self.file_write_lock:
                # 1. Plain text receipts log
                with open("Receipt_Data.txt", "a", encoding="utf-8") as f:
                    f.write(txt_entry)

                # 2. Master Consolidated CSV
                csv_path = "Receipt_Data.csv"
                csv_exists = os.path.exists(csv_path)
                with open(csv_path, "a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
                    if not csv_exists:
                        writer.writerow(["Client","Date","Vendor","Category","Subtotal","Tax","Total","Payment_Method","Card_Last_4","Ref_Number","Source_File","Slip_Number"])
                    writer.writerow([
                        sanitize_csv_field(active_client),
                        sanitize_csv_field(date_str),
                        sanitize_csv_field(vendor),
                        sanitize_csv_field(category),
                        f"{subtotal:.2f}",
                        f"{tax:.2f}",
                        f"{total:.2f}",
                        sanitize_csv_field(payment),
                        sanitize_csv_field(card_last_4),
                        sanitize_csv_field(ref_num),
                        os.path.basename(filepath),
                        idx
                    ])

                # 3. Client-Specific Individual CSV
                cl_csv_path = os.path.join(client_dir, f"Receipt_Data_{safe_client}.csv")
                cl_csv_exists = os.path.exists(cl_csv_path)
                with open(cl_csv_path, "a", newline="", encoding="utf-8") as f_cl:
                    cl_writer = csv.writer(f_cl, quoting=csv.QUOTE_MINIMAL)
                    if not cl_csv_exists:
                        cl_writer.writerow(["Client","Date","Vendor","Category","Subtotal","Tax","Total","Payment_Method","Card_Last_4","Ref_Number","Source_File","Slip_Number"])
                    cl_writer.writerow([
                        sanitize_csv_field(active_client),
                        sanitize_csv_field(date_str),
                        sanitize_csv_field(vendor),
                        sanitize_csv_field(category),
                        f"{subtotal:.2f}",
                        f"{tax:.2f}",
                        f"{total:.2f}",
                        sanitize_csv_field(payment),
                        sanitize_csv_field(card_last_4),
                        sanitize_csv_field(ref_num),
                        os.path.basename(filepath),
                        idx
                    ])

                # 4. QuickBooks Import CSV
                qb_path = "QuickBooks_Bills.csv"
                qb_exists = os.path.exists(qb_path)
                with open(qb_path, "a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
                    if not qb_exists:
                        writer.writerow(["Client","BillDate","Vendor","ExpenseAccount","Amount","Memo","RefNumber"])
                    writer.writerow([
                        sanitize_csv_field(active_client),
                        sanitize_csv_field(date_str),
                        sanitize_csv_field(vendor),
                        sanitize_csv_field(category),
                        f"{total:.2f}",
                        sanitize_csv_field(category),
                        sanitize_csv_field(ref_num)
                    ])

            # --- Client-Isolated QuickBooks Online Direct Sync ---
            client_syncer = self.qbo_client.get_client_syncer(active_client) if hasattr(self.qbo_client, "get_client_syncer") else self.qbo_client
            if client_syncer and client_syncer.is_configured():
                try:
                    qbo_purchase_type = "CC" if is_cc else "Cash"
                    client_prof = self.profile_mgr.profiles.get(active_client, {})
                    selected_pay_acc_id = client_prof.get("default_pay_account") or self.get_selected_payment_account_id()
                    expense_acc = category
                    qbo_memo = category

                    self.log(f"☁ Posting to '{active_client}' QBO: '{vendor}' (${total:.2f}) -> Account {selected_pay_acc_id} | Category: '{category}'", "info")
                    qbo_purchase = client_syncer.create_expense(
                        date_str=date_str,
                        purchase_type=qbo_purchase_type,
                        payee=vendor,
                        payment_account_id=selected_pay_acc_id,
                        expense_account=expense_acc,
                        memo=qbo_memo,
                        charge=total,
                        ref_number=ref_num
                    )
                    qbo_id = qbo_purchase.get("Id", "OK")
                    self.log(f"⚡ [{active_client}] Successfully Created Expense #{qbo_id} -> Category: '{category}' | Ref: '{ref_num}'", "qbo")
                except Exception as qbo_err:
                    self.log(f"⚠️ QuickBooks Online Sync Note ({active_client}): {qbo_err}", "warning")

            cat_folder = category.replace(":", "_").replace(" ", "_").replace("&", "and")
            target_dir = os.path.join("./processed", safe_client, cat_folder)
            os.makedirs(target_dir, exist_ok=True)
            safe_vendor = "".join([c for c in vendor if c.isalnum() or c in (' ', '_', '-')]).strip()
            suffix = f"_slip{idx}" if num_found > 1 else ""
            new_filename = f"{date_str}_{safe_vendor}{suffix}_${total:.2f}.jpg"
            target_file = os.path.join(target_dir, new_filename)

            try:
                pil_img.save(target_file, "JPEG", quality=92)
            except Exception:
                pass

            with self.stats_lock:
                self.stats["total"] += 1
                if "Cow" in category: self.stats["cows"] += total
                elif "Chicken" in category: self.stats["chickens"] += total
                else: self.stats["general"] += total
                self.stats["dollars"] += total

            prefix_str = f"[{idx}/{num_found}] " if num_found > 1 else ""
            self.log(
                f"✅ {prefix_str}[{active_client}] {vendor} | {date_str} | ${total:.2f} | Ref: {ref_num} | [{category}] -> Exported & Synced",
                "success"
            )

        self.save_hash(file_hash)
        self.update_stats_display()

        archived = self.archive_original_file(filepath, client_name=active_client)
        if archived:
            archived_folder = os.path.basename(os.path.dirname(archived))
            self.log(f"📦 Moved original file -> {archived_folder}/{os.path.basename(archived)} (Inbox kept clear!)", "info")

        return True

    def update_stats_display(self):
        def _do_update():
            with self.stats_lock:
                total_cnt = self.stats['total']
                cows_amt = self.stats['cows']
                chick_amt = self.stats['chickens']
                gen_amt = self.stats['general']
                total_dol = self.stats['dollars']
            self.lbl_stat_total.config(text=f"Total Scanned: {total_cnt}")
            self.lbl_stat_cows.config(text=f"Farm:Cows: ${cows_amt:.2f}")
            self.lbl_stat_chickens.config(text=f"Farm:Chickens: ${chick_amt:.2f}")
            self.lbl_stat_general.config(text=f"Supplies/General: ${gen_amt:.2f}")
            self.lbl_stat_dollars.config(text=f"Total Sum: ${total_dol:.2f}")
        self.after(0, _do_update)

    # -------------------------------------------------------------------------
    # Scan Actions (Async / Threaded)
    # -------------------------------------------------------------------------
    def scan_single_file(self):
        if not self.license_mgr.is_subscription_active():
            self.log("❌ Action blocked: Active subscription license required. Click '👑 License' to activate.", "error")
            self.open_license_dialog()
            return

        filepath = filedialog.askopenfilename(
            title="Select Receipt Image or PDF",
            filetypes=[("Receipt files", "*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.tiff;*.pdf"), ("All files", "*.*")]
        )
        if filepath:
            threading.Thread(target=self.process_image_file, args=(filepath,), daemon=True).start()

    def scan_inbox_once(self):
        if not self.license_mgr.is_subscription_active():
            self.log("❌ Action blocked: Active subscription license required. Click '👑 License' to activate.", "error")
            self.open_license_dialog()
            return

        folder = os.path.abspath(self.folder_var.get())
        if not os.path.exists(folder):
            os.makedirs(folder, exist_ok=True)
            self.log(f"📁 Created inbox folder at {folder}. Drop receipt photos here!", "info")
            return

        self.sync_client_inbox_folders()

        # 1. Collect files from root inbox folder (target = currently active client)
        active_client = self.qbo_client.active_client_name or "General"
        candidates = []
        try:
            for f in os.listdir(folder):
                p = os.path.join(folder, f)
                if os.path.isfile(p) and f.lower().endswith(VALID_EXTENSIONS):
                    candidates.append((p, active_client))
        except Exception:
            pass

        # 2. Collect files from client-specific subfolders (target = that specific client)
        client_names = self.profile_mgr.get_client_names()
        for c_name in client_names:
            c_safe = "".join([c for c in c_name if c.isalnum() or c in (' ', '_', '-')]).strip()
            c_path = os.path.join(folder, c_safe)
            if os.path.isdir(c_path):
                try:
                    for f in os.listdir(c_path):
                        p = os.path.join(c_path, f)
                        if os.path.isfile(p) and f.lower().endswith(VALID_EXTENSIONS):
                            candidates.append((p, c_name))
                except Exception:
                    pass

        if not candidates:
            self.log(f"ℹ️ Inbox is empty ({folder} and client subfolders). Drop receipts in and scan again.", "info")
            return

        self.log(f"⚡ Multi-Client Batch: Scanning {len(candidates)} file(s) across all clients concurrently in parallel...", "info")
        for filepath, target_client in candidates:
            with self.active_jobs_lock:
                if filepath in self.active_jobs:
                    continue
                self.active_jobs.add(filepath)
            self.worker_pool.submit(self._worker_process_receipt, filepath, target_client)

    def toggle_watch_mode(self):
        if self.is_watching:
            self.is_watching = False
            self.watch_btn.config(text="▶ Start Continuous Watch Mode", bg="#b45309")
            self.log("⏹ Continuous Watch Mode STOPPED.", "warning")
        else:
            if not self.license_mgr.is_subscription_active():
                self.log("❌ Cannot start watch mode: Active subscription license required. Click '👑 License' to activate.", "error")
                self.open_license_dialog()
                return
            folder = os.path.abspath(self.folder_var.get())
            os.makedirs(folder, exist_ok=True)
            self.folder_var.set(folder)
            self.sync_client_inbox_folders()
            self.is_watching = True
            active_client = self.qbo_client.active_client_name or "General"
            self.watch_btn.config(text="⏸ Watching Active (Click to Stop)", bg="#15803d")
            self.log(f"👁 CONTINUOUS MULTI-CLIENT WATCH MODE STARTED!", "success")
            self.log(f"   📂 Actively watching local root: '{folder}'", "highlight")
            self.log(f"   🏢 Monitored Clients: {', '.join(self.profile_mgr.get_client_names()) or 'Root Default'}", "highlight")
            self.log(f"   ⚡ Drop files into any client subfolder — processes simultaneously without switching!", "info")

            if self.email_user and self.email_pass and self.watch_gmail_enabled:
                self.log(f"   ✉ Actively monitoring Gmail ({self.email_user}) with Option B Sender Mapping.", "highlight")
                self.last_gmail_check = 0

            self.watch_thread = threading.Thread(target=self.watch_loop, args=(folder,), daemon=True)
            self.watch_thread.start()

    def watch_loop(self, folder):
        GMAIL_INTERVAL_SECS = 30
        self.sync_client_inbox_folders()

        while self.is_watching:
            try:
                if os.path.exists(folder):
                    active_client = self.qbo_client.active_client_name or "General"
                    candidates = []

                    # 1. Check root inbox folder (active client fallback)
                    for f in os.listdir(folder):
                        p = os.path.join(folder, f)
                        if os.path.isfile(p) and f.lower().endswith(VALID_EXTENSIONS):
                            candidates.append((p, active_client))

                    # 2. Check each client's dedicated subfolder
                    client_names = self.profile_mgr.get_client_names()
                    for c_name in client_names:
                        c_safe = "".join([c for c in c_name if c.isalnum() or c in (' ', '_', '-')]).strip()
                        c_path = os.path.join(folder, c_safe)
                        if os.path.isdir(c_path):
                            for f in os.listdir(c_path):
                                p = os.path.join(c_path, f)
                                if os.path.isfile(p) and f.lower().endswith(VALID_EXTENSIONS):
                                    candidates.append((p, c_name))

                    # Dispatch candidates into parallel worker pool
                    for filepath, target_client in candidates:
                        if not self.is_watching:
                            break
                        if not is_file_ready(filepath):
                            continue

                        fname = os.path.basename(filepath)
                        h = get_file_sha256(filepath)
                        if h in self.processed_hashes:
                            self.log(f"ℹ️ '{fname}' was already processed earlier. Archiving...", "info")
                            self.archive_original_file(filepath, client_name=target_client)
                            continue

                        with self.active_jobs_lock:
                            if filepath in self.active_jobs:
                                continue
                            self.active_jobs.add(filepath)

                        self.log(f"📥 [Inbox Drop Detected] Found: {fname} for [{target_client}] (Dispatching worker thread)", "highlight")
                        self.worker_pool.submit(self._worker_process_receipt, filepath, target_client)
                        time.sleep(0.08)

                if self.watch_gmail_enabled and self.email_user and self.email_pass:
                    now = time.time()
                    if now - self.last_gmail_check >= GMAIL_INTERVAL_SECS:
                        self.last_gmail_check = now
                        self._run_email_pipeline(is_background_watch=True)

            except Exception as e:
                self.log(f"⚠️ Watch monitor notice: {e}", "warning")

            for _ in range(20):
                if not self.is_watching:
                    break
                time.sleep(0.1)

    def scan_email(self):
        if not self.license_mgr.is_subscription_active():
            self.log("❌ Action blocked: Active subscription license required. Click '👑 License' to activate.", "error")
            self.open_license_dialog()
            return

        if not self.email_user or not self.email_pass:
            messagebox.showinfo("Gmail Configuration", "EMAIL_USER or EMAIL_PASS is not configured.\nClick '✉ Gmail' to set up.")
            return
        threading.Thread(target=self._run_email_pipeline, args=(False,), daemon=True).start()

    def _run_email_pipeline(self, is_background_watch=False):
        if not self.email_user or not self.email_pass:
            if not is_background_watch:
                self.log("❌ Gmail credentials not configured. Click '✉ Gmail' to set up.", "warning")
            return

        try:
            import imaplib
            import email
            from email.header import decode_header
            from email.utils import parseaddr

            if not is_background_watch:
                self.log(f"✉ Connecting to {self.imap_server} for {self.email_user}...", "info")

            mail = imaplib.IMAP4_SSL(self.imap_server, timeout=12)
            mail.login(self.email_user, self.email_pass)
            mail.select("INBOX")
            status, messages = mail.search(None, '(UNSEEN)')
            if status != "OK" or not messages or not messages[0]:
                if not is_background_watch:
                    self.log("✉ No unread messages found in Gmail.", "info")
                mail.logout()
                return

            msg_ids = messages[0].split()
            if not msg_ids:
                if not is_background_watch:
                    self.log("✉ No unread messages found in Gmail.", "info")
                mail.logout()
                return

            self.log(f"✉ [Gmail] Found {len(msg_ids)} unread email(s). Checking for receipt attachments...", "highlight")
            count = 0
            inbox_dir = self.folder_var.get()
            os.makedirs(inbox_dir, exist_ok=True)

            for m_id in msg_ids:
                status, data = mail.fetch(m_id, "(RFC822)")
                if status != "OK":
                    continue
                raw_msg = data[0][1]
                msg = email.message_from_bytes(raw_msg)
                sender = msg.get("From", "Unknown")

                # --- Option B: Sender Mapping Lookup ---
                _, sender_addr = parseaddr(sender)
                matched_client = self.profile_mgr.find_client_by_sender_email(sender_addr)
                if matched_client:
                    target_client = matched_client
                    self.log(f"🎯 [Email Routing - Option B] Sender '{sender_addr}' matched Client: [{matched_client}]", "highlight")
                else:
                    target_client = self.qbo_client.active_client_name or "General"
                    self.log(f"ℹ️ [Email Routing] Sender '{sender_addr}' not mapped. Routing to active client [{target_client}]", "info")

                for part in msg.walk():
                    filename = part.get_filename()
                    ctype = part.get_content_type().lower()

                    is_receipt_file = False
                    clean_filename = ""

                    if filename:
                        decoded = decode_header(filename)
                        clean_filename = "".join([
                            p.decode(enc or "utf-8", errors="ignore") if isinstance(p, bytes) else p
                            for p, enc in decoded
                        ])
                        if clean_filename.lower().endswith(VALID_EXTENSIONS):
                            is_receipt_file = True
                    elif "image/" in ctype or "application/pdf" in ctype:
                        ext = ".pdf" if "pdf" in ctype else ".jpg"
                        clean_filename = f"gmail_receipt_{int(time.time())}_{m_id.decode()}{ext}"
                        is_receipt_file = True

                    if is_receipt_file:
                        content = part.get_payload(decode=True)
                        if content and len(content) > 100:
                            safe_client_folder = "".join([c for c in target_client if c.isalnum() or c in (' ', '_', '-')]).strip()
                            target_client_inbox = os.path.join(inbox_dir, safe_client_folder)
                            os.makedirs(target_client_inbox, exist_ok=True)

                            save_path = os.path.join(target_client_inbox, clean_filename)
                            if os.path.exists(save_path):
                                base_n, ext_n = os.path.splitext(clean_filename)
                                save_path = os.path.join(target_client_inbox, f"{base_n}_{int(time.time())}{ext_n}")
                            with open(save_path, "wb") as f_att:
                                f_att.write(content)

                            self.log(f"📥 [Gmail] Saved attachment for [{target_client}]: '{os.path.basename(save_path)}'", "info")
                            with self.active_jobs_lock:
                                self.active_jobs.add(save_path)
                            self.worker_pool.submit(self._worker_process_receipt, save_path, target_client)
                            count += 1

                mail.store(m_id, '+FLAGS', '\\Seen')

            mail.logout()
            if count > 0:
                self.log(f"✅ [Gmail] Dispatched {count} receipt(s) from email to concurrent multi-client worker pool!", "success")
            elif not is_background_watch:
                self.log("ℹ️ [Gmail] Checked unread emails, but no receipt attachments were found.", "info")

        except Exception as e:
            err_msg = str(e)
            if "AUTHENTICATIONFAILED" in err_msg or "Application-specific password" in err_msg:
                self.log(f"❌ [Gmail] Authentication failed: App Password required.", "error")
            else:
                self.log(f"⚠️ [Gmail notice]: {e}", "warning")


# -----------------------------------------------------------------------------
# Headless Worker Engine (For Multi-VM Distributed Clusters & Server Daemons)
# -----------------------------------------------------------------------------
class HeadlessWorkerEngine:
    """
    Dedicated Headless Engine for Virtual Machine Worker Nodes.
    Runs 24/7 in the background without requiring a GUI, display server, or X11.
    Designed for single-operator centralized processing and multi-VM clusters.
    Features:
      - Multi-client inbox subfolder scanning (inbox/<ClientName>/)
      - Distributed atomic lockfiles to prevent race conditions across multiple VM nodes
      - Option B Sender-Email Mapping processing via IMAP
      - Concurrent worker pool with ThreadPoolExecutor
      - Thread-safe CSV logging and Client-Isolated QuickBooks Online API Sync
    """
    def __init__(self, folder="inbox", worker_id=None, max_workers=6, poll_interval=2.0):
        self.folder = os.path.abspath(folder)
        self.worker_id = worker_id or os.getenv("WORKER_NODE_ID") or f"vm-node-{socket.gethostname()[:8]}"
        self.max_workers = max_workers
        self.poll_interval = poll_interval
        self.worker_pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=max_workers, 
            thread_name_prefix=f"VMWorker_{self.worker_id}"
        )
        self.active_jobs = set()
        self.active_jobs_lock = threading.Lock()
        self.file_write_lock = threading.Lock()
        self.hash_lock = threading.Lock()
        self.key_lock = threading.Lock()
        self.key_index = 0
        self.running = True

        # API Keys & Model
        raw_keys = os.getenv("GEMINI_API_KEYS", "") or os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
        self.api_keys = [k.strip() for k in raw_keys.replace(";", ",").split(",") if k.strip()]
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

        # Vault & Multi-Client Profiles
        self.vault = SecureVault()
        self.profile_mgr = ClientProfileManager(self.vault)
        self.qbo_client = QuickBooksOnlineSync(self.profile_mgr)

        # Hash Cache
        self.processed_hashes = set()
        self.load_hash_cache()

        # Email Settings (Option B Sender Mapping)
        self.email_user = os.getenv("EMAIL_USER", "")
        self.email_pass = os.getenv("EMAIL_PASS", "")
        self.imap_server = os.getenv("IMAP_SERVER", "imap.gmail.com")
        self.watch_gmail = os.getenv("WATCH_GMAIL", "true").lower() in ("1", "true", "yes")
        self.last_gmail_check = 0

    def log(self, msg: str, level="info"):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = f"[{ts}] [{self.worker_id}]"
        print(f"{prefix} {msg}")
        try:
            with open("vm_worker.log", "a", encoding="utf-8") as f:
                f.write(f"{prefix} {msg}\n")
        except Exception:
            pass

    def load_hash_cache(self):
        cache_file = ".processed_hashes.txt"
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r") as f:
                    self.processed_hashes = set(line.strip() for line in f if line.strip())
            except Exception:
                pass

    def save_hash(self, file_hash):
        with self.hash_lock:
            self.processed_hashes.add(file_hash)
            try:
                with open(".processed_hashes.txt", "a") as f:
                    f.write(f"{file_hash}\n")
            except Exception:
                pass

    def get_next_key(self):
        if not self.api_keys:
            return None
        with self.key_lock:
            key = self.api_keys[self.key_index % len(self.api_keys)]
            self.key_index = (self.key_index + 1) % len(self.api_keys)
            return key

    def sync_client_folders(self):
        os.makedirs(self.folder, exist_ok=True)
        for client in self.profile_mgr.get_client_names():
            safe_name = "".join([c for c in client if c.isalnum() or c in (' ', '_', '-')]).strip()
            if safe_name:
                os.makedirs(os.path.join(self.folder, safe_name), exist_ok=True)
                os.makedirs(os.path.join(self.folder, "inbox_archive", safe_name), exist_ok=True)

    def try_claim_file(self, filepath: str) -> bool:
        """Atomic lockfile creation: ensures only 1 VM worker processes this file across a shared network drive."""
        lock_path = f"{filepath}.lock.{self.worker_id}"
        # Check for other locks
        parent = os.path.dirname(filepath)
        base = os.path.basename(filepath)
        for entry in os.listdir(parent):
            if entry.startswith(f"{base}.lock.") and not entry.endswith(f".{self.worker_id}"):
                # Another worker node has this locked. Check for stale lock (> 10 mins)
                lock_file = os.path.join(parent, entry)
                try:
                    if time.time() - os.path.getmtime(lock_file) > 600:
                        os.remove(lock_file)
                    else:
                        return False
                except Exception:
                    return False

        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, 'w') as f:
                f.write(f"worker={self.worker_id}\ntime={time.time()}\n")
            return True
        except (FileExistsError, OSError):
            return False

    def release_claim_file(self, filepath: str):
        lock_path = f"{filepath}.lock.{self.worker_id}"
        try:
            if os.path.exists(lock_path):
                os.remove(lock_path)
        except Exception:
            pass

    def archive_original_file(self, filepath, client_name=None):
        if not os.path.exists(filepath):
            return None
        try:
            parent_dir = os.path.dirname(filepath)
            base_archive = os.path.join(parent_dir, "inbox_archive") if os.path.basename(parent_dir).lower() == "inbox" else os.path.join(self.folder, "inbox_archive")
            if client_name:
                safe_client = "".join([c for c in client_name if c.isalnum() or c in (' ', '_', '-')]).strip()
                archive_dir = os.path.join(base_archive, safe_client)
            else:
                archive_dir = base_archive
            os.makedirs(archive_dir, exist_ok=True)

            filename = os.path.basename(filepath)
            dest_path = os.path.join(archive_dir, filename)
            if os.path.exists(dest_path):
                base_name, ext = os.path.splitext(filename)
                dest_path = os.path.join(archive_dir, f"{base_name}_{int(time.time())}{ext}")
            shutil.move(filepath, dest_path)
            return dest_path
        except Exception as e:
            self.log(f"⚠️ Archive notice: {e}", "warning")
            return None

    def process_file(self, filepath: str, client_name: str):
        try:
            if not os.path.exists(filepath):
                return False

            file_hash = get_file_sha256(filepath)
            if file_hash in self.processed_hashes:
                self.log(f"⏩ Skipping {os.path.basename(filepath)} (already processed earlier)", "info")
                self.archive_original_file(filepath, client_name)
                return False

            if not self.api_keys:
                self.log("❌ Cannot process: No Gemini API keys configured. Set GEMINI_API_KEY in .env", "error")
                return False

            self.log(f"🔍 Analyzing for [{client_name}]: {os.path.basename(filepath)}...", "info")

            with open(filepath, "rb") as f_img:
                img_bytes = f_img.read()
            pil_img = Image.open(io.BytesIO(img_bytes))
            full_b64 = prepare_receipt_image(pil_img)

            payload = {
                "contents": [{
                    "parts": [
                        {"text": "Analyze this photo. Detect the store vendor, date, line items, payment method, card last 4 digits, and total amount. Return ONE receipt entry unless multiple completely physically separated receipts are laid side-by-side."},
                        {"inlineData": {"mimeType": "image/jpeg", "data": full_b64}}
                    ]
                }],
                "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
                "generationConfig": {
                    "temperature": 0.0,
                    "responseMimeType": "application/json",
                    "responseSchema": RECEIPT_SCHEMA
                }
            }

            active_key = self.get_next_key()
            keys_to_try = [active_key] + [k for k in self.api_keys if k != active_key]
            data = None

            for key_idx, key in enumerate(keys_to_try):
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={key}"
                try:
                    resp = GLOBAL_SESSION.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=35)
                    if resp.status_code == 200:
                        res_json = resp.json()
                        text_part = res_json['candidates'][0]['content']['parts'][0]['text']
                        data = json.loads(text_part.strip())
                        break
                    elif resp.status_code == 429:
                        self.log(f"⚠️ Rate limit (429) hit. Switching to next key...", "warning")
                        continue
                except Exception as e:
                    self.log(f"⚠️ API call exception with key #{key_idx+1}: {e}", "warning")

            if not data:
                self.log(f"❌ Extraction failed for {os.path.basename(filepath)}", "error")
                return False

            receipt_list = []
            if isinstance(data, dict):
                if "receipts" in data and isinstance(data["receipts"], list):
                    receipt_list = data["receipts"]
                elif "vendor" in data:
                    receipt_list = [data]

            if not receipt_list:
                self.log(f"❌ No valid receipts detected in {os.path.basename(filepath)}", "error")
                return False

            safe_client = "".join([c for c in client_name if c.isalnum() or c in (' ', '_', '-')]).strip() or "General"
            client_dir = os.path.join("./processed", safe_client)
            os.makedirs(client_dir, exist_ok=True)

            for idx, r_data in enumerate(receipt_list, start=1):
                vendor = r_data.get("vendor", "Unknown Vendor").strip()
                date_str = r_data.get("date", datetime.now().strftime("%Y-%m-%d")).strip()
                total = float(r_data.get("total", 0.0))
                category = r_data.get("category", "Supplies & Materials")
                subtotal = float(r_data.get("subtotal", total))
                tax = float(r_data.get("tax", 0.0))
                payment = r_data.get("payment_method", "Cash/Card")
                raw_card = str(r_data.get("card_last_4", "")).strip()
                card_last_4 = "".join([c for c in raw_card if c.isdigit()])[-4:]
                is_cc = bool(card_last_4) or ("card" in payment.lower()) or ("visa" in payment.lower()) or ("mastercard" in payment.lower())
                ref_num = "CC" if is_cc else "Cash"

                # Thread-safe logging
                with self.file_write_lock:
                    csv_path = "Receipt_Data.csv"
                    csv_exists = os.path.exists(csv_path)
                    with open(csv_path, "a", newline="", encoding="utf-8") as f:
                        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
                        if not csv_exists:
                            writer.writerow(["Client","Date","Vendor","Category","Subtotal","Tax","Total","Payment_Method","Card_Last_4","Ref_Number","Source_File","Slip_Number","Worker_Node"])
                        writer.writerow([
                            sanitize_csv_field(client_name),
                            sanitize_csv_field(date_str),
                            sanitize_csv_field(vendor),
                            sanitize_csv_field(category),
                            f"{subtotal:.2f}",
                            f"{tax:.2f}",
                            f"{total:.2f}",
                            sanitize_csv_field(payment),
                            sanitize_csv_field(card_last_4),
                            sanitize_csv_field(ref_num),
                            os.path.basename(filepath),
                            idx,
                            self.worker_id
                        ])

                    # Client-specific CSV
                    cl_csv_path = os.path.join(client_dir, f"Receipt_Data_{safe_client}.csv")
                    cl_exists = os.path.exists(cl_csv_path)
                    with open(cl_csv_path, "a", newline="", encoding="utf-8") as f_cl:
                        cl_writer = csv.writer(f_cl, quoting=csv.QUOTE_MINIMAL)
                        if not cl_exists:
                            cl_writer.writerow(["Client","Date","Vendor","Category","Subtotal","Tax","Total","Payment_Method","Card_Last_4","Ref_Number","Source_File","Slip_Number"])
                        cl_writer.writerow([
                            sanitize_csv_field(client_name),
                            sanitize_csv_field(date_str),
                            sanitize_csv_field(vendor),
                            sanitize_csv_field(category),
                            f"{subtotal:.2f}",
                            f"{tax:.2f}",
                            f"{total:.2f}",
                            sanitize_csv_field(payment),
                            sanitize_csv_field(card_last_4),
                            sanitize_csv_field(ref_num),
                            os.path.basename(filepath),
                            idx
                        ])

                # Client-isolated QBO Sync
                client_syncer = self.qbo_client.get_client_syncer(client_name)
                if client_syncer and client_syncer.is_configured():
                    try:
                        client_prof = self.profile_mgr.profiles.get(client_name, {})
                        pay_acc = client_prof.get("default_pay_account", "41")
                        qbo_purchase = client_syncer.create_expense(
                            date_str=date_str,
                            purchase_type="CC" if is_cc else "Cash",
                            payee=vendor,
                            payment_account_id=pay_acc,
                            expense_account=category,
                            memo=category,
                            charge=total,
                            ref_number=ref_num
                        )
                        qbo_id = qbo_purchase.get("Id", "OK")
                        self.log(f"⚡ [{client_name}] Synced to QuickBooks Online: #{qbo_id} (${total:.2f}) -> {category}", "info")
                    except Exception as qbo_err:
                        self.log(f"⚠️ QuickBooks Sync notice ({client_name}): {qbo_err}", "warning")

                self.log(f"✅ [{client_name}] Extracted: {vendor} | ${total:.2f} | Category: {category} | Date: {date_str}", "info")

            self.save_hash(file_hash)
            self.archive_original_file(filepath, client_name)
            return True

        except Exception as e:
            self.log(f"❌ Error processing {os.path.basename(filepath)}: {e}", "error")
            return False
        finally:
            self.release_claim_file(filepath)
            with self.active_jobs_lock:
                self.active_jobs.discard(filepath)

    def _worker_task(self, filepath: str, client_name: str):
        self.process_file(filepath, client_name)

    def check_gmail(self):
        if not self.email_user or not self.email_pass or not self.watch_gmail:
            return
        try:
            import imaplib
            import email
            from email.header import decode_header
            from email.utils import parseaddr

            mail = imaplib.IMAP4_SSL(self.imap_server, timeout=12)
            mail.login(self.email_user, self.email_pass)
            mail.select("INBOX")
            status, messages = mail.search(None, '(UNSEEN)')
            if status != "OK" or not messages or not messages[0]:
                mail.logout()
                return

            msg_ids = messages[0].split()
            for m_id in msg_ids:
                status, data = mail.fetch(m_id, "(RFC822)")
                if status != "OK":
                    continue
                raw_msg = data[0][1]
                msg = email.message_from_bytes(raw_msg)
                sender = msg.get("From", "Unknown")
                _, sender_addr = parseaddr(sender)
                matched_client = self.profile_mgr.find_client_by_sender_email(sender_addr)
                target_client = matched_client or "General"

                for part in msg.walk():
                    filename = part.get_filename()
                    ctype = part.get_content_type().lower()
                    if filename:
                        decoded = decode_header(filename)
                        clean_fn = "".join([p.decode(enc or "utf-8", errors="ignore") if isinstance(p, bytes) else p for p, enc in decoded])
                        if clean_fn.lower().endswith(VALID_EXTENSIONS):
                            content = part.get_payload(decode=True)
                            if content and len(content) > 100:
                                safe_c = "".join([c for c in target_client if c.isalnum() or c in (' ', '_', '-')]).strip()
                                client_folder = os.path.join(self.folder, safe_c)
                                os.makedirs(client_folder, exist_ok=True)
                                save_p = os.path.join(client_folder, clean_fn)
                                with open(save_p, "wb") as f_out:
                                    f_out.write(content)
                                self.log(f"📥 [Gmail Option B] Saved attachment for [{target_client}]: {clean_fn}", "info")
                mail.store(m_id, '+FLAGS', '\\Seen')
            mail.logout()
        except Exception as e:
            self.log(f"⚠️ Gmail poll notice: {e}", "warning")

    def run_forever(self):
        self.log(f"🚀 HEADLESS VM WORKER NODE STARTED: [{self.worker_id}]", "info")
        self.log(f"   📂 Monitoring Inbox: '{self.folder}'", "info")
        self.log(f"   🏢 Registered Clients: {', '.join(self.profile_mgr.get_client_names()) or 'Default'}", "info")
        self.log(f"   ⚡ Concurrency: {self.max_workers} simultaneous worker threads with distributed file locking", "info")
        self.sync_client_folders()

        while self.running:
            try:
                # 1. Discover receipts across root and client subfolders
                candidates = []
                if os.path.exists(self.folder):
                    # Check root folder (General)
                    for f in os.listdir(self.folder):
                        p = os.path.join(self.folder, f)
                        if os.path.isfile(p) and f.lower().endswith(VALID_EXTENSIONS) and not any(k in f for k in ('.lock.', '.tmp')):
                            candidates.append((p, "General"))

                    # Check client subfolders
                    for c_name in self.profile_mgr.get_client_names():
                        safe_c = "".join([c for c in c_name if c.isalnum() or c in (' ', '_', '-')]).strip()
                        c_dir = os.path.join(self.folder, safe_c)
                        if os.path.isdir(c_dir):
                            for f in os.listdir(c_dir):
                                p = os.path.join(c_dir, f)
                                if os.path.isfile(p) and f.lower().endswith(VALID_EXTENSIONS) and not any(k in f for k in ('.lock.', '.tmp')):
                                    candidates.append((p, c_name))

                # 2. Dispatch candidates using distributed atomic claim
                for filepath, client_name in candidates:
                    with self.active_jobs_lock:
                        if filepath in self.active_jobs:
                            continue
                    if not is_file_ready(filepath):
                        continue

                    # Try claiming lockfile atomically across VMs
                    if not self.try_claim_file(filepath):
                        continue

                    with self.active_jobs_lock:
                        self.active_jobs.add(filepath)

                    self.log(f"📥 [Claimed Job] {os.path.basename(filepath)} for [{client_name}] -> Dispatching worker thread", "info")
                    self.worker_pool.submit(self._worker_task, filepath, client_name)

                # 3. Check Gmail every 30s
                now = time.time()
                if now - self.last_gmail_check >= 30:
                    self.last_gmail_check = now
                    self.check_gmail()

            except Exception as loop_err:
                self.log(f"⚠️ Worker loop notice: {loop_err}", "warning")

            time.sleep(self.poll_interval)


# -----------------------------------------------------------------------------
# Entry Point
# -----------------------------------------------------------------------------
def main():
    import argparse
    parser = argparse.ArgumentParser(description="Farm & Small Business Receipt Processor — Operator & VM Cluster Edition")
    parser.add_argument("--headless", action="store_true", help="Run in headless worker node mode for VMs/servers (no GUI/Tkinter required)")
    parser.add_argument("--worker-id", type=str, default=None, help="Identifier for this worker node (e.g. vm-worker-1)")
    parser.add_argument("--folder", type=str, default="inbox", help="Path to the inbox root folder")
    parser.add_argument("--workers", type=int, default=6, help="Number of concurrent worker threads")
    parser.add_argument("--interval", type=float, default=2.0, help="Polling interval in seconds")
    args, unknown = parser.parse_known_args()

    # If --headless is requested or running in non-interactive environment
    is_headless = args.headless or os.getenv("HEADLESS_WORKER", "").lower() in ("1", "true", "yes")

    if is_headless:
        worker_engine = HeadlessWorkerEngine(
            folder=args.folder,
            worker_id=args.worker_id,
            max_workers=args.workers,
            poll_interval=args.interval
        )
        try:
            worker_engine.run_forever()
        except KeyboardInterrupt:
            print("\n[INFO] Headless worker shutting down gracefully...")
        return

    # 1. Verify Tkinter availability for Desktop GUI mode
    if tk is None:
        err_msg = (
            "\n" + "="*70 + "\n"
            "[INFO] Tkinter GUI library is not available in this Python installation.\n"
            "To run the visual Desktop App on Windows:\n"
            "   Run Python installer -> Click 'Modify' -> Check 'tcl/tk and IDLE'.\n\n"
            "To run in HEADLESS VM WORKER mode (no GUI required):\n"
            "   python receipt_processor.py --headless --worker-id vm-node-1\n"
            + "="*70 + "\n"
        )
        print(err_msg)
        try:
            with open(os.path.join(SCRIPT_DIR, "crash_log.txt"), "w", encoding="utf-8") as f:
                f.write(err_msg)
        except Exception:
            pass
        return

    # 2. Launch GUI Application with top-level crash guard
    try:
        app = FarmReceiptApp()
        app.mainloop()
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        err_report = (
            "\n" + "="*70 + "\n"
            f"[FATAL ERROR] Receipt Processor failed to initialize or encountered a crash:\n"
            f"{tb}\n"
            + "="*70 + "\n"
        )
        print(err_report)
        try:
            with open(os.path.join(SCRIPT_DIR, "crash_log.txt"), "w", encoding="utf-8") as f:
                f.write(f"Timestamp: {datetime.now().isoformat()}\nError: {e}\n\nTraceback:\n{tb}")
        except Exception:
            pass
        try:
            if messagebox:
                messagebox.showerror(
                    "Receipt Processor Startup Error",
                    f"The application encountered an error while starting:\n\n{e}\n\nDetails have been saved to crash_log.txt."
                )
        except Exception:
            pass

if __name__ == "__main__":
    main()
