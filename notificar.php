<?php
require_once 'auth_helper.php';

$_allowedOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$_trustedOrigins = ['https://rapca.app', 'https://www.rapca.app', 'http://localhost:8000'];
header('Access-Control-Allow-Origin: ' . (in_array($_allowedOrigin, $_trustedOrigins, true) ? $_allowedOrigin : 'https://rapca.app'));
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método no permitido']); exit; }

$raw = file_get_contents('php://input');
$input = json_decode($raw, true);
if (!$input) { http_response_code(400); echo json_encode(['error' => 'JSON inválido']); exit; }

$pdo = getDBConnection();

// --- AUTENTICACIÓN ---
$user = requireAuth($pdo, $input);

$codigos     = is_array($input['codigos'] ?? null) ? $input['codigos'] : [];
$error       = trim(substr($input['error'] ?? 'Error desconocido', 0, 500));
$dispositivo = trim(substr($input['dispositivo'] ?? '', 0, 500));
$fecha       = date('Y-m-d H:i:s');

// --- Registrar en Base de Datos ---
$db_ok = false;
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS errores_subida (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigos TEXT,
        error VARCHAR(500),
        dispositivo VARCHAR(500),
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario_email VARCHAR(255),
        resuelto TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $stmt = $pdo->prepare('INSERT INTO errores_subida (codigos, error, dispositivo, fecha, usuario_email) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([implode(', ', $codigos), $error, $dispositivo, $fecha, $user['email']]);
    $db_ok = true;
} catch (PDOException $e) {
    error_log('RAPCA notificar DB error: ' . $e->getMessage());
}

// --- Enviar email al administrador ---
$email_ok = false;
if (defined('ADMIN_EMAIL') && ADMIN_EMAIL !== '') {
    $n = count($codigos);
    $subject = "RAPCA - Error subida $n foto" . ($n > 1 ? 's' : '') . " [$fecha]";

    $body  = "Se han producido errores al subir fotos.\n\n";
    $body .= "Usuario: " . $user['email'] . " (" . $user['nombre'] . ")\n";
    $body .= "Fecha: $fecha\n";
    $body .= "Dispositivo: $dispositivo\n";
    $body .= "Fotos fallidas ($n): " . implode(', ', $codigos) . "\n";
    $body .= "Error: $error\n";

    $headers  = "From: RAPCA <noreply@rapca.es>\r\n";
    $headers .= "Content-Type: text/plain; charset=utf-8\r\n";

    $email_ok = @mail(ADMIN_EMAIL, $subject, $body, $headers);
}

echo json_encode(['ok' => true, 'db' => $db_ok, 'email' => $email_ok]);
