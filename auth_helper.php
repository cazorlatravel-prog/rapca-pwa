<?php
/**
 * Helper compartido de autenticación para endpoints RAPCA.
 * Valida el token de sesión y devuelve el usuario o null.
 * Incluye expiración de tokens (30 días de inactividad).
 */

require_once 'config.php';

define('TOKEN_EXPIRY_DAYS', 30);

/**
 * Obtiene conexión PDO.
 * Los errores no filtran detalles al cliente.
 */
function getDBConnection() {
    try {
        return new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    } catch (PDOException $e) {
        error_log('RAPCA DB Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Error de conexión con la base de datos']);
        exit;
    }
}

/**
 * Valida un token de sesión y devuelve el usuario.
 * Tokens inactivos por más de TOKEN_EXPIRY_DAYS días se eliminan.
 *
 * @return array|null Usuario {id, email, nombre, rol} o null si inválido
 */
function validarTokenAuth($pdo, $token) {
    if (!$token || strlen($token) < 10) return null;

    // Limpiar tokens expirados (inactivos > 30 días)
    try {
        $pdo->prepare("DELETE FROM sesiones WHERE fecha_ultimo_acceso < DATE_SUB(NOW(), INTERVAL ? DAY)")
            ->execute([TOKEN_EXPIRY_DAYS]);
    } catch (PDOException $e) {
        // No bloquear si la limpieza falla
        error_log('RAPCA token cleanup error: ' . $e->getMessage());
    }

    // Validar token
    $stmt = $pdo->prepare(
        "SELECT u.id, u.email, u.nombre, u.rol, u.activo, s.fecha_ultimo_acceso
         FROM usuarios u
         INNER JOIN sesiones s ON s.usuario_id = u.id
         WHERE s.token = ? AND u.activo = 1
         AND s.fecha_ultimo_acceso >= DATE_SUB(NOW(), INTERVAL ? DAY)"
    );
    $stmt->execute([$token, TOKEN_EXPIRY_DAYS]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        // Actualizar último acceso
        $pdo->prepare("UPDATE sesiones SET fecha_ultimo_acceso = NOW() WHERE token = ?")
            ->execute([$token]);
        unset($user['fecha_ultimo_acceso']);
        unset($user['activo']);
        return $user;
    }

    return null;
}

/**
 * Extrae el token del body JSON o del header Authorization.
 */
function extraerToken($input) {
    // Primero del body
    if (isset($input['token']) && $input['token']) {
        return trim($input['token']);
    }
    // Luego del header Authorization: Bearer <token>
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
        return trim($m[1]);
    }
    return '';
}

/**
 * Requiere autenticación. Si falla, responde 401 y termina.
 *
 * @return array Usuario autenticado
 */
function requireAuth($pdo, $input) {
    $token = extraerToken($input);
    $user = validarTokenAuth($pdo, $token);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Sesión inválida o expirada']);
        exit;
    }
    return $user;
}
