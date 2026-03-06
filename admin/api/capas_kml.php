<?php
/**
 * RAPCA Campo — API Capas KML
 */
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth.php';

if (!isLoggedIn()) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'No autenticado']);
    exit;
}

$pdo = getDB();
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Upload KML
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'upload') {
    header('Content-Type: application/json');
    $nombre = trim($_POST['nombre'] ?? '');
    $contenido = $_POST['contenido'] ?? '';

    if ($nombre === '' || $contenido === '') {
        echo json_encode(['ok' => false, 'error' => 'Nombre y contenido son obligatorios']);
        exit;
    }

    $stmt = $pdo->prepare("INSERT INTO capas_kml (nombre, contenido) VALUES (:nombre, :contenido)
        ON DUPLICATE KEY UPDATE contenido = VALUES(contenido)");
    $stmt->execute([':nombre' => $nombre, ':contenido' => $contenido]);

    echo json_encode(['ok' => true, 'id' => $pdo->lastInsertId()]);
    exit;
}

// Delete KML
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'delete') {
    header('Content-Type: application/json');
    $id = (int)($_POST['id'] ?? 0);
    $pdo->prepare("DELETE FROM capas_kml WHERE id = :id")->execute([':id' => $id]);
    echo json_encode(['ok' => true]);
    exit;
}

// Get KML content
if ($action === 'get') {
    header('Content-Type: application/json');
    $id = (int)($_GET['id'] ?? 0);
    $stmt = $pdo->prepare("SELECT * FROM capas_kml WHERE id = :id");
    $stmt->execute([':id' => $id]);
    echo json_encode($stmt->fetch() ?: []);
    exit;
}

// Export all records + infra as KML
if ($action === 'export_kml') {
    $registros = $pdo->query("SELECT * FROM registros WHERE lat IS NOT NULL AND lon IS NOT NULL")->fetchAll();
    $infras = $pdo->query("SELECT * FROM infraestructuras WHERE lat IS NOT NULL AND lon IS NOT NULL")->fetchAll();

    header('Content-Type: application/vnd.google-earth.kml+xml');
    header('Content-Disposition: attachment; filename=rapca_export_' . date('Ymd') . '.kml');

    echo '<?xml version="1.0" encoding="UTF-8"?>';
    echo '<kml xmlns="http://www.opengis.net/kml/2.2">';
    echo '<Document><name>RAPCA Campo Export ' . date('d/m/Y') . '</name>';

    // Estilos
    $styles = ['VP' => '88d8b0', 'EL' => '2ecc71', 'EI' => 'fd9853', 'INFRA' => '8e44ad'];
    foreach ($styles as $name => $color) {
        echo '<Style id="style-' . $name . '"><IconStyle><color>ff' . substr($color, 4, 2) . substr($color, 2, 2) . substr($color, 0, 2) . '</color>';
        echo '<scale>1.0</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon>';
        echo '</IconStyle></Style>';
    }

    // Registros
    echo '<Folder><name>Registros</name>';
    foreach ($registros as $r) {
        echo '<Placemark>';
        echo '<name>' . htmlspecialchars($r['tipo'] . ' - ' . $r['unidad']) . '</name>';
        echo '<description>' . htmlspecialchars($r['fecha'] . ($r['operador_nombre'] ? ' — ' . $r['operador_nombre'] : '')) . '</description>';
        echo '<styleUrl>#style-' . $r['tipo'] . '</styleUrl>';
        echo '<Point><coordinates>' . $r['lon'] . ',' . $r['lat'] . ',0</coordinates></Point>';
        echo '</Placemark>';
    }
    echo '</Folder>';

    // Infraestructuras
    echo '<Folder><name>Infraestructuras</name>';
    foreach ($infras as $i) {
        echo '<Placemark>';
        echo '<name>' . htmlspecialchars($i['id_unidad'] . ' — ' . ($i['nombre'] ?? '')) . '</name>';
        echo '<styleUrl>#style-INFRA</styleUrl>';
        echo '<Point><coordinates>' . $i['lon'] . ',' . $i['lat'] . ',0</coordinates></Point>';
        echo '</Placemark>';
    }
    echo '</Folder>';

    echo '</Document></kml>';
    exit;
}
