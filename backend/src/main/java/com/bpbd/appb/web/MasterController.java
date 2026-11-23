package com.bpbd.appb.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class MasterController {

    private final JdbcTemplate jdbc;
    private final Utility util;

    public MasterController(JdbcTemplate jdbc, Utility util) {
        this.jdbc = jdbc;
        this.util = util;
    }

    @GetMapping("/wilayah")
    public List<Map<String, Object>> wilayah() {
        // Satu query saja: schema ken memiliki 83.762 kelurahan, sehingga
        // query bertingkat per kecamatan terlalu lambat.
        Map<String, Map<String, Map<String, List<String>>>> tree = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT prov, kab, kec, kel FROM wilayah ORDER BY prov, kab, kec, kel")) {
            String prov = String.valueOf(row.get("prov"));
            String kab = String.valueOf(row.get("kab"));
            String kec = String.valueOf(row.get("kec"));
            tree.computeIfAbsent(prov, k -> new LinkedHashMap<>())
                    .computeIfAbsent(kab, k -> new LinkedHashMap<>())
                    .computeIfAbsent(kec, k -> new ArrayList<>())
                    .add(String.valueOf(row.get("kel")));
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, Map<String, Map<String, List<String>>>> prov : tree.entrySet()) {
            Map<String, Object> provNode = new LinkedHashMap<>();
            provNode.put("nama", prov.getKey());
            List<Map<String, Object>> kabNodes = new ArrayList<>();
            for (Map.Entry<String, Map<String, List<String>>> kab : prov.getValue().entrySet()) {
                Map<String, Object> kabNode = new LinkedHashMap<>();
                kabNode.put("nama", kab.getKey());
                List<Map<String, Object>> kecNodes = new ArrayList<>();
                for (Map.Entry<String, List<String>> kec : kab.getValue().entrySet()) {
                    Map<String, Object> kecNode = new LinkedHashMap<>();
                    kecNode.put("nama", kec.getKey());
                    kecNode.put("kelurahan", kec.getValue());
                    kecNodes.add(kecNode);
                }
                kabNode.put("kecamatan", kecNodes);
                kabNodes.add(kabNode);
            }
            provNode.put("kabupaten", kabNodes);
            out.add(provNode);
        }
        return out;
    }

    @GetMapping("/kategori")
    public List<Map<String, Object>> kategori() {
        return util.normalizeAll(jdbc.queryForList("SELECT * FROM kategori ORDER BY nama"));
    }

    @PostMapping("/kategori")
    public Map<String, Object> createKategori(@RequestBody Map<String, Object> body) {
        String nama = Utility.text(body, "nama");
        if (nama == null || nama.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nama kategori wajib diisi");
        }
        Integer duplicate = jdbc.queryForObject(
                "SELECT COUNT(*) FROM kategori WHERE lower(nama) = lower(?)", Integer.class, nama);
        if (duplicate != null && duplicate > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Kategori " + nama + " sudah ada.");
        }
        String id = Utility.uid();
        jdbc.update("INSERT INTO kategori (id, nama, aktif, deskripsi) VALUES (?, ?, ?, ?)",
                id, nama,
                Utility.bool(body, "aktif", true),
                Utility.text(body, "deskripsi"));
        // Trigger PostgreSQL menetapkan id logis "c<n>"; UUID yang dikirim
        // controller hanya dipakai sebagai penanda insert, bukan kunci akhir.
        return util.normalize(jdbc.queryForList(
                "SELECT * FROM kategori WHERE lower(nama) = lower(?) ORDER BY id DESC LIMIT 1",
                nama).get(0));
    }

    @PatchMapping("/kategori/{id}")
    public Map<String, Object> updateKategori(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM kategori WHERE id = ?", Integer.class, id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Kategori tidak ditemukan");
        }
        jdbc.update("UPDATE kategori SET nama = COALESCE(?, nama), aktif = COALESCE(?, aktif), "
                        + "deskripsi = COALESCE(?, deskripsi) WHERE id = ?",
                Utility.text(body, "nama"),
                body.containsKey("aktif") ? Utility.bool(body, "aktif", true) : null,
                Utility.text(body, "deskripsi"), id);
        return util.normalize(jdbc.queryForList("SELECT * FROM kategori WHERE id = ?", id).get(0));
    }

    @DeleteMapping("/kategori/{id}")
    public Map<String, Object> deleteKategoriRest(@PathVariable String id) {
        return deleteKategori(id);
    }

    @PostMapping("/kategori/{id}/delete")
    public Map<String, Object> deleteKategori(@PathVariable String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM kategori WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Kategori tidak ditemukan");
        }
        String nama = String.valueOf(rows.get(0).get("nama"));
        Integer used = jdbc.queryForObject(
                "SELECT COUNT(*) FROM reports WHERE jenis = ?", Integer.class, nama);
        if (used != null && used > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Kategori masih dipakai " + used + " laporan dan tidak dapat dihapus.");
        }
        jdbc.update("DELETE FROM kategori WHERE id = ?", id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        return out;
    }
}
