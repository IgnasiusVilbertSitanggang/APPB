package com.bpbd.appb.web;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class Utility {

    private static final TypeReference<List<Map<String, Object>>> LIST_MAP =
            new TypeReference<>() {};

    private final ObjectMapper mapper;

    public Utility(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public static String uid() {
        return UUID.randomUUID().toString();
    }

    public static Timestamp now() {
        return Timestamp.from(Instant.now());
    }

    public static String text(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        return value == null ? null : String.valueOf(value);
    }

    public static String text(Map<String, Object> body, String key, String fallback) {
        String value = text(body, key);
        return value == null || value.isBlank() ? fallback : value;
    }

    public static int number(Map<String, Object> body, String key, int fallback) {
        Object value = body == null ? null : body.get(key);
        if (value instanceof Number n) return n.intValue();
        if (value == null) return fallback;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    public static boolean bool(Map<String, Object> body, String key, boolean fallback) {
        Object value = body == null ? null : body.get(key);
        if (value instanceof Boolean b) return b;
        if (value == null) return fallback;
        return Boolean.parseBoolean(String.valueOf(value));
    }

    public static String camel(String key) {
        if (key == null || key.isEmpty()) return key;
        StringBuilder out = new StringBuilder();
        boolean upper = false;
        for (char c : key.toCharArray()) {
            if (c == '_') {
                upper = true;
            } else if (upper) {
                out.append(Character.toUpperCase(c));
                upper = false;
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** Ubah baris SQL menjadi objek JSON berkebab-untuk-frontend. */
    public Map<String, Object> normalize(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (row == null) return out;
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            String key = switch (entry.getKey()) {
                case "by_user" -> "by";
                case "report_code" -> "reportCode";
                case "rumah_rusak" -> "rumahRusak";
                case "device_id" -> "deviceId";
                case "korban_history" -> "korbanHistory";
                case "status_history" -> "statusHistory";
                default -> camel(entry.getKey());
            };
            out.put(key, normalizeValue(entry.getKey(), entry.getValue()));
        }
        // Alias yang dipakai komponen lama.
        if (!out.containsKey("korban") && out.containsKey("luka")) {
            Map<String, Object> korban = new LinkedHashMap<>();
            korban.put("luka", out.get("luka"));
            korban.put("hilang", out.get("hilang"));
            korban.put("meninggal", out.get("meninggal"));
            korban.put("mengungsi", out.get("mengungsi"));
            out.put("korban", korban);
        }
        return out;
    }

    public List<Map<String, Object>> normalizeAll(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) out.add(normalize(row));
        return out;
    }

    private Object normalizeValue(String key, Object value) {
        if (value == null) return null;
        if (value instanceof Timestamp ts) {
            // Baseline Python selalu memakai 3 digit milidetik (ISO "Z").
            return DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
                    .withZone(ZoneOffset.UTC).format(ts.toInstant());
        }
        if (value instanceof java.sql.Date date) return date.toLocalDate().toString();
        if (value instanceof byte[] bytes) return new String(bytes, StandardCharsets.UTF_8);
        if (key.equals("korban_history") || key.equals("susulan") || key.equals("status_history")) {
            String raw = value instanceof byte[] b ? new String(b, StandardCharsets.UTF_8) : String.valueOf(value);
            return parseList(raw);
        }
        return value;
    }

    public List<Map<String, Object>> parseList(String raw) {
        if (raw == null || raw.isBlank()) return new ArrayList<>();
        try {
            return mapper.readValue(raw, LIST_MAP);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    public String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Gagal membuat JSON", e);
        }
    }
}
