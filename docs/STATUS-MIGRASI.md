# Status Migrasi APPB

Dokumen ini merangkum hasil migrasi aplikasi APPB dari mockup React/TypeScript
menjadi HTML + JavaScript murni dengan backend **API Java Spring** dan PostgreSQL
**branch `ken`** sebagai sumber kebenaran. Mockup asli (`src/` di root proyek)
**sengaja tidak diubah**; seluruh hasil migrasi berada di folder `migrasi/`.

> Catatan pembaruan: penyebutan "API Python" di bagian bawah adalah catatan
> historis/arsip. Jalur aktif sekarang adalah `backend/` (Java 21, Spring Boot
> 3.3.5) dengan `tools/ken_compat.sql`; `tools/local_api.py` tidak dijalankan.

Keterangan status:

- **Siap** — sudah ditulis, tersambung ke API/DB, dan diverifikasi.
- **Dasar** — alur utama ada, sebagian masih mengikuti batas mockup.
- **Belum** — tidak direncanakan untuk produksi.

---

## 1. Cakupan yang sudah selesai

### Frontend

- HTML + ES modules + vanilla JS + CSS, **tanpa framework dan tanpa build step**.
- Tailwind CSS v4 **browser runtime** dan Lucide di-**vendor lokal** di
  `frontend/vendor/` → tidak ada CDN JS saat runtime.
- Tema/utility class asli dipertahankan di `frontend/index.html`
  (`@theme`, `@layer`, komponen `.inp`, `.card`, `.h1`, dan lain-lain).
- Fallback CSS kecil ada di `frontend/css/overrides.css`.
- Modul: `js/app.js` (tabel rute), `js/router.js` (router klien + guard peran +
  shell + pencarian global + polling 10 detik), `js/store.js` (cerminan DB dari
  `/api/snapshot`, sesi di `sessionStorage.appb-session`, device id di
  `localStorage.appb-device`), `js/api.js`, `js/ui.js`, `js/wilayah.js`, dan
  halaman di `js/pages/`.
- API base default `/api` same-origin (Nginx); override sekali lewat
  `?apiBase=...` atau `window.APPB_API_BASE`, tersimpan di
  `localStorage.appb-api-base`.

### Backend / database (jalur aktif)

- PostgreSQL 16 `appb_db`, diimpor dari dump branch `ken`
  (`~/Downloads/basisdata/`) oleh `tools/import_ken_sql.py`.
- `tools/ken_compat.sql` menyediakan view + trigger `INSTEAD OF` untuk tabel
  logis UI (`reports`, `users`, `kategori`, `announcements`, `logs`, `bantuan`,
  `historis`, `settings`, `imports`) di atas tabel asli `ken`:
  `laporan_bencana`, `admin`/`petugas`/`relawan`, `bencana`, `pengumuman`,
  `log_penanganan`, `bantuan_ken`, `data_historis`, `foto`,
  `pembaruan_laporan`, dan data wilayah.
- `backend/` (Java Spring) menyajikan REST API JSON; `JdbcTemplate` menulis
  lewat view/trigger tersebut pada setiap mutasi.
- Nginx lokal `nginx.local.conf` di port 8081 mem-proxy `/api/` ke API Java
  port 8080. pgAdmin 4 di port 8082 untuk panel database.
- `frontend/js/wilayah.js` dihasilkan oleh `tools/generate_wilayah.py` dari
  tabel `provinsi`/`kota`/`kecamatan`/`kelurahan` (bukan salinan 23 wilayah
  dummy). Posisi pin peta dihitung deterministik dari `id_kota`.
- Jalur Docker/MySQL dan API Python **dinonaktifkan**: seed
  `data.sql`/`seed.sql` dan `postgres_bootstrap.py` dihapus; `local_api.py`
  hanya arsip.

### Data branch `ken`

Dataset awal dump: 25 laporan, 14 user, 8 kategori, 4 pengumuman, 20 log,
6 bantuan, 5 historis. **Data live saat ini: 26 laporan, 14 user, 8 kategori,
4 pengumuman, 21 log, sequence `APPB-2026-00150` berikutnya**, plus 38 provinsi,
514 kota, 7.285 kecamatan, 83.762 kelurahan, 19 kunci pengaturan tema.

Kata sandi: hash bcrypt asli dipertahankan di `password_original`; kolom
`password` berisi hash PBKDF2-SHA256 dari `appb2026`. Login demo: `a1` /
`admin_demo`, `u1` / `petugas_medan_demo`, `u7` / `relawan_medan_demo`.
Akun `u8` nonaktif → `403`.

### Penyesuaian yang sudah dilaporkan/diterima

1. Tailwind v4 runtime dan Lucide di-vendor lokal (tanpa CDN JS saat runtime).
2. `css/overrides.css` sebagai pelengkap kecil tema di `index.html`.
3. Persistensi sesi memakai `sessionStorage.appb-session` (device id tetap di
   `localStorage.appb-device`).
4. Pencarian global kode laporan di shell aplikasi.
5. Polling snapshot tiap 10 detik + banner/offline indicator.
6. Endpoint `/api/reports/{code}/catatan` untuk catatan lapangan append-only.
7. Dokumentasi endpoint di `docs/API.md`.
8. API base frontend default ke `/api` (same-origin), override `?apiBase=...`.
9. Skrip SQL Docker tidak lagi memuat `CREATE DATABASE`/`USE appb_db;` hardcoded.
10. Halaman `/admin/konfigurasi` + tabel `app_settings` untuk warna tema,
    peran petugas/relawan/admin, dan data bencana lewat web.
11. Hosting lokal `nginx.local.conf` + API Java Spring di port 8080.
12. **Database diganti ke dump branch `ken`** lewat `import_ken_sql.py`;
    `tools/ken_compat.sql` menjembatani controller Java ke tabel `ken`;
    bcrypt dipertahankan di `password_original`, login memakai PBKDF2
    `appb2026`, dan `log_penanganan.id_laporan` sengaja tidak UNIQUE agar
    jejak audit append-only bisa memiliki banyak entri per laporan.
13. Tombol demo relawan di halaman masuk diubah `u8` → `u7` karena `u8`
    nonaktif di data `ken`.
14. API Java dipasang sebagai systemd service `appb-api.service`
    (`tools/appb-api.service`, `Restart=always`, `TZ=UTC`, `ExecStartPre`
    menjalankan `ken_compat.sql`) agar tidak mati diam-diam dan frontend
    tidak mendapat `502 Bad Gateway`.
15. **Semua data pra-migrasi dihapus**: 10 tabel legacy di PostgreSQL di-drop
    oleh `import_ken_sql.py`; `db/mysql/seed.sql`,
    `backend/src/main/resources/data.sql`, dan `tools/postgres_bootstrap.py`
    dihapus; Spring SQL init dimatikan. `wilayah.js` diganti dengan 83.762
    kelurahan dari `ken` (pilihan Anda: seluruh wilayah, bukan 11 terpakai).

---

## 2. Peta file

```text
migrasi/
├── README.md, .env.example, .gitignore
├── docker-compose.yml                 arsip jalur Docker (nonaktif; tanpa seed)
├── nginx.conf                         proxy /api/ + SPA fallback (Docker)
├── nginx.local.conf                   server lokal port 8081 + proxy /api
├── tools/
│   ├── import_ken_sql.py              dump ken MySQL → PostgreSQL (+ drop legacy)
│   ├── generate_wilayah.py            wilayah.js dari tabel ken
│   ├── ken_compat.sql                 view + trigger Java ↔ tabel ken (aktif)
│   ├── ken_store.py                   adapter Python (arsip)
│   ├── local_api.py                   REST API Python (arsip)
│   ├── appb-api.service               unit systemd Java (auto-restart)
│   └── start_local.sh                 start/stop/restart API Python (manual, arsip)
├── docs/
│   ├── API.md                         daftar endpoint REST
│   ├── CONFIGURASI.md                 konfigurasi lama vs target + teks file
│   ├── RINGKASAN-KONFIGURASI.txt      ringkasan singkat
│   └── STATUS-MIGRASI.md              file ini
├── db/mysql/                          schema.sql saja (seed dummy dihapus)
├── backend/                           backend Java Spring aktif (PostgreSQL)
└── frontend/
    ├── index.html                     theme Tailwind + vendor + APPB_API_BASE
    ├── css/overrides.css
    ├── vendor/                        tailwind-browser.js, lucide.js
    └── js/
        ├── app.js, config.js, router.js, store.js, api.js, ui.js, wilayah.js
        └── pages/                     public.js, petugas.js, admin.js,
                                       design.js, config.js
```

---

## 3. Peta rute (sumber: `frontend/js/app.js`)

| Rute | File halaman | Status |
|---|---|---|
| `/` | `pages/public.js` → `beranda` | Siap |
| `/lapor` | `pages/public.js` → `lapor` | Siap |
| `/lapor/sukses/:code` | `pages/public.js` → `laporSukses` | Siap |
| `/laporan`, `/laporan/:code`, `/laporan/:code/susulan` | `pages/public.js` | Siap |
| `/pengumuman` | `pages/public.js` → `pengumumanPublik` | Siap |
| `/masuk` | `pages/public.js` → `masuk` | Siap |
| `*` (404) | `pages/public.js` → `notFound` | Siap |
| `/_design` | `pages/design.js` → `design` | Siap (preview komponen) |
| `/petugas`, `/relawan` | `pages/petugas.js` → `dashboard` | Dasar |
| `/petugas/verifikasi` | `pages/petugas.js` → `verifikasi` | Dasar |
| `/petugas/penanganan`, `/petugas/penanganan/:code` | `pages/petugas.js` | Dasar |
| `/petugas/bantuan`, `/admin/bantuan` | `pages/admin.js` → `bantuan` | Dasar |
| `/petugas/laporan-publik`, `/relawan/laporan-publik` | `pages/petugas.js` | Dasar |
| `/petugas/pengumuman` | `pages/petugas.js` → `buatPengumuman` | Dasar |
| `/petugas/log`, `/relawan/log`, `/admin/log` | `pages/petugas.js` → `logPage` | Dasar |
| `/relawan/penanganan`, `/relawan/penanganan/:code` | `pages/petugas.js` | Dasar |
| `/admin` | `pages/admin.js` → `dashboard` | Dasar |
| `/admin/import` → `/admin/import/wilayah` | redirect di `app.js` | Siap |
| `/admin/import/wilayah` | `pages/admin.js` → `importWilayah` | Dasar |
| `/admin/petugas`, `/admin/relawan` | `pages/admin.js` → `kelolaAkun` | Dasar |
| `/admin/kategori`, `/admin/historis` | `pages/admin.js` | Dasar |
| `/admin/koreksi` | `pages/admin.js` → `koreksi` | Dasar |
| `/admin/konfigurasi` | `pages/config.js` → `konfigurasi` | Siap (warna, peran, kata sandi, data bencana) |

Guard halaman (`area: petugas|relawan|admin`) ada di `router.js`; user nonaktif
mendapat halaman 403.

---

## 4. Checklist perilaku & aturan bisnis

| Aturan / perilaku | Implementasi | Status |
|---|---|---|
| Cerminan data PostgreSQL via `GET /api/snapshot` | `store.js` + `ken_store.load()` | Siap |
| Sesi `sessionStorage.appb-session`, device id `localStorage.appb-device` | `store.js`, `api.js` | Siap |
| Duplikat laporan aktif (jenis + kel) menolak kiriman publik → `409` | `local_api.submit_report()` | Siap (diuji) |
| Alasan penolakan minimal 10 karakter | `local_api` verifikasi | Siap |
| Ringkasan penutupan minimal 30 karakter | `local_api` tutup | Siap |
| Hanya status tertentu yang boleh ditutup | `local_api` tutup | Siap |
| Relawan tidak boleh verifikasi/tolak, tutup, atau tandai TTPL | API + guard UI | Siap |
| `Case Closed` terkunci; hanya admin lewat `/api/koreksi` (alasan min. 15) | `local_api.koreksi()` | Siap |
| Log audit append-only untuk setiap aksi | trigger PostgreSQL + `LogService` | Siap (diuji) |
| Catatan lapangan hanya menulis log | `POST /reports/{code}/catatan` | Siap |
| Pencarian global kode laporan | `router.js` (`data-global-search`) | Siap |
| Refresh otomatis 10 detik + banner koneksi tidak stabil | `store.js`, `ui.js` | Siap |
| Validasi peran di semua endpoint | sebagian besar lewat `actor`/`actorRole` dari frontend | Dasar |
| Upload foto nyata | belum ada; hanya jumlah foto seperti mockup | Belum |
| Peta geospasial interaktif | belum ada; peta skematis SVG di `ui.js` | Belum |

---

## 5. Hasil verifikasi (sudah dijalankan)

1. `python3 -m py_compile tools/local_api.py tools/ken_store.py tools/import_ken_sql.py`
   → sukses; `python3 /tmp/opencode/js_static_check.py` → **PASS** untuk semua
   modul JS (`api.js`, `app.js`, `config.js`, halaman, `router.js`, `store.js`,
   `ui.js`, `wilayah.js`) termasuk pemeriksaan impor/ekspor.
2. `GET /api/health` → `OK`, `database: connected`, `mode: postgresql`.
3. Snapshot setelah import ken → 25 reports, 14 users, 8 categories,
   4 announcements, 20 logs, 6 bantuan, 5 historis; DB PostgreSQL menunjukkan
   83.762 kelurahan dan 25 baris `laporan_meta`.
4. Login: `a1` + `appb2026` → 200; `u7` → 200; `u8` (nonaktif) → 403;
   kata sandi salah → 401. Ganti password `u1` → 200, login lama 401/login
   baru 200, hash berubah di tabel `petugas`; kata sandi dikembalikan.
5. `PATCH /api/settings` tema → nilai berubah di `app_settings`
   (`theme.color-navy` diuji `#123456`, lalu dikembalikan ke `#1e3a8a`).
6. `POST /api/reports` dengan `jenis`, `kel`, `pelapor` → 201, id `r026`,
   baris muncul di `laporan_bencana` + `laporan_meta`; kiriman ulang → 409.
   Data uji kemudian dihapus, DB kembali ke 25 laporan/20 log.
7. Trigger append-only: `UPDATE log_penanganan` ditolak
   (`Entri log tidak dapat diubah`).
8. Firefox headless melalui geckodriver: seluruh rute publik/petugas/relawan/
   admin (termasuk `/admin/konfigurasi`) dirender; tidak ada error JS.
   Satu-satunya "Akses ditolak" adalah penolakan peran yang memang diharapkan.
9. Login UI (tombol demo **dan** form manual) untuk `u1`, `u7`, `a1`, dan
   username ken `petugas_medan_demo`/`relawan_medan_demo`/`admin_demo` →
   masing-masing masuk ke `/petugas`, `/relawan`, `/admin` tanpa popup error.
10. `appb-api.service` diuji dengan membunuh PID-nya: systemd otomatis
   menjalankan ulang dalam ~3 detik; health dan login kembali 200.

11. Penghapusan dummy: setelah `import_ken_sql.py` dijalankan ulang, hanya 18
    tabel `ken` yang ada (10 tabel legacy hilang); seed file dan bootstrap lama
    dihapus dari repo.
12. `frontend/js/wilayah.js` hasil generator: 38 provinsi/514 kabupaten/
    7.285 kecamatan/83.762 kelurahan; Firefox headless memuat halaman `/lapor`
    dalam ~365 ms, dropdown provinsi→kabupaten→kecamatan→kelurahan berisi data
    `ken`, tanpa error JS. Login `a1`/`u1`/`u7` dan `/admin/konfigurasi` tetap OK.

13. Switch ke Java: `mvn -B -DskipTests package` sukses; `appb-api.service`
    aktif menjalankan `java -jar ...appb-backend-1.0.0.jar` di port 8080.
    Baseline 12 endpoint (health, settings, config/db, kategori, users,
    reports, logs, bantuan, historis, imports, announcements, snapshot)
    dibandingkan; sisa perbedaan hanya field baseline lama untuk laporan live
    `00149`, `announcements.by`, dan `log.id` dari data `ken`.
14. Uji aturan bisnis di klon `appb_test`: **19/19 PASS** — login `a1`/`u1`/`u7`
    dengan `appb2026`, duplikat aktif `409` + bentuk error
    `{timestamp,status,error,message}`, alasan tolak `<10` → `400`, ringkasan
    `<30` → `400`, relawan dilarang verifikasi/tutup → `403`, `Case Closed`
    hanya admin, `PATCH /reports/{code}/admin` admin-only, ganti password per
    user, create + `DELETE /api/kategori/{id}`.
15. DB produksi setelah switch tetap **26 reports, 14 users, 21 logs, 4
    announcements, sequence `149`**; frontend `8081`, proxy `/api`, dan
    pgAdmin `8082` merespons normal. Trigger append-only log menolak
    UPDATE/DELETE pada klon.

16. Perbaikan CORS: karena origin frontend bisa berbeda (port, IP LAN, atau
    preview), `app.cors.allowed-origins` dan unit systemd memakai `*`.
    Spring meng-echo origin pada `Access-Control-Allow-Origin` dan preflight
    `max-age=0` agar tidak ada cache lama. Login `a1`, `u1`, `u7` lewat proxy
    `/api` dengan berbagai `Origin` → `200`; preflight `OPTIONS` → `200`.

Jalur Docker/MySQL dan API Python tidak diverifikasi lagi karena sudah
dinonaktifkan; keduanya tersimpan sebagai arsip.

---

## 6. Keterbatasan dan catatan jujur

- Autentikasi memakai hash PBKDF2 per akun di tabel `ken`, tetapi **belum**
  memakai Spring Security/session server/JWT. Peran (`actorRole`) masih dikirim
  frontend dan dipercaya API; harus diganti sebelum produksi.
- Foto hanya berupa jumlah (mengikuti mockup), bukan unggahan berkas. Data
  `foto` dari ken tetap tersimpan dan dihitung, tapi tidak ditampilkan satu per
  satu.
- Peta bersifat skematis (SVG), bukan peta interaktif.
- Mode offline hanya menyimpan snapshot terakhir + indikator; tidak ada antrean
  tulis saat server mati.
- `docker-compose.yml` + `backend/` memakai MySQL dan skema lama, bukan dump
  `ken`; keduanya sengaja dipertahankan sebagai jalur opsional pembanding.
- Push repo: `git@github.com:FahriAkbarPutra/APPB-Private.git` memakai SSH;
  akses HTTPS/API ke repo private mengembalikan 404 di lingkungan ini.
