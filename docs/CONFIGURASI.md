# Catatan Konfigurasi — Website APPB

Dokumen ini berisi konfigurasi proyek lama (pembanding), konfigurasi target
hasil migrasi, teks file konfigurasi yang **benar-benar ada** di `migrasi/`,
serta cara menjalankan dan verifikasinya.

> **Update jalur aktif:** backend yang berjalan adalah **Java Spring Boot 3.3.5
> (JDK 21)** di port `8080`, bukan API Python. `tools/ken_compat.sql`
> menyediakan tabel logis di atas skema `ken`. Bagian yang masih menyebut
> "API Python" di bawah adalah catatan arsip/konfigurasi lama; jangan dipakai
> untuk menjalankan aplikasi.

---

## 1. Konfigurasi proyek lama (React + Vite + Figma Make) — tidak diubah

Lokasi: `/home/ubuntu/Downloads/Telegram Desktop/High-Fidelity Website Mockup`

| Item | Nilai |
|---|---|
| Nama paket | `figma-make-app` `1.0.0`, tipe modul `module` |
| Runtime | React 19, React DOM 19 |
| Router | `react-router` 8.4 (`createBrowserRouter`) |
| UI | Tailwind CSS v4 via `@tailwindcss/vite`; ikon `lucide-react` 1.49 |
| Build | Vite 8, TypeScript 5.7, `@vitejs/plugin-react` 6; format `oxfmt` 0.2 |
| Toolchain | Node 22, pnpm 10.34.3 (`.mise.toml`) |
| Dev server | `$PORT` atau `8443`, host `0.0.0.0`, `strictPort: true` |
| Alias import | `@` → `./src` |
| Base URL | `FIGMA_PUBLIC_URL` bila ada, jika tidak `/` |
| Judul/bahasa | `appb` (`.figma/make/site.json`), HTML `lang="id"` |
| Robots | `noindex, nofollow` |
| Font | Inter (Google Fonts) |
| Zona waktu | `Asia/Jakarta`, suffix `WIB` |
| Penyimpanan | `localStorage.appb-reports`, `localStorage.appb-device`, `sessionStorage.appb-session` |

Script lama: `dev` → `vite`, `build` → `vite build`, `preview` →
`vite preview`, `format` → `oxfmt`.

Variabel lingkungan lama: `PORT` (default `8443`),
`FIGMA_DEV_SERVER_HOST` (`0.0.0.0`), `FIGMA_PUBLIC_URL` (kosong).

Aturan kode lama (`AGENTS.md`): kutip ganda untuk string mengandung apostrof,
tag JSX tertutup/braces seimbang, komponen sebagai default export, `@import`
CSS di baris paling atas, dan bug pengumuman diperbaiki dengan menghapus blok
`all.filter(...)` di `PengumumanPublik` (bukan menyentuh `LaporanPublik`).

---

## 2. Konfigurasi target (HTML/JS + API Java Spring + PostgreSQL branch `ken`)

### 2.1 Perbandingan ringkas

| Aspek | Lama | Target aktif |
|---|---|---|
| Frontend | React 19 + TS + Vite | HTML + ES modules + vanilla JS + CSS, tanpa build |
| Styling | Tailwind v4 via plugin Vite | Tailwind v4 browser runtime + Lucide, **di-vendor lokal** |
| Data | `localStorage` + `store.ts` | PostgreSQL 16 `appb_db` dari dump branch `ken` (seed dummy dihapus) |
| Backend | tidak ada | API Java Spring Boot `backend/` + `tools/ken_compat.sql` |
| Port | 8443 | 8081 (Nginx), 8080 (API), 8082 (pgAdmin), 5432 (PostgreSQL) |
| Runtime JS | Node/pnpm dibutuhkan | tidak dibutuhkan untuk menjalankan frontend |

### 2.2 Versi yang dipakai

| Komponen | Versi | Catatan |
|---|---|---|
| JDK | 21 | sesuai `pom.xml` (`java.version=21`) |
| Spring Boot | 3.3.5 | parent POM |
| Spring Web / JDBC | dari starter | `JdbcTemplate`, tanpa ORM |
| PostgreSQL Driver | dikelola Spring Boot | scope `runtime`, menggantikan MySQL Connector/J |
| PostgreSQL Server | 16 lokal | db `appb_db`, user `appb` |
| Maven | 3.8.7+ | build jar `backend/target/appb-backend-1.0.0.jar` |
| Nginx | 1.25-alpine | image `nginx:1.25-alpine` |

### 2.3 Port dan URL

Aktif (lokal):

| Layanan | Port | URL lokal |
|---|---|---|
| Frontend (Nginx `nginx.local.conf`) | 8081 | `http://localhost:8081/` |
| API Java Spring | 8080 | `http://127.0.0.1:8080/api/...` |
| PostgreSQL | 5432 | `dbname=appb_db user=appb` (via `DB_*` / `application.properties`) |
| pgAdmin 4 | 8082 | `http://localhost:8082/pgadmin4/` (`admin@appb.com` / `appb2026`) |
| Health check | 8081/8080 | `http://localhost:8081/api/health` |

Jalur Docker/MySQL **dinonaktifkan** (seed `data.sql`/`seed.sql` dihapus; tabel only):

| Layanan | Port | URL lokal |
|---|---|---|
| Frontend (Nginx) | 80 | `http://localhost/` |
| Backend (Spring Boot) | 8080 | `http://localhost:8080/api/...` |
| MySQL | 3306 | `jdbc:mysql://localhost:3306/appb_db` |
| Health check | 8080 | `http://localhost:8080/api/health` |

### 2.4 Variabel lingkungan (arsip jalur Docker; tidak dipakai jalur aktif)

| Nama | Default `.env.example` | Dipakai di / keterangan |
|---|---|---|
| `DB_HOST` | `localhost` | `application.properties` (Di Compose di-set ke `mysql`) |
| `DB_PORT` | `3306` | `application.properties`, pemetaan port MySQL |
| `DB_NAME` | `appb_db` | nama database; skrip SQL sudah bebas `USE appb_db;`, sehingga variabel ini efektif |
| `DB_USER` | `appb` | user database |
| `DB_PASSWORD` | `appb_pass` | password user database |
| `MYSQL_ROOT_PASSWORD` | `root_pass` | password root container MySQL |
| `SERVER_PORT` | `8080` | port backend |
| `CORS_ORIGINS` | `*` | `app.cors.allowed-origins`; hosting lokal memakai pattern `*` (origin di-echo kembali), preflight tidak di-cache |
| `TZ` | `UTC` | wajib UTC agar timestamp mengikuti baseline API |
| `API_BASE_URL` | — | variabel dihapus dari `.env.example`; API base frontend memakai `/api` atau `?apiBase=...` (lihat §4) |

Nilai default aktif di `application.properties`: `DB_HOST=127.0.0.1`,
`DB_PORT=5432`, `DB_NAME=appb_db`, `DB_USER=appb`, `DB_PASSWORD=appb_pass`,
`SERVER_PORT=8080`. Service systemd juga menetapkan `TZ=UTC` dan
`-Duser.timezone=UTC`.

---

## 3. Teks file konfigurasi (isi aktual)

### 3.1 `backend/src/main/resources/application.properties`

```properties
# ---- Server ----
server.port=${SERVER_PORT:8080}
server.servlet.context-path=/
server.error.include-message=always

# ---- Database (branch ken, PostgreSQL) ----
spring.datasource.url=jdbc:postgresql://${DB_HOST:127.0.0.1}:${DB_PORT:5432}/${DB_NAME:appb_db}
spring.datasource.username=${DB_USER:appb}
spring.datasource.password=${DB_PASSWORD:appb_pass}
spring.datasource.driver-class-name=org.postgresql.Driver
spring.datasource.hikari.maximum-pool-size=10
spring.datasource.hikari.minimum-idle=2
spring.datasource.hikari.connection-timeout=30000

# ---- SQL init ----
# Layer kompatibilitas dipasang oleh tools/ken_compat.sql (idempoten).
spring.sql.init.mode=never

# ---- Jackson ----
# Timestamp dump ken dan baseline API memakai UTC, 3 digit milidetik.
spring.jackson.time-zone=UTC
spring.jackson.serialization.write-dates-as-timestamps=false
spring.jackson.default-property-inclusion=always

# ---- CORS ----
app.cors.allowed-origins=${CORS_ORIGINS:*}

# ---- Logging ----
logging.level.root=INFO
logging.level.com.bpbd.appb=DEBUG
logging.pattern.console=%d{yyyy-MM-dd HH:mm:ss} %-5level [%thread] %logger{36} - %msg%n

spring.application.name=appb-backend
```

Inisialisasi SQL Java dimatikan (`spring.sql.init.mode=never`) karena
`data.sql` dan `db/mysql/seed.sql` sudah dihapus. File `schema.sql` yang tersisa
hanya arsip struktur tanpa data. Jalur aktif memakai `tools/import_ken_sql.py`
untuk mengimpor dump `ken` dan `tools/ken_compat.sql` untuk view/trigger yang
dipakai controller Java. `tools/ken_store.py` hanya arsip (lihat §5 Opsi D).

### 3.2 `.env.example`

```dotenv
# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=appb_db
DB_USER=appb
DB_PASSWORD=appb_pass
MYSQL_ROOT_PASSWORD=root_pass

# Backend
SERVER_PORT=8080
CORS_ORIGINS=*
TZ=Asia/Jakarta

# Frontend
# API frontend default ke /api melalui Nginx. Untuk frontend statis tanpa proxy,
# buka sekali: http://localhost:8081/?apiBase=http://localhost:8080/api
# (tersimpan di localStorage.appb-api-base). Tidak perlu variabel .env.
```

### 3.3 `docker-compose.yml`

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: appb-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root_pass}
      MYSQL_DATABASE: ${DB_NAME:-appb_db}
      MYSQL_USER: ${DB_USER:-appb}
      MYSQL_PASSWORD: ${DB_PASSWORD:-appb_pass}
      TZ: ${TZ:-Asia/Jakarta}
    ports:
      - "${DB_PORT:-3306}:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./db/mysql:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-p${MYSQL_ROOT_PASSWORD:-root_pass}"]
      interval: 10s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    container_name: appb-backend
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      DB_HOST: mysql
      DB_PORT: 3306
      DB_NAME: ${DB_NAME:-appb_db}
      DB_USER: ${DB_USER:-appb}
      DB_PASSWORD: ${DB_PASSWORD:-appb_pass}
      SERVER_PORT: 8080
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost}
      TZ: ${TZ:-Asia/Jakarta}
    ports:
      - "8080:8080"

  frontend:
    image: nginx:1.25-alpine
    container_name: appb-frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "80:80"
    volumes:
      - ./frontend:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro

volumes:
  mysql-data:
```

Catatan (arsip): konfigurasi Docker di bawah tidak lagi menjalankan seed.
`db/mysql/` kini hanya berisi `schema.sql`; backend memakai
`spring.sql.init.mode=never`. Jangan pakai jalur ini untuk data—satu-satunya
sumber adalah dump `ken` (§5 Opsi D).

### 3.4 `nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    charset utf-8;

    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        try_files $uri =404;
    }
}
```

### 3.5 `backend/Dockerfile`

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/appb-backend-1.0.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

### 3.6 `frontend/js/config.js`

```javascript
export const CONFIG = {
  apiBase: window.APPB_API_BASE || '/api',
  timezone: 'Asia/Jakarta',
  pageSize: 20,
  toastDuration: 4000,
  deviceKey: 'appb-device',
  sessionKey: 'appb-session',
};
```

---

## 4. API base frontend (dua pilihan)

Nilai bawaan: `/api` (same-origin). Prioritas pembacaan di `frontend/index.html`:
`window.APPB_API_BASE` → query `?apiBase=...` → `localStorage.appb-api-base` →
`/api`. Nilai terpilih dipakai `js/config.js` melalui `window.APPB_API_BASE`.

1. **Lewat Nginx** (default, disarankan saat memakai Compose): buka
   `http://localhost/`. Proxy `/api/` di `nginx.conf` meneruskan ke backend.
2. **Akses backend langsung** (frontend statis tanpa proxy): buka sekali
   `http://localhost:8081/?apiBase=http://localhost:8080/api`. Nilai tersebut
   disimpan di `localStorage.appb-api-base`, sehingga tidak perlu diulang pada
   kunjungan berikutnya.

Variabel `API_BASE_URL` sudah dihapus dari `.env.example` karena tidak
dikonsumsi Docker/Nginx maupun kode frontend. Untuk mengganti API base, pakai
query `?apiBase=...` sekali atau set `window.APPB_API_BASE` sebelum `app.js`.

---

## 5. Cara menjalankan

### Opsi A/B — Docker Compose / Java + MySQL (dinonaktifkan)

Kedua jalur ini **tidak lagi bisa dipakai untuk data**: `db/mysql/seed.sql`,
`backend/src/main/resources/data.sql`, dan `tools/postgres_bootstrap.py`
sudah dihapus, Spring SQL init dimatikan. Berkas `docker-compose.yml` dan
`schema.sql` tersisa sebagai arsip struktur. Backend Java sudah dialihkan ke
PostgreSQL dan merupakan jalur aktif; gunakan Opsi D.

### Opsi C — Mockup lama (pembanding, tidak diubah)

```bash
cd ".../High-Fidelity Website Mockup"
mise install && pnpm install && pnpm dev   # port 8443
```

### Opsi D — Hosting lokal dengan Nginx + API Java Spring + PostgreSQL

Ini dipakai untuk menjalankan hasil migrasi sekarang juga. Backend Spring Boot
berjalan di port `8080`; **PostgreSQL `appb_db` adalah sumber kebenaran**,
sedangkan `.local/db.json` hanya cache yang bisa dibaca manusia.
Data awal berasal dari dump SQL branch `ken` di `~/Downloads/basisdata/`
(identik dengan `basis data/` di `origin/ken`), diimpor oleh
`tools/import_ken_sql.py`. `tools/ken_compat.sql` menyediakan view + trigger
`INSTEAD OF` bernama `users`, `reports`, `kategori`, `logs`, dll. di atas tabel
asli `ken`. `tools/ken_store.py` / `tools/local_api.py` adalah arsip.

```bash
cd migrasi
# Hanya saat menyiapkan DB baru: python3 tools/import_ken_sql.py
python3 tools/generate_wilayah.py          # wilayah.js dari tabel ken (83.762 kelurahan)
psql -h 127.0.0.1 -U appb -d appb_db -v ON_ERROR_STOP=1 -f tools/ken_compat.sql
cd backend && mvn -q -B -DskipTests package
cd ..
sudo ln -sfn "$PWD" /opt/appb-migrasi
sudo cp tools/appb-api.service /etc/systemd/system/appb-api.service
sudo systemctl daemon-reload && sudo systemctl enable --now appb-api.service
sudo ln -sfn "$PWD/nginx.local.conf" /etc/nginx/conf.d/appb-local.conf
sudo nginx -t && sudo systemctl reload nginx
```

- Frontend: `http://localhost:8081/`; konfigurasi: `/admin/konfigurasi`
- API: `http://localhost:8081/api/health` → `"mode": "postgresql"`
- pgAdmin: `http://localhost:8082/pgadmin4/` (`admin@appb.com` / `appb2026`),
  server `APPB PostgreSQL` memakai `appb` / `appb_pass` ke `appb_db`.
- Login: admin `a1` / `admin_demo`, petugas `u1` / `petugas_medan_demo`,
  relawan `u7` / `relawan_medan_demo`; kata sandi `appb2026`. Akun `u8`
  nonaktif dan ditolak (`403`).
- Password per akun: hash bcrypt asal disimpan di `password_original`, kolom
  `password` pada tabel `admin`/`petugas`/`relawan` berisi PBKDF2-SHA256;
  diubah lewat `PATCH /api/users/{id}/password` atau kolom "Kata sandi baru"
  di panel admin.
- **Jangan menjalankan ulang import pada DB live:** `import_ken_sql.py` akan
  mereset ke 25 laporan dan menghapus laporan baru (`APPB-2026-00149`).
  Untuk memulihkan, pakai dump `/tmp/opencode/appb_db_before_java_compat.dump`.
- Ganti koneksi lewat variabel `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
  `DB_PASSWORD` pada `tools/appb-api.service` (bukan `APPB_DB_DSN`).

Penyesuaian skema terhadap dump `ken`: hash bcrypt dipertahankan di
`password_original`; `log_penanganan.id_laporan` sengaja tidak UNIQUE agar
jejak audit append-only bisa memiliki beberapa entri per laporan (dijaga
trigger `trg_log_tolak_update`/`trg_log_tolak_delete`); ditambah tabel
`laporan_meta`, `app_settings`, dan `imports` untuk state UI yang tidak ada
di skema asli.

`nginx.local.conf` tidak menggantikan `nginx.conf` untuk Docker; file tersebut
hanya server tambahan pada port 8081.

#### Auto-start API dengan systemd (disarankan)

`bash tools/start_local.sh --start` menjalankan API sebagai proses latar biasa.
Bila proses tersebut mati (misalnya saat sesi shell dibersihkan), Nginx akan
mengembalikan **502 Bad Gateway** pada `/api/*` dan frontend menampilkan popup
"Tidak dapat terhubung ke server". Pasang service systemd agar API selalu
hidup dan otomatis restart:

```bash
cd migrasi
sudo ln -sfn "$PWD" /opt/appb-migrasi      # path tanpa spasi untuk systemd
sudo cp tools/appb-api.service /etc/systemd/system/appb-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now appb-api.service
systemctl status appb-api.service
```

Unit memakai `Restart=always`, `User=ubuntu`, DSN lengkap di `Environment`, dan
log di `/tmp/opencode/appb-api-systemd.log`. Hentikan service ini sebelum
memakai `tools/start_local.sh --start` secara manual agar tidak berebut port
8080. Diagnosis cepat: `systemctl status appb-api.service`,
`curl http://127.0.0.1:8080/api/health`, dan
`sudo tail -20 /var/log/nginx/error.log`.

---

## 6. Verifikasi

### Sudah dijalankan (jalur aktif Python + PostgreSQL + Nginx)

1. `python3 -m py_compile tools/local_api.py tools/ken_store.py tools/import_ken_sql.py`
   → sukses; pengecekan statis impor/ekspor seluruh modul JS → **PASS**.
2. Import `ken`: 25 laporan, 14 user, 8 bencana, 4 pengumuman, 20 log,
   6 bantuan, 5 historis, 83.762 kelurahan, 19 pengaturan tema.
3. `curl http://localhost:8081/api/health` → `OK`, `mode: postgresql`;
   `/api/snapshot` memuat semua koleksi.
4. Login `a1` + `appb2026` → 200; `u7` → 200; `u8` nonaktif → 403;
   password salah → 401. Ganti password persisten di tabel `petugas`.
5. `PATCH /api/settings` persisten di `app_settings`; warna uji dikembalikan
   ke `#1e3a8a`.
6. `POST /api/reports` → 201 dan baris masuk ke `laporan_bencana` +
   `laporan_meta`; kiriman duplikat → 409. Data uji dihapus.
7. Trigger append-only menolak UPDATE/DELETE pada `log_penanganan`.
8. Firefox headless: seluruh rute (termasuk `/admin/konfigurasi`) bebas error
   JS; penolakan hanya untuk peran yang memang tidak diizinkan.
9. Seed dummy dihapus: 10 tabel legacy tidak ada lagi; `wilayah.js` berisi
   38 provinsi/514 kabupaten/7.285 kecamatan/83.762 kelurahan dari `ken`,
   dropdown bertingkat berfungsi tanpa error JS.

### Jalur Docker/Java/MySQL tidak lagi dijalankan

Seed untuk jalur tersebut sudah dihapus, jadi build/package Docker tidak
lagi relevan. Semua verifikasi di atas dilakukan pada jalur aktif
(Nginx + API Python + PostgreSQL `ken`).
