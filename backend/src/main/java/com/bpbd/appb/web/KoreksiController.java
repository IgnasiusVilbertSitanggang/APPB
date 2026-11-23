package com.bpbd.appb.web;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Koreksi admin untuk laporan yang sudah Case Closed. Peran lain tetap terkunci.
 */
@RestController
public class KoreksiController {

    private static final Set<String> PENANGANAN_VALUES = Set.of(
            "Belum Ditangani", "Sedang Ditangani", "Selesai Ditangani",
            "Tidak Perlu Tindak Lanjut", "Case Closed");
    private static final List<String> KORBAN_FIELDS = List.of("luka", "hilang", "meninggal", "mengungsi");

    private final JdbcTemplate jdbc;
    private final Utility util;
    private final LogService logService;

    public KoreksiController(JdbcTemplate jdbc, Utility util, LogService logService) {
        this.jdbc = jdbc;
        this.util = util;
        this.logService = logService;
    }

    @PostMapping("/api/koreksi")
    public Map<String, Object> koreksi(@RequestBody Map<String, Object> body) {
        String code = Utility.text(body, "code");
        if (code == null || code.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Kode laporan wajib diisi");
        }
        String actor = Utility.text(body, "actor", "Admin");
        String role = Utility.text(body, "actorRole", Utility.text(body, "role", inferRole(actor)));
        if (!"admin".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Hanya admin yang dapat mengoreksi laporan yang sudah ditutup.");
        }
        List<Map<String, Object>> users = jdbc.queryForList(
                "SELECT aktif FROM users WHERE nama = ? LIMIT 1", actor);
        if (!users.isEmpty() && !Boolean.TRUE.equals(users.get(0).get("aktif"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Akun tidak aktif.");
        }
        String alasan = Utility.text(body, "alasan");
        String trimmedAlasan = alasan == null ? "" : alasan.trim();
        if (trimmedAlasan.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Alasan koreksi wajib diisi.");
        }
        if (trimmedAlasan.length() < 15) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Alasan koreksi minimal 15 karakter (sekarang " + trimmedAlasan.length() + ").");
        }

        Map<String, Object> raw = raw(code);
        if (!"Case Closed".equals(String.valueOf(raw.get("penanganan")))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Hanya laporan Case Closed yang dapat dikoreksi.");
        }
        String status = Utility.text(body, "status");
        if (status == null || !PENANGANAN_VALUES.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status penanganan tidak valid");
        }

        String currentStatus = String.valueOf(raw.get("penanganan"));
        Map<?, ?> korban = body.get("korban") instanceof Map<?, ?> m ? m : Map.of();
        List<String> diffs = new ArrayList<>();
        List<Object> values = new ArrayList<>();
        for (String field : KORBAN_FIELDS) {
            int from = raw.get(field) instanceof Number n ? n.intValue() : 0;
            Object requested = korban.get(field);
            int to = requested instanceof Number n ? n.intValue() : from;
            if (to != from) {
                diffs.add(label(field) + " " + from + " > " + to);
            }
            values.add(to);
        }
        if (!status.equals(currentStatus)) {
            diffs.add("Status " + currentStatus + " > " + status);
        }
        String currentRingkasan = raw.get("ringkasan") == null ? "" : String.valueOf(raw.get("ringkasan"));
        String ringkasan = Utility.text(body, "ringkasan", currentRingkasan).trim();
        if (!ringkasan.equals(currentRingkasan)) {
            diffs.add("Ringkasan diubah");
        }
        if (diffs.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tidak ada perubahan data untuk dikoreksi.");
        }

        String historyJson = null;
        if (!status.equals(currentStatus)) {
            List<Map<String, Object>> history = util.parseList(jsonColumn(raw, "status_history"));
            Map<String, Object> change = new LinkedHashMap<>();
            change.put("at", Instant.now().toString());
            change.put("status", status);
            change.put("by", "Admin");
            history.add(change);
            historyJson = util.json(history);
        }
        // Laporan tetap Case Closed; status yang dipilih admin hanya tercatat di
        // statusHistory, menyerupai patchReport() di store.ts.
        jdbc.update("UPDATE reports SET luka = ?, hilang = ?, meninggal = ?, mengungsi = ?, "
                        + "ringkasan = ?, status_history = COALESCE(?, status_history) WHERE code = ?",
                values.get(0), values.get(1), values.get(2), values.get(3),
                ringkasan, historyJson, code);

        String detail = String.join("; ", diffs) + ". Alasan: " + trimmedAlasan;
        logService.write(actor, "admin", "Koreksi laporan", code, detail);
        return util.normalize(raw(code));
    }

    private Map<String, Object> raw(String code) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM reports WHERE code = ?", code);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Laporan " + code + " tidak ditemukan");
        }
        return rows.get(0);
    }

    private String jsonColumn(Map<String, Object> row, String key) {
        Object value = row.get(key);
        if (value == null) return "[]";
        if (value instanceof byte[] bytes) return new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        return String.valueOf(value);
    }

    private String inferRole(String actor) {
        if (actor == null || actor.isBlank() || "Sistem".equals(actor) || "Anonim".equals(actor)) {
            return "warga";
        }
        List<String> roles = jdbc.query("SELECT role FROM users WHERE nama = ? LIMIT 1",
                (rs, i) -> rs.getString(1), actor);
        return roles.isEmpty() ? "warga" : roles.get(0);
    }

    private String label(String field) {
        return switch (field) {
            case "luka" -> "Luka-luka";
            case "hilang" -> "Hilang";
            case "meninggal" -> "Meninggal Dunia";
            default -> "Mengungsi/Selamat";
        };
    }
}
