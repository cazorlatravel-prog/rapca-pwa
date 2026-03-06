<?php
/**
 * RAPCA Campo — Sistema de Autenticación
 */
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    $isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $isSecure,
        'httponly'  => true,
        'samesite'  => 'Lax',
    ]);
    session_start();
}

/**
 * Login con email y password.
 */
function login(string $email, string $password): array|false {
    $pdo = getDB();

    $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE email = :email LIMIT 1");
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user) return false;
    if (!$user['activo']) return false;
    if (!password_verify($password, $user['password'])) return false;

    session_regenerate_id(true);

    $_SESSION['user_id']    = (int) $user['id'];
    $_SESSION['user_name']  = $user['nombre'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_rol']   = $user['rol'];

    $pdo->prepare("UPDATE usuarios SET ultimo_login = NOW() WHERE id = :id")
        ->execute([':id' => $user['id']]);

    return $user;
}

function logout(): void {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']);
    }
    session_destroy();
}

function isLoggedIn(): bool {
    return isset($_SESSION['user_id']);
}

function currentUser(): ?array {
    if (!isLoggedIn()) return null;
    return [
        'id'     => $_SESSION['user_id'],
        'nombre' => $_SESSION['user_name'],
        'email'  => $_SESSION['user_email'],
        'rol'    => $_SESSION['user_rol'],
    ];
}

function requireAuth(string $loginUrl = '/admin/login.php'): array {
    if (!isLoggedIn()) {
        header('Location: ' . $loginUrl);
        exit;
    }
    return currentUser();
}

function requireRole(string|array $roles, string $loginUrl = '/admin/login.php'): array {
    $user = requireAuth($loginUrl);
    if (is_string($roles)) $roles = [$roles];

    if (!in_array($user['rol'], $roles, true)) {
        http_response_code(403);
        echo '<!DOCTYPE html><html><body><h1>403 - Acceso denegado</h1></body></html>';
        exit;
    }
    return $user;
}

function hashPw(string $password): string {
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

function csrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function validateCsrf(): bool {
    $token = $_POST['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    return hash_equals(csrfToken(), $token);
}

function csrfField(): string {
    return '<input type="hidden" name="csrf_token" value="' . csrfToken() . '">';
}

function isAdmin(): bool {
    return ($_SESSION['user_rol'] ?? '') === 'admin';
}
