package com.bpbd.appb.web;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private static final List<String> KORBAN_ORDER = List.of("luka", "hilang", "meninggal", "mengungsi");
    private static final Set<String> KORBAN_FIELDS = Set.copyOf(KORBAN_ORDER);
    private static final Set<String> VERIF_VALUES = Set.of("Tertunda", "Resmi", "Ditolak");
    private static final Set<String> PENANGANAN_VALUES = Set.of(
            "Belum Ditangani", "Sedang Ditangani", "Selesai Ditangani",
            "Tidak Perlu Tindak Lanjut", "Case Closed");
    private static final Set<String> STAFF_ROLES = Set.of("petugas", "relawan", "admin");

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;
    private final Utility util;
    private final CodeService codeService;
    private final LogService logService;

    public ReportController(JdbcTemplate jdbc, NamedParameterJdbcTemplate namedJdbc,
                            Utility util, CodeService codeService, LogService logService) {
        this.jdbc = jdbc;
        this.namedJdbc = namedJdbc;
        this.util = util;
        this.codeService = codeService;
        this.logService = logService;
    }

    @GetMapping
    public List<Map<String, Object>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String jenis,
            @RequestParam(required = false) String prov,
            @RequestParam(required = false) String kab,
            @RequestParam(required = false) String kec,
            @RequestParam(required = false) String kel,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String deviceId,
            @RequestParam(defaultValue = "200") int limit) {

        StringBuilder sql = new StringBuilder("SELECT * FROM reports WHERE 1 = 1");
        MapSqlParameterSource params = new MapSqlParameterSource();

        addLike(sql, params, "jenis", jenis);
        addLike(sql, params, "prov", prov);
        addLike(sql, params, "kab", kab);
        addLike(sql, params, "kec", kec);
        addLike(sql, params, "kel", kel);
        addLike(sql, params, "device_id", deviceId);

        if (q != null && !q.isBlank()) {
            sql.append(" AND (code LIKE :q OR pelapor LIKE :q OR deskripsi LIKE :q OR alamat LIKE :q)");
            params.addValue("q", "%" + q.trim() + "%");
        }
        if (status != null && !status.isBlank()) {
            if (VERIF_VALUES.contains(status)) {
                sql.append(" AND verif = :status");
            } else {
                sql.append(" AND penanganan = :status");
            }
            params.addValue("status", status);
        }
        sql.append(" ORDER BY created_at DESC LIMIT ").append(Math.max(1, Math.min(limit, 500)));
        return util.normalizeAll(namedJdbc.queryForList(sql.toString(), params));
    }

    @GetMapping("/stats/ringkas")
    public Map<String, Object> stats() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", count("SELECT COUNT(*) FROM reports"));
        out.put("tertunda", count("SELECT COUNT(*) FROM reports WHERE verif = 'Tertunda'"));
        out.put("resmi", count("SELECT COUNT(*) FROM reports WHERE verif = 'Resmi'"));
        out.put("ditolak", count("SELECT COUNT(*) FROM reports WHERE verif = 'Ditolak'"));
        out.put("aktif", count("SELECT COUNT(*) FROM reports WHERE verif = 'Tertunda' OR "
                + "(verif = 'Resmi' AND (penanganan IS NULL OR penanganan NOT IN "
                + "('Case Closed', 'Tidak Perlu Tindak Lanjut')))"));
        out.put("selesai", count("SELECT COUNT(*) FROM reports WHERE penanganan = 'Case Closed'"));
        out.put("pengungsi", count("SELECT COALESCE(SUM(mengungsi), 0) FROM reports WHERE verif = 'Resmi'"));
        out.put("meninggal", count("SELECT COALESCE(SUM(meninggal), 0) FROM reports WHERE verif = 'Resmi'"));
        return out;
    }

    @GetMapping("/{code}")
    public Map<String, Object> detail(@PathVariable String code) {
        return one(code);
    }

    @PostMapping
    public Map<String, Object> submit(@RequestBody Map<String, Object> body) {
        String jenis = Utility.text(body, "jenis");
        String kel = Utility.text(body, "kel");
        String pelapor = Utility.text(body, "pelapor");
        if (jenis == null || jenis.isBlank() || kel == null || kel.isBlank()
                || pelapor == null || pelapor.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Jenis, kelurahan, dan pelapor wajib diisi");
        }

        // findActiveResmi(): laporan aktif dengan jenis + kel yang sama memblokir
        // pengiriman warga/device. Frontend mockup menampilkan modal duplikat.
        String submitRole = roleOf(body, Utility.text(body, "actor", ""));
        if (!STAFF_ROLES.contains(submitRole)) {
            List<Map<String, Object>> dupes = jdbc.queryForList(
                    "SELECT code FROM reports WHERE jenis = ? AND kel = ? AND "
                            + "(verif = 'Tertunda' OR (verif = 'Resmi' AND "
                            + "(penanganan IS NULL OR penanganan NOT IN "
                            + "('Case Closed', 'Tidak Perlu Tindak Lanjut')))) "
                            + "ORDER BY created_at DESC LIMIT 1",
                    jenis, kel);
            if (!dupes.isEmpty()) {
                String duplicateCode = String.valueOf(dupes.get(0).get("code"));
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Sudah ada laporan aktif " + duplicateCode + " untuk jenis " + jenis
                                + " di Kel. " + kel + ".");
            }
        }

        String code = codeService.nextReportCode();
        String id = Utility.uid();
        String at = Instant.now().toString();
        String history = util.json(List.of(Map.of("at", at, "status", "Tertunda", "by", "Sistem")));
        jdbc.update("INSERT INTO reports (id, code, device_id, jenis, prov, kab, kec, kel, alamat, deskripsi, "
                        + "created_at, pelapor, hp, verif, luka, hilang, meninggal, mengungsi, "
                        + "korban_history, susulan, status_history, foto) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Tertunda', 0, 0, 0, 0, '[]', '[]', ?, ?)",
                id, code, Utility.text(body, "deviceId"), jenis,
                Utility.text(body, "prov", ""), Utility.text(body, "kab", ""),
                Utility.text(body, "kec", ""), kel,
                Utility.text(body, "alamat"), Utility.text(body, "deskripsi"),
                Utility.now(), pelapor, Utility.text(body, "hp"), history,
                Utility.number(body, "foto", 0));
        logService.write("Sistem", "Laporan masuk", code, "Laporan warga baru, status Tertunda");
        return one(code);
    }

    @PostMapping("/{code}/susulan")
    public Map<String, Object> addSusulan(@PathVariable String code, @RequestBody Map<String, Object> body) {
        Map<String, Object> raw = raw(code);
        String actor = Utility.text(body, "nama", "Warga");
        String role = roleOf(body, actor);
        requireWritable(raw, role, actor);
        if (!STAFF_ROLES.contains(role) && !"Tertunda".equals(String.valueOf(raw.get("verif")))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Pembaruan hanya dapat ditambahkan petugas pada laporan yang sudah diverifikasi.");
        }
        String isi = Utility.text(body, "isi");
        if (isi == null || isi.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Isi susulan wajib diisi");
        }
        List<Map<String, Object>> items = util.parseList(jsonColumn(raw, "susulan"));
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", Utility.uid());
        item.put("at", Instant.now().toString());
        item.put("nama", actor);
        item.put("isi", isi.trim());
        item.put("foto", Utility.number(body, "foto", 0));
        items.add(item);
        jdbc.update("UPDATE reports SET susulan = ? WHERE code = ?", util.json(items), code);
        logService.write(actor, role, "Catatan", code, isi.trim());
        return one(code);
    }

    /** Catatan lapangan: append-only log, tidak mengubah data laporan. */
    @PostMapping("/{code}/catatan")
    public Map<String, Object> catatan(@PathVariable String code, @RequestBody Map<String, Object> body) {
        Map<String, Object> raw = raw(code);
        String detail = Utility.text(body, "detail");
        if (detail == null || detail.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Detail catatan wajib diisi");
        }
        String actor = Utility.text(body, "actor", "Sistem");
        String role = Utility.text(body, "actorRole", Utility.text(body, "role", inferRole(actor)));
        requireActiveActor(actor, role);
        if ("Case Closed".equals(String.valueOf(raw.get("penanganan"))) && !"admin".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Laporan sudah ditutup; hanya admin yang dapat mengoreksi.");
        }
        logService.write(actor, role, "Catatan", code, detail.trim());
        return one(code);
    }

    @PatchMapping("/{code}/verifikasi")
    public Map<String, Object> verifikasi(@PathVariable String code, @RequestBody Map<String, Object> body) {
        String verif = Utility.text(body, "verif");
        if (verif == null || !VERIF_VALUES.contains(verif)
                || "Tertunda".equals(verif)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Nilai verifikasi harus Resmi atau Ditolak");
        }
        String actor = Utility.text(body, "actor", "Petugas");
        String role = roleOf(body, actor);
        if (!STAFF_ROLES.contains(role) || "relawan".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Hanya petugas aktif yang dapat memverifikasi atau menolak laporan.");
        }
        String reason = Utility.text(body, "rejectReason");
        String trimmed = reason == null ? "" : reason.trim();
        if ("Ditolak".equals(verif)) {
            if (trimmed.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Alasan penolakan wajib diisi");
            }
            if (trimmed.length() < 10) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Alasan minimal 10 karakter agar pelapor memahami penolakan.");
            }
        }

        List<String> codes = new ArrayList<>();
        Object requested = body.get("codes");
        if (requested instanceof List<?> values) {
            for (Object value : values) {
                if (value != null && !String.valueOf(value).isBlank()) {
                    codes.add(String.valueOf(value));
                }
            }
        }
        if (codes.isEmpty()) codes.add(code);

        // Validasi dulu semua target agar bulk tidak setengah jalan.
        List<Map<String, Object>> targets = new ArrayList<>();
        for (String targetCode : codes) {
            Map<String, Object> target = raw(targetCode);
            requireWritable(target, role, actor);
            if (!"Tertunda".equals(String.valueOf(target.get("verif")))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Hanya laporan Tertunda yang dapat diverifikasi atau ditolak.");
            }
            targets.add(target);
        }

        String at = Instant.now().toString();
        for (Map<String, Object> target : targets) {
            String targetCode = String.valueOf(target.get("code"));
            if ("Ditolak".equals(verif)) {
                jdbc.update("UPDATE reports SET verif = 'Ditolak', reject_reason = ? WHERE code = ?",
                        trimmed, targetCode);
                appendStatuses(target, List.of("Ditolak"), actor, at);
                logService.write(actor, "Tolak", targetCode, "Alasan: " + trimmed);
            } else {
                String penanganan = target.get("penanganan") == null
                        ? "Belum Ditangani" : String.valueOf(target.get("penanganan"));
                jdbc.update("UPDATE reports SET verif = 'Resmi', penanganan = ?, verified_by = ?, "
                                + "verified_at = ?, reject_reason = NULL WHERE code = ?",
                        penanganan, actor, Utility.now(), targetCode);
                appendStatuses(target, List.of("Resmi", penanganan), actor, at);
                logService.write(actor, "Verifikasi", targetCode, "Tertunda > Resmi");
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("count", targets.size());
        out.put("codes", codes);
        out.put("report", one(codes.get(0)));
        return out;
    }

    @PatchMapping("/{code}/penanganan")
    public Map<String, Object> penanganan(@PathVariable String code, @RequestBody Map<String, Object> body) {
        Map<String, Object> raw = raw(code);
        String status = Utility.text(body, "penanganan");
        if (status == null || !PENANGANAN_VALUES.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status penanganan tidak valid");
        }
        String actor = Utility.text(body, "actor", "Petugas");
        String role = roleOf(body, actor);
        requireWritable(raw, role, actor);
        if ("Case Closed".equals(status) && !"admin".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Laporan sudah ditutup; hanya admin yang dapat mengoreksi.");
        }
        if ("relawan".equals(role)
                && ("Case Closed".equals(status) || "Tidak Perlu Tindak Lanjut".equals(status))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Relawan tidak dapat menutup laporan atau menandai Tidak Perlu Tindak Lanjut.");
        }
        String old = oldValue(raw, "penanganan");
        if (status.equals(old)) {
            return one(code);
        }
        jdbc.update("UPDATE reports SET penanganan = ? WHERE code = ?", status, code);
        appendStatus(raw, status, actor);
        logService.write(actor, "Ubah status", code, old + " > " + status);
        return one(code);
    }

    @PatchMapping("/{code}/korban")
    public Map<String, Object> korban(@PathVariable String code, @RequestBody Map<String, Object> body) {
        Map<String, Object> raw = raw(code);
        String actor = Utility.text(body, "actor", "Petugas");
        String role = roleOf(body, actor);
        requireWritable(raw, role, actor);
        if (!STAFF_ROLES.contains(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Hanya petugas atau relawan yang dapat mengubah jumlah korban.");
        }

        Map<String, Integer> values = new LinkedHashMap<>();
        for (String field : KORBAN_ORDER) {
            values.put(field, Math.max(0, toInt(raw.get(field))));
        }
        List<Map<String, Object>> changes = new ArrayList<>();

        // Frontend mengirim { korban: {...}, history: [...] }; endpoint lama juga
        // menerima { field, value }.
        if (body.get("history") instanceof List<?> provided) {
            for (Object item : provided) {
                if (!(item instanceof Map<?, ?> m)) continue;
                String field = text(m, "field");
                if (field == null || !KORBAN_FIELDS.contains(field)) continue;
                int from = Math.max(0, toInt(m.get("from")));
                int to = Math.max(0, toInt(m.get("to")));
                if (from == to) continue;
                values.put(field, to);
                changes.add(change(m, field, from, to, actor));
            }
        } else if (body.get("korban") instanceof Map<?, ?> korban) {
            for (String field : KORBAN_ORDER) {
                Object requested = korban.get(field);
                if (requested == null) continue;
                int from = values.get(field);
                int to = Math.max(0, toInt(requested));
                if (from == to) continue;
                values.put(field, to);
                changes.add(change(Map.of(), field, from, to, actor));
            }
        } else {
            String field = Utility.text(body, "field");
            if (field == null || !KORBAN_FIELDS.contains(field)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Field korban tidak valid");
            }
            int from = values.get(field);
            int to = Math.max(0, Utility.number(body, "value", from));
            if (from == to) return one(code);
            values.put(field, to);
            changes.add(change(Map.of(), field, from, to, actor));
        }

        if (changes.isEmpty()) {
            return one(code);
        }
        List<Map<String, Object>> history = util.parseList(jsonColumn(raw, "korban_history"));
        history.addAll(changes);
        jdbc.update("UPDATE reports SET luka = ?, hilang = ?, meninggal = ?, mengungsi = ?, "
                        + "korban_history = ? WHERE code = ?",
                values.get("luka"), values.get("hilang"), values.get("meninggal"),
                values.get("mengungsi"), util.json(history), code);
        for (Map<String, Object> change : changes) {
            String field = String.valueOf(change.get("field"));
            int from = toInt(change.get("from"));
            int to = toInt(change.get("to"));
            logService.write(actor, role, "Ubah jumlah korban", code,
                    label(field) + " " + from + " > " + to);
        }
        return one(code);
    }

    /** Koreksi data laporan oleh admin, termasuk korban dan status. */
    @PatchMapping("/{code}/admin")
    public Map<String, Object> adminUpdate(@PathVariable String code, @RequestBody Map<String, Object> body) {
        String actor = Utility.text(body, "actor", "Admin");
        if (!"admin".equals(Utility.text(body, "actorRole"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Hanya admin yang dapat mengubah data laporan.");
        }
        requireActiveActor(actor, "admin");
        Map<String, Object> raw = raw(code);
        Map<String, Object> columns = new LinkedHashMap<>();
        List<String> changed = new ArrayList<>();

        for (String field : new String[] {"jenis", "prov", "kab", "kec", "kel", "alamat",
                "deskripsi", "pelapor", "hp"}) {
            adminText(body, raw, columns, changed, field,
                    "jenis".equals(field) || "kel".equals(field) || "pelapor".equals(field));
        }
        if (body.containsKey("foto")) {
            int foto = requireNonNegative(body.get("foto"), "foto");
            if (foto != Math.max(0, toInt(raw.get("foto")))) {
                columns.put("foto", foto);
                changed.add("foto");
            }
        }

        String verif = adminText(body, raw, columns, changed, "verif", true);
        if (verif != null && !VERIF_VALUES.contains(verif)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nilai verifikasi tidak valid");
        }
        String penanganan = adminText(body, raw, columns, changed, "penanganan", false);
        if (penanganan != null && !PENANGANAN_VALUES.contains(penanganan)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status penanganan tidak valid");
        }

        // Duplikat aktif tetap dilarang bila admin memindahkan jenis/kel laporan aktif.
        if (columns.containsKey("jenis") || columns.containsKey("kel")) {
            String newJenis = columns.containsKey("jenis")
                    ? String.valueOf(columns.get("jenis")) : oldValue(raw, "jenis");
            String newKel = columns.containsKey("kel")
                    ? String.valueOf(columns.get("kel")) : oldValue(raw, "kel");
            String effectiveVerif = columns.containsKey("verif")
                    ? String.valueOf(columns.get("verif")) : oldValue(raw, "verif");
            String effectivePenanganan = columns.containsKey("penanganan")
                    ? (columns.get("penanganan") == null ? null : String.valueOf(columns.get("penanganan")))
                    : (raw.get("penanganan") == null ? null : String.valueOf(raw.get("penanganan")));
            boolean active = "Tertunda".equals(effectiveVerif)
                    || ("Resmi".equals(effectiveVerif) && (effectivePenanganan == null
                    || !("Case Closed".equals(effectivePenanganan)
                    || "Tidak Perlu Tindak Lanjut".equals(effectivePenanganan))));
            if (active) {
                List<Map<String, Object>> dupes = jdbc.queryForList(
                        "SELECT code FROM reports WHERE code <> ? AND jenis = ? AND kel = ? AND "
                                + "(verif = 'Tertunda' OR (verif = 'Resmi' AND "
                                + "(penanganan IS NULL OR penanganan NOT IN "
                                + "('Case Closed', 'Tidak Perlu Tindak Lanjut')))) "
                                + "ORDER BY created_at DESC LIMIT 1",
                        code, newJenis, newKel);
                if (!dupes.isEmpty()) {
                    String duplicateCode = String.valueOf(dupes.get(0).get("code"));
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Sudah ada laporan aktif " + duplicateCode + " untuk jenis " + newJenis
                                    + " di Kel. " + newKel + ".");
                }
            }
        }

        Map<String, Integer> korbanValues = new LinkedHashMap<>();
        for (String field : KORBAN_ORDER) korbanValues.put(field, Math.max(0, toInt(raw.get(field))));
        List<Map<String, Object>> korbanChanges = new ArrayList<>();
        if (body.get("korban") instanceof Map<?, ?> korban) {
            for (Object key : korban.keySet()) {
                if (key == null || !KORBAN_FIELDS.contains(String.valueOf(key))) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Field korban tidak valid");
                }
            }
            for (String field : KORBAN_ORDER) {
                if (!korban.containsKey(field)) continue;
                int to = requireNonNegative(korban.get(field), "korban." + field);
                int from = korbanValues.get(field);
                if (from == to) continue;
                korbanValues.put(field, to);
                korbanChanges.add(change(Map.of(), field, from, to, actor));
                columns.put(field, to);
                changed.add("korban." + field);
            }
            if (!korbanChanges.isEmpty()) {
                List<Map<String, Object>> history = util.parseList(jsonColumn(raw, "korban_history"));
                history.addAll(korbanChanges);
                columns.put("korban_history", util.json(history));
            }
        }

        if (columns.isEmpty()) return one(code);

        StringBuilder sql = new StringBuilder("UPDATE reports SET ");
        List<Object> args = new ArrayList<>();
        for (Map.Entry<String, Object> entry : columns.entrySet()) {
            if (args.size() > 0) sql.append(", ");
            sql.append(entry.getKey()).append(" = ?");
            args.add(entry.getValue());
        }
        sql.append(" WHERE code = ?");
        args.add(code);
        jdbc.update(sql.toString(), args.toArray());

        List<String> statuses = new ArrayList<>();
        if (verif != null && columns.containsKey("verif")) statuses.add(verif);
        if (penanganan != null && columns.containsKey("penanganan")) statuses.add(penanganan);
        if (!statuses.isEmpty()) appendStatuses(raw, statuses, actor, Instant.now().toString());
        logService.write(actor, "Ubah data laporan", code, "Diubah: " + String.join(", ", changed));
        return one(code);
    }

    @PostMapping("/{code}/tutup")
    public Map<String, Object> tutup(@PathVariable String code, @RequestBody Map<String, Object> body) {
        Map<String, Object> raw = raw(code);
        String ringkasan = Utility.text(body, "ringkasan");
        String trimmed = ringkasan == null ? "" : ringkasan.trim();
        String current = String.valueOf(raw.get("penanganan"));
        if (!"Selesai Ditangani".equals(current) && !"Tidak Perlu Tindak Lanjut".equals(current)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Laporan harus berstatus Selesai Ditangani atau Tidak Perlu Tindak Lanjut untuk ditutup.");
        }
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ringkasan wajib diisi sebelum menutup laporan.");
        }
        if (trimmed.length() < 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ringkasan minimal 30 karakter (sekarang " + trimmed.length() + ").");
        }
        String actor = Utility.text(body, "actor", "Petugas");
        String role = roleOf(body, actor);
        requireActiveActor(actor, role);
        if (!"petugas".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Hanya petugas aktif yang dapat menutup laporan.");
        }
        jdbc.update("UPDATE reports SET penanganan = 'Case Closed', closed_by = ?, closed_at = ?, "
                        + "ringkasan = ? WHERE code = ?",
                actor, Utility.now(), trimmed, code);
        appendStatus(raw, "Case Closed", actor);
        logService.write(actor, "Tutup laporan", code, current + " > Case Closed");
        return one(code);
    }

    // ---------- helper ----------

    private String adminText(Map<String, Object> body, Map<String, Object> raw,
                             Map<String, Object> columns, List<String> changed,
                             String field, boolean required) {
        String current = raw.get(field) == null ? null : String.valueOf(raw.get(field));
        if (!body.containsKey(field)) return current;
        String value = Utility.text(body, field);
        if (value == null || value.isBlank()) {
            if (required) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Field " + field + " wajib diisi");
            }
            value = null;
        }
        if (!Objects.equals(current, value)) {
            columns.put(field, value);
            changed.add(field);
        }
        return value;
    }

    private static int requireNonNegative(Object value, String field) {
        int parsed;
        if (value instanceof Number n) {
            parsed = n.intValue();
        } else {
            try {
                parsed = Integer.parseInt(String.valueOf(value));
            } catch (NumberFormatException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Nilai " + field + " harus bilangan bulat");
            }
        }
        if (parsed < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Nilai " + field + " tidak boleh negatif");
        }
        return parsed;
    }

    private void addLike(StringBuilder sql, MapSqlParameterSource params, String column, String value) {
        if (value != null && !value.isBlank()) {
            sql.append(" AND ").append(column).append(" LIKE :").append(column);
            params.addValue(column, "%" + value.trim() + "%");
        }
    }

    private int count(String sql) {
        Integer value = jdbc.queryForObject(sql, Integer.class);
        return value == null ? 0 : value;
    }

    private Map<String, Object> raw(String code) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM reports WHERE code = ?", code);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Laporan " + code + " tidak ditemukan");
        }
        return rows.get(0);
    }

    private Map<String, Object> one(String code) {
        return util.normalize(raw(code));
    }

    private String jsonColumn(Map<String, Object> row, String key) {
        Object value = row.get(key);
        if (value == null) return "[]";
        if (value instanceof byte[] bytes) return new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        return String.valueOf(value);
    }

    private void appendStatus(Map<String, Object> raw, String status, String actor) {
        appendStatuses(raw, List.of(status), actor, Instant.now().toString());
    }

    private void appendStatuses(Map<String, Object> raw, List<String> statuses, String actor, String at) {
        List<Map<String, Object>> history = util.parseList(jsonColumn(raw, "status_history"));
        for (String status : statuses) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("at", at);
            item.put("status", status);
            item.put("by", actor);
            history.add(item);
        }
        jdbc.update("UPDATE reports SET status_history = ? WHERE code = ?",
                util.json(history), raw.get("code"));
    }

    private String oldValue(Map<String, Object> raw, String key) {
        Object value = raw.get(key);
        return value == null ? "-" : String.valueOf(value);
    }

    private static int toInt(Object value) {
        if (value instanceof Number n) return n.intValue();
        if (value == null) return 0;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String text(Map<?, ?> map, String key) {
        Object value = map.get(key);
        if (value == null) return null;
        String out = String.valueOf(value);
        return out.isBlank() ? null : out;
    }

    private static Map<String, Object> change(Map<?, ?> source, String field,
                                              int from, int to, String actor) {
        Map<String, Object> out = new LinkedHashMap<>();
        Object at = source.get("at");
        out.put("at", at == null ? Instant.now().toString() : String.valueOf(at));
        Object by = source.get("by");
        out.put("by", by == null || String.valueOf(by).isBlank() ? actor : String.valueOf(by));
        out.put("field", field);
        out.put("from", from);
        out.put("to", to);
        return out;
    }

    private String label(String field) {
        return switch (field) {
            case "luka" -> "Luka-luka";
            case "hilang" -> "Hilang";
            case "meninggal" -> "Meninggal Dunia";
            default -> "Mengungsi/Selamat";
        };
    }

    private String roleOf(Map<String, Object> body, String actor) {
        String role = Utility.text(body, "actorRole");
        if (role == null || role.isBlank()) role = Utility.text(body, "role");
        return role == null || role.isBlank() ? inferRole(actor) : role;
    }

    private String inferRole(String actor) {
        if (actor == null || actor.isBlank() || "Sistem".equals(actor) || "Anonim".equals(actor)) {
            return "warga";
        }
        List<String> roles = jdbc.query("SELECT role FROM users WHERE nama = ? LIMIT 1",
                (rs, i) -> rs.getString(1), actor);
        return roles.isEmpty() ? "warga" : roles.get(0);
    }

    private Map<String, Object> userByName(String actor) {
        if (actor == null || actor.isBlank()) return null;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM users WHERE nama = ? LIMIT 1", actor);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void requireActiveActor(String actor, String role) {
        Map<String, Object> user = userByName(actor);
        if (user != null && !Boolean.TRUE.equals(user.get("aktif"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Akun tidak aktif.");
        }
    }

    /** Case Closed terkunci untuk semua peran kecuali admin (koreksi). */
    private void requireWritable(Map<String, Object> raw, String role, String actor) {
        if ("Case Closed".equals(String.valueOf(raw.get("penanganan"))) && !"admin".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Laporan sudah ditutup; hanya admin yang dapat mengoreksi.");
        }
        requireActiveActor(actor, role);
        if ("Ditolak".equals(String.valueOf(raw.get("verif"))) && !"admin".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Laporan ditolak tidak dapat diubah.");
        }
    }
}
