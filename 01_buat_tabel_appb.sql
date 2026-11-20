CREATE TABLE provinsi (
    id_provinsi CHAR(2) PRIMARY KEY,
    nama_provinsi VARCHAR(100) NOT NULL
);

CREATE TABLE kota (
    id_kota CHAR(5) PRIMARY KEY,
    id_provinsi CHAR(2) NOT NULL,
    nama_kota VARCHAR(100) NOT NULL,
    CONSTRAINT fk_kota_provinsi FOREIGN KEY (id_provinsi) REFERENCES provinsi (id_provinsi)
);

CREATE TABLE kecamatan (
    id_kecamatan CHAR(8) PRIMARY KEY,
    id_kota CHAR(5) NOT NULL,
    nama_kecamatan VARCHAR(100) NOT NULL,
    CONSTRAINT fk_kecamatan_kota FOREIGN KEY (id_kota) REFERENCES kota (id_kota)
);

CREATE TABLE kelurahan (
    id_kelurahan CHAR(13) PRIMARY KEY,
    id_kecamatan CHAR(8) NOT NULL,
    nama_kelurahan VARCHAR(100) NOT NULL,
    CONSTRAINT fk_kelurahan_kecamatan FOREIGN KEY (id_kecamatan) REFERENCES kecamatan (id_kecamatan)
);

CREATE TABLE admin (
    id_admin INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(150) NOT NULL,
    username VARCHAR(80) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL COMMENT 'Simpan hash kata sandi'
);

CREATE TABLE petugas (
    id_petugas INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_kelurahan CHAR(13) NOT NULL,
    nama VARCHAR(150) NOT NULL,
    username VARCHAR(80) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL COMMENT 'Simpan hash kata sandi',
    kontak VARCHAR(30),
    instansi VARCHAR(150) NOT NULL,
    status ENUM('Aktif', 'Nonaktif') NOT NULL DEFAULT 'Aktif',
    CONSTRAINT fk_petugas_kelurahan FOREIGN KEY (id_kelurahan) REFERENCES kelurahan (id_kelurahan)
);

CREATE TABLE relawan (
    id_relawan INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_kelurahan CHAR(13) NOT NULL,
    nama VARCHAR(150) NOT NULL,
    username VARCHAR(80) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL COMMENT 'Simpan hash kata sandi',
    kontak VARCHAR(30),
    instansi VARCHAR(150) NOT NULL,
    status ENUM('Aktif', 'Nonaktif') NOT NULL DEFAULT 'Aktif',
    CONSTRAINT fk_relawan_kelurahan FOREIGN KEY (id_kelurahan) REFERENCES kelurahan (id_kelurahan)
);

CREATE TABLE bencana (
    id_bencana INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nama_bencana VARCHAR(100) NOT NULL UNIQUE,
    deskripsi TEXT,
    status ENUM('Aktif', 'Nonaktif') NOT NULL DEFAULT 'Aktif'
);

CREATE TABLE laporan_bencana (
    id_laporan BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_kelurahan CHAR(13) NOT NULL,
    id_bencana INT UNSIGNED NOT NULL,
    id_petugas INT UNSIGNED NULL COMMENT 'Belum terisi saat laporan baru masuk',
    judul_laporan VARCHAR(180) NOT NULL,
    deskripsi TEXT NOT NULL,
    alamat VARCHAR(255) NOT NULL,
    status ENUM(
        'Tertunda', 'Resmi', 'Ditolak', 'Belum Ditangani',
        'Sedang Ditangani', 'Selesai Ditangani',
        'Tidak Memerlukan Tindak Lanjut', 'Case Closed'
    ) NOT NULL DEFAULT 'Tertunda',
    waktu_laporan DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    waktu_verifikasi DATETIME NULL,
    no_hp_pelapor VARCHAR(30) NULL,
    jumlah_korban INT UNSIGNED NOT NULL DEFAULT 0,
    jumlah_luka INT UNSIGNED NOT NULL DEFAULT 0,
    jumlah_hilang INT UNSIGNED NOT NULL DEFAULT 0,
    jumlah_meninggal INT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_laporan_kelurahan FOREIGN KEY (id_kelurahan) REFERENCES kelurahan (id_kelurahan),
    CONSTRAINT fk_laporan_bencana FOREIGN KEY (id_bencana) REFERENCES bencana (id_bencana),
    CONSTRAINT fk_laporan_petugas FOREIGN KEY (id_petugas) REFERENCES petugas (id_petugas),
    INDEX idx_laporan_wilayah_kategori_status (id_kelurahan, id_bencana, status),
    INDEX idx_laporan_status_waktu (status, waktu_laporan)
);

CREATE TABLE foto (
    id_foto BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_laporan BIGINT UNSIGNED NOT NULL,
    url_foto VARCHAR(2048) NOT NULL,
    CONSTRAINT fk_foto_laporan FOREIGN KEY (id_laporan) REFERENCES laporan_bencana (id_laporan)
);

CREATE TABLE pembaruan_laporan (
    id_pembaruan BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_laporan BIGINT UNSIGNED NOT NULL,
    deskripsi TEXT NOT NULL,
    waktu_pembaruan DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pembaruan_laporan FOREIGN KEY (id_laporan) REFERENCES laporan_bencana (id_laporan)
);

CREATE TABLE log_penanganan (
    id_log BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_laporan BIGINT UNSIGNED NOT NULL UNIQUE,
    aktor VARCHAR(150) NOT NULL,
    aksi VARCHAR(80) NOT NULL,
    detail TEXT NOT NULL,
    waktu_log DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_laporan FOREIGN KEY (id_laporan) REFERENCES laporan_bencana (id_laporan)
);

CREATE TABLE pengumuman (
    id_pengumuman BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_kelurahan CHAR(13) NULL,
    id_laporan BIGINT UNSIGNED NULL,
    id_petugas INT UNSIGNED NOT NULL,
    label VARCHAR(50) NOT NULL,
    judul VARCHAR(180) NOT NULL,
    deskripsi TEXT NOT NULL,
    waktu_diumumkan DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pengumuman_kelurahan FOREIGN KEY (id_kelurahan) REFERENCES kelurahan (id_kelurahan),
    CONSTRAINT fk_pengumuman_laporan FOREIGN KEY (id_laporan) REFERENCES laporan_bencana (id_laporan),
    CONSTRAINT fk_pengumuman_petugas FOREIGN KEY (id_petugas) REFERENCES petugas (id_petugas),
    CONSTRAINT ck_pengumuman_target CHECK (id_kelurahan IS NOT NULL OR id_laporan IS NOT NULL)
);

CREATE TABLE bantuan (
    id_bantuan BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_kelurahan CHAR(13) NULL,
    id_laporan BIGINT UNSIGNED NULL,
    sumber VARCHAR(150) NOT NULL,
    jenis_bantuan VARCHAR(150) NOT NULL,
    jumlah INT UNSIGNED NOT NULL,
    waktu_catat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bantuan_kelurahan FOREIGN KEY (id_kelurahan) REFERENCES kelurahan (id_kelurahan),
    CONSTRAINT fk_bantuan_laporan FOREIGN KEY (id_laporan) REFERENCES laporan_bencana (id_laporan),
    CONSTRAINT ck_bantuan_target CHECK (id_kelurahan IS NOT NULL OR id_laporan IS NOT NULL),
    CONSTRAINT ck_bantuan_jumlah CHECK (jumlah > 0)
);

CREATE TABLE data_historis (
    id_historis BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_kelurahan CHAR(13) NOT NULL,
    id_laporan BIGINT UNSIGNED NULL UNIQUE COMMENT 'Boleh kosong untuk catatan sebelum APPB digunakan',
    id_admin INT UNSIGNED NOT NULL,
    jumlah_korban INT UNSIGNED NOT NULL DEFAULT 0,
    sumber_data VARCHAR(180) NOT NULL,
    tanggal_kejadian DATE NOT NULL,
    CONSTRAINT fk_historis_kelurahan FOREIGN KEY (id_kelurahan) REFERENCES kelurahan (id_kelurahan),
    CONSTRAINT fk_historis_laporan FOREIGN KEY (id_laporan) REFERENCES laporan_bencana (id_laporan),
    CONSTRAINT fk_historis_admin FOREIGN KEY (id_admin) REFERENCES admin (id_admin)
);

-- Log bersifat append-only. Jalankan skrip 02 hanya untuk mereset basis data demo.
CREATE TRIGGER trg_log_tolak_update
BEFORE UPDATE ON log_penanganan FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Entri log tidak dapat diubah';

CREATE TRIGGER trg_log_tolak_delete
BEFORE DELETE ON log_penanganan FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Entri log tidak dapat dihapus';
