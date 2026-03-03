<?php
// Devolver contenido KML de una capa por ID
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonError('Solo GET', 405);

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
if (!$id) jsonError('ID obligatorio');

try {
    $db = getDB();
    $stmt = $db->prepare("SELECT contenido_kml FROM rapca_capas_kml WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Capa no encontrada', 404);

    header('Content-Type: application/xml; charset=utf-8');
    echo $row['contenido_kml'];
    exit;
} catch (Exception $e) {
    jsonError('Error: ' . $e->getMessage(), 500);
}
