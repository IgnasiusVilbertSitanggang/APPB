package com.bpbd.appb.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
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
@RequestMapping("/api/announcements")
public class AnnouncementController {

    private static final List<String> SEVERITY = List.of("Peringatan", "Imbauan", "Evakuasi", "Informasi");

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;
    private final Utility util;
    private final LogService logService;

    public AnnouncementController(JdbcTemplate jdbc, NamedParameterJdbcTemplate namedJdbc,
                                  Utility util, LogService logService) {
        this.jdbc = jdbc;
        this.namedJdbc = namedJdbc;
        this.util = util;
        this.logService = logService;
    }

    @GetMapping
    public List<Map<String, Object>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String jenis,
            @RequestParam(required = false) String prov,
            @RequestParam(required = false) String kab,
            @RequestParam(required = false) String kec,
            @RequestParam(required = false) String kel,
            @RequestParam(defaultValue = "100") int limit) {

        StringBuilder sql = new StringBuilder("SELECT * FROM announcements WHERE 1 = 1");
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (q != null && !q.isBlank()) {
            sql.append(" AND (title LIKE :q OR body LIKE :q)");
            params.addValue("q", "%" + q.trim() + "%");
        }
        if (severity != null && !severity.isBlank()) {
            sql.append(" AND severity = :severity");
            params.addValue("severity", severity);
        }
        for (String[] f : new String[][] {{"jenis", jenis}, {"prov", prov}, {"kab", kab}, {"kec", kec}, {"kel", kel}}) {
            if (f[1] != null && !f[1].isBlank()) {
                sql.append(" AND ").append(f[0]).append(" = :").append(f[0]);
                params.addValue(f[0], f[1]);
            }
        }
        sql.append(" ORDER BY at DESC LIMIT ").append(Math.max(1, Math.min(limit, 500)));
        return util.normalizeAll(namedJdbc.queryForList(sql.toString(), params));
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String title = Utility.text(body, "title");
        String text = Utility.text(body, "body");
        String severity = Utility.text(body, "severity");
        String jenis = Utility.text(body, "jenis");
        if (title == null || title.isBlank() || text == null || text.isBlank()
                || severity == null || !SEVERITY.contains(severity)
                || jenis == null || jenis.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Judul, isi, severity, dan jenis pengumuman wajib diisi dengan benar");
        }
        String id = Utility.uid();
        String by = Utility.text(body, "by", "Petugas");
        jdbc.update("INSERT INTO announcements (id, title, body, severity, jenis, prov, kab, kec, kel, "
                        + "report_code, at, by_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, title, text, severity, jenis,
                Utility.text(body, "prov"), Utility.text(body, "kab"),
                Utility.text(body, "kec"), Utility.text(body, "kel"),
                Utility.text(body, "reportCode"), Utility.now(), by);
        logService.write(by, "Terbitkan pengumuman", Utility.text(body, "reportCode"), severity + ": " + title);
        return util.normalize(jdbc.queryForList("SELECT * FROM announcements WHERE id = ?", id).get(0));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        List<Map<String, Object>> existing = jdbc.queryForList("SELECT * FROM announcements WHERE id = ?", id);
        if (existing.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pengumuman tidak ditemukan");
        }
        Map<String, Object> row = existing.get(0);
        String title = merged(body, row, "title", "title");
        String text = merged(body, row, "body", "body");
        String severity = merged(body, row, "severity", "severity");
        String jenis = merged(body, row, "jenis", "jenis");
        if (isBlank(title) || isBlank(text) || severity == null || !SEVERITY.contains(severity)
                || isBlank(jenis)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Judul, isi, severity, dan jenis pengumuman wajib diisi dengan benar");
        }
        String reportCode = merged(body, row, "reportCode", "report_code");
        if (isBlank(reportCode)) reportCode = null;
        jdbc.update("UPDATE announcements SET title = ?, body = ?, severity = ?, jenis = ?, "
                        + "prov = ?, kab = ?, kec = ?, kel = ?, report_code = ? WHERE id = ?",
                title, text, severity, jenis,
                merged(body, row, "prov", "prov"), merged(body, row, "kab", "kab"),
                merged(body, row, "kec", "kec"), merged(body, row, "kel", "kel"),
                reportCode, id);
        String actor = Utility.text(body, "actor");
        if (isBlank(actor)) actor = row.get("by_user") == null ? "Petugas" : String.valueOf(row.get("by_user"));
        logService.write(actor, "Ubah pengumuman", reportCode, severity + ": " + title + " (id: " + id + ")");
        return util.normalize(jdbc.queryForList("SELECT * FROM announcements WHERE id = ?", id).get(0));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> remove(@PathVariable String id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT title, report_code FROM announcements WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pengumuman tidak ditemukan");
        }
        Map<String, Object> row = rows.get(0);
        jdbc.update("DELETE FROM announcements WHERE id = ?", id);
        logService.write("Admin", "Hapus pengumuman",
                row.get("report_code") == null ? null : String.valueOf(row.get("report_code")),
                "Pengumuman id: " + id + " — " + String.valueOf(row.get("title")));
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

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
