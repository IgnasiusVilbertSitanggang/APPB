package com.bpbd.appb.web;

import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class LogService {

    private static final Set<String> ROLES = Set.of("warga", "petugas", "relawan", "admin", "sistem");

    private final JdbcTemplate jdbc;

    public LogService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void write(String actor, String aksi, String code, String detail) {
        String safeActor = actor == null || actor.isBlank() ? "Sistem" : actor;
        List<String> roles = jdbc.query(
                "SELECT role FROM users WHERE nama = ? LIMIT 1",
                (rs, i) -> rs.getString(1), safeActor);
        write(safeActor, roles.isEmpty() ? "sistem" : roles.get(0), aksi, code, detail);
    }

    /** Tulis log dengan peran yang diberikan caller (dipakai endpoint catatan). */
    public void write(String actor, String role, String aksi, String code, String detail) {
        String safeActor = actor == null || actor.isBlank() ? "Sistem" : actor;
        String safeRole = role == null || role.isBlank() || !ROLES.contains(role) ? "sistem" : role;
        jdbc.update(
                "INSERT INTO logs (id, at, actor, role, aksi, code, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
                Utility.uid(), Utility.now(), safeActor, safeRole, aksi, code, detail);
    }
}
