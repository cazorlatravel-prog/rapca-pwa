<?php
require_once 'config.php';
require_once __DIR__ . '/includes/rate_limit.php';

$allowedOrigin = (!empty($_SERVER['HTTP_ORIGIN'])) ? $_SERVER['HTTP_ORIGIN'] : '';
$trustedOrigins = ['https://rapca.app', 'https://www.rapca.app', 'http://localhost:8000'];
if (in_array($allowedOrigin, $trustedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
} else {
    header('Access-Control-Allow-Origin: https://rapca.app');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método no permitido']); exit; }

$raw = file_get_contents('php://input');
$input = json_decode($raw, true);
if (!$input) { http_response_code(400); echo json_encode(['error' => 'JSON inválido']); exit; }

$action = trim($input['action'] ?? '');

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Crear tablas si no existen
    $pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        nombre VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        rol ENUM('admin','operador') DEFAULT 'operador',
        activo TINYINT(1) DEFAULT 1,
        ultimo_login DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS sesiones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL,
            token VARCHAR(128) NOT NULL UNIQUE,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_ultimo_acceso DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_token (token),
            INDEX idx_usuario_id (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (PDOException $e2) {
        // Si falla (p.ej. FK rota de versión anterior), intentar borrar y recrear
        $pdo->exec("DROP TABLE IF EXISTS sesiones");
        $pdo->exec("CREATE TABLE sesiones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL,
            token VARCHAR(128) NOT NULL UNIQUE,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_ultimo_acceso DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_token (token),
            INDEX idx_usuario_id (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }

    // Sembrar admin si no hay usuarios
    $count = $pdo->query("SELECT COUNT(*) FROM usuarios")->fetchColumn();
    if ($count == 0) {
        $hash = password_hash('Gallito9431%', PASSWORD_BCRYPT);
        $pdo->prepare("INSERT INTO usuarios (email, nombre, password, rol) VALUES (?, ?, ?, 'admin')")
            ->execute(['rapcajaen@gmail.com', 'Administrador RAPCA', $hash]);
    }

} catch (PDOException $e) {
    http_response_code(500);
    error_log('RAPCA auth DB error: ' . $e->getMessage());
    echo json_encode(['error' => 'Error de conexión con la base de datos']);
    exit;
}

// --- Funciones auxiliares ---
define('AUTH_TOKEN_EXPIRY_DAYS', 30);

function generarToken() {
    return bin2hex(random_bytes(32));
}

function obtenerUsuarioPorToken($pdo, $token) {
    if (!$token || strlen($token) < 10) return null;
    try {
        // Consulta simple sin filtro de fecha — máxima compatibilidad
        $stmt = $pdo->prepare("SELECT u.id, u.email, u.nombre, u.rol, u.activo FROM usuarios u
                               INNER JOIN sesiones s ON s.usuario_id = u.id
                               WHERE s.token = ? AND u.activo = 1");
        $stmt->execute([$token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user ?: null;
    } catch (PDOException $e) {
        error_log('obtenerUsuarioPorToken error: ' . $e->getMessage());
        return null;
    }
}

// --- Acciones ---
switch ($action) {

    case 'login':
        if (!checkRateLimit()) {
            http_response_code(429);
            echo json_encode(['error' => 'Demasiados intentos. Espera 15 minutos.']);
            exit;
        }
        $email = trim($input['email'] ?? '');
        $pass = $input['password'] ?? '';
        if (!$email || !$pass) {
            echo json_encode(['error' => 'Email y contraseña requeridos']);
            exit;
        }
        $stmt = $pdo->prepare("SELECT id, email, nombre, password, rol, activo FROM usuarios WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user || !password_verify($pass, $user['password'])) {
            recordFailedAttempt();
            echo json_encode(['error' => 'Credenciales incorrectas']);
            exit;
        }
        if (!$user['activo']) {
            echo json_encode(['error' => 'Usuario desactivado. Contacta al administrador']);
            exit;
        }
        clearRateLimit();
        $token = generarToken();
        $pdo->prepare("INSERT INTO sesiones (usuario_id, token) VALUES (?, ?)")->execute([$user['id'], $token]);
        try { $pdo->prepare("UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?")->execute([$user['id']]); } catch (PDOException $e) { /* columna puede no existir */ }
        echo json_encode([
            'ok' => true,
            'token' => $token,
            'usuario' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'nombre' => $user['nombre'],
                'rol' => $user['rol']
            ]
        ]);
        break;

    case 'validar':
        $token = trim($input['token'] ?? '');
        $user = obtenerUsuarioPorToken($pdo, $token);
        if ($user) {
            echo json_encode(['ok' => true, 'usuario' => $user]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'Sesión inválida']);
        }
        break;

    case 'logout':
        $token = trim($input['token'] ?? '');
        if ($token) {
            $pdo->prepare("DELETE FROM sesiones WHERE token = ?")->execute([$token]);
        }
        echo json_encode(['ok' => true]);
        break;

    case 'crear_usuario':
        $token = trim($input['token'] ?? '');
        $admin = obtenerUsuarioPorToken($pdo, $token);
        if (!$admin || $admin['rol'] !== 'admin') {
            echo json_encode(['error' => 'Sin permisos de administrador']);
            exit;
        }
        $nuevoEmail = trim($input['nuevo_email'] ?? '');
        $nuevoNombre = trim($input['nuevo_nombre'] ?? '');
        $nuevoPass = $input['nuevo_password'] ?? '';
        $nuevoRol = trim($input['nuevo_rol'] ?? 'operador');
        if (!$nuevoEmail || !$nuevoNombre || !$nuevoPass) {
            echo json_encode(['error' => 'Email, nombre y contraseña requeridos']);
            exit;
        }
        if (strlen($nuevoPass) < 8) {
            echo json_encode(['error' => 'La contraseña debe tener al menos 8 caracteres']);
            exit;
        }
        if (!in_array($nuevoRol, ['admin', 'operador'])) $nuevoRol = 'operador';
        // Verificar que no existe
        $existe = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $existe->execute([$nuevoEmail]);
        if ($existe->fetch()) {
            echo json_encode(['error' => 'Ya existe un usuario con ese email']);
            exit;
        }
        $hash = password_hash($nuevoPass, PASSWORD_BCRYPT);
        $pdo->prepare("INSERT INTO usuarios (email, nombre, password, rol) VALUES (?, ?, ?, ?)")
            ->execute([$nuevoEmail, $nuevoNombre, $hash, $nuevoRol]);
        echo json_encode(['ok' => true, 'id' => $pdo->lastInsertId()]);
        break;

    case 'listar_usuarios':
        $token = trim($input['token'] ?? '');
        $admin = obtenerUsuarioPorToken($pdo, $token);
        if (!$admin || $admin['rol'] !== 'admin') {
            echo json_encode(['error' => 'Sin permisos de administrador']);
            exit;
        }
        // Compatible con ambas versiones de esquema (fecha_creacion o created_at)
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM usuarios")->fetchAll(PDO::FETCH_COLUMN);
            $dateCol = in_array('created_at', $cols) ? 'created_at' : (in_array('fecha_creacion', $cols) ? 'fecha_creacion' : 'id');
            $stmt = $pdo->query("SELECT id, email, nombre, rol, activo FROM usuarios ORDER BY " . $dateCol);
        } catch (PDOException $e) {
            $stmt = $pdo->query("SELECT id, email, nombre, rol, activo FROM usuarios ORDER BY id");
        }
        echo json_encode(['ok' => true, 'usuarios' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        break;

    case 'toggle_usuario':
        $token = trim($input['token'] ?? '');
        $admin = obtenerUsuarioPorToken($pdo, $token);
        if (!$admin || $admin['rol'] !== 'admin') {
            echo json_encode(['error' => 'Sin permisos de administrador']);
            exit;
        }
        $userId = intval($input['usuario_id'] ?? 0);
        if ($userId === $admin['id']) {
            echo json_encode(['error' => 'No puedes desactivarte a ti mismo']);
            exit;
        }
        $pdo->prepare("UPDATE usuarios SET activo = NOT activo WHERE id = ?")->execute([$userId]);
        echo json_encode(['ok' => true]);
        break;

    case 'cambiar_password':
        $token = trim($input['token'] ?? '');
        $admin = obtenerUsuarioPorToken($pdo, $token);
        if (!$admin || $admin['rol'] !== 'admin') {
            echo json_encode(['error' => 'Sin permisos de administrador']);
            exit;
        }
        $userId = intval($input['usuario_id'] ?? 0);
        $nuevaPass = $input['nueva_password'] ?? '';
        if (!$userId || !$nuevaPass) {
            echo json_encode(['error' => 'ID usuario y nueva contraseña requeridos']);
            exit;
        }
        if (strlen($nuevaPass) < 8) {
            echo json_encode(['error' => 'La contraseña debe tener al menos 8 caracteres']);
            exit;
        }
        $hash = password_hash($nuevaPass, PASSWORD_BCRYPT);
        $pdo->prepare("UPDATE usuarios SET password = ? WHERE id = ?")->execute([$hash, $userId]);
        echo json_encode(['ok' => true]);
        break;

    case 'eliminar_usuario':
        $token = trim($input['token'] ?? '');
        $admin = obtenerUsuarioPorToken($pdo, $token);
        if (!$admin || $admin['rol'] !== 'admin') {
            echo json_encode(['error' => 'Sin permisos de administrador']);
            exit;
        }
        $userId = intval($input['usuario_id'] ?? 0);
        if ($userId === $admin['id']) {
            echo json_encode(['error' => 'No puedes eliminar tu propio usuario']);
            exit;
        }
        $pdo->prepare("DELETE FROM usuarios WHERE id = ?")->execute([$userId]);
        echo json_encode(['ok' => true]);
        break;

    case 'sync_usuarios':
        // Subir usuarios creados offline al servidor
        $token = trim($input['token'] ?? '');
        $admin = obtenerUsuarioPorToken($pdo, $token);
        if (!$admin || $admin['rol'] !== 'admin') {
            echo json_encode(['error' => 'Sin permisos de administrador']);
            exit;
        }
        $usuarios = $input['usuarios'] ?? [];
        $creados = 0;
        foreach ($usuarios as $u) {
            $email = trim($u['email'] ?? '');
            $nombre = trim($u['nombre'] ?? '');
            $pass = $u['password'] ?? '';
            $rol = in_array($u['rol'] ?? '', ['admin', 'operador']) ? $u['rol'] : 'operador';
            if (!$email || !$nombre) continue;
            // Verificar si ya existe
            $existe = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
            $existe->execute([$email]);
            if ($existe->fetch()) continue; // Ya existe, no duplicar
            // Crear con password hasheado (si tiene password local, usarlo)
            if ($pass) {
                $hash = password_hash($pass, PASSWORD_BCRYPT);
            } else {
                $hash = password_hash('temp_' . bin2hex(random_bytes(4)), PASSWORD_BCRYPT);
            }
            $pdo->prepare("INSERT INTO usuarios (email, nombre, password, rol, activo) VALUES (?, ?, ?, ?, ?)")
                ->execute([$email, $nombre, $hash, $rol, $u['activo'] ?? 1]);
            $creados++;
        }
        echo json_encode(['ok' => true, 'creados' => $creados]);
        break;

    default:
        echo json_encode(['error' => 'Acción no reconocida']);
        break;
}
