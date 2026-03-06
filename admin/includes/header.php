<?php
/**
 * RAPCA Campo — Header compartido del panel admin
 */
$currentPage = basename($_SERVER['PHP_SELF'], '.php');
$user = currentUser();
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title><?= htmlspecialchars($pageTitle ?? 'RAPCA Campo') ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
    <?php if ($currentPage === 'mapa'): ?>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
    <?php endif; ?>
    <link rel="stylesheet" href="/admin/css/admin.css">
</head>
<body>
<nav class="navbar navbar-expand-lg navbar-dark" style="background:#1a3d2e;">
    <div class="container-fluid">
        <a class="navbar-brand fw-bold" href="/admin/">
            <i class="fas fa-leaf me-2"></i>RAPCA Campo
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navAdmin">
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navAdmin">
            <ul class="navbar-nav me-auto">
                <li class="nav-item">
                    <a class="nav-link <?= $currentPage === 'index' ? 'active' : '' ?>" href="/admin/">
                        <i class="fas fa-chart-line me-1"></i>Dashboard
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?= $currentPage === 'registros' ? 'active' : '' ?>" href="/admin/registros.php">
                        <i class="fas fa-clipboard-list me-1"></i>Registros
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?= $currentPage === 'infraestructuras' ? 'active' : '' ?>" href="/admin/infraestructuras.php">
                        <i class="fas fa-building me-1"></i>Infraestructuras
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?= $currentPage === 'ganaderos' ? 'active' : '' ?>" href="/admin/ganaderos.php">
                        <i class="fas fa-cow me-1"></i>Ganaderos
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?= $currentPage === 'mapa' ? 'active' : '' ?>" href="/admin/mapa.php">
                        <i class="fas fa-map-marked-alt me-1"></i>Mapa
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?= $currentPage === 'timeline' ? 'active' : '' ?>" href="/admin/timeline.php">
                        <i class="fas fa-stream me-1"></i>Historial
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?= $currentPage === 'comparador' ? 'active' : '' ?>" href="/admin/comparador.php">
                        <i class="fas fa-columns me-1"></i>Comparador
                    </a>
                </li>
                <?php if (isAdmin()): ?>
                <li class="nav-item">
                    <a class="nav-link <?= $currentPage === 'usuarios' ? 'active' : '' ?>" href="/admin/usuarios.php">
                        <i class="fas fa-users-cog me-1"></i>Usuarios
                    </a>
                </li>
                <?php endif; ?>
            </ul>
            <ul class="navbar-nav">
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown">
                        <i class="fas fa-user-circle me-1"></i><?= htmlspecialchars($user['nombre']) ?>
                        <span class="badge bg-light text-dark ms-1"><?= $user['rol'] ?></span>
                    </a>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li><a class="dropdown-item" href="/public/operador.php"><i class="fas fa-mobile-alt me-2"></i>App Operador</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="/admin/login.php?action=logout"><i class="fas fa-sign-out-alt me-2"></i>Cerrar sesión</a></li>
                    </ul>
                </li>
            </ul>
        </div>
    </div>
</nav>
<div class="container-fluid py-3">
