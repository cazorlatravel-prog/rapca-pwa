<?php
require_once 'config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método no permitido']); exit; }

$raw = file_get_contents('php://input');
$input = json_decode($raw, true);
if (!$input) { http_response_code(400); echo json_encode(['error' => 'JSON inválido']); exit; }

$action = trim($input['action'] ?? '');
$token = trim($input['token'] ?? '');

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Crear tabla de registros sincronizados
    $pdo->exec("CREATE TABLE IF NOT EXISTS registros_sync (
        id INT AUTO_INCREMENT PRIMARY KEY,
        registro_id BIGINT NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        fecha VARCHAR(20),
        zona VARCHAR(50),
        unidad VARCHAR(50),
        transecto VARCHAR(10),
        datos LONGTEXT,
        enviado TINYINT(1) DEFAULT 0,
        usuario_email VARCHAR(255),
        usuario_nombre VARCHAR(255),
        fecha_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_registro (registro_id, usuario_email),
        INDEX idx_usuario (usuario_email),
        INDEX idx_tipo (tipo),
        INDEX idx_unidad (unidad)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de base de datos: ' . $e->getMessage()]);
    exit;
}

// Validar sesión
function obtenerUsuario($pdo, $token) {
    if (!$token) return null;
    $stmt = $pdo->prepare("SELECT u.id, u.email, u.nombre, u.rol FROM usuarios u
                           INNER JOIN sesiones s ON s.usuario_id = u.id
                           WHERE s.token = ? AND u.activo = 1");
    $stmt->execute([$token]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

$user = obtenerUsuario($pdo, $token);
if (!$user) {
    http_response_code(401);
    echo json_encode(['error' => 'Sesión inválida']);
    exit;
}

switch ($action) {

    case 'guardar':
        $registro = $input['registro'] ?? null;
        if (!$registro) {
            echo json_encode(['error' => 'Registro vacío']);
            exit;
        }
        $stmt = $pdo->prepare("INSERT INTO registros_sync (registro_id, tipo, fecha, zona, unidad, transecto, datos, enviado, usuario_email, usuario_nombre)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE tipo=VALUES(tipo), fecha=VALUES(fecha), zona=VALUES(zona), unidad=VALUES(unidad),
                               transecto=VALUES(transecto), datos=VALUES(datos), enviado=VALUES(enviado), fecha_sync=NOW()");
        $stmt->execute([
            $registro['id'],
            $registro['tipo'] ?? '',
            $registro['fecha'] ?? '',
            $registro['zona'] ?? '',
            $registro['unidad'] ?? '',
            $registro['transecto'] ?? '',
            json_encode($registro['datos'] ?? []),
            $registro['enviado'] ? 1 : 0,
            $user['email'],
            $user['nombre']
        ]);
        echo json_encode(['ok' => true]);
        break;

    case 'listar':
        if ($user['rol'] === 'admin') {
            // Admin ve todos los registros
            $filtroEmail = trim($input['filtro_email'] ?? '');
            if ($filtroEmail) {
                $stmt = $pdo->prepare("SELECT * FROM registros_sync WHERE usuario_email = ? ORDER BY fecha_sync DESC");
                $stmt->execute([$filtroEmail]);
            } else {
                $stmt = $pdo->query("SELECT * FROM registros_sync ORDER BY fecha_sync DESC");
            }
        } else {
            // Operador solo ve los suyos
            $stmt = $pdo->prepare("SELECT * FROM registros_sync WHERE usuario_email = ? ORDER BY fecha_sync DESC");
            $stmt->execute([$user['email']]);
        }
        $registros = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Decodificar datos JSON
        foreach ($registros as &$r) {
            $r['datos'] = json_decode($r['datos'], true);
        }
        echo json_encode(['ok' => true, 'registros' => $registros]);
        break;

    case 'eliminar':
        $registroId = intval($input['registro_id'] ?? 0);
        if (!$registroId) {
            echo json_encode(['error' => 'ID de registro requerido']);
            exit;
        }
        if ($user['rol'] === 'admin') {
            $pdo->prepare("DELETE FROM registros_sync WHERE registro_id = ?")->execute([$registroId]);
        } else {
            $pdo->prepare("DELETE FROM registros_sync WHERE registro_id = ? AND usuario_email = ?")->execute([$registroId, $user['email']]);
        }
        echo json_encode(['ok' => true]);
        break;

    default:
        echo json_encode(['error' => 'Acción no reconocida: ' . $action]);
        break;
}
