<?php
/**
 * RAPCA Campo — Login del operador de campo
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';

if (($_GET['action'] ?? '') === 'logout') {
    logout();
    header('Location: /public/login.php');
    exit;
}

if (isLoggedIn()) {
    header('Location: /public/operador.php');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    if ($email === '' || $password === '') {
        $error = 'Introduce email y contraseña';
    } else {
        $user = login($email, $password);
        if ($user) {
            header('Location: /public/operador.php');
            exit;
        } else {
            $error = 'Email o contraseña incorrectos';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>RAPCA Campo — Acceso</title>
    <link rel="manifest" href="/public/manifest.json">
    <meta name="theme-color" content="#1a3d2e">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="icon" href="/public/icons/icon-192.png">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a3d2e 0%, #2d6a4f 50%, #5b8c5a 100%);
            min-height: 100vh; min-height: 100dvh;
            display: flex; align-items: center; justify-content: center;
            padding: 1rem;
        }
        .login-card {
            background: #fff; border-radius: 20px; padding: 2rem;
            width: 100%; max-width: 360px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .logo { width: 72px; height: 72px; background: #1a3d2e; border-radius: 18px;
            display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; }
        .logo svg { width: 36px; height: 36px; fill: #88d8b0; }
        h2 { text-align: center; font-size: 1.3rem; color: #1a3d2e; margin-bottom: 0.25rem; }
        .subtitle { text-align: center; color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
        .field { margin-bottom: 1rem; }
        .field label { display: block; font-size: 0.8rem; font-weight: 600; color: #555; margin-bottom: 0.3rem; }
        .field input { width: 100%; padding: 0.7rem 0.9rem; border: 2px solid #e0e0e0; border-radius: 10px;
            font-size: 1rem; outline: none; transition: border-color 0.2s; }
        .field input:focus { border-color: #1a3d2e; }
        .btn-login { width: 100%; padding: 0.8rem; background: #1a3d2e; color: #fff; border: none;
            border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer;
            transition: background 0.2s; }
        .btn-login:active { background: #2d6a4f; }
        .error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;
            border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.85rem; margin-bottom: 1rem; }
        .admin-link { text-align: center; margin-top: 1rem; }
        .admin-link a { color: #888; font-size: 0.8rem; text-decoration: none; }
    </style>
</head>
<body>
    <div class="login-card">
        <div class="logo">
            <svg viewBox="0 0 24 24"><path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z"/></svg>
        </div>
        <h2>RAPCA Campo</h2>
        <p class="subtitle">Operador de campo</p>

        <?php if ($error): ?>
        <div class="error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <form method="POST" autocomplete="on">
            <div class="field">
                <label>Email</label>
                <input type="email" name="email" required autocomplete="email"
                       value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"
                       placeholder="tu@email.com" autofocus>
            </div>
            <div class="field">
                <label>Contraseña</label>
                <input type="password" name="password" required autocomplete="current-password"
                       placeholder="Tu contraseña">
            </div>
            <button type="submit" class="btn-login">Iniciar Sesión</button>
        </form>

        <div class="admin-link">
            <a href="/admin/login.php">Acceso administración</a>
        </div>
    </div>
</body>
</html>
