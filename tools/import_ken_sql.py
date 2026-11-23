#!/usr/bin/env python3
"""Import the branch-`ken` MySQL dump into PostgreSQL (appb_db).

Source (downloaded from origin/ken):
  ~/Downloads/basisdata/01_buat_tabel_appb.sql
  ~/Downloads/basisdata/02_hapus_tabel_appb.sql
  ~/Downloads/basisdata/03_isi_data_awal_appb.sql

MySQL-specific DDL (ENUM, UNSIGNED, AUTO_INCREMENT, inline INDEX, COMMENT,
SIGNAL triggers) is translated to PostgreSQL DDL. Data is parsed from the
INSERT statements and inserted with explicit ids so foreign keys stay intact.

Two deliberate, documented adaptations:
  * bcrypt hashes from ken are kept in `password_original`; the login column
    `password` receives a PBKDF2 hash of the documented demo password so the
    migrated UI can still sign in (the bcrypt plaintext is unknown).
  * log_penanganan.id_laporan is NOT UNIQUE here: the migrated UI writes a
    full append-only audit trail (several entries per report).
"""
from __future__ import annotations

import hashlib
import os
import re
import secrets
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path.home() / "Downloads" / "basisdata"
DATA_FILE = SOURCE / "03_isi_data_awal_appb.sql"
DSN = os.getenv(
    "APPB_DB_DSN",
    "dbname=appb_db user=appb password=appb_pass host=127.0.0.1 port=5432",
)
DEMO_PASSWORD = "appb2026"
ITERATIONS = 120_000
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

STATUS_VALUES = (
    "Tertunda", "Resmi", "Ditolak", "Belum Ditangani", "Sedang Ditangani",
    "Selesai Ditangani", "Tidak Memerlukan Tindak Lanjut", "Case Closed",
)

DDL = """
-- Hapus semua data pra-migrasi (seed mockup lama). Source of truth = dump ken.
DROP TABLE IF EXISTS announcements, historis, kategori, logs, reports,
                     sequences, settings, users, wilayah, wilayah_posisi CASCADE;
DROP TABLE IF EXISTS app_settings, imports, laporan_meta CASCADE;
DROP TABLE IF EXISTS data_historis, bantuan, pengumuman, log_penanganan CASCADE;
DROP TABLE IF EXISTS pembaruan_laporan, foto, laporan_bencana, bencana CASCADE;
DROP TABLE IF EXISTS petugas, relawan, admin, kelurahan, kecamatan, kota, provinsi CASCADE;
DROP FUNCTION IF EXISTS log_append_only();

CREATE TABLE provinsi (
  id_provinsi varchar(2) PRIMARY KEY,
  nama_provinsi varchar(100) NOT NULL
);
CREATE TABLE kota (
  id_kota varchar(5) PRIMARY KEY,
  id_provinsi varchar(2) NOT NULL REFERENCES provinsi(id_provinsi),
  nama_kota varchar(100) NOT NULL
);
CREATE TABLE kecamatan (
  id_kecamatan varchar(8) PRIMARY KEY,
  id_kota varchar(5) NOT NULL REFERENCES kota(id_kota),
  nama_kecamatan varchar(100) NOT NULL
);
CREATE TABLE kelurahan (
  id_kelurahan varchar(13) PRIMARY KEY,
  id_kecamatan varchar(8) NOT NULL REFERENCES kecamatan(id_kecamatan),
  nama_kelurahan varchar(100) NOT NULL
);
CREATE TABLE admin (
  id_admin integer PRIMARY KEY,
  nama varchar(150) NOT NULL,
  username varchar(80) NOT NULL UNIQUE,
  password text NOT NULL,
  password_original text
);
CREATE TABLE petugas (
  id_petugas integer PRIMARY KEY,
  id_kelurahan varchar(13) NOT NULL REFERENCES kelurahan(id_kelurahan),
  nama varchar(150) NOT NULL,
  username varchar(80) NOT NULL UNIQUE,
  password text NOT NULL,
  password_original text,
  kontak varchar(30),
  instansi varchar(150) NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif','Nonaktif'))
);
CREATE TABLE relawan (
  id_relawan integer PRIMARY KEY,
  id_kelurahan varchar(13) NOT NULL REFERENCES kelurahan(id_kelurahan),
  nama varchar(150) NOT NULL,
  username varchar(80) NOT NULL UNIQUE,
  password text NOT NULL,
  password_original text,
  kontak varchar(30),
  instansi varchar(150) NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif','Nonaktif'))
);
CREATE TABLE bencana (
  id_bencana integer PRIMARY KEY,
  nama_bencana varchar(100) NOT NULL UNIQUE,
  deskripsi text,
  status varchar(10) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif','Nonaktif'))
);
CREATE TABLE laporan_bencana (
  id_laporan bigint PRIMARY KEY,
  id_kelurahan varchar(13) NOT NULL REFERENCES kelurahan(id_kelurahan),
  id_bencana integer NOT NULL REFERENCES bencana(id_bencana),
  id_petugas integer REFERENCES petugas(id_petugas),
  judul_laporan varchar(180) NOT NULL,
  deskripsi text NOT NULL,
  alamat varchar(255) NOT NULL,
  status varchar(60) NOT NULL DEFAULT 'Tertunda' CHECK (status IN ({statuses})),
  waktu_laporan timestamp NOT NULL DEFAULT now(),
  waktu_verifikasi timestamp,
  no_hp_pelapor varchar(30),
  jumlah_korban integer NOT NULL DEFAULT 0,
  jumlah_luka integer NOT NULL DEFAULT 0,
  jumlah_hilang integer NOT NULL DEFAULT 0,
  jumlah_meninggal integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_laporan_wilayah_kategori_status
  ON laporan_bencana (id_kelurahan, id_bencana, status);
CREATE INDEX idx_laporan_status_waktu
  ON laporan_bencana (status, waktu_laporan);
CREATE TABLE foto (
  id_foto bigint PRIMARY KEY,
  id_laporan bigint NOT NULL REFERENCES laporan_bencana(id_laporan),
  url_foto varchar(2048) NOT NULL
);
CREATE TABLE pembaruan_laporan (
  id_pembaruan bigint PRIMARY KEY,
  id_laporan bigint NOT NULL REFERENCES laporan_bencana(id_laporan),
  deskripsi text NOT NULL,
  waktu_pembaruan timestamp NOT NULL DEFAULT now()
);
CREATE TABLE log_penanganan (
  id_log bigint PRIMARY KEY,
  id_laporan bigint NOT NULL REFERENCES laporan_bencana(id_laporan),
  aktor varchar(150) NOT NULL,
  aksi varchar(80) NOT NULL,
  detail text NOT NULL,
  waktu_log timestamp NOT NULL DEFAULT now()
);
CREATE TABLE pengumuman (
  id_pengumuman bigint PRIMARY KEY,
  id_kelurahan varchar(13) REFERENCES kelurahan(id_kelurahan),
  id_laporan bigint REFERENCES laporan_bencana(id_laporan),
  id_petugas integer NOT NULL REFERENCES petugas(id_petugas),
  label varchar(50) NOT NULL,
  judul varchar(180) NOT NULL,
  deskripsi text NOT NULL,
  waktu_diumumkan timestamp NOT NULL DEFAULT now(),
  CHECK (id_kelurahan IS NOT NULL OR id_laporan IS NOT NULL)
);
CREATE TABLE bantuan (
  id_bantuan bigint PRIMARY KEY,
  id_kelurahan varchar(13) REFERENCES kelurahan(id_kelurahan),
  id_laporan bigint REFERENCES laporan_bencana(id_laporan),
  sumber varchar(150) NOT NULL,
  jenis_bantuan varchar(150) NOT NULL,
  jumlah integer NOT NULL CHECK (jumlah > 0),
  waktu_catat timestamp NOT NULL DEFAULT now(),
  CHECK (id_kelurahan IS NOT NULL OR id_laporan IS NOT NULL)
);
CREATE TABLE data_historis (
  id_historis bigint PRIMARY KEY,
  id_kelurahan varchar(13) NOT NULL REFERENCES kelurahan(id_kelurahan),
  id_laporan bigint UNIQUE REFERENCES laporan_bencana(id_laporan),
  id_admin integer NOT NULL REFERENCES admin(id_admin),
  jumlah_korban integer NOT NULL DEFAULT 0,
  sumber_data varchar(180) NOT NULL,
  tanggal_kejadian date NOT NULL
);
CREATE FUNCTION log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Entri log tidak dapat diubah';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_log_tolak_update
  BEFORE UPDATE ON log_penanganan FOR EACH ROW EXECUTE FUNCTION log_append_only();
CREATE TRIGGER trg_log_tolak_delete
  BEFORE DELETE ON log_penanganan FOR EACH ROW EXECUTE FUNCTION log_append_only();

-- Extra state needed by the migrated UI but absent from the ken schema.
CREATE TABLE laporan_meta (
  id_laporan bigint PRIMARY KEY REFERENCES laporan_bencana(id_laporan),
  code text, device_id text, verified_by text, reject_reason text,
  closed_by text, closed_at text, ringkasan text,
  korban_history jsonb DEFAULT '[]'::jsonb,
  status_history jsonb DEFAULT '[]'::jsonb,
  verif text DEFAULT 'Tertunda',
  penanganan text DEFAULT 'Belum Ditangani'
);
CREATE TABLE app_settings (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE imports (
  id text PRIMARY KEY, at text, file text, jenis text,
  berhasil integer DEFAULT 0, gagal integer DEFAULT 0, by_user text
);
""".format(statuses=", ".join("'%s'" % s for s in STATUS_VALUES))

USER_TABLES = {"admin", "petugas", "relawan"}


def hash_password(password: str = DEMO_PASSWORD) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def parse_inserts(path: Path) -> dict[str, tuple[list[str], list[list]]]:
    """Parse multi-line MySQL INSERT ... VALUES into column names and rows."""
    sql = path.read_text(encoding="utf-8")
    sql = re.sub(r"^\s*--.*$", "", sql, flags=re.MULTILINE)
    pattern = re.compile(
        r"INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*(.*?);",
        re.IGNORECASE | re.DOTALL,
    )
    result: dict[str, tuple[list[str], list[list]]] = {}
    for match in pattern.finditer(sql):
        table = match.group(1).lower()
        columns = [c.strip().lower() for c in match.group(2).split(",")]
        rows = parse_values(match.group(3))
        if table not in result:
            result[table] = (columns, [])
        result[table][1].extend(rows)
    return result


def parse_values(text: str) -> list[list]:
    rows: list[list] = []
    row: list = []
    value = ""
    quote = False
    i = 0
    while i < len(text):
        char = text[i]
        if quote:
            if char == "'":
                if i + 1 < len(text) and text[i + 1] == "'":
                    value += "'"
                    i += 2
                    continue
                quote = False
            else:
                value += char
        elif char == "'":
            quote = True
        elif char == "(":
            row = []
            value = ""
        elif char == ")":
            row.append(convert(value))
            rows.append(row)
            value = ""
        elif char == ",":
            row.append(convert(value))
            value = ""
        elif not char.isspace():
            value += char
        i += 1
    return rows


def convert(value: str):
    raw = value.strip()
    if raw.upper() == "NULL" or raw == "":
        return None
    if raw.upper() == "TRUE":
        return True
    if raw.upper() == "FALSE":
        return False
    return raw


def coerce(table: str, column: str, value):
    if value is None:
        return None
    if column in {"jumlah_korban", "jumlah_luka", "jumlah_hilang", "jumlah_meninggal",
                  "jumlah", "id_admin", "id_petugas", "id_relawan", "id_bencana",
                  "id_laporan", "id_log", "id_foto", "id_pembaruan",
                  "id_pengumuman", "id_bantuan", "id_historis"}:
        return int(value)
    if column.startswith("waktu") or column in {"tanggal_kejadian"}:
        return str(value).replace("T", " ")
    return value


def main() -> None:
    if not DATA_FILE.exists():
        raise SystemExit(f"Tidak ditemukan dump ken: {DATA_FILE}")
    parsed = parse_inserts(DATA_FILE)
    conn = psycopg2.connect(DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(DDL)
            for table, (columns, rows) in parsed.items():
                if table not in USER_TABLES:
                    cols = list(columns)
                    quoted = ", ".join(f'"{c}"' for c in cols)
                    placeholders = ", ".join(["%s"] * len(cols))
                    values = [[coerce(table, c, r[i]) for i, c in enumerate(cols)] for r in rows]
                    cur.executemany(
                        f"INSERT INTO {table} ({quoted}) VALUES ({placeholders})", values
                    )
                    continue
                # Keep the original bcrypt hash, set a usable PBKDF2 password.
                cols = list(columns)
                if "password_original" not in cols:
                    cols.append("password_original")
                    extra = True
                else:
                    extra = False
                quoted = ", ".join(f'"{c}"' for c in cols)
                placeholders = ", ".join(["%s"] * len(cols))
                values = []
                for row in rows:
                    item = [coerce(table, c, row[i]) for i, c in enumerate(columns)]
                    idx = columns.index("password") if "password" in columns else None
                    original = row[idx] if idx is not None else None
                    if idx is not None:
                        item[idx] = hash_password()
                    if extra:
                        item.append(original)
                    values.append(item)
                cur.executemany(
                    f"INSERT INTO {table} ({quoted}) VALUES ({placeholders})", values
                )
            # Seed the UI-only settings table with the migrated theme defaults.
            for key, value in THEME_DEFAULTS.items():
                cur.execute(
                    "INSERT INTO app_settings (key, value) VALUES (%s, %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                    (key, value),
                )
        conn.commit()
    finally:
        conn.close()

    print(f"Imported branch-ken database into {DSN}")
    for table in sorted(parsed):
        print(f"  {table}: {len(parsed[table][1])} rows")


if __name__ == "__main__":
    main()
