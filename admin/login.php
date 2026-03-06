<?php
/**
 * RAPCA Campo — Login del panel admin
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/rate_limit.php';

// Logout
if (($_GET['action'] ?? '') === 'logout') {
    logout();
    header('Location: /admin/login.php');
    exit;
}

// Si ya hay sesión, ir al dashboard
if (isLoggedIn()) {
    header('Location: /admin/');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    if (!checkRateLimit()) {
        $error = 'Demasiados intentos. Espera 15 minutos.';
    } elseif ($email === '' || $password === '') {
        $error = 'Introduce email y contraseña';
    } else {
        $user = login($email, $password);
        if ($user) {
            clearRateLimit();
            header('Location: /admin/');
            exit;
        } else {
            recordFailedAttempt();
            $remaining = getRateLimitRemaining();
            $error = 'Email o contraseña incorrectos';
            if ($remaining <= 2 && $remaining > 0) {
                $error .= " ({$remaining} intentos restantes)";
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>RAPCA Campo — Iniciar Sesión</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
    <style>
        body {
            background: linear-gradient(135deg, #1a3d2e 0%, #2d6a4f 50%, #5b8c5a 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-card {
            background: #fff;
            border-radius: 16px;
            padding: 2.5rem;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        }
        .login-logo {
            width: 80px;
            height: 80px;
            background: #1a3d2e;
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem;
        }
        .login-logo i { font-size: 2rem; color: #88d8b0; }
        .btn-rapca {
            background: #1a3d2e;
            color: #fff;
            border: none;
            padding: 0.75rem;
            border-radius: 10px;
            font-weight: 600;
        }
        .btn-rapca:hover { background: #2d6a4f; color: #fff; }
    </style>
</head>
<body>
    <div class="login-card">
        <div class="login-logo">
            <i class="fas fa-leaf"></i>
        </div>
        <h4 class="text-center mb-1 fw-bold">RAPCA Campo</h4>
        <p class="text-center text-muted mb-4">Panel de Administración</p>

        <?php if ($error): ?>
        <div class="alert alert-danger py-2"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <form method="POST" autocomplete="on">
            <div class="mb-3">
                <label class="form-label fw-semibold">Email</label>
                <div class="input-group">
                    <span class="input-group-text"><i class="fas fa-envelope"></i></span>
                    <input type="email" name="email" class="form-control" required
                           value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"
                           placeholder="tu@email.com" autofocus>
                </div>
            </div>
            <div class="mb-4">
                <label class="form-label fw-semibold">Contraseña</label>
                <div class="input-group">
                    <span class="input-group-text"><i class="fas fa-lock"></i></span>
                    <input type="password" name="password" class="form-control" required
                           placeholder="Tu contraseña">
                </div>
            </div>
            <button type="submit" class="btn btn-rapca w-100">
                <i class="fas fa-sign-in-alt me-2"></i>Iniciar Sesión
            </button>
        </form>

        <div class="text-center mt-3">
            <a href="/public/login.php" class="text-muted small">
                <i class="fas fa-mobile-alt me-1"></i>Acceso operador de campo
            </a>
        </div>
    </div>
</body>
</html>
