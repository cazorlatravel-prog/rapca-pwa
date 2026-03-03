<?php
require_once 'config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método no permitido']); exit; }

$raw = file_get_contents('php://input');
$input = json_decode($raw, true);
if (!$input) { http_response_code(400); echo json_encode(['error' => 'JSON inválido']); exit; }

$codigos     = $input['codigos'] ?? [];
$error       = trim($input['error'] ?? 'Error desconocido');
$dispositivo = trim($input['dispositivo'] ?? '');
$fecha       = date('Y-m-d H:i:s');

// --- Registrar en Base de Datos ---
$db_ok = false;
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $pdo->exec("CREATE TABLE IF NOT EXISTS errores_subida (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigos TEXT,
        error VARCHAR(500),
        dispositivo VARCHAR(500),
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        resuelto TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $stmt = $pdo->prepare('INSERT INTO errores_subida (codigos, error, dispositivo, fecha) VALUES (?, ?, ?, ?)');
    $stmt->execute([implode(', ', $codigos), $error, $dispositivo, $fecha]);
    $db_ok = true;
} catch (PDOException $e) {
    error_log('RAPCA notificar DB error: ' . $e->getMessage());
}

// --- Enviar email al administrador ---
$email_ok = false;
if (defined('ADMIN_EMAIL') && ADMIN_EMAIL !== '') {
    $n = count($codigos);
    $subject = "RAPCA - Error subida $n foto" . ($n > 1 ? 's' : '') . " [$fecha]";

    $body  = "Se han producido errores al subir fotos a Cloudinary.\n\n";
    $body .= "Fecha: $fecha\n";
    $body .= "Dispositivo: $dispositivo\n";
    $body .= "Fotos fallidas ($n): " . implode(', ', $codigos) . "\n";
    $body .= "Error: $error\n\n";
    $body .= "Las fotos permanecen en el dispositivo del operador y se reintentarán.\n";
    $body .= "Revise la tabla 'errores_subida' en la base de datos para más detalles.";

    $headers  = "From: RAPCA <noreply@rapca.es>\r\n";
    $headers .= "Content-Type: text/plain; charset=utf-8\r\n";

    $email_ok = @mail(ADMIN_EMAIL, $subject, $body, $headers);
}

echo json_encode([
    'ok'       => true,
    'db'       => $db_ok,
    'email'    => $email_ok
]);
