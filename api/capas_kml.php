<?php
// CRUD para capas KML almacenadas en base de datos
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = getDB();

    if ($method === 'GET') {
        // Listar capas
        $stmt = $db->query("SELECT id, nombre, color, visible, created_at FROM rapca_capas_kml ORDER BY created_at DESC");
        jsonResponse(['ok' => true, 'capas' => $stmt->fetchAll()]);

    } elseif ($method === 'POST') {
        // Guardar nueva capa
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            // Intentar form data
            $input = $_POST;
        }
        $nombre = isset($input['nombre']) ? trim($input['nombre']) : '';
        $kml = isset($input['contenido_kml']) ? $input['contenido_kml'] : '';
        $color = isset($input['color']) ? trim($input['color']) : '#8b5cf6';

        if (!$nombre || !$kml) jsonError('Nombre y contenido KML obligatorios');

        $stmt = $db->prepare("INSERT INTO rapca_capas_kml (nombre, contenido_kml, color) VALUES (:nombre, :kml, :color)");
        $stmt->execute([':nombre' => $nombre, ':kml' => $kml, ':color' => $color]);

        jsonResponse(['ok' => true, 'id' => $db->lastInsertId(), 'message' => 'Capa guardada']);

    } elseif ($method === 'DELETE') {
        $input = json_decode(file_get_contents('php://input'), true);
        $id = isset($input['id']) ? intval($input['id']) : 0;
        if (!$id) jsonError('ID obligatorio');

        $stmt = $db->prepare("DELETE FROM rapca_capas_kml WHERE id = :id");
        $stmt->execute([':id' => $id]);

        jsonResponse(['ok' => true, 'message' => 'Capa eliminada']);

    } else {
        jsonError('Metodo no soportado', 405);
    }
} catch (Exception $e) {
    jsonError('Error: ' . $e->getMessage(), 500);
}
