<?php
// Configuracion RAPCA API
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// Base de datos
define('DB_HOST', 'localhost');
define('DB_NAME', 'u919343704_rapcajaen');
define('DB_USER', 'u919343704_datosrapca');
define('DB_PASS', 'Gallito9431%');

// Cloudinary
define('CLOUD_NAME', 'drnqs1jwl');
define('CLOUD_API_KEY', '587983846793923');
define('CLOUD_API_SECRET', 'Exb9UsGezv7P48JYn1T1RC-EUxw');

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError($msg, $code = 400) {
    jsonResponse(['ok' => false, 'error' => $msg], $code);
}
