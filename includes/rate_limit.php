<?php
/**
 * RAPCA Campo — Rate limiting simple basado en ficheros
 * Limita intentos de login por IP para prevenir fuerza bruta.
 */
declare(strict_types=1);

define('RATE_LIMIT_DIR', sys_get_temp_dir() . '/rapca_rate_limit');
define('RATE_LIMIT_MAX_ATTEMPTS', 5);
define('RATE_LIMIT_WINDOW_SECONDS', 900); // 15 minutos

function getRateLimitKey(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return md5($ip);
}

function checkRateLimit(): bool {
    $key = getRateLimitKey();
    $file = RATE_LIMIT_DIR . '/' . $key;

    if (!is_dir(RATE_LIMIT_DIR)) {
        @mkdir(RATE_LIMIT_DIR, 0700, true);
    }

    if (!file_exists($file)) return true;

    $data = @json_decode((string)file_get_contents($file), true);
    if (!$data) return true;

    // Limpiar intentos fuera de la ventana
    $now = time();
    $attempts = array_filter($data['attempts'] ?? [], function($t) use ($now) {
        return ($now - $t) < RATE_LIMIT_WINDOW_SECONDS;
    });

    return count($attempts) < RATE_LIMIT_MAX_ATTEMPTS;
}

function recordFailedAttempt(): void {
    $key = getRateLimitKey();
    $file = RATE_LIMIT_DIR . '/' . $key;

    if (!is_dir(RATE_LIMIT_DIR)) {
        @mkdir(RATE_LIMIT_DIR, 0700, true);
    }

    $data = ['attempts' => []];
    if (file_exists($file)) {
        $data = @json_decode((string)file_get_contents($file), true) ?: ['attempts' => []];
    }

    $now = time();
    // Limpiar intentos antiguos
    $data['attempts'] = array_values(array_filter($data['attempts'] ?? [], function($t) use ($now) {
        return ($now - $t) < RATE_LIMIT_WINDOW_SECONDS;
    }));
    $data['attempts'][] = $now;

    @file_put_contents($file, json_encode($data), LOCK_EX);
}

function clearRateLimit(): void {
    $key = getRateLimitKey();
    $file = RATE_LIMIT_DIR . '/' . $key;
    if (file_exists($file)) {
        @unlink($file);
    }
}

function getRateLimitRemaining(): int {
    $key = getRateLimitKey();
    $file = RATE_LIMIT_DIR . '/' . $key;

    if (!file_exists($file)) return RATE_LIMIT_MAX_ATTEMPTS;

    $data = @json_decode((string)file_get_contents($file), true);
    if (!$data) return RATE_LIMIT_MAX_ATTEMPTS;

    $now = time();
    $attempts = array_filter($data['attempts'] ?? [], function($t) use ($now) {
        return ($now - $t) < RATE_LIMIT_WINDOW_SECONDS;
    });

    return max(0, RATE_LIMIT_MAX_ATTEMPTS - count($attempts));
}
