package com.bpbd.appb.web;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Konfigurasi web yang dipersistenkan di tabel settings. Kunci disimpan dengan
 * awalan "theme." di database; API memakai kunci tanpa awalan di dalam objek
 * theme. Kata sandi database sengaja tidak pernah dimasukkan ke respons.
 */
@RestController
public class SettingsController {

    private static final String PREFIX = "theme.";
    private static final String HEX_PATTERN = "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$";
    private static final int MAX_TEXT_VALUE = 128;

    /** Daftar putih + urutan respons + nilai fallback bila seed belum dijalankan. */
    private static final Map<String, String> THEME_DEFAULTS = themeDefaults();

    private final JdbcTemplate jdbc;
    private final LogService logService;
    private final String dbName;
    private final String dbHost;
    private final String dbPort;
    private final String dbUser;

    public SettingsController(JdbcTemplate jdbc, LogService logService,
                              @Value("${DB_NAME:appb_db}") String dbName,
                              @Value("${DB_HOST:127.0.0.1}") String dbHost,
                              @Value("${DB_PORT:5432}") String dbPort,
                              @Value("${DB_USER:appb}") String dbUser) {
        this.jdbc = jdbc;
        this.logService = logService;
        this.dbName = dbName;
        this.dbHost = dbHost;
        this.dbPort = dbPort;
        this.dbUser = dbUser;
    }

    @GetMapping("/api/settings")
    public Map<String, Object> settings() {
        return fullSettings();
    }

    /** Informasi koneksi database saja (read-only, tanpa kata sandi). */
    @GetMapping("/api/config/db")
    public Map<String, Object> dbConfig() {
        return dbInfo();
    }

    @PatchMapping("/api/settings")
    public Map<String, Object> update(@RequestBody Map<String, Object> body) {
        Object rawTheme = body == null ? null : body.get("theme");
        if (!(rawTheme instanceof Map<?, ?> theme)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Objek theme wajib diisi");
        }

        List<Object[]> upserts = new ArrayList<>();
        List<String> changes = new ArrayList<>();
        for (Map.Entry<?, ?> entry : theme.entrySet()) {
            String key = entry.getKey() == null ? "" : String.valueOf(entry.getKey());
            if (!THEME_DEFAULTS.containsKey(key)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Kunci tema tidak dikenal: " + key);
            }
            String value = entry.getValue() == null ? null : String.valueOf(entry.getValue());
            if (key.startsWith("color-")) {
                if (value == null || !value.matches(HEX_PATTERN)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Nilai " + key + " harus warna hex #rgb atau #rrggbb");
                }
            } else if (value == null || value.isBlank() || value.length() > MAX_TEXT_VALUE) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Nilai " + key + " wajib berupa teks pendek yang tidak kosong (maks. "
                                + MAX_TEXT_VALUE + " karakter)");
            }
            upserts.add(new Object[] {PREFIX + key, value});
            changes.add(key + ": " + THEME_DEFAULTS.get(key) + " > " + value);
        }

        if (!upserts.isEmpty()) {
            for (Object[] row : upserts) {
                int updated = jdbc.update("UPDATE settings SET value = ? WHERE \"key\" = ?",
                        row[1], row[0]);
                if (updated == 0) {
                    jdbc.update("INSERT INTO settings (\"key\", value) VALUES (?, ?)",
                            row[0], row[1]);
                }
            }
            logService.write(Utility.text(body, "actor", "Admin"), "Ubah warna tema", null,
                    String.join(", ", changes));
        }
        return fullSettings();
    }

    /** Bentuk lengkap yang juga dipakai oleh /api/snapshot. */
    public Map<String, Object> fullSettings() {
        Map<String, String> theme = new LinkedHashMap<>(THEME_DEFAULTS);
        for (Map<String, Object> row : jdbc.queryForList("SELECT \"key\", value FROM settings")) {
            String key = asText(row.get("key"));
            if (!key.startsWith(PREFIX)) continue;
            String shortKey = key.substring(PREFIX.length());
            if (THEME_DEFAULTS.containsKey(shortKey)) {
                theme.put(shortKey, asText(row.get("value")));
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("theme", theme);
        out.put("db", dbInfo());
        return out;
    }

    public Map<String, Object> dbInfo() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", "postgresql");
        out.put("name", dbName + " (branch ken)");
        out.put("host", dbHost);
        out.put("port", dbPort);
        out.put("user", dbUser);
        return out;
    }

    private static String asText(Object value) {
        if (value == null) return "";
        if (value instanceof byte[] bytes) return new String(bytes, StandardCharsets.UTF_8);
        return String.valueOf(value);
    }

    private static Map<String, String> themeDefaults() {
        Map<String, String> out = new LinkedHashMap<>();
        out.put("color-ink", "#0f172a");
        out.put("color-ink2", "#475569");
        out.put("color-mute", "#94a3b8");
        out.put("color-line", "#e2e8f0");
        out.put("color-app", "#f8fafc");
        out.put("color-navy", "#1e3a8a");
        out.put("color-navyh", "#1e40af");
        out.put("color-crit", "#b91c1c");
        out.put("color-crit-t", "#fef2f2");
        out.put("color-warn", "#b45309");
        out.put("color-warn-t", "#fffbeb");
        out.put("color-ok", "#15803d");
        out.put("color-ok-t", "#f0fdf4");
        out.put("color-info", "#1d4ed8");
        out.put("color-info-t", "#eff6ff");
        out.put("font-sans", "'Inter', system-ui, sans-serif");
        out.put("radius-sm", "4px");
        out.put("radius-md", "6px");
        out.put("radius-lg", "8px");
        return out;
    }
}
