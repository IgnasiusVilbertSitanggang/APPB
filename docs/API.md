# Daftar API REST — API Java Spring (jalur aktif)

Base URL: `http://localhost:8081/api` lewat Nginx (langsung:
`http://127.0.0.1:8080/api`).

Semua request/response menggunakan JSON (`Content-Type: application/json`).
Format tanggal mengikuti ISO-8601 UTC, ditampilkan frontend dalam `Asia/Jakarta`.

Jalur aktif memakai API Java Spring (`backend/`) di atas PostgreSQL `appb_db`
yang diimpor dari dump branch `ken`. `tools/ken_compat.sql` menyediakan view +
trigger `INSTEAD OF` bernama `users`, `reports`, `kategori`, `logs`, dll. di
atas tabel asli `ken`; `tools/local_api.py` + `tools/ken_store.py` tersimpan
sebagai arsip kontrak dan **tidak dijalankan**. Jalur Docker/MySQL juga tidak
aktif. Satu-satunya sumber data adalah dump `ken`.

## Health

| Method | Path | Keterangan |
|---|---|---|
| GET | `/health` | Status server + waktu server |

## Snapshot 1:1

| Method | Path | Keterangan |
|---|---|---|
| GET | `/snapshot` | Objek DB lengkap: `reports`, `users`, `categories`, `announcements`, `logs`, `bantuan`, `historis`, `imports`, `settings`, `session`, `nextCode` |

`settings` memakai bentuk yang sama persis dengan `GET /settings` (objek `theme` +
objek `db`).

## Konfigurasi Web (Settings)

Nilai tema disimpan permanen di tabel `app_settings` (branch `ken`) dengan
awalan `theme.` pada kunci database (`theme.color-ink`, dst.). API menormalkan
awalan itu: kunci yang terlihat di objek `theme` adalah `color-ink`,
`font-sans`, `radius-sm`, dst.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/settings` | Konfigurasi lengkap: `theme` + `db` |
| GET | `/config/db` | Hanya objek `db` (read-only) |
| PATCH | `/settings` | Ubah/simpan nilai tema; kunci tidak dikenal → `400` |

Objek `db` selalu berisi `mode`, `name`, `host`, `port`, `user`. Pada jalur
aktif nilainya `postgresql`, `appb_db (branch ken)`, `127.0.0.1`, `5432`,
`appb` (konstanta `DB_INFO` di `local_api.py`; DSN bisa diganti lewat env
`APPB_DB_DSN`). **Kata sandi database tidak pernah dikembalikan oleh endpoint
mana pun** (tidak ada field `password`).

Bentuk lengkap `GET /settings` (juga dipakai oleh `/snapshot`):

```json
{
  "theme": {
    "color-ink": "#0f172a",
    "color-ink2": "#475569",
    "color-mute": "#94a3b8",
    "color-line": "#e2e8f0",
    "color-app": "#f8fafc",
    "color-navy": "#1e3a8a",
    "color-navyh": "#1e40af",
    "color-crit": "#b91c1c",
    "color-crit-t": "#fef2f2",
    "color-warn": "#b45309",
    "color-warn-t": "#fffbeb",
    "color-ok": "#15803d",
    "color-ok-t": "#f0fdf4",
    "color-info": "#1d4ed8",
    "color-info-t": "#eff6ff",
    "font-sans": "'Inter', system-ui, sans-serif",
    "radius-sm": "4px",
    "radius-md": "6px",
    "radius-lg": "8px"
  },
  "db": {
    "mode": "postgresql",
    "name": "appb_db (branch ken)",
    "host": "127.0.0.1",
    "port": "5432",
    "user": "appb"
  }
}
```

**PATCH `/settings`**

```json
{
  "actor": "Admin",
  "theme": {
    "color-navy": "#123456",
    "font-sans": "'Inter', system-ui, sans-serif",
    "radius-md": "10px"
  }
}
```

Aturan: kunci harus termasuk daftar putih 19 kunci di atas; nilai `color-*` harus
warna hex `#rgb` atau `#rrggbb`; `font-sans` dan `radius-*` harus teks pendek
yang tidak kosong (maks. 128 karakter). Perubahan dicatat dengan aksi
`Ubah warna tema`. Responsnya adalah objek lengkap seperti `GET /settings`.

## Wilayah dan Master Data

| Method | Path | Keterangan |
|---|---|---|
| GET | `/wilayah` | Daftar provinsi → kabupaten → kecamatan → kelurahan (38/514/7.285/83.762 from `ken`) |
| GET | `/kategori` | Daftar kategori bencana |
| POST | `/kategori` | Tambah kategori |
| PATCH | `/kategori/{id}` | Ubah nama/aktif/deskripsi kategori |
| POST | `/kategori/{id}/delete` | Hapus kategori (ditolak `409` bila masih dipakai laporan) |

## Laporan

| Method | Path | Keterangan |
|---|---|---|
| GET | `/reports` | Daftar laporan. Query: `q`, `jenis`, `prov`, `kab`, `kec`, `kel`, `status`, `deviceId`, `limit` |
| GET | `/reports/{code}` | Detail satu laporan berdasarkan kode `APPB-2026-xxxxx` |
| POST | `/reports` | Kirim laporan baru (publik). Duplikat aktif jenis+kelurahan → `409` dengan kode laporan di pesan |
| POST | `/reports/{code}/susulan` | Tambah catatan susulan |
| POST | `/reports/{code}/catatan` | Catatan lapangan (log-only). Body: `{ detail, actor, actorRole }` |
| PATCH | `/reports/{code}/verifikasi` | Verifikasi/tolak satu atau banyak laporan. Kirim `codes: ["APPB-2026-..."]` untuk bulk; hanya `Tertunda`; alasan tolak min. 10 karakter |
| PATCH | `/reports/{code}/penanganan` | Ubah status penanganan; `Case Closed` hanya untuk admin (alur normal tetap `/tutup`) |
| PATCH | `/reports/{code}/korban` | Ubah jumlah korban. Body frontend: `{ korban: {...}, history: [...] }`; kompatibel juga dengan `{ field, value }` |
| PATCH | `/reports/{code}/admin` | Koreksi admin: data wilayah/deskripsi/pelapor/foto, `korban`, `verif`, `penanganan`. `actorRole` harus `admin` (`403` jika bukan) |
| POST | `/reports/{code}/tutup` | Tutup laporan dengan ringkasan min. 30 karakter (petugas aktif) |
| GET | `/reports/stats/ringkas` | Statistik untuk dashboard |
| POST | `/koreksi` | Koreksi admin laporan Case Closed (alasan min. 15 karakter) |

### Contoh body

**POST `/reports`**

```json
{
  "jenis": "Banjir",
  "prov": "DKI Jakarta",
  "kab": "Kota Jakarta Timur",
  "kec": "Jatinegara",
  "kel": "Kampung Melayu",
  "alamat": "Jl. Jatinegara Barat RT 05/RW 02",
  "deskripsi": "Air meluap sejak pukul 03.00.",
  "pelapor": "Siti Aminah",
  "hp": "0812-3456-7890",
  "foto": 2
}
```

**PATCH `/reports/{code}/verifikasi`**

```json
{ "verif": "Resmi", "actor": "Rina Wulandari", "actorRole": "petugas" }
```

```json
{
  "verif": "Resmi",
  "actor": "Rina Wulandari",
  "actorRole": "petugas",
  "codes": ["APPB-2026-00134", "APPB-2026-00135"]
}
```

```json
{ "verif": "Ditolak", "actor": "Rina Wulandari", "actorRole": "petugas", "rejectReason": "Lokasi tidak sesuai." }
```

**PATCH `/reports/{code}/korban`**

```json
{
  "korban": { "luka": 14, "hilang": 0, "meninggal": 0, "mengungsi": 1240 },
  "history": [
    { "field": "luka", "from": 6, "to": 14, "by": "Rina Wulandari", "at": "2026-11-20T04:12:00.000Z" }
  ],
  "actor": "Rina Wulandari",
  "actorRole": "petugas"
}
```

Bentuk lama `{ "field": "mengungsi", "value": 1240, "actor": "..." }` tetap diterima.

**PATCH `/reports/{code}/admin`**

```json
{
  "actor": "Hendra Siregar",
  "actorRole": "admin",
  "jenis": "Banjir",
  "kel": "Kampung Melayu",
  "deskripsi": "Air meluap sejak pukul 03.00, tinggi 150 cm.",
  "foto": 3,
  "korban": { "luka": 14, "hilang": 0, "meninggal": 0, "mengungsi": 1240 },
  "verif": "Resmi",
  "penanganan": "Sedang Ditangani"
}
```

Semua field opsional. `verif`: `Tertunda`/`Resmi`/`Ditolak`; `penanganan`: salah
satu nilai penanganan yang berlaku. Nilai `korban` harus bilangan bulat bukan
negatif. Perubahan korban menambah entri `korbanHistory`, perubahan `verif` atau
`penanganan` menambah entri `statusHistory`, dan aksi audit `Ubah data laporan`
mencatat daftar nama field yang berubah. Bila `jenis`/`kel` berubah pada
laporan yang masih aktif, aturan duplikat aktif tetap berlaku (`409`). Responsnya
adalah satu laporan ternormalisasi (sama seperti `GET /reports/{code}`).

## Pengumuman

| Method | Path | Keterangan |
|---|---|---|
| GET | `/announcements` | Daftar pengumuman. Query: `severity`, `jenis`, `prov`, `kab`, `kec`, `kel`, `q` |
| POST | `/announcements` | Terbitkan pengumuman baru |
| PATCH | `/announcements/{id}` | Ubah `title`, `body`, `severity`, `jenis`, `prov`, `kab`, `kec`, `kel`, `reportCode` (validasi sama seperti create) |
| DELETE | `/announcements/{id}` | Hapus pengumuman; mencatat aksi `Hapus pengumuman` |

## Pengguna dan Autentikasi Sederhana

> Hash bcrypt asli dari branch `ken` dipertahankan di kolom
> `password_original` (tabel `admin`/`petugas`/`relawan`). Kolom `password`
> berisi hash PBKDF2-SHA256 dari kata sandi demo `appb2026`, sehingga login
> tetap berfungsi. Kata sandi dapat diubah per akun lewat
> `PATCH /users/{id}/password`; hash tidak pernah dikembalikan endpoint mana
> pun. Akun nonaktif (mis. `u8`) ditolak dengan `403`.
> Pemetaan id: `admin.id_admin` → `a{id}`, `petugas.id_petugas` → `u{id}`,
> `relawan.id_relawan` → `u{6+id}`.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/users` | Daftar petugas/relawan/admin (tanpa `passwordHash`) |
| POST | `/users` | Tambah pengguna; `password` opsional (default `appb2026`) |
| PATCH | `/users/{id}` | Ubah nama/email/hp/instansi/wilayah/role/aktif; `password` opsional |
| DELETE | `/users/{id}` | Hapus pengguna |
| PATCH | `/users/{id}/aktif` | Aktifkan/nonaktifkan akun |
| PATCH | `/users/{id}/password` | Ganti kata sandi (minimal 6 karakter); mencatat log "Ubah kata sandi" |
| POST | `/auth/login` | Login dengan `email`, `username`, **atau** `id`/`userId` + `password`, mengembalikan user (`id`, `role`, `aktif`) |
| POST | `/auth/logout` | Logout (membersihkan sesi frontend) |

## Log, Bantuan, Historis, Import

| Method | Path | Keterangan |
|---|---|---|
| GET | `/logs` | Audit log. Query: `code`, `role`, `limit`. Baris log bersifat append-only: trigger PostgreSQL `trg_log_tolak_update` / `trg_log_tolak_delete` menolak UPDATE/DELETE pada tabel `log_penanganan` |
| GET | `/bantuan` | Daftar bantuan masuk |
| POST | `/bantuan` | Tambah bantuan |
| PATCH | `/bantuan/{id}` | Ubah `sumber`, `jenis`, `jumlah`, `satuan`, `kab`, `code` (validasi sama seperti create) |
| DELETE | `/bantuan/{id}` | Hapus bantuan; mencatat aksi `Hapus bantuan` |
| GET | `/historis` | Data historis bencana |
| POST | `/historis` | Tambah data historis |
| PATCH | `/historis/{id}` | Ubah `jenis`, `prov`, `kab`, `tanggal`, `meninggal`, `mengungsi`, `rumahRusak`, `sumber` (validasi sama seperti create) |
| DELETE | `/historis/{id}` | Hapus data historis; mencatat aksi `Hapus historis` |
| GET | `/imports` | Riwayat import data master |
| POST | `/imports` | Catat hasil import |

## Format error

```json
{
  "timestamp": "2026-11-20T07:15:30.123Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Kode laporan tidak ditemukan"
}
```
