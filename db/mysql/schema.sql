-- ============================================================
-- APPB — MySQL 8 schema
-- Charset utf8mb4, zona waktu aplikasi Asia/Jakarta
-- Jalankan manual: mysql -u root -p appb_db < schema.sql
-- Saat memakai Docker, database dibuat dari DB_NAME pada docker-compose.
-- ============================================================

-- Script idempoten: aman dijalankan ulang, data lama tidak dihapus.

-- ------------------------------------------------------------
-- Master wilayah: provinsi / kabupaten / kecamatan / kelurahan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wilayah (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prov VARCHAR(100) NOT NULL,
  kab VARCHAR(100) NOT NULL,
  kec VARCHAR(100) NOT NULL,
  kel VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_wilayah (prov, kab, kec, kel),
  KEY idx_wilayah_kab (prov, kab)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wilayah_posisi (
  kab VARCHAR(100) PRIMARY KEY,
  pos_x INT NOT NULL,
  pos_y INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Kategori bencana (dulu: src/data/store.ts → categories)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kategori (
  id VARCHAR(36) PRIMARY KEY,
  nama VARCHAR(80) NOT NULL UNIQUE,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  deskripsi TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Pengguna: petugas / relawan / admin
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  nama VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  hp VARCHAR(30),
  instansi VARCHAR(150),
  wilayah VARCHAR(100),
  role ENUM('petugas','relawan','admin') NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Laporan (dulu: Report di src/data/store.ts)
-- JSON: korban_history, susulan, status_history
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  device_id VARCHAR(64) NULL,
  jenis VARCHAR(80) NOT NULL,
  prov VARCHAR(100) NOT NULL,
  kab VARCHAR(100) NOT NULL,
  kec VARCHAR(100) NOT NULL,
  kel VARCHAR(100) NOT NULL,
  alamat TEXT,
  deskripsi TEXT,
  created_at DATETIME(3) NOT NULL,
  pelapor VARCHAR(120) NOT NULL,
  hp VARCHAR(30),
  verif ENUM('Tertunda','Resmi','Ditolak') NOT NULL DEFAULT 'Tertunda',
  penanganan VARCHAR(40) NULL,
  luka INT NOT NULL DEFAULT 0,
  hilang INT NOT NULL DEFAULT 0,
  meninggal INT NOT NULL DEFAULT 0,
  mengungsi INT NOT NULL DEFAULT 0,
  korban_history JSON NULL,
  susulan JSON NULL,
  status_history JSON NULL,
  foto INT NOT NULL DEFAULT 0,
  verified_by VARCHAR(120),
  verified_at DATETIME(3),
  reject_reason TEXT,
  closed_by VARCHAR(120),
  closed_at DATETIME(3),
  ringkasan TEXT,
  KEY idx_reports_wilayah (prov, kab, kec, kel),
  KEY idx_reports_status (verif, penanganan),
  KEY idx_reports_created (created_at DESC),
  KEY idx_reports_device (device_id),
  CONSTRAINT fk_reports_kategori FOREIGN KEY (jenis) REFERENCES kategori(nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Pengumuman (dulu: Announcement)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  severity ENUM('Peringatan','Imbauan','Evakuasi','Informasi') NOT NULL,
  jenis VARCHAR(80) NOT NULL,
  prov VARCHAR(100),
  kab VARCHAR(100),
  kec VARCHAR(100),
  kel VARCHAR(100),
  report_code VARCHAR(32),
  at DATETIME(3) NOT NULL,
  by_user VARCHAR(120) NOT NULL,
  KEY idx_ann_at (at DESC),
  KEY idx_ann_wilayah (prov, kab, kec, kel),
  CONSTRAINT fk_ann_report FOREIGN KEY (report_code) REFERENCES reports(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Audit log (dulu: LogEntry)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs (
  id VARCHAR(36) PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  actor VARCHAR(120) NOT NULL,
  role ENUM('warga','petugas','relawan','admin','sistem') NOT NULL,
  aksi VARCHAR(100) NOT NULL,
  code VARCHAR(32),
  detail TEXT,
  KEY idx_logs_at (at DESC),
  KEY idx_logs_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Bantuan (dulu: Bantuan)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bantuan (
  id VARCHAR(36) PRIMARY KEY,
  sumber VARCHAR(150) NOT NULL,
  jenis VARCHAR(100) NOT NULL,
  jumlah DECIMAL(12,2) NOT NULL,
  satuan VARCHAR(30) NOT NULL,
  kab VARCHAR(100) NOT NULL,
  code VARCHAR(32),
  at DATETIME(3) NOT NULL,
  by_user VARCHAR(120) NOT NULL,
  KEY idx_bantuan_at (at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Data historis bencana (dulu: Historis)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historis (
  id VARCHAR(36) PRIMARY KEY,
  jenis VARCHAR(80) NOT NULL,
  prov VARCHAR(100) NOT NULL,
  kab VARCHAR(100) NOT NULL,
  tanggal DATE NOT NULL,
  meninggal INT NOT NULL DEFAULT 0,
  mengungsi INT NOT NULL DEFAULT 0,
  rumah_rusak INT NOT NULL DEFAULT 0,
  sumber VARCHAR(150),
  KEY idx_historis_tanggal (tanggal DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Riwayat import data master (dulu: ImportRun)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  file VARCHAR(255) NOT NULL,
  jenis VARCHAR(50) NOT NULL,
  berhasil INT NOT NULL DEFAULT 0,
  gagal INT NOT NULL DEFAULT 0,
  by_user VARCHAR(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Penomoran kode laporan (dulu: db.nextCode)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sequences (
  name VARCHAR(50) PRIMARY KEY,
  value INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Konfigurasi web: nilai tema disimpan dengan awalan "theme."
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
