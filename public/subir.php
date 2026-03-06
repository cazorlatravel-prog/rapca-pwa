<?php
/**
 * RAPCA Campo — Subida de fotos a Cloudinary
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/cloudinary_helper.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'Método no permitido']);
    exit;
}

// Validate CSRF
$token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
if (!hash_equals(csrfToken(), $token)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'CSRF inválido']);
    exit;
}

$codigo = trim($_POST['codigo'] ?? '');
$data = $_POST['data'] ?? '';
$unidad = trim($_POST['unidad'] ?? '');
$tipo = trim($_POST['tipo'] ?? '');

if ($codigo === '' || $data === '') {
    echo json_encode(['ok' => false, 'error' => 'Código y datos son obligatorios']);
    exit;
}

$pdo = getDB();

// Determine photo type from code
$tipoFoto = 'general';
if (str_contains($codigo, '_W1_')) $tipoFoto = 'comparativa_w1';
elseif (str_contains($codigo, '_W2_')) $tipoFoto = 'comparativa_w2';

// Determine record type
$tipoRegistro = null;
if (str_contains($codigo, '_VP_')) $tipoRegistro = 'VP';
elseif (str_contains($codigo, '_EL_')) $tipoRegistro = 'EL';
elseif (str_contains($codigo, '_EI_')) $tipoRegistro = 'EI';

// Upload to Cloudinary
$folder = 'rapca/' . ($tipoRegistro ?? 'misc') . '/' . ($unidad ?: 'sin_unidad');
$result = uploadToCloudinary($data, $folder, $codigo);

$urlCloudinary = $result ? ($result['secure_url'] ?? $result['url'] ?? null) : null;

// Get GPS from session state if available
$lat = null;
$lon = null;
if (isset($_POST['lat']) && $_POST['lat'] !== '') $lat = (float)$_POST['lat'];
if (isset($_POST['lon']) && $_POST['lon'] !== '') $lon = (float)$_POST['lon'];

// Save to DB
try {
    $stmt = $pdo->prepare("INSERT INTO fotos (codigo, url_cloudinary, tipo_foto, unidad, tipo_registro, lat, lon, subida)
        VALUES (:codigo, :url, :tipo_foto, :unidad, :tipo_registro, :lat, :lon, :subida)
        ON DUPLICATE KEY UPDATE url_cloudinary = VALUES(url_cloudinary), subida = VALUES(subida)");
    $stmt->execute([
        ':codigo'       => $codigo,
        ':url'          => $urlCloudinary,
        ':tipo_foto'    => $tipoFoto,
        ':unidad'       => $unidad,
        ':tipo_registro'=> $tipoRegistro,
        ':lat'          => $lat,
        ':lon'          => $lon,
        ':subida'       => $urlCloudinary ? 1 : 0,
    ]);

    echo json_encode([
        'ok'  => true,
        'url' => $urlCloudinary,
        'codigo' => $codigo,
    ]);
} catch (PDOException $e) {
    error_log('Error guardando foto: ' . $e->getMessage());

    // Log error
    try {
        $pdo->prepare("INSERT INTO errores_subida (codigo_foto, error, usuario_id) VALUES (:codigo, :error, :uid)")
            ->execute([
                ':codigo' => $codigo,
                ':error'  => $e->getMessage(),
                ':uid'    => $_SESSION['user_id'] ?? null,
            ]);
    } catch (PDOException $e2) {}

    echo json_encode(['ok' => false, 'error' => 'Error al guardar foto']);
}
