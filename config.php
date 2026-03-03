<?php
// --- Cargar .env si existe (Hostinger y otros hostings) ---
$envPaths = [
    __DIR__ . '/.env',
    dirname(__DIR__) . '/.env',          // un nivel arriba (raíz del hosting)
    $_SERVER['DOCUMENT_ROOT'] . '/.env', // raíz del document root
];
foreach ($envPaths as $envFile) {
    if (file_exists($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            if (strpos($line, '=') === false) continue;
            list($key, $val) = array_map('trim', explode('=', $line, 2));
            // Quitar comillas
            $val = trim($val, '"\'');
            $_ENV[$key] = $val;
            putenv("$key=$val");
        }
        break; // Solo cargar el primer .env encontrado
    }
}

// --- Credenciales de Base de Datos ---
// Prioridad: variable de entorno (.env) → valor hardcodeado de fallback
define('DB_HOST',     getenv('DB_HOST')     ?: 'localhost');
define('DB_NAME',     getenv('DB_NAME')     ?: 'u919343704_rapcajaen');
define('DB_USER',     getenv('DB_USER')     ?: 'u919343704_datosrapca');
define('DB_PASS',     getenv('DB_PASSWORD') ?: (getenv('DB_PASS') ?: 'Gallito9431%'));

// --- Credenciales de Cloudinary ---
// .env puede tener CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
$cloudinaryUrl = getenv('CLOUDINARY_URL') ?: '';
if ($cloudinaryUrl && preg_match('#cloudinary://([^:]+):([^@]+)@(.+)#', $cloudinaryUrl, $m)) {
    define('CLOUDINARY_API_KEY',    $m[1]);
    define('CLOUDINARY_API_SECRET', $m[2]);
    define('CLOUDINARY_CLOUD_NAME', $m[3]);
} else {
    define('CLOUDINARY_CLOUD_NAME', getenv('CLOUDINARY_CLOUD_NAME') ?: 'drnqs1jwl');
    define('CLOUDINARY_API_KEY',    getenv('CLOUDINARY_API_KEY')    ?: '587983846793923');
    define('CLOUDINARY_API_SECRET', getenv('CLOUDINARY_API_SECRET') ?: 'Exb9UsGezv7P48JYn1T1RC-EUxw');
}

// Email del administrador para alertas de fallos
define('ADMIN_EMAIL', getenv('ADMIN_EMAIL') ?: '');
