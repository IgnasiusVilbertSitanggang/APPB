package com.bpbd.appb.web;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Snapshot lengkap menyerupai objek DB di src/data/store.ts.
 * Frontend 1:1 memakai respons ini sekali saat boot, lalu menyimpan sesi/device
 * secara lokal seperti mockup aslinya.
 */
@RestController
@RequestMapping("/api")
public class SnapshotController {

    private static final String REPORT_ORDER = """
            ORDER BY
              CASE WHEN id ~ '^r[0-9]+$' THEN 0 ELSE 1 END,
              CASE WHEN id ~ '^r[0-9]+$' THEN CAST(SUBSTRING(id, 2) AS BIGINT) ELSE 0 END,
              created_at DESC, id
            """;

    private final JdbcTemplate jdbc;
    private final Utility util;
    private final SettingsController settingsController;

    public SnapshotController(JdbcTemplate jdbc, Utility util, SettingsController settingsController) {
        this.jdbc = jdbc;
        this.util = util;
        this.settingsController = settingsController;
    }

    @GetMapping("/snapshot")
    public Map<String, Object> snapshot() {
        Map<String, Object> out = new LinkedHashMap<>();

        out.put("reports", util.normalizeAll(jdbc.queryForList("SELECT * FROM reports " + REPORT_ORDER)));
        out.put("users", util.normalizeAll(jdbc.queryForList("SELECT * FROM users ORDER BY id")));
        out.put("categories", util.normalizeAll(jdbc.queryForList(
                "SELECT * FROM kategori ORDER BY CAST(SUBSTRING(id, 2) AS BIGINT)")));
        out.put("announcements", util.normalizeAll(jdbc.queryForList("SELECT * FROM announcements ORDER BY id")));
        out.put("logs", util.normalizeAll(jdbc.queryForList("SELECT * FROM logs ORDER BY at DESC, id")));
        out.put("bantuan", util.normalizeAll(jdbc.queryForList("SELECT * FROM bantuan ORDER BY id")));
        out.put("historis", util.normalizeAll(jdbc.queryForList("SELECT * FROM historis ORDER BY id")));
        out.put("imports", util.normalizeAll(jdbc.queryForList("SELECT * FROM imports ORDER BY at DESC")));
        out.put("settings", settingsController.fullSettings());

        Map<String, Object> session = new LinkedHashMap<>();
        session.put("role", "warga");
        out.put("session", session);

        Integer next = jdbc.queryForObject(
                "SELECT value FROM sequences WHERE name = 'report_code'", Integer.class);
        out.put("nextCode", next == null ? 140 : next);
        return out;
    }
}
