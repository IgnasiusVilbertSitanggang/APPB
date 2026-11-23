-- ============================================================================
-- Ken compatibility layer
-- ----------------------------------------------------------------------------
-- Menyediakan "tabel logis" (users, reports, kategori, ...) di atas schema
-- branch `ken` supaya backend Java Spring bisa memakai SQL yang sama dengan
-- mockup. Semua objek bersifat additif: tabel asli dan	data live tidak diubah
-- secara destruktif. File ini aman dijalankan berulang kali.
-- ============================================================================

\set ON_ERROR_STOP on

-- `bantuan` dipakai sebagai nama view logis, jadi tabel aslinya diganti nama.
-- Rename tidak mengubah baris/KTP dan aman dijalankan ulang.
DO $do$ BEGIN
  IF to_regclass('public.bantuan') IS NOT NULL
     AND to_regclass('public.bantuan_ken') IS NULL THEN
    ALTER TABLE bantuan RENAME TO bantuan_ken;
  END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- 1. Kolom tambahan (id logis & atribut UI yang tidak ada di dump ken)
-- ---------------------------------------------------------------------------
ALTER TABLE admin           ADD COLUMN IF NOT EXISTS id_logis text;
ALTER TABLE petugas         ADD COLUMN IF NOT EXISTS id_logis text;
ALTER TABLE relawan         ADD COLUMN IF NOT EXISTS id_logis text;
ALTER TABLE log_penanganan  ADD COLUMN IF NOT EXISTS id_logis text;
ALTER TABLE log_penanganan  ADD COLUMN IF NOT EXISTS role_logis text NOT NULL DEFAULT 'sistem';
ALTER TABLE pengumuman      ADD COLUMN IF NOT EXISTS id_logis text;
ALTER TABLE pengumuman      ADD COLUMN IF NOT EXISTS jenis text;
ALTER TABLE pengumuman      ADD COLUMN IF NOT EXISTS prov text;
ALTER TABLE pengumuman      ADD COLUMN IF NOT EXISTS kab text;
ALTER TABLE pengumuman      ADD COLUMN IF NOT EXISTS kec text;
ALTER TABLE pengumuman      ADD COLUMN IF NOT EXISTS kel text;
ALTER TABLE pengumuman      ADD COLUMN IF NOT EXISTS report_code text;
ALTER TABLE pengumuman      ADD COLUMN IF NOT EXISTS by_user text;
ALTER TABLE bantuan_ken     ADD COLUMN IF NOT EXISTS id_logis text;
ALTER TABLE bantuan_ken     ADD COLUMN IF NOT EXISTS satuan text;
ALTER TABLE bantuan_ken     ADD COLUMN IF NOT EXISTS kab text;
ALTER TABLE bantuan_ken     ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE bantuan_ken     ADD COLUMN IF NOT EXISTS by_user text;
ALTER TABLE data_historis   ADD COLUMN IF NOT EXISTS id_logis text;
ALTER TABLE data_historis   ADD COLUMN IF NOT EXISTS jenis text;
ALTER TABLE data_historis   ADD COLUMN IF NOT EXISTS prov text;
ALTER TABLE data_historis   ADD COLUMN IF NOT EXISTS kab text;
ALTER TABLE data_historis   ADD COLUMN IF NOT EXISTS meninggal integer NOT NULL DEFAULT 0;
ALTER TABLE data_historis   ADD COLUMN IF NOT EXISTS mengungsi integer NOT NULL DEFAULT 0;
ALTER TABLE data_historis   ADD COLUMN IF NOT EXISTS rumah_rusak integer NOT NULL DEFAULT 0;
ALTER TABLE laporan_meta    ADD COLUMN IF NOT EXISTS susulan jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE laporan_meta    ADD COLUMN IF NOT EXISTS foto integer NOT NULL DEFAULT 0;
ALTER TABLE laporan_meta    ADD COLUMN IF NOT EXISTS pelapor text;
ALTER TABLE laporan_meta    ADD COLUMN IF NOT EXISTS verified_at text;

-- ---------------------------------------------------------------------------
-- 2. Inisialisasi nilai logis untuk baris yang sudah ada (tanpa overwrite)
-- ---------------------------------------------------------------------------
UPDATE admin   SET id_logis = 'a' || id_admin::text          WHERE id_logis IS NULL;
UPDATE petugas SET id_logis = 'u' || id_petugas::text        WHERE id_logis IS NULL;
UPDATE relawan SET id_logis = 'u' || (6 + id_relawan)::text  WHERE id_logis IS NULL;
-- log_penanganan bersifat append-only (trigger), jadi id dan peran baris lama
-- tidak diubah; view logs yang menghitung keduanya.
UPDATE pengumuman SET id_logis = 'n' || id_pengumuman::text WHERE id_logis IS NULL;
UPDATE bantuan_ken SET id_logis = 'b' || id_bantuan::text    WHERE id_logis IS NULL;
UPDATE data_historis SET id_logis = 'h' || id_historis::text WHERE id_logis IS NULL;

UPDATE pengumuman p SET
    jenis = COALESCE(p.jenis, 'Informasi'),
    prov = COALESCE(p.prov, (SELECT p2.nama_provinsi FROM provinsi p2
        JOIN kota kt ON kt.id_provinsi = p2.id_provinsi
        JOIN kecamatan kc ON kc.id_kota = kt.id_kota
        JOIN kelurahan k ON k.id_kecamatan = kc.id_kecamatan
        WHERE k.id_kelurahan = p.id_kelurahan LIMIT 1), ''),
    kab = COALESCE(p.kab, (SELECT kt.nama_kota FROM kota kt
        JOIN kecamatan kc ON kc.id_kota = kt.id_kota
        JOIN kelurahan k ON k.id_kecamatan = kc.id_kecamatan
        WHERE k.id_kelurahan = p.id_kelurahan LIMIT 1), ''),
    kec = COALESCE(p.kec, (SELECT kc.nama_kecamatan FROM kecamatan kc
        JOIN kelurahan k ON k.id_kecamatan = kc.id_kecamatan
        WHERE k.id_kelurahan = p.id_kelurahan LIMIT 1), ''),
    kel = COALESCE(p.kel, (SELECT k.nama_kelurahan FROM kelurahan k
        WHERE k.id_kelurahan = p.id_kelurahan LIMIT 1), ''),
    report_code = COALESCE(p.report_code, (SELECT m.code FROM laporan_meta m
        WHERE m.id_laporan = p.id_laporan)),
    by_user = COALESCE(p.by_user, (SELECT pt.username FROM petugas pt
        WHERE pt.id_petugas = p.id_petugas), 'Sistem')
  WHERE p.jenis IS NULL OR p.prov IS NULL OR p.kab IS NULL OR p.kec IS NULL
     OR p.kel IS NULL OR p.report_code IS NULL OR p.by_user IS NULL;

UPDATE bantuan_ken b SET
    satuan = COALESCE(b.satuan, 'paket'),
    kab = COALESCE(b.kab, (SELECT kt.nama_kota FROM kota kt
        JOIN kecamatan kc ON kc.id_kota = kt.id_kota
        JOIN kelurahan k ON k.id_kecamatan = kc.id_kecamatan
        WHERE k.id_kelurahan = b.id_kelurahan LIMIT 1), ''),
    code = COALESCE(b.code, (SELECT m.code FROM laporan_meta m
        WHERE m.id_laporan = b.id_laporan)),
    by_user = COALESCE(b.by_user, 'Sistem')
  WHERE b.satuan IS NULL OR b.kab IS NULL OR b.code IS NULL OR b.by_user IS NULL;

UPDATE data_historis h SET
    jenis = COALESCE(h.jenis, 'Historis'),
    prov = COALESCE(h.prov, (SELECT p.nama_provinsi FROM provinsi p
        JOIN kota kt ON kt.id_provinsi = p.id_provinsi
        JOIN kecamatan kc ON kc.id_kota = kt.id_kota
        JOIN kelurahan k ON k.id_kecamatan = kc.id_kecamatan
        WHERE k.id_kelurahan = h.id_kelurahan LIMIT 1), ''),
    kab = COALESCE(h.kab, (SELECT kt.nama_kota FROM kota kt
        JOIN kecamatan kc ON kc.id_kota = kt.id_kota
        JOIN kelurahan k ON k.id_kecamatan = kc.id_kecamatan
        WHERE k.id_kelurahan = h.id_kelurahan LIMIT 1), ''),
    rumah_rusak = h.jumlah_korban
  WHERE h.jenis IS NULL OR h.prov IS NULL OR h.kab IS NULL;

UPDATE laporan_meta m SET susulan = COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', 's' || p.id_pembaruan::text,
        'at', to_char(p.waktu_pembaruan, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'nama', 'Sistem',
        'isi', p.deskripsi) ORDER BY p.id_pembaruan)
    FROM pembaruan_laporan p WHERE p.id_laporan = m.id_laporan), '[]'::jsonb)
  WHERE m.susulan = '[]'::jsonb
    AND EXISTS (SELECT 1 FROM pembaruan_laporan p WHERE p.id_laporan = m.id_laporan);

-- Normalisasi baris yang sudah terisi oleh versi sebelumnya: spasi -> T dan
-- 6 digit mikrodetik -> 3 digit milidetik, sesuai kontrak API baseline.
UPDATE laporan_meta m SET susulan = regexp_replace(m.susulan::text,
    '(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\.\d{6}Z',
    '\1T\2.000Z', 'g')::jsonb
 WHERE m.susulan::text ~ '\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}Z';

UPDATE laporan_meta m SET foto = COALESCE((
    SELECT count(*)::integer FROM foto f WHERE f.id_laporan = m.id_laporan), 0)
  WHERE m.foto = 0
    AND EXISTS (SELECT 1 FROM foto f WHERE f.id_laporan = m.id_laporan);

UPDATE laporan_meta m SET verified_at = to_char(b.waktu_verifikasi, 'YYYY-MM-DD HH24:MI:SS.US')
  FROM laporan_bencana b
 WHERE b.id_laporan = m.id_laporan AND m.verified_at IS NULL
   AND b.waktu_verifikasi IS NOT NULL;

INSERT INTO app_settings ("key", value)
SELECT 'sequence.report_code',
       COALESCE((SELECT max(substring(code from '([0-9]+)$')::integer)
                 FROM laporan_meta WHERE code IS NOT NULL), 149)::text
ON CONFLICT ("key") DO NOTHING;

-- Trigger pembuat id untuk tabel imports (tabel asli dipakai langsung).
CREATE OR REPLACE FUNCTION ken_imports_id() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS NULL OR btrim(NEW.id) = '' THEN
    NEW.id := 'i' || lpad((COALESCE((SELECT max(substring(id from 2)::integer)
      FROM imports WHERE id ~ '^i[0-9]+$'), 0) + 1)::text, 12, '0');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_imports_id ON imports;
CREATE TRIGGER trg_imports_id BEFORE INSERT ON imports
  FOR EACH ROW EXECUTE FUNCTION ken_imports_id();

-- ---------------------------------------------------------------------------
-- 3. Fungsi pembantu
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_default_password_hash() RETURNS text AS $$
BEGIN
  -- PBKDF2-SHA256 120k untuk kata sandi demo appb2026.
  RETURN 'pbkdf2_sha256$120000$4f2e75766eec201e046baf4294829b95$ab821a3e608bfee5c272c0333ff04b01f6d351067db637237916842b7071f482';
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_status_from(p_verif text, p_penanganan text)
RETURNS text AS $$
BEGIN
  IF p_verif = 'Ditolak' THEN RETURN 'Ditolak'; END IF;
  IF p_penanganan IN ('Belum Ditangani', 'Sedang Ditangani', 'Selesai Ditangani',
                      'Tidak Memerlukan Tindak Lanjut', 'Case Closed') THEN
    RETURN p_penanganan;
  END IF;
  IF p_verif = 'Resmi' THEN RETURN 'Resmi'; END IF;
  RETURN 'Tertunda';
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_jsonb(p_text text) RETURNS jsonb AS $$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN RETURN '[]'::jsonb; END IF;
  RETURN p_text::jsonb;
EXCEPTION WHEN OTHERS THEN RETURN '[]'::jsonb;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_ts_text(p timestamp) RETURNS text AS $$
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  RETURN to_char(p, 'YYYY-MM-DD HH24:MI:SS.US');
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_bencana_id(p_nama text) RETURNS integer AS $$
DECLARE v integer;
BEGIN
  IF p_nama IS NULL OR btrim(p_nama) = '' THEN RETURN 1; END IF;
  SELECT id_bencana INTO v FROM bencana WHERE nama_bencana = btrim(p_nama) LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  v := COALESCE((SELECT max(id_bencana) FROM bencana), 0) + 1;
  INSERT INTO bencana (id_bencana, nama_bencana, deskripsi, status)
    VALUES (v, btrim(p_nama), '', 'Aktif');
  RETURN v;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_kelurahan_id(
  p_id varchar, p_prov text, p_kab text, p_kec text, p_kel text)
RETURNS varchar AS $$
DECLARE v varchar(13);
BEGIN
  IF p_id IS NOT NULL AND p_id <> ''
     AND EXISTS (SELECT 1 FROM kelurahan WHERE id_kelurahan = p_id) THEN
    RETURN p_id;
  END IF;
  SELECT k.id_kelurahan INTO v FROM kelurahan k
    JOIN kecamatan kc ON kc.id_kecamatan = k.id_kecamatan
    JOIN kota kt ON kt.id_kota = kc.id_kota
    JOIN provinsi p ON p.id_provinsi = kt.id_provinsi
   WHERE p.nama_provinsi = p_prov AND kt.nama_kota = p_kab
     AND kc.nama_kecamatan = p_kec AND k.nama_kelurahan = p_kel LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT k.id_kelurahan INTO v FROM kelurahan k
    JOIN kecamatan kc ON kc.id_kecamatan = k.id_kecamatan
    JOIN kota kt ON kt.id_kota = kc.id_kota
    JOIN provinsi p ON p.id_provinsi = kt.id_provinsi
   WHERE p.nama_provinsi = p_prov AND kt.nama_kota = p_kab
     AND kc.nama_kecamatan = p_kec LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT k.id_kelurahan INTO v FROM kelurahan k
    JOIN kecamatan kc ON kc.id_kecamatan = k.id_kecamatan
    JOIN kota kt ON kt.id_kota = kc.id_kota
   WHERE kt.nama_kota = p_kab LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT id_kelurahan INTO v FROM kelurahan ORDER BY id_kelurahan LIMIT 1;
  RETURN v;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_petugas_id(p_username text) RETURNS integer AS $$
DECLARE v integer;
BEGIN
  IF p_username IS NOT NULL AND p_username <> '' THEN
    SELECT id_petugas INTO v FROM petugas WHERE username = p_username LIMIT 1;
    IF v IS NOT NULL THEN RETURN v; END IF;
  END IF;
  SELECT id_petugas INTO v FROM petugas ORDER BY id_petugas LIMIT 1;
  RETURN v;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_report_base_id(p_code text) RETURNS bigint AS $$
DECLARE v bigint; n text;
BEGIN
  IF p_code IS NOT NULL THEN
    SELECT id_laporan INTO v FROM laporan_meta WHERE code = p_code LIMIT 1;
    IF v IS NOT NULL THEN RETURN v; END IF;
  END IF;
  n := regexp_replace(COALESCE(p_code, ''), '\D', '', 'g');
  IF n <> '' THEN RETURN n::bigint; END IF;
  RETURN COALESCE((SELECT max(id_laporan) FROM laporan_bencana), 0) + 1;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_user_unique(p_username text) RETURNS text AS $$
DECLARE v text := COALESCE(NULLIF(btrim(p_username), ''), 'user'); i integer := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM admin WHERE username = v)
     OR EXISTS (SELECT 1 FROM petugas WHERE username = v)
     OR EXISTS (SELECT 1 FROM relawan WHERE username = v) LOOP
    i := i + 1;
    v := COALESCE(NULLIF(btrim(p_username), ''), 'user') || i::text;
  END LOOP;
  RETURN v;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_users_insert(
  p_id text, p_nama text, p_email text, p_username text, p_hp text,
  p_instansi text, p_wilayah text, p_kelurahan_id varchar(13),
  p_role text, p_aktif boolean, p_password text)
RETURNS text AS $$
DECLARE
  v_role text := COALESCE(p_role, 'petugas');
  v_uid text := COALESCE(NULLIF(p_id, ''), gen_random_uuid()::text);
  v_user text; v_kel varchar(13); v_pw text := COALESCE(NULLIF(p_password, ''), ken_default_password_hash());
  v_id integer;
BEGIN
  IF v_role NOT IN ('admin', 'petugas', 'relawan') THEN v_role := 'petugas'; END IF;
  v_user := ken_user_unique(COALESCE(NULLIF(btrim(COALESCE(p_username, '')), ''),
      split_part(COALESCE(p_email, COALESCE(p_nama, 'user')), '@', 1), 'user'));
  v_kel := COALESCE(p_kelurahan_id, ken_kelurahan_id(NULL, p_wilayah, p_wilayah, NULL, NULL));
  IF v_role = 'admin' THEN
    v_id := COALESCE((SELECT max(id_admin) FROM admin), 0) + 1;
    INSERT INTO admin (id_admin, nama, username, password, id_logis)
      VALUES (v_id, COALESCE(NULLIF(p_nama, ''), v_user), v_user, v_pw, v_uid);
  ELSIF v_role = 'petugas' THEN
    v_id := COALESCE((SELECT max(id_petugas) FROM petugas), 0) + 1;
    INSERT INTO petugas (id_petugas, id_kelurahan, nama, username, password,
                         kontak, instansi, status, id_logis)
      VALUES (v_id, v_kel, COALESCE(NULLIF(p_nama, ''), v_user), v_user, v_pw,
              p_hp, COALESCE(NULLIF(p_instansi, ''), 'BPBD'),
              CASE WHEN COALESCE(p_aktif, true) THEN 'Aktif' ELSE 'Nonaktif' END, v_uid);
  ELSE
    v_id := COALESCE((SELECT max(id_relawan) FROM relawan), 0) + 1;
    INSERT INTO relawan (id_relawan, id_kelurahan, nama, username, password,
                         kontak, instansi, status, id_logis)
      VALUES (v_id, v_kel, COALESCE(NULLIF(p_nama, ''), v_user), v_user, v_pw,
              p_hp, COALESCE(NULLIF(p_instansi, ''), 'BPBD'),
              CASE WHEN COALESCE(p_aktif, true) THEN 'Aktif' ELSE 'Nonaktif' END, v_uid);
  END IF;
  RETURN v_uid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_users_delete(p_id text, p_role text) RETURNS void AS $$
BEGIN
  IF p_role = 'admin' THEN DELETE FROM admin WHERE id_logis = p_id;
  ELSIF p_role = 'petugas' THEN DELETE FROM petugas WHERE id_logis = p_id;
  ELSIF p_role = 'relawan' THEN DELETE FROM relawan WHERE id_logis = p_id;
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_users_update(
  p_id text, p_role text, p_nama text, p_email text, p_username text, p_hp text,
  p_instansi text, p_kelurahan_id varchar(13), p_wilayah text, p_aktif boolean,
  p_password text)
RETURNS void AS $$
DECLARE v_kel varchar(13); v_user text;
BEGIN
  v_user := NULLIF(btrim(COALESCE(p_username, '')), '');
  v_kel := COALESCE(p_kelurahan_id, ken_kelurahan_id(NULL, p_wilayah, p_wilayah, NULL, NULL));
  IF p_role = 'admin' THEN
    UPDATE admin SET nama = COALESCE(NULLIF(p_nama, ''), nama),
      username = COALESCE(v_user, username), password = COALESCE(p_password, password)
      WHERE id_logis = p_id;
  ELSIF p_role = 'petugas' THEN
    UPDATE petugas SET nama = COALESCE(NULLIF(p_nama, ''), nama),
      username = COALESCE(v_user, username), kontak = COALESCE(p_hp, kontak),
      instansi = COALESCE(NULLIF(p_instansi, ''), instansi),
      id_kelurahan = COALESCE(v_kel, id_kelurahan), password = COALESCE(p_password, password),
      status = CASE WHEN p_aktif IS NULL THEN status
                    WHEN p_aktif THEN 'Aktif' ELSE 'Nonaktif' END
      WHERE id_logis = p_id;
  ELSIF p_role = 'relawan' THEN
    UPDATE relawan SET nama = COALESCE(NULLIF(p_nama, ''), nama),
      username = COALESCE(v_user, username), kontak = COALESCE(p_hp, kontak),
      instansi = COALESCE(NULLIF(p_instansi, ''), instansi),
      id_kelurahan = COALESCE(v_kel, id_kelurahan), password = COALESCE(p_password, password),
      status = CASE WHEN p_aktif IS NULL THEN status
                    WHEN p_aktif THEN 'Aktif' ELSE 'Nonaktif' END
      WHERE id_logis = p_id;
  END IF;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 4. View logis
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS users, auth_users, reports, kategori, wilayah, settings,
                    sequences, logs, announcements, historis;
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'bantuan' AND c.relkind = 'v') THEN
    DROP VIEW bantuan;
  END IF;
END $do$;

CREATE VIEW users AS
SELECT a.id_logis AS id, a.nama::text AS nama,
       a.username || '@appb.local' AS email, a.username::text AS username,
       NULL::text AS hp, 'BPBD'::text AS instansi, 'Nasional'::text AS wilayah,
       NULL::varchar(13) AS kelurahan_id, 'admin'::text AS role, true AS aktif
  FROM admin a
UNION ALL
SELECT p.id_logis, p.nama::text, p.username || '@appb.local', p.username::text,
       p.kontak::text, COALESCE(p.instansi, 'BPBD')::text,
       COALESCE((SELECT kt.nama_kota FROM kota kt
         JOIN kecamatan kc ON kc.id_kota = kt.id_kota
         JOIN kelurahan k ON k.id_kecamatan = kc.id_kecamatan
         WHERE k.id_kelurahan = p.id_kelurahan LIMIT 1), 'Nasional')::text,
       p.id_kelurahan, 'petugas'::text, p.status = 'Aktif'
  FROM petugas p
UNION ALL
SELECT r.id_logis, r.nama::text, r.username || '@appb.local', r.username::text,
       r.kontak::text, COALESCE(r.instansi, 'BPBD')::text,
       COALESCE((SELECT kt.nama_kota FROM kota kt
         JOIN kecamatan kc ON kc.id_kota = kt.id_kota
         JOIN kelurahan k ON k.id_kecamatan = kc.id_kecamatan
         WHERE k.id_kelurahan = r.id_kelurahan LIMIT 1), 'Nasional')::text,
       r.id_kelurahan, 'relawan'::text, r.status = 'Aktif'
  FROM relawan r;

CREATE VIEW auth_users AS
SELECT a.id_logis AS id, a.username || '@appb.local' AS email,
       a.username::text AS username, a.password::text AS password_hash FROM admin a
UNION ALL
SELECT p.id_logis, p.username || '@appb.local', p.username::text, p.password::text FROM petugas p
UNION ALL
SELECT r.id_logis, r.username || '@appb.local', r.username::text, r.password::text FROM relawan r;

CREATE VIEW kategori AS
SELECT 'c' || b.id_bencana::text AS id, b.nama_bencana::text AS nama,
       b.status = 'Aktif' AS aktif, COALESCE(b.deskripsi, '')::text AS deskripsi
  FROM bencana b;

CREATE VIEW wilayah AS
SELECT p.nama_provinsi::text AS prov, kt.nama_kota::text AS kab,
       kc.nama_kecamatan::text AS kec, k.nama_kelurahan::text AS kel
  FROM kelurahan k
  JOIN kecamatan kc ON kc.id_kecamatan = k.id_kecamatan
  JOIN kota kt ON kt.id_kota = kc.id_kota
  JOIN provinsi p ON p.id_provinsi = kt.id_provinsi;

CREATE VIEW settings AS
SELECT s."key"::text AS "key", s.value::text AS value FROM app_settings s;

CREATE VIEW sequences AS
SELECT 'report_code'::text AS name,
       s.value::integer AS value
  FROM app_settings s WHERE s."key" = 'sequence.report_code';

CREATE VIEW logs AS
SELECT COALESCE(l.id_logis, 'l' || l.id_log::text) AS id,
       l.waktu_log AS at, l.aktor::text AS actor,
       CASE WHEN l.role_logis <> 'sistem' THEN l.role_logis
            WHEN l.aktor LIKE 'admin%' THEN 'admin'
            WHEN l.aktor LIKE 'relawan%' THEN 'relawan'
            WHEN l.aktor IN ('Sistem', 'Anonim') OR l.aktor IS NULL THEN 'sistem'
            ELSE 'petugas' END::text AS role,
       l.aksi::text AS aksi,
       (SELECT m.code FROM laporan_meta m WHERE m.id_laporan = l.id_laporan) AS code,
       l.detail::text AS detail
  FROM log_penanganan l;

CREATE VIEW reports AS
SELECT
  'r' || lpad(b.id_laporan::text, 3, '0') AS id,
  COALESCE(m.code, 'APPB-2026-' || lpad((122 + b.id_laporan)::text, 5, '0')) AS code,
  COALESCE(m.device_id, 'ken-import')::text AS device_id,
  bc.nama_bencana::text AS jenis,
  COALESCE(p.nama_provinsi, '')::text AS prov,
  COALESCE(kt.nama_kota, '')::text AS kab,
  COALESCE(kc.nama_kecamatan, '')::text AS kec,
  COALESCE(k.nama_kelurahan, '')::text AS kel,
  b.id_kelurahan AS kelurahan_id,
  b.alamat::text AS alamat,
  b.judul_laporan::text AS judul,
  b.deskripsi::text AS deskripsi,
  b.waktu_laporan AS created_at,
  COALESCE(m.pelapor, 'Warga')::text AS pelapor,
  b.no_hp_pelapor::text AS hp,
  COALESCE(m.verif, CASE WHEN b.status = 'Tertunda' THEN 'Tertunda'
      WHEN b.status = 'Ditolak' THEN 'Ditolak' ELSE 'Resmi' END)::text AS verif,
  m.penanganan::text AS penanganan,
  b.jumlah_luka AS luka, b.jumlah_hilang AS hilang,
  b.jumlah_meninggal AS meninggal, b.jumlah_korban AS mengungsi,
  ken_jsonb(m.korban_history::text)::text AS korban_history,
  COALESCE(m.susulan::text, '[]') AS susulan,
  ken_jsonb(m.status_history::text)::text AS status_history,
  COALESCE(m.foto, 0) AS foto,
  COALESCE(m.verified_by, pt.username)::text AS verified_by,
  NULLIF(m.verified_at, '')::timestamp AS verified_at,
  COALESCE(m.reject_reason, '')::text AS reject_reason,
  m.closed_by::text AS closed_by,
  NULLIF(m.closed_at, '')::timestamp AS closed_at,
  COALESCE(m.ringkasan, '')::text AS ringkasan
  FROM laporan_bencana b
  JOIN bencana bc ON bc.id_bencana = b.id_bencana
  JOIN kelurahan k ON k.id_kelurahan = b.id_kelurahan
  JOIN kecamatan kc ON kc.id_kecamatan = k.id_kecamatan
  JOIN kota kt ON kt.id_kota = kc.id_kota
  JOIN provinsi p ON p.id_provinsi = kt.id_provinsi
  LEFT JOIN petugas pt ON pt.id_petugas = b.id_petugas
  LEFT JOIN laporan_meta m ON m.id_laporan = b.id_laporan;

CREATE VIEW announcements AS
SELECT p.id_logis AS id, p.judul::text AS title, p.deskripsi::text AS body,
       p.label::text AS severity, COALESCE(p.jenis, 'Informasi')::text AS jenis,
       COALESCE(p.prov, '')::text AS prov, COALESCE(p.kab, '')::text AS kab,
       COALESCE(p.kec, '')::text AS kec, COALESCE(p.kel, '')::text AS kel,
       COALESCE(p.report_code, (SELECT m.code FROM laporan_meta m
         WHERE m.id_laporan = p.id_laporan))::text AS report_code,
       p.waktu_diumumkan AS at,
       COALESCE(p.by_user, pt.username, 'Sistem')::text AS by_user,
       p.id_kelurahan AS kelurahan_id, p.id_laporan AS report_id
  FROM pengumuman p LEFT JOIN petugas pt ON pt.id_petugas = p.id_petugas;

CREATE VIEW bantuan AS
SELECT b.id_logis AS id, b.sumber::text AS sumber, b.jenis_bantuan::text AS jenis,
       b.jumlah::numeric AS jumlah, COALESCE(b.satuan, 'paket')::text AS satuan,
       COALESCE(b.kab, '')::text AS kab, b.code::text AS code,
       b.waktu_catat AS at, COALESCE(b.by_user, 'Sistem')::text AS by_user,
       b.id_kelurahan AS kelurahan_id, b.id_laporan AS report_id
  FROM bantuan_ken b;

CREATE VIEW historis AS
SELECT h.id_logis AS id, COALESCE(h.jenis, 'Historis')::text AS jenis,
       COALESCE(h.prov, '')::text AS prov, COALESCE(h.kab, '')::text AS kab,
       h.tanggal_kejadian::text AS tanggal, h.meninggal AS meninggal,
       h.mengungsi AS mengungsi,
       COALESCE(h.rumah_rusak, h.jumlah_korban, 0) AS rumah_rusak,
       h.sumber_data::text AS sumber, h.id_kelurahan AS kelurahan_id
  FROM data_historis h;

-- ---------------------------------------------------------------------------
-- 5. Trigger INSTEAD OF (tulis lewat view logis)
-- ---------------------------------------------------------------------------

-- users ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_users_view_ins() RETURNS trigger AS $$
BEGIN
  NEW.id := ken_users_insert(NEW.id, NEW.nama, NEW.email, NEW.username, NEW.hp,
      NEW.instansi, NEW.wilayah, NEW.kelurahan_id, NEW.role, NEW.aktif, NULL);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_users_view_upd() RETURNS trigger AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM ken_users_delete(OLD.id, OLD.role);
    NEW.id := ken_users_insert(OLD.id, NEW.nama, NEW.email, NEW.username, NEW.hp,
        NEW.instansi, NEW.wilayah, NEW.kelurahan_id, NEW.role, NEW.aktif, NULL);
  ELSE
    PERFORM ken_users_update(OLD.id, OLD.role, NEW.nama, NEW.email, NEW.username,
        NEW.hp, NEW.instansi, NEW.kelurahan_id, NEW.wilayah, NEW.aktif, NULL);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_users_view_del() RETURNS trigger AS $$
BEGIN
  PERFORM ken_users_delete(OLD.id, OLD.role);
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_users_ins ON users;
DROP TRIGGER IF EXISTS trg_users_upd ON users;
DROP TRIGGER IF EXISTS trg_users_del ON users;
CREATE TRIGGER trg_users_ins INSTEAD OF INSERT ON users FOR EACH ROW EXECUTE FUNCTION ken_users_view_ins();
CREATE TRIGGER trg_users_upd INSTEAD OF UPDATE ON users FOR EACH ROW EXECUTE FUNCTION ken_users_view_upd();
CREATE TRIGGER trg_users_del INSTEAD OF DELETE ON users FOR EACH ROW EXECUTE FUNCTION ken_users_view_del();

CREATE OR REPLACE FUNCTION ken_auth_users_view_upd() RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    UPDATE admin SET password = NEW.password_hash WHERE id_logis = OLD.id;
    UPDATE petugas SET password = NEW.password_hash WHERE id_logis = OLD.id;
    UPDATE relawan SET password = NEW.password_hash WHERE id_logis = OLD.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_auth_users_upd ON auth_users;
CREATE TRIGGER trg_auth_users_upd INSTEAD OF UPDATE ON auth_users
  FOR EACH ROW EXECUTE FUNCTION ken_auth_users_view_upd();

-- kategori -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_kategori_view_ins() RETURNS trigger AS $$
DECLARE v_id integer;
BEGIN
  -- ID dari API berupa UUID; hanya ID logis "c<angka>" yang boleh dipakai
  -- sebagai id_bencana. UUID tidak boleh dibuang digitnya (bisa overflow).
  IF COALESCE(NEW.id, '') ~ '^c[0-9]+$' THEN
    v_id := substring(NEW.id from 2)::integer;
  END IF;
  IF v_id IS NULL OR EXISTS (SELECT 1 FROM bencana WHERE id_bencana = v_id) THEN
    v_id := COALESCE((SELECT max(id_bencana) FROM bencana), 0) + 1;
  END IF;
  INSERT INTO bencana (id_bencana, nama_bencana, deskripsi, status)
    VALUES (v_id, NEW.nama, COALESCE(NEW.deskripsi, ''),
            CASE WHEN COALESCE(NEW.aktif, true) THEN 'Aktif' ELSE 'Nonaktif' END);
  NEW.id := 'c' || v_id::text;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_kategori_view_upd() RETURNS trigger AS $$
DECLARE v_id integer := NULLIF(regexp_replace(OLD.id, '\D', '', 'g'), '')::integer;
BEGIN
  UPDATE bencana SET nama_bencana = COALESCE(NEW.nama, nama_bencana),
    deskripsi = COALESCE(NEW.deskripsi, deskripsi),
    status = CASE WHEN NEW.aktif IS NULL THEN status
                  WHEN NEW.aktif THEN 'Aktif' ELSE 'Nonaktif' END
    WHERE id_bencana = v_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_kategori_view_del() RETURNS trigger AS $$
BEGIN
  DELETE FROM bencana WHERE id_bencana = NULLIF(regexp_replace(OLD.id, '\D', '', 'g'), '')::integer;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_kategori_ins ON kategori;
DROP TRIGGER IF EXISTS trg_kategori_upd ON kategori;
DROP TRIGGER IF EXISTS trg_kategori_del ON kategori;
CREATE TRIGGER trg_kategori_ins INSTEAD OF INSERT ON kategori FOR EACH ROW EXECUTE FUNCTION ken_kategori_view_ins();
CREATE TRIGGER trg_kategori_upd INSTEAD OF UPDATE ON kategori FOR EACH ROW EXECUTE FUNCTION ken_kategori_view_upd();
CREATE TRIGGER trg_kategori_del INSTEAD OF DELETE ON kategori FOR EACH ROW EXECUTE FUNCTION ken_kategori_view_del();

-- reports --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_reports_view_ins() RETURNS trigger AS $$
DECLARE v_id bigint; v_kel varchar(13); v_bencana integer;
BEGIN
  v_id := COALESCE((SELECT max(id_laporan) FROM laporan_bencana), 0) + 1;
  v_bencana := ken_bencana_id(NEW.jenis);
  v_kel := ken_kelurahan_id(NEW.kelurahan_id, NEW.prov, NEW.kab, NEW.kec, NEW.kel);
  INSERT INTO laporan_bencana (id_laporan, id_kelurahan, id_bencana, judul_laporan,
      deskripsi, alamat, status, waktu_laporan, no_hp_pelapor,
      jumlah_korban, jumlah_luka, jumlah_hilang, jumlah_meninggal)
    VALUES (v_id, v_kel, v_bencana,
      COALESCE(NULLIF(NEW.judul, ''), left(COALESCE(NEW.deskripsi, NEW.jenis), 180)),
      COALESCE(NEW.deskripsi, ''), COALESCE(NEW.alamat, ''), 'Tertunda',
      COALESCE(NEW.created_at, now()), NEW.hp,
      COALESCE(NEW.mengungsi, 0), COALESCE(NEW.luka, 0),
      COALESCE(NEW.hilang, 0), COALESCE(NEW.meninggal, 0));
  INSERT INTO laporan_meta (id_laporan, code, device_id, pelapor, verif, penanganan,
      korban_history, status_history, susulan, foto, verified_at)
    VALUES (v_id, NEW.code, NEW.device_id, NEW.pelapor,
      COALESCE(NEW.verif, 'Tertunda'), COALESCE(NEW.penanganan, 'Belum Ditangani'),
      ken_jsonb(NEW.korban_history), ken_jsonb(NEW.status_history),
      ken_jsonb(NEW.susulan), COALESCE(NEW.foto, 0), ken_ts_text(NEW.verified_at));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_reports_view_upd() RETURNS trigger AS $$
DECLARE v_id bigint := ken_report_base_id(OLD.code); v_kel varchar(13);
BEGIN
  IF (NEW.kelurahan_id, NEW.prov, NEW.kab, NEW.kec, NEW.kel)
     IS DISTINCT FROM (OLD.kelurahan_id, OLD.prov, OLD.kab, OLD.kec, OLD.kel) THEN
    v_kel := ken_kelurahan_id(NEW.kelurahan_id, NEW.prov, NEW.kab, NEW.kec, NEW.kel);
  END IF;
  UPDATE laporan_bencana b SET
      id_bencana = CASE WHEN NEW.jenis IS DISTINCT FROM OLD.jenis
                        THEN ken_bencana_id(NEW.jenis) ELSE b.id_bencana END,
      id_kelurahan = COALESCE(v_kel, b.id_kelurahan),
      judul_laporan = COALESCE(NEW.judul, b.judul_laporan),
      alamat = NEW.alamat, deskripsi = NEW.deskripsi,
      no_hp_pelapor = NEW.hp,
      status = ken_status_from(NEW.verif, NEW.penanganan),
      jumlah_korban = COALESCE(NEW.mengungsi, 0), jumlah_luka = COALESCE(NEW.luka, 0),
      jumlah_hilang = COALESCE(NEW.hilang, 0), jumlah_meninggal = COALESCE(NEW.meninggal, 0),
      waktu_verifikasi = CASE WHEN NEW.verified_at IS DISTINCT FROM OLD.verified_at
                              THEN NEW.verified_at ELSE b.waktu_verifikasi END
    WHERE b.id_laporan = v_id;
  UPDATE laporan_meta m SET
      code = NEW.code, device_id = NEW.device_id, pelapor = NEW.pelapor,
      verif = NEW.verif, penanganan = NEW.penanganan,
      korban_history = ken_jsonb(NEW.korban_history),
      status_history = ken_jsonb(NEW.status_history),
      susulan = ken_jsonb(NEW.susulan), foto = COALESCE(NEW.foto, 0),
      verified_by = NEW.verified_by,
      verified_at = CASE WHEN NEW.verified_at IS DISTINCT FROM OLD.verified_at
                         THEN ken_ts_text(NEW.verified_at) ELSE m.verified_at END,
      reject_reason = NEW.reject_reason, closed_by = NEW.closed_by,
      closed_at = CASE WHEN NEW.closed_at IS DISTINCT FROM OLD.closed_at
                       THEN ken_ts_text(NEW.closed_at) ELSE m.closed_at END,
      ringkasan = NEW.ringkasan
    WHERE m.id_laporan = v_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ken_reports_view_del() RETURNS trigger AS $$
BEGIN
  DELETE FROM laporan_meta WHERE id_laporan = ken_report_base_id(OLD.code);
  DELETE FROM laporan_bencana WHERE id_laporan = ken_report_base_id(OLD.code);
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_reports_ins ON reports;
DROP TRIGGER IF EXISTS trg_reports_upd ON reports;
DROP TRIGGER IF EXISTS trg_reports_del ON reports;
CREATE TRIGGER trg_reports_ins INSTEAD OF INSERT ON reports FOR EACH ROW EXECUTE FUNCTION ken_reports_view_ins();
CREATE TRIGGER trg_reports_upd INSTEAD OF UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION ken_reports_view_upd();
CREATE TRIGGER trg_reports_del INSTEAD OF DELETE ON reports FOR EACH ROW EXECUTE FUNCTION ken_reports_view_del();

-- sequences ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_sequences_view_upd() RETURNS trigger AS $$
BEGIN
  UPDATE app_settings SET value = NEW.value::text WHERE "key" = 'sequence.report_code';
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_sequences_upd ON sequences;
CREATE TRIGGER trg_sequences_upd INSTEAD OF UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION ken_sequences_view_upd();

-- logs -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_logs_view_ins() RETURNS trigger AS $$
DECLARE v_id bigint; v_laporan bigint;
BEGIN
  v_id := COALESCE((SELECT max(id_log) FROM log_penanganan), 0) + 1;
  IF NEW.code IS NOT NULL THEN
    SELECT id_laporan INTO v_laporan FROM laporan_meta WHERE code = NEW.code LIMIT 1;
  END IF;
  IF v_laporan IS NULL THEN
    SELECT id_laporan INTO v_laporan FROM laporan_bencana ORDER BY id_laporan LIMIT 1;
  END IF;
  INSERT INTO log_penanganan (id_log, id_laporan, aktor, aksi, detail, waktu_log,
                              id_logis, role_logis)
    VALUES (v_id, v_laporan, COALESCE(NEW.actor, 'Sistem'), NEW.aksi,
            COALESCE(NEW.detail, ''), COALESCE(NEW.at, now()),
            COALESCE(NULLIF(NEW.id, ''), gen_random_uuid()::text),
            COALESCE(NEW.role, 'sistem'));
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_logs_ins ON logs;
CREATE TRIGGER trg_logs_ins INSTEAD OF INSERT ON logs FOR EACH ROW EXECUTE FUNCTION ken_logs_view_ins();

-- announcements --------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_announcements_view_ins() RETURNS trigger AS $$
DECLARE v_id bigint; v_kel varchar(13); v_laporan bigint;
BEGIN
  v_id := COALESCE((SELECT max(id_pengumuman) FROM pengumuman), 0) + 1;
  v_kel := ken_kelurahan_id(NULL, NEW.prov, NEW.kab, NEW.kec, NEW.kel);
  IF NEW.report_code IS NOT NULL THEN
    SELECT id_laporan INTO v_laporan FROM laporan_meta WHERE code = NEW.report_code LIMIT 1;
  END IF;
  INSERT INTO pengumuman (id_pengumuman, id_kelurahan, id_laporan, id_petugas,
      label, judul, deskripsi, waktu_diumumkan, id_logis, jenis, prov, kab, kec, kel,
      report_code, by_user)
    VALUES (v_id, v_kel, v_laporan, ken_petugas_id(NEW.by_user), NEW.severity,
      NEW.title, NEW.body, COALESCE(NEW.at, now()),
      COALESCE(NULLIF(NEW.id, ''), gen_random_uuid()::text),
      COALESCE(NEW.jenis, 'Informasi'), NEW.prov, NEW.kab, NEW.kec, NEW.kel,
      NEW.report_code, COALESCE(NEW.by_user, 'Sistem'));
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_announcements_view_upd() RETURNS trigger AS $$
DECLARE v_id bigint := NULLIF(regexp_replace(OLD.id, '\D', '', 'g'), '')::bigint;
BEGIN
  UPDATE pengumuman SET judul = NEW.title, deskripsi = NEW.body, label = NEW.severity,
    jenis = NEW.jenis, prov = NEW.prov, kab = NEW.kab, kec = NEW.kec, kel = NEW.kel,
    report_code = NEW.report_code, by_user = NEW.by_user,
    id_laporan = (SELECT id_laporan FROM laporan_meta WHERE code = NEW.report_code LIMIT 1)
    WHERE id_pengumuman = v_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_announcements_view_del() RETURNS trigger AS $$
BEGIN
  DELETE FROM pengumuman
   WHERE id_pengumuman = NULLIF(regexp_replace(OLD.id, '\D', '', 'g'), '')::bigint;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_announcements_ins ON announcements;
DROP TRIGGER IF EXISTS trg_announcements_upd ON announcements;
DROP TRIGGER IF EXISTS trg_announcements_del ON announcements;
CREATE TRIGGER trg_announcements_ins INSTEAD OF INSERT ON announcements FOR EACH ROW EXECUTE FUNCTION ken_announcements_view_ins();
CREATE TRIGGER trg_announcements_upd INSTEAD OF UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION ken_announcements_view_upd();
CREATE TRIGGER trg_announcements_del INSTEAD OF DELETE ON announcements FOR EACH ROW EXECUTE FUNCTION ken_announcements_view_del();

-- bantuan --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_bantuan_view_ins() RETURNS trigger AS $$
DECLARE v_id bigint; v_kel varchar(13); v_laporan bigint;
BEGIN
  v_id := COALESCE((SELECT max(id_bantuan) FROM bantuan_ken), 0) + 1;
  v_kel := ken_kelurahan_id(NULL, NULL, NEW.kab, NULL, NULL);
  IF NEW.code IS NOT NULL THEN
    SELECT id_laporan INTO v_laporan FROM laporan_meta WHERE code = NEW.code LIMIT 1;
  END IF;
  INSERT INTO bantuan_ken (id_bantuan, id_kelurahan, id_laporan, sumber, jenis_bantuan,
      jumlah, waktu_catat, id_logis, satuan, kab, code, by_user)
    VALUES (v_id, v_kel, v_laporan, NEW.sumber, NEW.jenis, GREATEST(1, NEW.jumlah::integer),
      COALESCE(NEW.at, now()), COALESCE(NULLIF(NEW.id, ''), gen_random_uuid()::text),
      COALESCE(NEW.satuan, 'paket'), NEW.kab, NEW.code, COALESCE(NEW.by_user, 'Sistem'));
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_bantuan_view_upd() RETURNS trigger AS $$
DECLARE v_id bigint := NULLIF(regexp_replace(OLD.id, '\D', '', 'g'), '')::bigint;
BEGIN
  UPDATE bantuan_ken SET sumber = NEW.sumber, jenis_bantuan = NEW.jenis,
    jumlah = GREATEST(1, NEW.jumlah::integer), satuan = NEW.satuan, kab = NEW.kab,
    code = NEW.code, by_user = NEW.by_user,
    id_laporan = (SELECT id_laporan FROM laporan_meta WHERE code = NEW.code LIMIT 1)
    WHERE id_bantuan = v_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_bantuan_view_del() RETURNS trigger AS $$
BEGIN
  DELETE FROM bantuan_ken WHERE id_bantuan = NULLIF(regexp_replace(OLD.id, '\D', '', 'g'), '')::bigint;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_bantuan_ins ON bantuan;
DROP TRIGGER IF EXISTS trg_bantuan_upd ON bantuan;
DROP TRIGGER IF EXISTS trg_bantuan_del ON bantuan;
CREATE TRIGGER trg_bantuan_ins INSTEAD OF INSERT ON bantuan FOR EACH ROW EXECUTE FUNCTION ken_bantuan_view_ins();
CREATE TRIGGER trg_bantuan_upd INSTEAD OF UPDATE ON bantuan FOR EACH ROW EXECUTE FUNCTION ken_bantuan_view_upd();
CREATE TRIGGER trg_bantuan_del INSTEAD OF DELETE ON bantuan FOR EACH ROW EXECUTE FUNCTION ken_bantuan_view_del();

-- historis -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ken_historis_view_ins() RETURNS trigger AS $$
DECLARE v_id bigint; v_kel varchar(13);
BEGIN
  v_id := COALESCE((SELECT max(id_historis) FROM data_historis), 0) + 1;
  v_kel := ken_kelurahan_id(NULL, NEW.prov, NEW.kab, NULL, NULL);
  INSERT INTO data_historis (id_historis, id_kelurahan, id_laporan, id_admin,
      jumlah_korban, sumber_data, tanggal_kejadian, id_logis, jenis, prov, kab,
      meninggal, mengungsi, rumah_rusak)
    VALUES (v_id, v_kel, NULL, (SELECT id_admin FROM admin ORDER BY id_admin LIMIT 1),
      COALESCE(NEW.rumah_rusak, 0), COALESCE(NEW.sumber, ''), NEW.tanggal::date,
      COALESCE(NULLIF(NEW.id, ''), gen_random_uuid()::text),
      COALESCE(NEW.jenis, 'Historis'), NEW.prov, NEW.kab,
      COALESCE(NEW.meninggal, 0), COALESCE(NEW.mengungsi, 0), COALESCE(NEW.rumah_rusak, 0));
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_historis_view_upd() RETURNS trigger AS $$
DECLARE v_id bigint := NULLIF(regexp_replace(OLD.id, '\D', '', 'g'), '')::bigint;
BEGIN
  UPDATE data_historis SET jenis = NEW.jenis, prov = NEW.prov, kab = NEW.kab,
    tanggal_kejadian = NEW.tanggal::date, meninggal = NEW.meninggal,
    mengungsi = NEW.mengungsi, rumah_rusak = NEW.rumah_rusak,
    jumlah_korban = NEW.rumah_rusak, sumber_data = NEW.sumber
    WHERE id_historis = v_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION ken_historis_view_del() RETURNS trigger AS $$
BEGIN
  DELETE FROM data_historis
   WHERE id_historis = NULLIF(regexp_replace(OLD.id, '\D', '', 'g'), '')::bigint;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_historis_ins ON historis;
DROP TRIGGER IF EXISTS trg_historis_upd ON historis;
DROP TRIGGER IF EXISTS trg_historis_del ON historis;
CREATE TRIGGER trg_historis_ins INSTEAD OF INSERT ON historis FOR EACH ROW EXECUTE FUNCTION ken_historis_view_ins();
CREATE TRIGGER trg_historis_upd INSTEAD OF UPDATE ON historis FOR EACH ROW EXECUTE FUNCTION ken_historis_view_upd();
CREATE TRIGGER trg_historis_del INSTEAD OF DELETE ON historis FOR EACH ROW EXECUTE FUNCTION ken_historis_view_del();
