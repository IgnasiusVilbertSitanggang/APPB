package com.bpbd.appb.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
public class UserController {

    private static final Set<String> ROLES = Set.of("petugas", "relawan", "admin");

    private final JdbcTemplate jdbc;
    private final Utility util;
    private final LogService logService;
    private final PasswordService passwords;

    public UserController(JdbcTemplate jdbc, Utility util, LogService logService,
                          PasswordService passwords) {
        this.jdbc = jdbc;
        this.util = util;
        this.logService = logService;
        this.passwords = passwords;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> list(@RequestParam(required = false) String role) {
        if (role != null && !role.isBlank()) {
            return util.normalizeAll(jdbc.queryForList("SELECT * FROM users WHERE role = ? ORDER BY nama", role));
        }
        return util.normalizeAll(jdbc.queryForList("SELECT * FROM users ORDER BY role, nama"));
    }

    @PostMapping("/users")
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String nama = Utility.text(body, "nama");
        String email = Utility.text(body, "email");
        String role = Utility.text(body, "role");
        if (nama == null || nama.isBlank() || email == null || email.isBlank()
                || role == null || !ROLES.contains(role)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nama, email, dan role wajib diisi");
        }
        String password = Utility.text(body, "password");
        if (password != null && password.length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Kata sandi minimal 6 karakter");
        }
        String id = Utility.uid();
        jdbc.update("INSERT INTO users (id, nama, email, hp, instansi, wilayah, role, aktif) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, nama, email, Utility.text(body, "hp"), Utility.text(body, "instansi"),
                Utility.text(body, "wilayah"), role, Utility.bool(body, "aktif", true));
        if (password != null) {
            jdbc.update("UPDATE auth_users SET password_hash = ? WHERE id = ?",
                    passwords.hash(password), id);
        }
        return util.normalize(jdbc.queryForList("SELECT * FROM users WHERE id = ?", id).get(0));
    }

    @PatchMapping("/users/{id}")
    public Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM users WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pengguna tidak ditemukan");
        }
        String role = Utility.text(body, "role");
        if (role != null && !role.isBlank() && !ROLES.contains(role)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Peran tidak valid");
        }
        boolean currentAktif = Boolean.TRUE.equals(rows.get(0).get("aktif"));
        jdbc.update("UPDATE users SET nama = COALESCE(?, nama), email = COALESCE(?, email), "
                        + "hp = COALESCE(?, hp), instansi = COALESCE(?, instansi), "
                        + "wilayah = COALESCE(?, wilayah), role = COALESCE(?, role), aktif = ? WHERE id = ?",
                Utility.text(body, "nama"), Utility.text(body, "email"),
                Utility.text(body, "hp"), Utility.text(body, "instansi"),
                Utility.text(body, "wilayah"), role,
                body.containsKey("aktif") ? Utility.bool(body, "aktif", currentAktif) : currentAktif,
                id);
        String password = Utility.text(body, "password");
        if (password != null) {
            writePassword(id, password);
        }
        logService.write(Utility.text(body, "actor", "Admin"), "Ubah akun", null,
                "User id: " + id);
        return util.normalize(jdbc.queryForList("SELECT * FROM users WHERE id = ?", id).get(0));
    }

    /** Ubah kata sandi satu akun. Kata sandi tidak pernah dikembalikan di respons. */
    @PatchMapping("/users/{id}/password")
    public Map<String, Object> setPassword(@PathVariable String id,
                                           @RequestBody Map<String, Object> body) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ?", Integer.class, id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pengguna tidak ditemukan");
        }
        String password = Utility.text(body, "password");
        if (password == null || password.length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Kata sandi minimal 6 karakter");
        }
        writePassword(id, password);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        return out;
    }

    private void writePassword(String id, String password) {
        jdbc.update("UPDATE auth_users SET password_hash = ? WHERE id = ?",
                passwords.hash(password), id);
    }

    @DeleteMapping("/users/{id}")
    public Map<String, Object> remove(@PathVariable String id) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ?", Integer.class, id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pengguna tidak ditemukan");
        }
        jdbc.update("DELETE FROM users WHERE id = ?", id);
        logService.write("Admin", "Hapus akun", null, "User id: " + id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        return out;
    }

    @PatchMapping("/users/{id}/aktif")
    public Map<String, Object> setAktif(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ?", Integer.class, id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pengguna tidak ditemukan");
        }
        boolean aktif = Utility.bool(body, "aktif", true);
        jdbc.update("UPDATE users SET aktif = ? WHERE id = ?", aktif, id);
        logService.write(Utility.text(body, "actor", "Admin"),
                aktif ? "Aktifkan akun" : "Nonaktifkan akun", null, "User id: " + id);
        return util.normalize(jdbc.queryForList("SELECT * FROM users WHERE id = ?", id).get(0));
    }

    @PostMapping("/auth/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> body) {
        // Semua variasi kunci yang dipakai mockup: id, userId, email, identifier.
        String identifier = firstText(body, "id", "userId", "email", "identifier");
        if (identifier == null || identifier.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email atau ID pengguna wajib diisi");
        }
        String password = Utility.text(body, "password");
        if (password == null || password.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Kata sandi wajib diisi");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM users WHERE id = ? OR email = ? OR username = ?",
                identifier, identifier, identifier);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Akun tidak ditemukan. Periksa email atau ID pengguna.");
        }
        Map<String, Object> user = rows.get(0);
        List<String> hashes = jdbc.query(
                "SELECT password_hash FROM auth_users WHERE id = ? OR email = ? OR username = ?",
                (rs, i) -> rs.getString(1), identifier, identifier, identifier);
        String hash = hashes.isEmpty() ? null : hashes.get(0);
        if (!passwords.verify(password, hash)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Kata sandi salah");
        }
        if (!Boolean.TRUE.equals(user.get("aktif"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Akun tidak aktif atau tidak ditemukan.");
        }
        Map<String, Object> out = util.normalize(user);
        out.put("id", user.get("id"));
        out.put("role", String.valueOf(user.get("role")));
        out.put("aktif", true);
        return out;
    }

    private static String firstText(Map<String, Object> body, String... keys) {
        for (String key : keys) {
            String value = Utility.text(body, key);
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    @PostMapping("/auth/logout")
    public Map<String, Object> logout() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }
}
