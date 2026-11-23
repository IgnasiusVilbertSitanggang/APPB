package com.bpbd.appb.web;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {

    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        String db = jdbc.queryForObject("SELECT 1", String.class);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "OK");
        out.put("service", "appb-backend");
        out.put("database", "1".equals(db) ? "connected" : "unknown");
        out.put("mode", "postgresql");
        out.put("time", Instant.now().toString());
        return out;
    }
}
