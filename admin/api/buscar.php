<?php
/**
 * RAPCA Campo — API Búsqueda global (Ctrl+K)
 */
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth.php';

header('Content-Type: application/json');

if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'No autenticado']);
    exit;
}

$q = trim($_GET['q'] ?? '');
if (strlen($q) < 2) {
    echo json_encode(['results' => []]);
    exit;
}

$pdo = getDB();
$results = [];
$like = "%{$q}%";

// Infraestructuras
$stmt = $pdo->prepare("SELECT id, id_unidad, nombre, provincia, municipio FROM infraestructuras WHERE id_unidad LIKE :q OR nombre LIKE :q2 OR municipio LIKE :q3 LIMIT 10");
$stmt->execute([':q' => $like, ':q2' => $like, ':q3' => $like]);
foreach ($stmt->fetchAll() as $row) {
    $results[] = [
        'type'  => 'infra',
        'title' => $row['id_unidad'] . ' — ' . ($row['nombre'] ?? ''),
        'sub'   => $row['provincia'] . ' / ' . $row['municipio'],
        'url'   => '/admin/infraestructuras.php?q=' . urlencode($row['id_unidad']),
    ];
}

// Registros
$stmt = $pdo->prepare("SELECT id, tipo, fecha, unidad, operador_nombre FROM registros WHERE unidad LIKE :q OR zona LIKE :q2 OR operador_nombre LIKE :q3 ORDER BY fecha DESC LIMIT 10");
$stmt->execute([':q' => $like, ':q2' => $like, ':q3' => $like]);
foreach ($stmt->fetchAll() as $row) {
    $results[] = [
        'type'  => 'registro',
        'title' => $row['tipo'] . ' — ' . $row['unidad'],
        'sub'   => $row['fecha'] . ' — ' . ($row['operador_nombre'] ?? ''),
        'url'   => '/admin/ver_registro.php?id=' . $row['id'],
    ];
}

// Ganaderos
$stmt = $pdo->prepare("SELECT id, nombre, municipio FROM ganaderos WHERE nombre LIKE :q OR municipio LIKE :q2 LIMIT 5");
$stmt->execute([':q' => $like, ':q2' => $like]);
foreach ($stmt->fetchAll() as $row) {
    $results[] = [
        'type'  => 'ganadero',
        'title' => $row['nombre'],
        'sub'   => $row['municipio'] ?? '',
        'url'   => '/admin/ganaderos.php?edit=' . $row['id'],
    ];
}

echo json_encode(['results' => $results]);
