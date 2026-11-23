package com.bpbd.appb.web;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api")
public class MiscController {

    private final JdbcTemplate jdbc;
    private final Utility util;
    private final LogService logService;

    public MiscController(JdbcTemplate jdbc, Utility util, LogService logService) {
        this.jdbc = jdbc;
        this.util = util;
        this.logService = logService;
    }

    @GetMapping("/logs")
    public List<Map<String, Object>> logs(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String role,
            @RequestParam(defaultValue = "100") int limit) {
        String sql = "SELECT * FROM logs WHERE 1 = 1"
                + (code == null || code.isBlank() ? "" : " AND code = ?")
                + (role == null || role.isBlank() ? "" : " AND role = ?")
                + " ORDER BY at DESC LIMIT " + Math.max(1, Math.min(limit, 500));
        List<Object> args = new java.util.ArrayList<>();
        if (code != null && !code.isBlank()) args.add(code);
        if (role != null && !role.isBlank()) args.add(role);
        return util.normalizeAll(jdbc.queryForList(sql, args.toArray()));
    }

    @GetMapping("/bantuan")
    public List<Map<String, Object>> bantuan(@RequestParam(required = false) String kab,
                                             @RequestParam(required = false) String code) {
        String sql = "SELECT * FROM bantuan WHERE 1 = 1"
                + (kab == null || kab.isBlank() ? "" : " AND kab = ?")
                + (code == null || code.isBlank() ? "" : " AND code = ?")
                + " ORDER BY at DESC";
        List<Object> args = new java.util.ArrayList<>();
        if (kab != null && !kab.isBlank()) args.add(kab);
        if (code != null && !code.isBlank()) args.add(code);
        return util.normalizeAll(jdbc.queryForList(sql, args.toArray()));
    }

    @PostMapping("/bantuan")
    public Map<String, Object> addBantuan(@RequestBody Map<String, Object> body) {
        String sumber = Utility.text(body, "sumber");
        String jenis = Utility.text(body, "jenis");
        String kab = Utility.text(body, "kab");
        if (sumber == null || sumber.isBlank() || jenis == null || jenis.isBlank() || kab == null || kab.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sumber, jenis, dan kabupaten wajib diisi");
        }
        String id = Utility.uid();
        jdbc.update("INSERT INTO bantuan (id, sumber, jenis, jumlah, satuan, kab, code, at, by_user) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, sumber, jenis, Double.parseDouble(String.valueOf(Utility.number(body, "jumlah", 0))),
                Utility.text(body, "satuan", "unit"), kab, Utility.text(body, "code"),
                Utility.now(), Utility.text(body, "by", "Admin"));
        return util.normalize(jdbc.queryForList("SELECT * FROM bantuan WHERE id = ?", id).get(0));
    }

    @PatchMapping("/bantuan/{id}")
    public Map<String, Object> updateBantuan(@PathVariable String id, @RequestBody Map<String, Object> body) {
        List<Map<String, Object>> existing = jdbc.queryForList("SELECT * FROM bantuan WHERE id = ?", id);
        if (existing.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bantuan tidak ditemukan");
        }
        Map<String, Object> row = existing.get(0);
        String sumber = merged(body, row, "sumber", "sumber");
        String jenis = merged(body, row, "jenis", "jenis");
        String kab = merged(body, row, "kab", "kab");
        if (isBlank(sumber) || isBlank(jenis) || isBlank(kab)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sumber, jenis, dan kabupaten wajib diisi");
        }
        double jumlah = body.containsKey("jumlah")
                ? Double.parseDouble(String.valueOf(Utility.number(body, "jumlah", 0)))
                : toDouble(row.get("jumlah"), 0);
        String satuan = merged(body, row, "satuan", "satuan");
        if (isBlank(satuan)) satuan = "unit";
        jdbc.update("UPDATE bantuan SET sumber = ?, jenis = ?, jumlah = ?, satuan = ?, kab = ?, code = ? "
                        + "WHERE id = ?",
                sumber, jenis, jumlah, satuan, kab, merged(body, row, "code", "code"), id);
        logService.write(Utility.text(body, "actor", "Admin"), "Ubah bantuan", null,
                "Bantuan id: " + id + " — " + jenis + " (" + kab + ")");
        return util.normalize(jdbc.queryForList("SELECT * FROM bantuan WHERE id = ?", id).get(0));
    }

    @DeleteMapping("/bantuan/{id}")
    public Map<String, Object> removeBantuan(@PathVariable String id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT jenis, kab FROM bantuan WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bantuan tidak ditemukan");
        }
        jdbc.update("DELETE FROM bantuan WHERE id = ?", id);
        logService.write("Admin", "Hapus bantuan", null,
                "Bantuan id: " + id + " — " + String.valueOf(rows.get(0).get("jenis"))
                        + " (" + String.valueOf(rows.get(0).get("kab")) + ")");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        return out;
    }

    @GetMapping("/historis")
    public List<Map<String, Object>> historis(@RequestParam(required = false) String jenis,
                                              @RequestParam(required = false) String kab) {
        String sql = "SELECT * FROM historis WHERE 1 = 1"
                + (jenis == null || jenis.isBlank() ? "" : " AND jenis = ?")
                + (kab == null || kab.isBlank() ? "" : " AND kab = ?")
                + " ORDER BY tanggal DESC";
        List<Object> args = new java.util.ArrayList<>();
        if (jenis != null && !jenis.isBlank()) args.add(jenis);
        if (kab != null && !kab.isBlank()) args.add(kab);
        return util.normalizeAll(jdbc.queryForList(sql, args.toArray()));
    }

    @PostMapping("/historis")
    public Map<String, Object> addHistoris(@RequestBody Map<String, Object> body) {
        String jenis = Utility.text(body, "jenis");
        String prov = Utility.text(body, "prov");
        String kab = Utility.text(body, "kab");
        String tanggal = Utility.text(body, "tanggal");
        if (jenis == null || jenis.isBlank() || prov == null || prov.isBlank()
                || kab == null || kab.isBlank() || tanggal == null || tanggal.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Jenis, provinsi, kabupaten, dan tanggal wajib diisi");
        }
        String id = Utility.uid();
        jdbc.update("INSERT INTO historis (id, jenis, prov, kab, tanggal, meninggal, mengungsi, rumah_rusak, sumber) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, jenis, prov, kab, tanggal,
                Utility.number(body, "meninggal", 0), Utility.number(body, "mengungsi", 0),
                Utility.number(body, "rumahRusak", 0), Utility.text(body, "sumber"));
        return util.normalize(jdbc.queryForList("SELECT * FROM historis WHERE id = ?", id).get(0));
    }

    @PatchMapping("/historis/{id}")
    public Map<String, Object> updateHistoris(@PathVariable String id, @RequestBody Map<String, Object> body) {
        List<Map<String, Object>> existing = jdbc.queryForList("SELECT * FROM historis WHERE id = ?", id);
        if (existing.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Data historis tidak ditemukan");
        }
        Map<String, Object> row = existing.get(0);
        String jenis = merged(body, row, "jenis", "jenis");
        String prov = merged(body, row, "prov", "prov");
        String kab = merged(body, row, "kab", "kab");
        String tanggal = merged(body, row, "tanggal", "tanggal");
        if (isBlank(jenis) || isBlank(prov) || isBlank(kab) || isBlank(tanggal)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Jenis, provinsi, kabupaten, dan tanggal wajib diisi");
        }
        jdbc.update("UPDATE historis SET jenis = ?, prov = ?, kab = ?, tanggal = ?, meninggal = ?, "
                        + "mengungsi = ?, rumah_rusak = ?, sumber = ? WHERE id = ?",
                jenis, prov, kab, tanggal,
                numberOrExisting(body, row, "meninggal", "meninggal"),
                numberOrExisting(body, row, "mengungsi", "mengungsi"),
                numberOrExisting(body, row, "rumahRusak", "rumah_rusak"),
                merged(body, row, "sumber", "sumber"), id);
        logService.write(Utility.text(body, "actor", "Admin"), "Ubah historis", null,
                "Historis id: " + id + " — " + jenis + " (" + kab + ", " + tanggal + ")");
        return util.normalize(jdbc.queryForList("SELECT * FROM historis WHERE id = ?", id).get(0));
    }

    @DeleteMapping("/historis/{id}")
    public Map<String, Object> removeHistoris(@PathVariable String id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT jenis, kab FROM historis WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Data historis tidak ditemukan");
        }
        jdbc.update("DELETE FROM historis WHERE id = ?", id);
        logService.write("Admin", "Hapus historis", null,
                "Historis id: " + id + " — " + String.valueOf(rows.get(0).get("jenis"))
                        + " (" + String.valueOf(rows.get(0).get("kab")) + ")");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        return out;
    }

    private static String merged(Map<String, Object> body, Map<String, Object> row,
                                 String bodyKey, String column) {
        if (body.containsKey(bodyKey)) return Utility.text(body, bodyKey);
        Object value = row.get(column);
        return value == null ? null : String.valueOf(value);
    }

    private static int numberOrExisting(Map<String, Object> body, Map<String, Object> row,
                                        String bodyKey, String column) {
        if (body.containsKey(bodyKey)) return Utility.number(body, bodyKey, 0);
        Object value = row.get(column);
        if (value instanceof Number n) return n.intValue();
        if (value == null) return 0;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static double toDouble(Object value, double fallback) {
        if (value instanceof Number n) return n.doubleValue();
        if (value == null) return fallback;
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    @GetMapping("/imports")
    public List<Map<String, Object>> imports() {
        return util.normalizeAll(jdbc.queryForList("SELECT * FROM imports ORDER BY at DESC"));
    }

    @PostMapping("/imports")
    public Map<String, Object> addImport(@RequestBody Map<String, Object> body) {
        String file = Utility.text(body, "file");
        if (file == null || file.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nama file wajib diisi");
        }
        jdbc.update("INSERT INTO imports (at, file, jenis, berhasil, gagal, by_user) VALUES (?, ?, ?, ?, ?, ?)",
                Instant.now().toString(), file, Utility.text(body, "jenis", "wilayah"),
                Utility.number(body, "berhasil", 0), Utility.number(body, "gagal", 0),
                Utility.text(body, "by", "Admin"));
        logService.write(Utility.text(body, "by", "Admin"), "Import data master", null,
                file + " — " + Utility.number(body, "berhasil", 0) + " berhasil, "
                        + Utility.number(body, "gagal", 0) + " gagal");
        Map<String, Object> out = util.normalize(jdbc.queryForList(
                "SELECT * FROM imports ORDER BY id DESC LIMIT 1").get(0));
        return out;
    }
}
