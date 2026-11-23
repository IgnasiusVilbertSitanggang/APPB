#!/usr/bin/env python3
"""APPB local API — vanilla frontend + real PostgreSQL backend.

Drop-in replacement for the Java/Spring API for local hosting without Java or
MySQL. The source of truth is PostgreSQL (appb_db); .local/db.json is kept as a
human-readable cache. The data is imported from the branch-`ken` SQL dump by
tools/import_ken_sql.py and mapped by tools/ken_store.py. Every response under
/api uses the same JSON contract as the Java controllers (error shape included).

Run:  python3 tools/local_api.py
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import sys
import threading
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

import psycopg2
from psycopg2.extras import Json, RealDictCursor

import ken_store

HOST = "127.0.0.1"
PORT = 8080
BASE_DIR = Path(__file__).resolve().parent.parent
DB_FILE = BASE_DIR / ".local" / "db.json"
DSN = os.getenv(
    "APPB_DB_DSN",
    "dbname=appb_db user=appb password=appb_pass host=127.0.0.1 port=5432",
)

# 19 theme keys from app_settings / frontend index.html (the task text says
# "18" but lists 19; all 19 listed keys are implemented verbatim).
THEME_DEFAULTS = {
    "theme.color-ink": "#0f172a",
    "theme.color-ink2": "#475569",
    "theme.color-mute": "#94a3b8",
    "theme.color-line": "#e2e8f0",
    "theme.color-app": "#f8fafc",
    "theme.color-navy": "#1e3a8a",
    "theme.color-navyh": "#1e40af",
    "theme.color-crit": "#b91c1c",
    "theme.color-crit-t": "#fef2f2",
    "theme.color-warn": "#b45309",
    "theme.color-warn-t": "#fffbeb",
    "theme.color-ok": "#15803d",
    "theme.color-ok-t": "#f0fdf4",
    "theme.color-info": "#1d4ed8",
    "theme.color-info-t": "#eff6ff",
    "theme.font-sans": "'Inter', system-ui, sans-serif",
    "theme.radius-sm": "4px",
    "theme.radius-md": "6px",
    "theme.radius-lg": "8px",
}

DB_INFO = {
    "mode": "postgresql",
    "name": "appb_db (branch ken)",
    "host": "127.0.0.1",
    "port": "5432",
    "user": "appb",
}

APP_PASSWORD = "appb2026"  # Legacy fallback only for rows without a hash.
PASSWORD_ITERATIONS = 120_000
STAFF_ROLES = {"petugas", "relawan", "admin"}
VERIF_VALUES = {"Tertunda", "Resmi", "Ditolak"}
PENANGANAN_VALUES = {
    "Belum Ditangani", "Sedang Ditangani", "Selesai Ditangani",
    "Tidak Perlu Tindak Lanjut", "Case Closed",
}
ANNOUNCEMENT_SEVERITIES = {"Peringatan", "Imbauan", "Evakuasi", "Informasi"}
USER_ROLES = {"petugas", "relawan", "admin"}
LOG_ROLES = {"warga", "petugas", "relawan", "admin", "sistem"}
KORBAN_FIELDS = ("luka", "hilang", "meninggal", "mengungsi")
KORBAN_LABELS = {
    "luka": "Luka-luka",
    "hilang": "Hilang",
    "meninggal": "Meninggal Dunia",
    "mengungsi": "Mengungsi/Selamat",
}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = str(message)


# ---------------------------------------------------------------------------
# Per-user password helpers (PBKDF2-SHA256, one random salt per user)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(password).encode(), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    if not encoded:
        return False
    try:
        algorithm, iterations, salt_hex, digest_hex = str(encoded).split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", str(password).encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return secrets.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def password_matches(password: str, row: dict) -> bool:
    stored = str(row.get("password_hash") or "")
    if stored:
        return verify_password(password, stored)
    # Legacy rows seeded before hashing used one shared demo password.
    return secrets.compare_digest(str(password), APP_PASSWORD)


def to_int(value, fallback: int = 0) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if value is None:
        return fallback
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return fallback


def to_bool(value, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"true", "1", "yes", "y", "on"}


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def now_iso() -> str:
    return iso_utc(datetime.now(timezone.utc))


def uid() -> str:
    return str(uuid.uuid4())


class Store:
    """In-memory UI view of the branch-`ken` PostgreSQL schema."""

    def __init__(self):
        self.lock = threading.RLock()
        self.data = self._load()
        self.save()

    @staticmethod
    def _load() -> dict:
        try:
            return ken_store.load()
        except Exception as exc:
            raise RuntimeError(f"Gagal membaca PostgreSQL ({DSN}): {exc}") from exc

    def save(self) -> None:
        # Human-readable cache (wilayah lives in PostgreSQL, not in the cache).
        DB_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = DB_FILE.with_suffix(".json.tmp")
        cache = dict(self.data)
        cache["tables"] = {
            key: value for key, value in self.data["tables"].items() if key != "wilayah"
        }
        temporary.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(DB_FILE)
        ken_store.save(self.data)

    def table(self, name: str) -> list[dict]:
        return self.data["tables"].setdefault(name, [])


STORE = Store()

FIELD_NAMES = {
    "by_user": "by",
    "report_code": "reportCode",
    "rumah_rusak": "rumahRusak",
    "device_id": "deviceId",
    "korban_history": "korbanHistory",
    "status_history": "statusHistory",
}


def camel(key: str) -> str:
    parts = key.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def as_list(value) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def normalize(row: dict | None) -> dict:
    if not row:
        return {}
    out: dict = {}
    for key, value in row.items():
        if key == "password_hash":
            continue  # Never expose password hashes through the API.
        name = FIELD_NAMES.get(key, camel(key))
        out[name] = as_list(value) if key in {
            "korban_history", "susulan", "status_history"
        } else value
    if "korban" not in out and "luka" in out:
        out["korban"] = {field: out.get(field, 0) for field in KORBAN_FIELDS}
    return out


def normalize_all(rows: list[dict]) -> list[dict]:
    return [normalize(row) for row in rows]


def report_order(row: dict):
    identifier = str(row.get("id", ""))
    match = re.fullmatch(r"r(\d+)", identifier)
    if match:
        return (0, int(match.group(1)), "")
    return (1, 0, "")


def sorted_reports(rows: list[dict]) -> list[dict]:
    # Java order: seeded r1..rN first by numeric id, then everything else by
    # created_at DESC. Stable sorts let us express both parts independently.
    by_date = sorted(rows, key=lambda row: str(row.get("created_at", "")), reverse=True)
    return sorted(by_date, key=report_order)


def settings_payload() -> dict:
    theme = {}
    for key, value in STORE.data["settings"].items():
        if key.startswith("theme."):
            theme[key[len("theme."):]] = value
    for key, value in THEME_DEFAULTS.items():
        theme.setdefault(key[len("theme."):], value)
    return {"theme": theme, "db": dict(DB_INFO)}


# ---------------------------------------------------------------------------
# Shared helpers mirroring ReportController / LogService
# ---------------------------------------------------------------------------

def text(body: dict | None, key: str, fallback=None):
    value = body.get(key) if isinstance(body, dict) else None
    if value is None:
        return fallback
    value = str(value)
    return fallback if (fallback is not None and not value.strip()) else value


def first_text(body: dict, *keys: str):
    for key in keys:
        value = text(body, key)
        if value is not None and str(value).strip():
            return value
    return None


def number(body: dict | None, key: str, fallback: int = 0) -> int:
    value = body.get(key) if isinstance(body, dict) else None
    if value is None:
        return fallback
    if isinstance(value, (int, float, str)):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return fallback
    return fallback


def boolean(body: dict | None, key: str, fallback: bool = False) -> bool:
    value = body.get(key) if isinstance(body, dict) else None
    return fallback if value is None else to_bool(value, fallback)


def user_by_name(name: str | None) -> dict | None:
    if not name:
        return None
    for user in STORE.table("users"):
        if str(user.get("nama", "")) == str(name):
            return user
    return None


def infer_role(actor: str | None) -> str:
    if not actor or actor in {"Sistem", "Anonim"}:
        return "warga"
    user = user_by_name(actor)
    return str(user["role"]) if user else "warga"


def role_of(body: dict, actor: str) -> str:
    return first_text(body, "actorRole", "role") or infer_role(actor)


def write_log(actor, aksi, code, detail, role=None) -> dict:
    safe_actor = str(actor).strip() or "Sistem"
    if role is None:
        user = user_by_name(safe_actor)
        role = str(user["role"]) if user else "sistem"
    if role not in LOG_ROLES:
        role = "sistem"
    entry = {
        "id": uid(),
        "at": now_iso(),
        "actor": safe_actor,
        "role": role,
        "aksi": str(aksi),
        "code": code,
        "detail": detail,
    }
    STORE.table("logs").append(entry)
    return entry


def require_active_actor(actor: str, role: str) -> None:
    user = user_by_name(actor)
    if user and not to_bool(user.get("aktif"), False):
        raise ApiError(403, "Akun tidak aktif.")


def require_writable(report: dict, role: str, actor: str) -> None:
    if report.get("penanganan") == "Case Closed" and role != "admin":
        raise ApiError(403, "Laporan sudah ditutup; hanya admin yang dapat mengoreksi.")
    require_active_actor(actor, role)
    if report.get("verif") == "Ditolak" and role != "admin":
        raise ApiError(403, "Laporan ditolak tidak dapat diubah.")


def find_row(collection: str, key: str, value, label: str) -> dict:
    for row in STORE.table(collection):
        if str(row.get(key)) == str(value):
            return row
    raise ApiError(404, label)


def find_report(code: str) -> dict:
    return find_row("reports", "code", code, f"Laporan {code} tidak ditemukan")


def append_status(report: dict, statuses, actor: str, at: str | None = None) -> None:
    history = as_list(report.get("status_history"))
    stamp = at or now_iso()
    for status in statuses:
        history.append({"at": stamp, "status": status, "by": actor})
    report["status_history"] = history


def active_report(jenis, kel) -> dict | None:
    for report in STORE.table("reports"):
        if report.get("jenis") != jenis or report.get("kel") != kel:
            continue
        if report.get("verif") == "Tertunda" or (
            report.get("verif") == "Resmi"
            and report.get("penanganan") not in {"Case Closed", "Tidak Perlu Tindak Lanjut"}
        ):
            return report
    return None


def next_report_code() -> str:
    sequence = next(
        (row for row in STORE.table("sequences") if row.get("name") == "report_code"),
        None,
    )
    if sequence is None:
        sequence = {"name": "report_code", "value": 140}
        STORE.table("sequences").append(sequence)
    value = to_int(sequence.get("value"), 140) + 1
    sequence["value"] = value
    return f"APPB-2026-{value:05d}"


def filter_rows(rows: list[dict], query: dict, like_fields=(), exact_fields=()) -> list[dict]:
    result = rows
    for field in like_fields:
        needle = (query.get(field) or "").strip().lower()
        if needle:
            result = [
                row for row in result
                if needle in str(row.get(field) or "").lower()
            ]
    for field in exact_fields:
        needle = (query.get(field) or "").strip()
        if needle:
            result = [row for row in result if str(row.get(field) or "") == needle]
    return result


def limit_rows(rows: list[dict], query: dict, default: int) -> list[dict]:
    limit = min(500, max(1, to_int(query.get("limit"), default)))
    return rows[:limit]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def endpoint_health(query, body):
    return 200, {
        "status": "OK",
        "service": "appb-backend",
        "database": "connected",
        "mode": "postgresql",
        "time": now_iso(),
    }


def endpoint_snapshot(query, body):
    reports = STORE.table("reports")
    sequence = next(
        (row for row in STORE.table("sequences") if row.get("name") == "report_code"),
        None,
    )
    next_code = to_int(sequence.get("value"), 140) if sequence else 140
    return 200, {
        "reports": normalize_all(sorted_reports(reports)),
        "users": normalize_all(sorted(STORE.table("users"), key=lambda row: str(row.get("id", "")))),
        "categories": normalize_all(sorted(
            STORE.table("kategori"),
            key=lambda row: to_int(str(row.get("id", "")).lstrip("c"), 9999),
        )),
        "announcements": normalize_all(sorted(STORE.table("announcements"), key=lambda row: str(row.get("id", "")))),
        "logs": normalize_all(sorted(STORE.table("logs"), key=lambda row: str(row.get("at", "")), reverse=True)),
        "bantuan": normalize_all(sorted(STORE.table("bantuan"), key=lambda row: str(row.get("id", "")))),
        "historis": normalize_all(sorted(STORE.table("historis"), key=lambda row: str(row.get("id", "")))),
        "imports": normalize_all(sorted(STORE.table("imports"), key=lambda row: str(row.get("at", "")), reverse=True)),
        "session": {"role": "warga"},
        "nextCode": next_code,
        "settings": settings_payload(),
    }


def endpoint_settings(query, body):
    return 200, settings_payload()


def patch_settings(query, body):
    updates = body.get("theme") if isinstance(body, dict) else None
    if isinstance(updates, dict):
        candidates = updates
    elif isinstance(body, dict):
        candidates = body
    else:
        candidates = {}
    changed = 0
    for key, value in candidates.items():
        plain = str(key)
        if plain.startswith("theme."):
            plain = plain[len("theme."):]
        full_key = f"theme.{plain}"
        if full_key in THEME_DEFAULTS and value is not None:
            STORE.data["settings"][full_key] = str(value)
            changed += 1
    if changed:
        STORE.save()
    return 200, settings_payload()


def endpoint_db_config(query, body):
    return 200, dict(DB_INFO)


def endpoint_wilayah(query, body):
    rows = STORE.table("wilayah")
    provinces = sorted({str(row.get("prov", "")) for row in rows if row.get("prov")})
    result = []
    for province in provinces:
        kabupatens = []
        kab_names = sorted({
            str(row.get("kab", "")) for row in rows
            if row.get("prov") == province and row.get("kab")
        })
        for kab in kab_names:
            kecamatans = []
            kec_names = sorted({
                str(row.get("kec", "")) for row in rows
                if row.get("prov") == province and row.get("kab") == kab and row.get("kec")
            })
            for kec in kec_names:
                kelurahans = sorted(
                    str(row.get("kel", "")) for row in rows
                    if row.get("prov") == province and row.get("kab") == kab
                    and row.get("kec") == kec and row.get("kel")
                )
                kecamatans.append({"nama": kec, "kelurahan": kelurahans})
            kabupatens.append({"nama": kab, "kecamatan": kecamatans})
        result.append({"nama": province, "kabupaten": kabupatens})
    return 200, result


def list_kategori(query, body):
    rows = sorted(STORE.table("kategori"), key=lambda row: str(row.get("nama", "")))
    return 200, normalize_all(rows)


def create_kategori(query, body):
    nama = text(body, "nama")
    if not nama or not str(nama).strip():
        raise ApiError(400, "Nama kategori wajib diisi")
    if any(str(row.get("nama")) == str(nama) for row in STORE.table("kategori")):
        raise ApiError(409, "Kategori dengan nama tersebut sudah ada")
    row = {
        "id": uid(),
        "nama": str(nama),
        "aktif": boolean(body, "aktif", True),
        "deskripsi": text(body, "deskripsi"),
    }
    STORE.table("kategori").append(row)
    return 201, normalize(row)


def update_kategori(identifier, query, body):
    row = find_row("kategori", "id", identifier, "Kategori tidak ditemukan")
    for key in ("nama", "deskripsi"):
        value = text(body, key)
        if value is not None:
            row[key] = value
    if "aktif" in body:
        row["aktif"] = boolean(body, "aktif", to_bool(row.get("aktif"), True))
    STORE.save()
    return 200, normalize(row)


def delete_kategori(identifier, query, body):
    row = find_row("kategori", "id", identifier, "Kategori tidak ditemukan")
    used = sum(
        1 for report in STORE.table("reports")
        if report.get("jenis") == row.get("nama")
    )
    if used:
        raise ApiError(409, f"Kategori masih dipakai {used} laporan dan tidak dapat dihapus.")
    STORE.table("kategori").remove(row)
    STORE.save()
    return 200, {"ok": True, "id": str(identifier)}


def list_reports(query, body):
    rows = STORE.table("reports")
    rows = filter_rows(
        rows, query,
        like_fields=("jenis", "prov", "kab", "kec", "kel", "device_id"),
    )
    if "deviceId" in query and "device_id" not in query:
        needle = (query.get("deviceId") or "").strip().lower()
        if needle:
            rows = [row for row in rows if needle in str(row.get("device_id") or "").lower()]
    search = (query.get("q") or "").strip().lower()
    if search:
        rows = [
            row for row in rows
            if any(search in str(row.get(field) or "").lower()
                   for field in ("code", "pelapor", "deskripsi", "alamat"))
        ]
    status = (query.get("status") or "").strip()
    if status:
        field = "verif" if status in VERIF_VALUES else "penanganan"
        rows = [row for row in rows if str(row.get(field) or "") == status]
    rows = sorted(rows, key=lambda row: str(row.get("created_at", "")), reverse=True)
    return 200, normalize_all(limit_rows(rows, query, 200))


def report_stats(query, body):
    rows = STORE.table("reports")
    active = [
        row for row in rows
        if row.get("verif") == "Tertunda" or (
            row.get("verif") == "Resmi"
            and row.get("penanganan") not in {"Case Closed", "Tidak Perlu Tindak Lanjut"}
        )
    ]
    official = [row for row in rows if row.get("verif") == "Resmi"]
    return 200, {
        "total": len(rows),
        "tertunda": sum(1 for row in rows if row.get("verif") == "Tertunda"),
        "resmi": len(official),
        "ditolak": sum(1 for row in rows if row.get("verif") == "Ditolak"),
        "aktif": len(active),
        "selesai": sum(1 for row in rows if row.get("penanganan") == "Case Closed"),
        "pengungsi": sum(to_int(row.get("mengungsi")) for row in official),
        "meninggal": sum(to_int(row.get("meninggal")) for row in official),
    }


def get_report(code, query, body):
    return 200, normalize(find_report(code))


def submit_report(query, body):
    jenis = text(body, "jenis")
    kel = text(body, "kel")
    pelapor = text(body, "pelapor")
    if not jenis or not str(jenis).strip() or not kel or not str(kel).strip() \
            or not pelapor or not str(pelapor).strip():
        raise ApiError(400, "Jenis, kelurahan, dan pelapor wajib diisi")
    actor = text(body, "actor", "")
    if role_of(body, actor) not in STAFF_ROLES:
        duplicate = active_report(str(jenis).strip(), str(kel).strip())
        if duplicate:
            raise ApiError(
                409,
                f"Sudah ada laporan aktif {duplicate.get('code')} untuk jenis {jenis} di Kel. {kel}.",
            )
    code = next_report_code()
    report = {
        "id": uid(),
        "code": code,
        "device_id": text(body, "deviceId"),
        "jenis": jenis,
        "prov": text(body, "prov", "") or "",
        "kab": text(body, "kab", "") or "",
        "kec": text(body, "kec", "") or "",
        "kel": kel,
        "alamat": text(body, "alamat"),
        "deskripsi": text(body, "deskripsi"),
        "created_at": now_iso(),
        "pelapor": pelapor,
        "hp": text(body, "hp"),
        "verif": "Tertunda",
        "penanganan": None,
        "luka": 0,
        "hilang": 0,
        "meninggal": 0,
        "mengungsi": 0,
        "korban_history": [],
        "susulan": [],
        "status_history": [{"at": now_iso(), "status": "Tertunda", "by": "Sistem"}],
        "foto": number(body, "foto", 0),
        "verified_by": None,
        "verified_at": None,
        "reject_reason": None,
        "closed_by": None,
        "closed_at": None,
        "ringkasan": None,
    }
    STORE.table("reports").append(report)
    write_log("Sistem", "Laporan masuk", code, "Laporan warga baru, status Tertunda")
    STORE.save()
    return 201, normalize(report)


def add_susulan(code, query, body):
    report = find_report(code)
    actor = text(body, "nama", text(body, "actor", "Warga"))
    role = role_of(body, actor)
    require_writable(report, role, actor)
    if role not in STAFF_ROLES and report.get("verif") != "Tertunda":
        raise ApiError(
            403,
            "Pembaruan hanya dapat ditambahkan petugas pada laporan yang sudah diverifikasi.",
        )
    isi = text(body, "isi")
    if not isi or not str(isi).strip():
        raise ApiError(400, "Isi susulan wajib diisi")
    item = {
        "id": uid(),
        "at": now_iso(),
        "nama": actor,
        "isi": str(isi).strip(),
        "foto": number(body, "foto", 0),
    }
    report.setdefault("susulan", []).append(item)
    write_log(actor, role, "Catatan", code, str(isi).strip())
    STORE.save()
    return 201, normalize(report)


def add_catatan(code, query, body):
    report = find_report(code)
    detail = text(body, "detail")
    if not detail or not str(detail).strip():
        raise ApiError(400, "Detail catatan wajib diisi")
    actor = text(body, "actor", "Sistem")
    role = text(body, "actorRole", text(body, "role", infer_role(actor)))
    require_active_actor(actor, role)
    if report.get("penanganan") == "Case Closed" and role != "admin":
        raise ApiError(403, "Laporan sudah ditutup; hanya admin yang dapat mengoreksi.")
    write_log(actor, role, "Catatan", code, str(detail).strip())
    STORE.save()
    return 201, normalize(report)


def verifikasi(code, query, body):
    verif = text(body, "verif")
    if verif not in {"Resmi", "Ditolak"}:
        raise ApiError(400, "Nilai verifikasi harus Resmi atau Ditolak")
    actor = text(body, "actor", "Petugas")
    role = role_of(body, actor)
    if role not in STAFF_ROLES or role == "relawan":
        raise ApiError(403, "Hanya petugas aktif yang dapat memverifikasi atau menolak laporan.")
    reason = text(body, "rejectReason", "") or ""
    reason = str(reason).strip()
    if verif == "Ditolak":
        if not reason:
            raise ApiError(400, "Alasan penolakan wajib diisi")
        if len(reason) < 10:
            raise ApiError(400, "Alasan minimal 10 karakter agar pelapor memahami penolakan.")

    codes = []
    requested = body.get("codes")
    if isinstance(requested, list):
        codes = [str(value) for value in requested if value is not None and str(value).strip()]
    if not codes:
        codes = [str(code)]

    targets = []
    for target_code in codes:
        report = find_report(target_code)
        require_writable(report, role, actor)
        if report.get("verif") != "Tertunda":
            raise ApiError(400, "Hanya laporan Tertunda yang dapat diverifikasi atau ditolak.")
        targets.append(report)

    stamp = now_iso()
    for report in targets:
        target_code = str(report["code"])
        if verif == "Ditolak":
            report["verif"] = "Ditolak"
            report["reject_reason"] = reason
            append_status(report, ["Ditolak"], actor, stamp)
            write_log(actor, "Tolak", target_code, "Alasan: " + reason)
        else:
            penanganan = report.get("penanganan") or "Belum Ditangani"
            report["verif"] = "Resmi"
            report["penanganan"] = penanganan
            report["verified_by"] = actor
            report["verified_at"] = now_iso()
            report["reject_reason"] = None
            append_status(report, ["Resmi", penanganan], actor, stamp)
            write_log(actor, "Verifikasi", target_code, "Tertunda > Resmi")
    STORE.save()
    return 200, {
        "ok": True,
        "count": len(targets),
        "codes": codes,
        "report": normalize(targets[0]),
    }


def patch_penanganan(code, query, body):
    report = find_report(code)
    status = text(body, "penanganan")
    if status not in PENANGANAN_VALUES:
        raise ApiError(400, "Status penanganan tidak valid")
    actor = text(body, "actor", "Petugas")
    role = role_of(body, actor)
    require_writable(report, role, actor)
    if status == "Case Closed" and role != "admin":
        raise ApiError(403, "Laporan sudah ditutup; hanya admin yang dapat mengoreksi.")
    if role == "relawan" and status in {"Case Closed", "Tidak Perlu Tindak Lanjut"}:
        raise ApiError(403, "Relawan tidak dapat menutup laporan atau menandai Tidak Perlu Tindak Lanjut.")
    old = report.get("penanganan") or "-"
    if status == old:
        return 200, normalize(report)
    report["penanganan"] = status
    append_status(report, [status], actor)
    write_log(actor, "Ubah status", code, f"{old} > {status}")
    STORE.save()
    return 200, normalize(report)


def patch_korban(code, query, body):
    report = find_report(code)
    actor = text(body, "actor", "Petugas")
    role = role_of(body, actor)
    require_writable(report, role, actor)
    if role not in STAFF_ROLES:
        raise ApiError(403, "Hanya petugas atau relawan yang dapat mengubah jumlah korban.")

    values = {field: max(0, to_int(report.get(field))) for field in KORBAN_FIELDS}
    changes: list[dict] = []

    def change(source: dict, field: str, old: int, new: int) -> dict:
        at = source.get("at") or now_iso()
        by = source.get("by") or actor
        return {"at": at, "by": by, "field": field, "from": old, "to": new}

    supplied_history = body.get("history")
    if isinstance(supplied_history, list):
        for item in supplied_history:
            if not isinstance(item, dict):
                continue
            field = text(item, "field")
            if field not in KORBAN_FIELDS:
                continue
            old = max(0, to_int(item.get("from")))
            new = max(0, to_int(item.get("to")))
            if old == new:
                continue
            values[field] = new
            changes.append(change(item, field, old, new))
    elif isinstance(body.get("korban"), dict):
        for field in KORBAN_FIELDS:
            if field not in body["korban"] or body["korban"][field] is None:
                continue
            old = values[field]
            new = max(0, to_int(body["korban"][field]))
            if old == new:
                continue
            values[field] = new
            changes.append(change({}, field, old, new))
    else:
        field = text(body, "field")
        if field not in KORBAN_FIELDS:
            raise ApiError(400, "Field korban tidak valid")
        old = values[field]
        new = max(0, number(body, "value", old))
        if old == new:
            return 200, normalize(report)
        values[field] = new
        changes.append(change({}, field, old, new))

    if not changes:
        return 200, normalize(report)
    history = as_list(report.get("korban_history"))
    history.extend(changes)
    for field in KORBAN_FIELDS:
        report[field] = values[field]
    report["korban_history"] = history
    for item in changes:
        field = str(item["field"])
        write_log(
            actor, role, "Ubah jumlah korban", code,
            f"{KORBAN_LABELS.get(field, 'Mengungsi/Selamat')} "
            f"{item['from']} > {item['to']}",
        )
    STORE.save()
    return 200, normalize(report)


def tutup_laporan(code, query, body):
    report = find_report(code)
    ringkasan = text(body, "ringkasan", "") or ""
    ringkasan = str(ringkasan).strip()
    current = report.get("penanganan")
    if current not in {"Selesai Ditangani", "Tidak Perlu Tindak Lanjut"}:
        raise ApiError(
            400,
            "Laporan harus berstatus Selesai Ditangani atau Tidak Perlu Tindak Lanjut untuk ditutup.",
        )
    if not ringkasan:
        raise ApiError(400, "Ringkasan wajib diisi sebelum menutup laporan.")
    if len(ringkasan) < 30:
        raise ApiError(400, f"Ringkasan minimal 30 karakter (sekarang {len(ringkasan)}).")
    actor = text(body, "actor", "Petugas")
    role = role_of(body, actor)
    require_active_actor(actor, role)
    if role != "petugas":
        raise ApiError(403, "Hanya petugas aktif yang dapat menutup laporan.")
    report["penanganan"] = "Case Closed"
    report["closed_by"] = actor
    report["closed_at"] = now_iso()
    report["ringkasan"] = ringkasan
    append_status(report, ["Case Closed"], actor)
    write_log(actor, "Tutup laporan", code, f"{current} > Case Closed")
    STORE.save()
    return 200, normalize(report)


def koreksi(query, body):
    code = text(body, "code")
    if not code or not str(code).strip():
        raise ApiError(400, "Kode laporan wajib diisi")
    actor = text(body, "actor", "Admin")
    role = text(body, "actorRole", text(body, "role", infer_role(actor)))
    if role != "admin":
        raise ApiError(403, "Hanya admin yang dapat mengoreksi laporan yang sudah ditutup.")
    require_active_actor(actor, role)
    alasan = str(text(body, "alasan", "") or "").strip()
    if not alasan:
        raise ApiError(400, "Alasan koreksi wajib diisi.")
    if len(alasan) < 15:
        raise ApiError(400, f"Alasan koreksi minimal 15 karakter (sekarang {len(alasan)}).")
    report = find_report(str(code))
    if report.get("penanganan") != "Case Closed":
        raise ApiError(400, "Hanya laporan Case Closed yang dapat dikoreksi.")
    status = text(body, "status")
    if status not in PENANGANAN_VALUES:
        raise ApiError(400, "Status penanganan tidak valid")

    current_status = report.get("penanganan")
    korban = body.get("korban") if isinstance(body.get("korban"), dict) else {}
    values = []
    diffs = []
    for field in KORBAN_FIELDS:
        old = to_int(report.get(field))
        requested = korban.get(field)
        new = to_int(requested) if isinstance(requested, (int, float)) else old
        if new != old:
            diffs.append(f"{KORBAN_LABELS[field]} {old} > {new}")
        values.append(new)
    if status != current_status:
        diffs.append(f"Status {current_status} > {status}")
    current_ringkasan = report.get("ringkasan") or ""
    ringkasan = str(text(body, "ringkasan", current_ringkasan) or "").strip()
    if ringkasan != current_ringkasan:
        diffs.append("Ringkasan diubah")
    if not diffs:
        raise ApiError(400, "Tidak ada perubahan data untuk dikoreksi.")

    if status != current_status:
        append_status(report, [status], "Admin")
    for field, value in zip(KORBAN_FIELDS, values):
        report[field] = value
    report["ringkasan"] = ringkasan
    write_log(
        actor, "admin", "Koreksi laporan", str(code),
        "; ".join(diffs) + ". Alasan: " + alasan,
    )
    STORE.save()
    return 200, normalize(report)


def list_announcements(query, body):
    rows = STORE.table("announcements")
    search = (query.get("q") or "").strip().lower()
    if search:
        rows = [
            row for row in rows
            if search in str(row.get("title") or "").lower()
            or search in str(row.get("body") or "").lower()
        ]
    rows = filter_rows(
        rows, query,
        exact_fields=("severity", "jenis", "prov", "kab", "kec", "kel"),
    )
    rows = sorted(rows, key=lambda row: str(row.get("at", "")), reverse=True)
    return 200, normalize_all(limit_rows(rows, query, 100))


def create_announcement(query, body):
    title = text(body, "title")
    content = text(body, "body")
    severity = text(body, "severity")
    jenis = text(body, "jenis")
    if not title or not str(title).strip() or not content or not str(content).strip() \
            or severity not in ANNOUNCEMENT_SEVERITIES or not jenis or not str(jenis).strip():
        raise ApiError(400, "Judul, isi, severity, dan jenis pengumuman wajib diisi dengan benar")
    report_code = text(body, "reportCode")
    if report_code:
        find_report(report_code)
    actor = text(body, "by", "Petugas")
    row = {
        "id": uid(),
        "title": title,
        "body": content,
        "severity": severity,
        "jenis": jenis,
        "prov": text(body, "prov"),
        "kab": text(body, "kab"),
        "kec": text(body, "kec"),
        "kel": text(body, "kel"),
        "report_code": report_code,
        "at": now_iso(),
        "by_user": actor,
    }
    STORE.table("announcements").append(row)
    write_log(actor, "Terbitkan pengumuman", report_code, f"{severity}: {title}")
    STORE.save()
    return 201, normalize(row)


def update_announcement(identifier, query, body):
    row = find_row("announcements", "id", identifier, "Pengumuman tidak ditemukan")
    for field in ("title", "body", "jenis", "prov", "kab", "kec", "kel", "reportCode", "by"):
        if field in body and body[field] is not None:
            key = "report_code" if field == "reportCode" else "by_user" if field == "by" else field
            row[key] = str(body[field])
    if "severity" in body and body["severity"] in ANNOUNCEMENT_SEVERITIES:
        row["severity"] = body["severity"]
    STORE.save()
    return 200, normalize(row)


def delete_announcement(identifier, query, body):
    row = find_row("announcements", "id", identifier, "Pengumuman tidak ditemukan")
    STORE.table("announcements").remove(row)
    STORE.save()
    return 200, {"ok": True, "id": str(identifier)}


def list_users(query, body):
    rows = STORE.table("users")
    role = (query.get("role") or "").strip()
    if role:
        rows = [row for row in rows if row.get("role") == role]
    rows = sorted(rows, key=lambda row: (str(row.get("role", "")), str(row.get("nama", ""))))
    return 200, normalize_all(rows)


def create_user(query, body):
    nama = text(body, "nama")
    email = text(body, "email")
    role = text(body, "role")
    if not nama or not str(nama).strip() or not email or not str(email).strip() or role not in USER_ROLES:
        raise ApiError(400, "Nama, email, dan role wajib diisi")
    if any(str(row.get("email", "")).lower() == str(email).lower() for row in STORE.table("users")):
        raise ApiError(409, "Email pengguna sudah terdaftar")
    row = {
        "id": uid(),
        "nama": nama,
        "email": email,
        "hp": text(body, "hp"),
        "instansi": text(body, "instansi"),
        "wilayah": text(body, "wilayah"),
        "role": role,
        "aktif": boolean(body, "aktif", True),
        "password_hash": hash_password(text(body, "password") or APP_PASSWORD),
    }
    STORE.table("users").append(row)
    STORE.save()
    return 201, normalize(row)


def update_user(identifier, query, body):
    row = find_row("users", "id", identifier, "Pengguna tidak ditemukan")
    if "role" in body and body["role"] not in USER_ROLES:
        raise ApiError(400, "Peran tidak valid")
    for field in ("nama", "email", "hp", "instansi", "wilayah", "role"):
        if field in body and body[field] is not None:
            row[field] = str(body[field])
    if "aktif" in body and body["aktif"] is not None:
        row["aktif"] = boolean(body, "aktif", to_bool(row.get("aktif"), True))
    if "password" in body and body["password"]:
        row["password_hash"] = hash_password(str(body["password"]))
    write_log(text(body, "actor", "Admin"), "Ubah akun", None, f"User id: {identifier}")
    STORE.save()
    return 200, normalize(row)


def update_user_password(identifier, query, body):
    row = find_row("users", "id", identifier, "Pengguna tidak ditemukan")
    password = text(body, "password")
    if not password or len(str(password)) < 6:
        raise ApiError(400, "Kata sandi minimal 6 karakter")
    row["password_hash"] = hash_password(password)
    write_log(
        text(body, "actor", "Admin"),
        "Ubah kata sandi",
        None,
        f"User id: {identifier}",
    )
    STORE.save()
    return 200, {"ok": True, "id": str(identifier)}


def delete_user(identifier, query, body):
    row = find_row("users", "id", identifier, "Pengguna tidak ditemukan")
    STORE.table("users").remove(row)
    write_log("Admin", "Hapus akun", None, f"User id: {identifier}")
    STORE.save()
    return 200, {"ok": True, "id": str(identifier)}


def set_user_aktif(identifier, query, body):
    row = find_row("users", "id", identifier, "Pengguna tidak ditemukan")
    aktif = boolean(body, "aktif", True)
    row["aktif"] = aktif
    write_log(
        text(body, "actor", "Admin"),
        "Aktifkan akun" if aktif else "Nonaktifkan akun",
        None,
        f"User id: {identifier}",
    )
    STORE.save()
    return 200, normalize(row)


def login(query, body):
    identifier = first_text(body, "id", "userId", "email", "identifier")
    if not identifier:
        raise ApiError(400, "Email atau ID pengguna wajib diisi")
    password = text(body, "password")
    if not password:
        raise ApiError(400, "Kata sandi wajib diisi")
    row = next(
        (user for user in STORE.table("users")
         if str(user.get("id")) == identifier or str(user.get("email", "")).lower() == str(identifier).lower()),
        None,
    )
    if row is None:
        raise ApiError(401, "Akun tidak ditemukan. Periksa email atau ID pengguna.")
    if not password_matches(password, row):
        raise ApiError(401, "Kata sandi salah")
    if not to_bool(row.get("aktif"), False):
        raise ApiError(403, "Akun tidak aktif atau tidak ditemukan.")
    result = normalize(row)
    result.update({"id": row.get("id"), "role": str(row.get("role")), "aktif": True})
    return 200, result


def logout(query, body):
    return 200, {"ok": True}


def list_logs(query, body):
    rows = STORE.table("logs")
    rows = filter_rows(rows, query, exact_fields=("code", "role"))
    rows = sorted(rows, key=lambda row: str(row.get("at", "")), reverse=True)
    return 200, normalize_all(limit_rows(rows, query, 100))


def list_bantuan(query, body):
    rows = filter_rows(STORE.table("bantuan"), query, exact_fields=("kab", "code"))
    rows = sorted(rows, key=lambda row: str(row.get("at", "")), reverse=True)
    return 200, normalize_all(rows)


def create_bantuan(query, body):
    sumber = text(body, "sumber")
    jenis = text(body, "jenis")
    kab = text(body, "kab")
    if not sumber or not str(sumber).strip() or not jenis or not str(jenis).strip() \
            or not kab or not str(kab).strip():
        raise ApiError(400, "Sumber, jenis, dan kabupaten wajib diisi")
    row = {
        "id": uid(),
        "sumber": sumber,
        "jenis": jenis,
        "jumlah": number(body, "jumlah", 0),
        "satuan": text(body, "satuan", "unit"),
        "kab": kab,
        "code": text(body, "code"),
        "at": now_iso(),
        "by_user": text(body, "by", "Admin"),
    }
    STORE.table("bantuan").append(row)
    STORE.save()
    return 201, normalize(row)


def update_bantuan(identifier, query, body):
    row = find_row("bantuan", "id", identifier, "Bantuan tidak ditemukan")
    for field in ("sumber", "jenis", "kab", "code", "satuan"):
        if field in body and body[field] is not None:
            row[field] = str(body[field])
    if "jumlah" in body and body["jumlah"] is not None:
        row["jumlah"] = number(body, "jumlah", to_int(row.get("jumlah")))
    if "by" in body and body["by"] is not None:
        row["by_user"] = str(body["by"])
    STORE.save()
    return 200, normalize(row)


def delete_bantuan(identifier, query, body):
    row = find_row("bantuan", "id", identifier, "Bantuan tidak ditemukan")
    STORE.table("bantuan").remove(row)
    STORE.save()
    return 200, {"ok": True, "id": str(identifier)}


def list_historis(query, body):
    rows = filter_rows(STORE.table("historis"), query, exact_fields=("jenis", "kab"))
    rows = sorted(rows, key=lambda row: str(row.get("tanggal", "")), reverse=True)
    return 200, normalize_all(rows)


def create_historis(query, body):
    jenis = text(body, "jenis")
    prov = text(body, "prov")
    kab = text(body, "kab")
    tanggal = text(body, "tanggal")
    if not jenis or not str(jenis).strip() or not prov or not str(prov).strip() \
            or not kab or not str(kab).strip() or not tanggal or not str(tanggal).strip():
        raise ApiError(400, "Jenis, provinsi, kabupaten, dan tanggal wajib diisi")
    row = {
        "id": uid(),
        "jenis": jenis,
        "prov": prov,
        "kab": kab,
        "tanggal": tanggal,
        "meninggal": number(body, "meninggal", 0),
        "mengungsi": number(body, "mengungsi", 0),
        "rumah_rusak": number(body, "rumahRusak", number(body, "rumah_rusak", 0)),
        "sumber": text(body, "sumber"),
    }
    STORE.table("historis").append(row)
    STORE.save()
    return 201, normalize(row)


def update_historis(identifier, query, body):
    row = find_row("historis", "id", identifier, "Data historis tidak ditemukan")
    for field in ("jenis", "prov", "kab", "tanggal", "sumber"):
        if field in body and body[field] is not None:
            row[field] = str(body[field])
    for body_key, row_key in (
        ("meninggal", "meninggal"), ("mengungsi", "mengungsi"),
        ("rumahRusak", "rumah_rusak"), ("rumah_rusak", "rumah_rusak"),
    ):
        if body_key in body and body[body_key] is not None:
            row[row_key] = number(body, body_key, to_int(row.get(row_key)))
    STORE.save()
    return 200, normalize(row)


def delete_historis(identifier, query, body):
    row = find_row("historis", "id", identifier, "Data historis tidak ditemukan")
    STORE.table("historis").remove(row)
    STORE.save()
    return 200, {"ok": True, "id": str(identifier)}


def list_imports(query, body):
    rows = sorted(STORE.table("imports"), key=lambda row: str(row.get("at", "")), reverse=True)
    return 200, normalize_all(rows)


def create_import(query, body):
    file_name = text(body, "file")
    if not file_name or not str(file_name).strip():
        raise ApiError(400, "Nama file wajib diisi")
    rows = STORE.table("imports")
    identifier = max([to_int(row.get("id")) for row in rows] or [0]) + 1
    actor = text(body, "by", "Admin")
    berhasil = number(body, "berhasil", 0)
    gagal = number(body, "gagal", 0)
    row = {
        "id": identifier,
        "at": now_iso(),
        "file": file_name,
        "jenis": text(body, "jenis", "wilayah"),
        "berhasil": berhasil,
        "gagal": gagal,
        "by_user": actor,
    }
    rows.append(row)
    write_log(actor, "Import data master", None, f"{file_name} — {berhasil} berhasil, {gagal} gagal")
    STORE.save()
    return 201, normalize(row)


# ---------------------------------------------------------------------------
# Router + HTTP server
# ---------------------------------------------------------------------------

def dispatch(method: str, subpath: str, query: dict, body: dict):
    path = subpath.rstrip("/") or "/"
    match = None

    if method == "GET":
        if path == "/health":
            return endpoint_health(query, body)
        if path == "/snapshot":
            return endpoint_snapshot(query, body)
        if path == "/settings":
            return endpoint_settings(query, body)
        if path == "/config/db":
            return endpoint_db_config(query, body)
        if path == "/wilayah":
            return endpoint_wilayah(query, body)
        if path == "/kategori":
            return list_kategori(query, body)
        if path == "/reports":
            return list_reports(query, body)
        if path == "/reports/stats/ringkas":
            return report_stats(query, body)
        if path == "/announcements":
            return list_announcements(query, body)
        if path == "/users":
            return list_users(query, body)
        if path == "/logs":
            return list_logs(query, body)
        if path == "/bantuan":
            return list_bantuan(query, body)
        if path == "/historis":
            return list_historis(query, body)
        if path == "/imports":
            return list_imports(query, body)
        match = re.fullmatch(r"/reports/([^/]+)", path)
        if match:
            return get_report(unquote(match.group(1)), query, body)

    if method == "POST":
        if path == "/kategori":
            return create_kategori(query, body)
        if path == "/reports":
            return submit_report(query, body)
        if path == "/koreksi":
            return koreksi(query, body)
        if path == "/announcements":
            return create_announcement(query, body)
        if path == "/users":
            return create_user(query, body)
        if path == "/auth/login":
            return login(query, body)
        if path == "/auth/logout":
            return logout(query, body)
        if path == "/bantuan":
            return create_bantuan(query, body)
        if path == "/historis":
            return create_historis(query, body)
        if path == "/imports":
            return create_import(query, body)
        match = re.fullmatch(r"/kategori/([^/]+)/delete", path)
        if match:
            return delete_kategori(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/reports/([^/]+)/susulan", path)
        if match:
            return add_susulan(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/reports/([^/]+)/catatan", path)
        if match:
            return add_catatan(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/reports/([^/]+)/tutup", path)
        if match:
            return tutup_laporan(unquote(match.group(1)), query, body)

    if method == "PATCH":
        if path == "/settings":
            return patch_settings(query, body)
        match = re.fullmatch(r"/kategori/([^/]+)", path)
        if match:
            return update_kategori(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/reports/([^/]+)/verifikasi", path)
        if match:
            return verifikasi(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/reports/([^/]+)/penanganan", path)
        if match:
            return patch_penanganan(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/reports/([^/]+)/korban", path)
        if match:
            return patch_korban(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/announcements/([^/]+)", path)
        if match:
            return update_announcement(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/users/([^/]+)/aktif", path)
        if match:
            return set_user_aktif(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/users/([^/]+)/password", path)
        if match:
            return update_user_password(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/users/([^/]+)", path)
        if match:
            return update_user(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/bantuan/([^/]+)", path)
        if match:
            return update_bantuan(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/historis/([^/]+)", path)
        if match:
            return update_historis(unquote(match.group(1)), query, body)

    if method == "DELETE":
        match = re.fullmatch(r"/announcements/([^/]+)", path)
        if match:
            return delete_announcement(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/users/([^/]+)", path)
        if match:
            return delete_user(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/kategori/([^/]+)", path)
        if match:
            return delete_kategori(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/bantuan/([^/]+)", path)
        if match:
            return delete_bantuan(unquote(match.group(1)), query, body)
        match = re.fullmatch(r"/historis/([^/]+)", path)
        if match:
            return delete_historis(unquote(match.group(1)), query, body)

    raise ApiError(404, f"Endpoint {method} {subpath} tidak ditemukan")


def error_payload(status: int, message: str) -> dict:
    try:
        phrase = HTTPStatus(status).phrase
    except ValueError:
        phrase = "Error"
    return {
        "timestamp": now_iso(),
        "status": status,
        "error": phrase,
        "message": message,
    }


class LocalAPIHandler(BaseHTTPRequestHandler):
    server_version = "APPBLocalAPI/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")

    def send_json(self, status: int, payload) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cors_headers()
        self.end_headers()

    def _handle(self, method: str) -> None:
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if not path.startswith("/api"):
            self.send_json(404, error_payload(404, "Endpoint tidak ditemukan"))
            return
        try:
            length = to_int(self.headers.get("Content-Length"), 0)
            raw = self.rfile.read(length) if length > 0 else b""
            body = json.loads(raw.decode("utf-8")) if raw else {}
            if not isinstance(body, dict):
                raise ApiError(400, "Body harus berupa objek JSON")
            query = {
                key: values[0]
                for key, values in parse_qs(parsed.query, keep_blank_values=True).items()
            }
            with STORE.lock:
                status, payload = dispatch(method, path[len("/api"):], query, body)
            self.send_json(status, payload)
        except ApiError as exc:
            self.send_json(exc.status, error_payload(exc.status, exc.message))
        except json.JSONDecodeError:
            self.send_json(400, error_payload(400, "JSON tidak valid"))
        except Exception as exc:  # pragma: no cover - defensive
            sys.stderr.write(f"Unhandled error: {exc!r}\n")
            self.send_json(500, error_payload(500, str(exc)))

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def do_PATCH(self) -> None:  # noqa: N802
        self._handle("PATCH")

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle("DELETE")


def main() -> None:
    print(f"Data source   : postgresql (branch ken)", flush=True)
    print(f"State file    : {DB_FILE}", flush=True)
    print(f"Listening     : http://{HOST}:{PORT}/api/health", flush=True)
    server = ThreadingHTTPServer((HOST, PORT), LocalAPIHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAPI dihentikan.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
