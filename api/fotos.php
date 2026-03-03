<?php
// Obtener fotos de Cloudinary para una unidad o buscar ghost de visita anterior
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonError('Solo GET', 405);

try {
    $db = getDB();

    // Obtener ultima foto comparativa para ghost
    if (isset($_GET['ghost'])) {
        $unidad = isset($_GET['unidad']) ? trim($_GET['unidad']) : '';
        $subtipo = isset($_GET['subtipo']) ? trim($_GET['subtipo']) : '';
        if (!$unidad || !$subtipo) jsonError('unidad y subtipo obligatorios');

        $stmt = $db->prepare("SELECT url_cloudinary, codigo, fecha FROM rapca_fotos
            WHERE unidad = :unidad AND subtipo = :subtipo AND url_cloudinary IS NOT NULL
            ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([':unidad' => $unidad, ':subtipo' => $subtipo]);
        $foto = $stmt->fetch();

        jsonResponse(['ok' => true, 'foto' => $foto ?: null]);
    }

    // Obtener todas las fotos de una unidad
    if (isset($_GET['unidad'])) {
        $unidad = trim($_GET['unidad']);
        $stmt = $db->prepare("SELECT codigo, url_cloudinary, tipo, subtipo, lat, lon, fecha
            FROM rapca_fotos WHERE unidad = :unidad ORDER BY created_at DESC");
        $stmt->execute([':unidad' => $unidad]);
        jsonResponse(['ok' => true, 'fotos' => $stmt->fetchAll()]);
    }

    // Obtener todas las fotos con coordenadas (para mapa)
    if (isset($_GET['mapa'])) {
        $tipo = isset($_GET['tipo']) ? trim($_GET['tipo']) : '';
        $where = "WHERE lat IS NOT NULL AND lon IS NOT NULL";
        $params = [];
        if ($tipo && $tipo !== 'todos') {
            $where .= " AND tipo = :tipo";
            $params[':tipo'] = strtoupper($tipo);
        }
        $stmt = $db->prepare("SELECT codigo, url_cloudinary, unidad, tipo, subtipo, lat, lon, fecha
            FROM rapca_fotos $where ORDER BY created_at DESC LIMIT 500");
        $stmt->execute($params);
        jsonResponse(['ok' => true, 'fotos' => $stmt->fetchAll()]);
    }

    jsonError('Parametro no reconocido');
} catch (Exception $e) {
    jsonError('Error: ' . $e->getMessage(), 500);
}
