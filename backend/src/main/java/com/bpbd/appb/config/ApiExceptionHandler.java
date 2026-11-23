package com.bpbd.appb.config;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleStatus(ResponseStatusException ex) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        return ResponseEntity.status(status).body(body(status, ex.getReason() == null ? status.getReasonPhrase() : ex.getReason()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(body(HttpStatus.CONFLICT, "Data sudah ada atau melanggar batasan database"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(body(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage() == null ? "Internal server error" : ex.getMessage()));
    }

    private Map<String, Object> body(HttpStatus status, String message) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("timestamp", Instant.now().toString());
        out.put("status", status.value());
        out.put("error", status.getReasonPhrase());
        out.put("message", message);
        return out;
    }
}
