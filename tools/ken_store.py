#!/usr/bin/env python3
"""Adapter between the branch-`ken` PostgreSQL schema and the migrated UI.

The UI/API keep their original logical table names (reports, users, kategori,
...). This module translates them to/from ken's real tables
(laporan_bencana, admin/petugas/relawan, bencana, ...). All reads and writes
therefore hit the imported ken database itself.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

import psycopg2
from psycopg2.extras import Json, RealDictCursor

DSN = os.getenv(
    "APPB_DB_DSN",
    "dbname=appb_db user=appb password=appb_pass host=127.0.0.1 port=5432",
)

KEN_TABLES = (
    "provinsi", "kota", "kecamatan", "kelurahan", "admin", "petugas", "relawan",
    "bencana", "laporan_bencana", "foto", "pembaruan_laporan", "log_penanganan",
    "pengumuman", "bantuan", "data_historis", "app_settings", "imports",
    "laporan_meta",
)


def iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.isoformat(timespec="milliseconds")
    text = str(value).replace(" ", "T")
    if "." not in text:
        text += ".000"
    return text if text.endswith("Z") else text + "Z"


def uniso(value):
    if not value:
        return None
    return str(value).replace("T", " ").replace("Z", "").split(".")[0]


def report_code(identifier: int) -> str:
    return f"APPB-2026-{122 + identifier:05d}"


def logical_report_id(identifier) -> str:
    return f"r{int(identifier):03d}"


def ken_report_id(logical_id) -> int:
    return int(str(logical_id).lstrip("r") or 0)


def user_id(table: str, identifier: int) -> str:
    if table == "admin":
        return f"a{identifier}"
    if table == "petugas":
        return f"u{identifier}"
    return f"u{6 + identifier}"  # relawan 1..6 -> u7..u12


def _connect():
    return psycopg2.connect(DSN)


def _fetch(cur, sql, params=None) -> list[dict]:
    cur.execute(sql, params or ())
    return [dict(row) for row in cur.fetchall()]


def _wilayah_map(cur) -> dict[str, dict]:
    rows = _fetch(cur, """
        SELECT k.id_kelurahan, k.nama_kelurahan, kc.nama_kecamatan,
               kt.nama_kota, kt.id_kota, p.nama_provinsi, p.id_provinsi
        FROM kelurahan k
        JOIN kecamatan kc ON kc.id_kecamatan = k.id_kecamatan
        JOIN kota kt ON kt.id_kota = kc.id_kota
        JOIN provinsi p ON p.id_provinsi = kt.id_provinsi
    """)
    return {row["id_kelurahan"]: row for row in rows}


def load() -> dict:
    conn = _connect()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            wil = _wilayah_map(cur)
            bencana = {row["id_bencana"]: row for row in _fetch(cur, "SELECT * FROM bencana")}
            petugas = {row["id_petugas"]: row for row in _fetch(cur, "SELECT * FROM petugas")}
            meta = {row["id_laporan"]: row for row in _fetch(cur, "SELECT * FROM laporan_meta")}
            foto_count = {
                row["id_laporan"]: row["n"]
                for row in _fetch(cur, "SELECT id_laporan, count(*) n FROM foto GROUP BY id_laporan")
            }
            susulan: dict[int, list] = {}
            for row in _fetch(cur, "SELECT * FROM pembaruan_laporan ORDER BY id_pembaruan"):
                susulan.setdefault(row["id_laporan"], []).append({
                    "id": f"s{row['id_pembaruan']}",
                    "at": iso(row["waktu_pembaruan"]),
                    "nama": "Sistem",
                    "isi": row["deskripsi"],
                })
            logs_by_report: dict[int, list] = {}
            for row in _fetch(cur, "SELECT * FROM log_penanganan ORDER BY id_log"):
                logs_by_report.setdefault(row["id_laporan"], []).append(row)

            # ---- users ----
            users = []
            for table, id_col in (("admin", "id_admin"), ("petugas", "id_petugas"),
                                  ("relawan", "id_relawan")):
                for row in _fetch(cur, f"SELECT * FROM {table}"):
                    place = wil.get(row.get("id_kelurahan"), {})
                    role = "admin" if table == "admin" else table
                    users.append({
                        "id": user_id(table, row[id_col]),
                        "nama": row["nama"],
                        "email": f"{row['username']}@appb.local",
                        "username": row["username"],
                        "hp": row.get("kontak"),
                        "instansi": row.get("instansi") or "BPBD",
                        "wilayah": place.get("nama_kota") or "Nasional",
                        "kelurahanId": row.get("id_kelurahan"),
                        "role": role,
                        "aktif": True if table == "admin" else row.get("status") == "Aktif",
                        "password_hash": row["password"],
                    })

            # ---- categories ----
            categories = [{
                "id": f"c{row['id_bencana']}",
                "nama": row["nama_bencana"],
                "aktif": row["status"] == "Aktif",
                "deskripsi": row["deskripsi"],
            } for row in sorted(bencana.values(), key=lambda r: r["id_bencana"])]

            # ---- reports ----
            reports = []
            for row in _fetch(cur, "SELECT * FROM laporan_bencana ORDER BY id_laporan"):
                rid = row["id_laporan"]
                place = wil.get(row["id_kelurahan"], {})
                extra = meta.get(rid, {})
                status = row["status"]
                verif = extra.get("verif") or (
                    "Tertunda" if status == "Tertunda"
                    else "Ditolak" if status == "Ditolak" else "Resmi"
                )
                penanganan = extra.get("penanganan") or (
                    status if status in {
                        "Belum Ditangani", "Sedang Ditangani", "Selesai Ditangani",
                        "Tidak Memerlukan Tindak Lanjut", "Case Closed",
                    } else "Belum Ditangani"
                )
                assigned = petugas.get(row.get("id_petugas"), {})
                reports.append({
                    "id": logical_report_id(rid),
                    "code": extra.get("code") or report_code(rid),
                    "device_id": extra.get("device_id") or "ken-import",
                    "jenis": bencana.get(row["id_bencana"], {}).get("nama_bencana", ""),
                    "prov": place.get("nama_provinsi") or "",
                    "kab": place.get("nama_kota") or "",
                    "kec": place.get("nama_kecamatan") or "",
                    "kel": place.get("nama_kelurahan") or "",
                    "kelurahanId": row["id_kelurahan"],
                    "alamat": row["alamat"],
                    "judul": row["judul_laporan"],
                    "deskripsi": row["deskripsi"],
                    "created_at": iso(row["waktu_laporan"]),
                    "pelapor": "Warga",
                    "hp": row.get("no_hp_pelapor"),
                    "verif": verif,
                    "penanganan": penanganan,
                    "luka": row["jumlah_luka"],
                    "hilang": row["jumlah_hilang"],
                    "meninggal": row["jumlah_meninggal"],
                    "mengungsi": row["jumlah_korban"],
                    "korban_history": extra.get("korban_history") or [],
                    "susulan": susulan.get(rid, []),
                    "status_history": extra.get("status_history") or [
                        {"at": iso(log["waktu_log"]), "status": log["aksi"], "by": log["aktor"]}
                        for log in logs_by_report.get(rid, [])
                    ],
                    "foto": foto_count.get(rid, 0),
                    "verified_by": extra.get("verified_by") or assigned.get("username"),
                    "verified_at": iso(row.get("waktu_verifikasi")),
                    "reject_reason": extra.get("reject_reason") or "",
                    "closed_by": extra.get("closed_by"),
                    "closed_at": extra.get("closed_at"),
                    "ringkasan": extra.get("ringkasan") or "",
                })

            codes = {r["id"]: r["code"] for r in reports}

            # ---- announcements ----
            announcements = []
            for row in _fetch(cur, "SELECT * FROM pengumuman ORDER BY id_pengumuman"):
                place = wil.get(row.get("id_kelurahan"), {})
                report = next(
                    (r for r in reports if r["kelurahanId"] == row.get("id_kelurahan")), None
                )
                announcements.append({
                    "id": f"n{row['id_pengumuman']}",
                    "title": row["judul"],
                    "body": row["deskripsi"],
                    "severity": row["label"],
                    "jenis": "Informasi",
                    "prov": place.get("nama_provinsi") or "",
                    "kab": place.get("nama_kota") or "",
                    "kec": place.get("nama_kecamatan") or "",
                    "kel": place.get("nama_kelurahan") or "",
                    "report_code": (
                        codes.get(f"r{row['id_laporan']:03d}") if row.get("id_laporan") else None
                    ),
                    "at": iso(row["waktu_diumumkan"]),
                    "by_user": petugas.get(row["id_petugas"], {}).get("username", "Sistem"),
                    "kelurahanId": row.get("id_kelurahan"),
                    "reportId": row.get("id_laporan"),
                })

            # ---- logs (append-only) ----
            logs = []
            for row in _fetch(cur, "SELECT * FROM log_penanganan ORDER BY id_log"):
                actor = str(row["aktor"] or "")
                role = "admin" if actor.startswith("admin") else (
                    "relawan" if actor.startswith("relawan") else "petugas"
                )
                logs.append({
                    "id": f"l{row['id_log']}",
                    "at": iso(row["waktu_log"]),
                    "actor": actor,
                    "role": role,
                    "aksi": row["aksi"],
                    "code": codes.get(f"r{row['id_laporan']:03d}"),
                    "detail": row["detail"],
                })

            # ---- bantuan ----
            bantuan = []
            for row in _fetch(cur, "SELECT * FROM bantuan ORDER BY id_bantuan"):
                place = wil.get(row.get("id_kelurahan"), {})
                bantuan.append({
                    "id": f"b{row['id_bantuan']}",
                    "sumber": row["sumber"],
                    "jenis": row["jenis_bantuan"],
                    "jumlah": row["jumlah"],
                    "satuan": "paket",
                    "kab": place.get("nama_kota") or "",
                    "code": codes.get(f"r{row['id_laporan']:03d}") if row.get("id_laporan") else None,
                    "at": iso(row["waktu_catat"]),
                    "by_user": "Sistem",
                    "kelurahanId": row.get("id_kelurahan"),
                    "reportId": row.get("id_laporan"),
                })

            # ---- historis ----
            historis = []
            for row in _fetch(cur, "SELECT * FROM data_historis ORDER BY id_historis"):
                place = wil.get(row["id_kelurahan"], {})
                historis.append({
                    "id": f"h{row['id_historis']}",
                    "jenis": "Historis",
                    "prov": place.get("nama_provinsi") or "",
                    "kab": place.get("nama_kota") or "",
                    "tanggal": str(row["tanggal_kejadian"]),
                    "meninggal": 0,
                    "mengungsi": 0,
                    "rumah_rusak": row["jumlah_korban"],
                    "sumber": row["sumber_data"],
                    "kelurahanId": row["id_kelurahan"],
                })

            wilayah = [{
                "prov": place["nama_provinsi"], "kab": place["nama_kota"],
                "kec": place["nama_kecamatan"], "kel": place["nama_kelurahan"],
            } for place in wil.values()]

            settings = {
                row["key"]: row["value"]
                for row in _fetch(cur, "SELECT key, value FROM app_settings")
            }
            imports = [{
                "id": row["id"], "at": row["at"], "file": row["file"],
                "jenis": row["jenis"], "berhasil": row["berhasil"],
                "gagal": row["gagal"], "by_user": row["by_user"],
            } for row in _fetch(cur, "SELECT * FROM imports")]
    finally:
        conn.close()

    return {
        "version": 1,
        "source": "postgresql:appb_db/ken",
        "tables": {
            "sequences": [{"name": "report_code", "value": max(
                125, 122 + max((ken_report_id(r["id"]) for r in reports), default=0) + 1
            )}],
            "wilayah": wilayah,
            "wilayah_posisi": [],
            "kategori": categories,
            "users": users,
            "reports": reports,
            "announcements": announcements,
            "logs": logs,
            "bantuan": bantuan,
            "historis": historis,
            "settings": [{"key": k, "value": v} for k, v in settings.items()],
            "imports": imports,
        },
        "settings": settings,
    }


def _kelurahan_for(logical_row: dict, wil_lookup: dict, cur) -> str | None:
    if logical_row.get("kelurahanId"):
        return logical_row["kelurahanId"]
    key = (logical_row.get("prov"), logical_row.get("kab"),
           logical_row.get("kec"), logical_row.get("kel"))
    if key in wil_lookup:
        return wil_lookup[key]
    # Fall back to the first kelurahan of the chosen kecamatan.
    cur.execute("""SELECT k.id_kelurahan FROM kelurahan k
        JOIN kecamatan kc ON kc.id_kecamatan = k.id_kecamatan
        JOIN kota kt ON kt.id_kota = kc.id_kota
        JOIN provinsi p ON p.id_provinsi = kt.id_provinsi
        WHERE p.nama_provinsi = %s AND kt.nama_kota = %s AND kc.nama_kecamatan = %s
        LIMIT 1""", (logical_row.get("prov"), logical_row.get("kab"), logical_row.get("kec")))
    found = cur.fetchone()
    return found[0] if found else None


def save(data: dict) -> None:
    tables = data["tables"]
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute("""SELECT k.id_kelurahan, k.nama_kelurahan, kc.nama_kecamatan,
                    kt.nama_kota, p.nama_provinsi
                FROM kelurahan k
                JOIN kecamatan kc ON kc.id_kecamatan = k.id_kecamatan
                JOIN kota kt ON kt.id_kota = kc.id_kota
                JOIN provinsi p ON p.id_provinsi = kt.id_provinsi""")
            wil_lookup = {
                (r[4], r[3], r[2], r[1]): r[0] for r in cur.fetchall()
            }

            # ---- categories (bencana) ----
            category_by_nama: dict[str, int] = {}
            cur.execute("SELECT id_bencana, nama_bencana FROM bencana")
            for identifier, nama in cur.fetchall():
                category_by_nama[nama] = identifier
            for row in tables.get("kategori", []):
                identifier = int(str(row.get("id", "")).lstrip("c") or 0)
                nama = row.get("nama")
                if not nama:
                    continue
                category_by_nama[nama] = identifier
                cur.execute("""INSERT INTO bencana (id_bencana, nama_bencana, deskripsi, status)
                    VALUES (%s,%s,%s,%s) ON CONFLICT (id_bencana) DO UPDATE SET
                    nama_bencana=EXCLUDED.nama_bencana, deskripsi=EXCLUDED.deskripsi,
                    status=EXCLUDED.status""",
                    (identifier, nama, row.get("deskripsi"),
                     "Aktif" if row.get("aktif", True) else "Nonaktif"))
            cur.execute("DELETE FROM bencana WHERE id_bencana NOT IN %s",
                        (tuple(category_by_nama.values()) or (0,),))

            # ---- users ----
            wanted = {"admin": [], "petugas": [], "relawan": []}
            for row in tables.get("users", []):
                identifier = str(row.get("id", ""))
                role = row.get("role")
                if role not in wanted:
                    continue
                numeric = int("".join(ch for ch in identifier if ch.isdigit()) or 0)
                if role == "relawan":
                    numeric = max(0, numeric - 6)
                table = role
                id_col = f"id_{role}"
                nama = row.get("nama")
                username = str(row.get("email") or row.get("username") or "").split("@")[0]
                password_hash = row.get("password_hash") or ""
                if role == "admin":
                    cur.execute("""INSERT INTO admin (id_admin,nama,username,password,password_original)
                        VALUES (%s,%s,%s,%s,NULL) ON CONFLICT (id_admin) DO UPDATE SET
                        nama=EXCLUDED.nama, username=EXCLUDED.username, password=EXCLUDED.password""",
                        (numeric, nama, username, password_hash))
                else:
                    kel = _kelurahan_for(row, wil_lookup, cur)
                    cur.execute(f"""INSERT INTO {table}
                        ({id_col},id_kelurahan,nama,username,password,password_original,kontak,instansi,status)
                        VALUES (%s,%s,%s,%s,%s,NULL,%s,%s,%s)
                        ON CONFLICT ({id_col}) DO UPDATE SET
                        id_kelurahan=EXCLUDED.id_kelurahan, nama=EXCLUDED.nama,
                        username=EXCLUDED.username, password=EXCLUDED.password,
                        kontak=EXCLUDED.kontak, instansi=EXCLUDED.instansi, status=EXCLUDED.status""",
                        (numeric, kel, nama, username, password_hash, row.get("hp"),
                         row.get("instansi") or "BPBD",
                         "Aktif" if row.get("aktif", True) else "Nonaktif"))
                wanted[table].append(numeric)
            for table, id_col in (("admin", "id_admin"), ("petugas", "id_petugas"),
                                  ("relawan", "id_relawan")):
                cur.execute(f"DELETE FROM {table} WHERE {id_col} NOT IN %s",
                            (tuple(wanted[table]) or (0,),))

            # ---- reports ----
            report_rows = tables.get("reports", [])
            kept = []
            next_rid = max(
                (int(str(r["id"]).lstrip("r")) for r in report_rows
                 if str(r.get("id", "")).lstrip("r").isdigit()),
                default=0,
            ) + 1
            for row in report_rows:
                raw_id = str(row.get("id", "")).lstrip("r")
                rid = int(raw_id) if raw_id.isdigit() else next_rid
                if rid == next_rid and not raw_id.isdigit():
                    next_rid += 1
                row["id"] = f"r{rid:03d}"
                kept.append(rid)
                kel = _kelurahan_for(row, wil_lookup, cur)
                if not kel:
                    continue
                status = row.get("penanganan") or "Belum Ditangani"
                if row.get("verif") == "Ditolak":
                    status = "Ditolak"
                elif row.get("verif") == "Tertunda":
                    status = "Tertunda"
                jenis = row.get("jenis")
                bencana_id = category_by_nama.get(jenis)
                if bencana_id is None:
                    cur.execute("INSERT INTO bencana (id_bencana,nama_bencana,deskripsi,status) "
                                "VALUES ((SELECT COALESCE(MAX(id_bencana),0)+1 FROM bencana),%s,%s,'Aktif') "
                                "RETURNING id_bencana", (jenis, "Ditambahkan dari laporan"))
                    bencana_id = cur.fetchone()[0]
                    category_by_nama[jenis] = bencana_id
                assigned = None
                if row.get("verified_by"):
                    cur.execute("SELECT id_petugas FROM petugas WHERE username=%s",
                                (str(row["verified_by"]).split("@")[0],))
                    found = cur.fetchone()
                    assigned = found[0] if found else None
                cur.execute("""INSERT INTO laporan_bencana (
                    id_laporan,id_kelurahan,id_bencana,id_petugas,judul_laporan,deskripsi,
                    alamat,status,waktu_laporan,waktu_verifikasi,no_hp_pelapor,
                    jumlah_korban,jumlah_luka,jumlah_hilang,jumlah_meninggal)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (id_laporan) DO UPDATE SET
                    id_kelurahan=EXCLUDED.id_kelurahan, id_bencana=EXCLUDED.id_bencana,
                    id_petugas=EXCLUDED.id_petugas, judul_laporan=EXCLUDED.judul_laporan,
                    deskripsi=EXCLUDED.deskripsi, alamat=EXCLUDED.alamat, status=EXCLUDED.status,
                    waktu_laporan=EXCLUDED.waktu_laporan, waktu_verifikasi=EXCLUDED.waktu_verifikasi,
                    no_hp_pelapor=EXCLUDED.no_hp_pelapor, jumlah_korban=EXCLUDED.jumlah_korban,
                    jumlah_luka=EXCLUDED.jumlah_luka, jumlah_hilang=EXCLUDED.jumlah_hilang,
                    jumlah_meninggal=EXCLUDED.jumlah_meninggal""", (
                    rid, kel, bencana_id, assigned,
                    row.get("judul") or row.get("code") or "Laporan bencana",
                    row.get("deskripsi") or "", row.get("alamat") or "", status,
                    uniso(row.get("created_at")) or datetime.now(),
                    uniso(row.get("verified_at")), row.get("hp"),
                    int(row.get("mengungsi") or 0), int(row.get("luka") or 0),
                    int(row.get("hilang") or 0), int(row.get("meninggal") or 0),
                ))
                cur.execute("""INSERT INTO laporan_meta (
                    id_laporan,code,device_id,verified_by,reject_reason,closed_by,closed_at,
                    ringkasan,korban_history,status_history,verif,penanganan)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (id_laporan) DO UPDATE SET
                    code=EXCLUDED.code, device_id=EXCLUDED.device_id,
                    verified_by=EXCLUDED.verified_by, reject_reason=EXCLUDED.reject_reason,
                    closed_by=EXCLUDED.closed_by, closed_at=EXCLUDED.closed_at,
                    ringkasan=EXCLUDED.ringkasan, korban_history=EXCLUDED.korban_history,
                    status_history=EXCLUDED.status_history, verif=EXCLUDED.verif,
                    penanganan=EXCLUDED.penanganan""", (
                    rid, row.get("code"), row.get("device_id"), row.get("verified_by"),
                    row.get("reject_reason"), row.get("closed_by"), row.get("closed_at"),
                    row.get("ringkasan"), Json(row.get("korban_history") or []),
                    Json(row.get("status_history") or []),
                    row.get("verif") or "Tertunda", row.get("penanganan") or "Belum Ditangani",
                ))
            cur.execute("DELETE FROM laporan_meta WHERE id_laporan NOT IN %s",
                        (tuple(kept) or (0,),))

            # ---- susulan (pembaruan_laporan) ----
            cur.execute("DELETE FROM pembaruan_laporan")
            susulan_id = 0
            for row in report_rows:
                for item in row.get("susulan") or []:
                    susulan_id += 1
                    cur.execute("""INSERT INTO pembaruan_laporan
                        (id_pembaruan,id_laporan,deskripsi,waktu_pembaruan)
                        VALUES (%s,%s,%s,%s)""", (
                        susulan_id, ken_report_id(row["id"]),
                        item.get("isi") or "", uniso(item.get("at")) or datetime.now(),
                    ))

            # ---- announcements / bantuan / historis ----
            cur.execute("DELETE FROM pengumuman")
            for row in tables.get("announcements", []):
                cur.execute("""INSERT INTO pengumuman
                    (id_pengumuman,id_kelurahan,id_laporan,id_petugas,label,judul,deskripsi,waktu_diumumkan)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""", (
                    int(str(row.get("id", "")).lstrip("n") or 0),
                    _kelurahan_for(row, wil_lookup, cur), row.get("reportId"), 1,
                    row.get("severity") or "Informasi", row.get("title") or "",
                    row.get("body") or "", uniso(row.get("at")) or datetime.now(),
                ))
            cur.execute("DELETE FROM bantuan")
            for row in tables.get("bantuan", []):
                cur.execute("""INSERT INTO bantuan
                    (id_bantuan,id_kelurahan,id_laporan,sumber,jenis_bantuan,jumlah,waktu_catat)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)""", (
                    int(str(row.get("id", "")).lstrip("b") or 0),
                    _kelurahan_for(row, wil_lookup, cur), row.get("reportId"),
                    row.get("sumber") or "", row.get("jenis") or "",
                    max(1, int(row.get("jumlah") or 1)),
                    uniso(row.get("at")) or datetime.now(),
                ))
            cur.execute("DELETE FROM data_historis")
            for row in tables.get("historis", []):
                cur.execute("""INSERT INTO data_historis
                    (id_historis,id_kelurahan,id_laporan,id_admin,jumlah_korban,sumber_data,tanggal_kejadian)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)""", (
                    int(str(row.get("id", "")).lstrip("h") or 0),
                    _kelurahan_for(row, wil_lookup, cur), None, 1,
                    int(row.get("rumah_rusak") or 0), row.get("sumber") or "BPBD",
                    row.get("tanggal") or datetime.now().date(),
                ))

            # ---- logs: append-only, never delete or update ----
            cur.execute("SELECT id_log FROM log_penanganan")
            existing_logs = {f"l{row[0]}" for row in cur.fetchall()}
            log_id = max((int(x.lstrip("l")) for x in existing_logs), default=0)
            code_to_report = {
                row.get("code"): ken_report_id(row["id"]) for row in report_rows
            }
            for row in tables.get("logs", []):
                if row.get("id") in existing_logs:
                    continue
                log_id += 1
                cur.execute("""INSERT INTO log_penanganan
                    (id_log,id_laporan,aktor,aksi,detail,waktu_log)
                    VALUES (%s,%s,%s,%s,%s,%s)""", (
                    log_id, code_to_report.get(row.get("code"), 1),
                    row.get("actor") or "Sistem", row.get("aksi") or "Aksi",
                    row.get("detail") or "", uniso(row.get("at")) or datetime.now(),
                ))

            # ---- settings / imports ----
            for key, value in (data.get("settings") or {}).items():
                cur.execute("""INSERT INTO app_settings (key,value) VALUES (%s,%s)
                    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value""", (key, str(value)))
            cur.execute("DELETE FROM imports")
            for row in tables.get("imports", []):
                cur.execute("""INSERT INTO imports (id,at,file,jenis,berhasil,gagal,by_user)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)""", (
                    row.get("id"), row.get("at"), row.get("file"), row.get("jenis"),
                    row.get("berhasil") or 0, row.get("gagal") or 0, row.get("by_user"),
                ))
        conn.commit()
    finally:
        conn.close()
