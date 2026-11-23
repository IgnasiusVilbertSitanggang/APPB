package com.bpbd.appb.web;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CodeService {

    private final JdbcTemplate jdbc;

    public CodeService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public String nextReportCode() {
        Integer value = jdbc.queryForObject(
                "SELECT value FROM sequences WHERE name = 'report_code' FOR UPDATE",
                Integer.class);
        int next = value == null ? 140 : value + 1;
        jdbc.update("UPDATE sequences SET value = ? WHERE name = 'report_code'", next);
        return String.format("APPB-2026-%05d", next);
    }
}
