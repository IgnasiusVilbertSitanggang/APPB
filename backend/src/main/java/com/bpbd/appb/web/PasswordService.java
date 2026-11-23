package com.bpbd.appb.web;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Service;

/**
 * Hash kata sandi kompatibel dengan tools/ken_store.py dan tools/import_ken_sql.py:
 * pbkdf2_sha256${iterations}${saltHex}${digestHex}
 */
@Service
public class PasswordService {

    private static final String PREFIX = "pbkdf2_sha256$";
    private static final int ITERATIONS = 120_000;
    private static final int SALT_BYTES = 16;
    private static final int KEY_BITS = 256;
    private static final SecureRandom RANDOM = new SecureRandom();

    public String hash(String password) {
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        return PREFIX + ITERATIONS + "$" + hex(salt) + "$" + hex(derive(password, salt, ITERATIONS));
    }

    public boolean verify(String password, String stored) {
        if (password == null || stored == null || !stored.startsWith(PREFIX)) {
            // Hash bcrypt lama tidak bisa diverifikasi di sini; jalur lama sudah
            // dinonaktifkan dan seluruh akun memakai PBKDF2.
            return false;
        }
        String[] parts = stored.split("\\$");
        if (parts.length != 4) return false;
        try {
            int iterations = Integer.parseInt(parts[1]);
            byte[] salt = unhex(parts[2]);
            byte[] expected = unhex(parts[3]);
            return MessageDigest.isEqual(expected, derive(password, salt, iterations));
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static byte[] derive(String password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_BITS);
            try {
                return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            } finally {
                spec.clearPassword();
            }
        } catch (Exception e) {
            throw new IllegalStateException("Gagal menghitung hash kata sandi", e);
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) out.append(String.format("%02x", value & 0xff));
        return out.toString();
    }

    private static byte[] unhex(String value) {
        byte[] out = new byte[value.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }
}
