<?php
/**
 * RAPCA Campo — API Comparador de fotos
 */
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth.php';

header('Content-Type: application/json');

if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'No autenticado']);
    exit;
}

$pdo = getDB();
$action = $_GET['action'] ?? '';

if ($action === 'fechas') {
    $unidad = $_GET['unidad'] ?? '';
    $stmt = $pdo->prepare("
        SELECT r.id, r.fecha, r.tipo, r.transecto
        FROM registros r
        WHERE r.unidad = :unidad
        ORDER BY r.fecha DESC
    ");
    $stmt->execute([':unidad' => $unidad]);
    echo json_encode(['fechas' => $stmt->fetchAll()]);
    exit;
}

if ($action === 'fotos') {
    $r1 = (int)($_GET['r1'] ?? 0);
    $r2 = (int)($_GET['r2'] ?? 0);

    $stmt1 = $pdo->prepare("SELECT * FROM fotos WHERE registro_id = :id ORDER BY codigo");
    $stmt1->execute([':id' => $r1]);
    $fotos1 = $stmt1->fetchAll();

    $stmt2 = $pdo->prepare("SELECT * FROM fotos WHERE registro_id = :id ORDER BY codigo");
    $stmt2->execute([':id' => $r2]);
    $fotos2 = $stmt2->fetchAll();

    echo json_encode(['fotos1' => $fotos1, 'fotos2' => $fotos2]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Acción no válida']);
