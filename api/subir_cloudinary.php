<?php
// Endpoint para subir fotos a Cloudinary y guardar referencia en BD
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('Solo POST', 405);

// Validar que hay archivo
if (!isset($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK) {
    jsonError('No se recibio la foto o hubo error de subida');
}

$file = $_FILES['foto'];
$codigo = isset($_POST['codigo']) ? trim($_POST['codigo']) : '';
$unidad = isset($_POST['unidad']) ? trim($_POST['unidad']) : '';
$tipo = isset($_POST['tipo']) ? trim($_POST['tipo']) : '';
$subtipo = isset($_POST['subtipo']) ? trim($_POST['subtipo']) : '';
$lat = isset($_POST['lat']) ? floatval($_POST['lat']) : null;
$lon = isset($_POST['lon']) ? floatval($_POST['lon']) : null;
$fecha = isset($_POST['fecha']) ? trim($_POST['fecha']) : date('Y-m-d');

if (!$codigo) jsonError('Codigo de foto obligatorio');

// Validar tipo MIME
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);
$allowed = ['image/jpeg', 'image/png', 'image/webp'];
if (!in_array($mime, $allowed)) jsonError('Tipo de archivo no permitido: ' . $mime);

// Subir a Cloudinary
$timestamp = time();
$folder = 'rapca/' . $unidad;
$publicId = $codigo;

// Generar firma SHA-256
$params = [
    'folder' => $folder,
    'public_id' => $publicId,
    'timestamp' => $timestamp
];
ksort($params);
$signStr = implode('&', array_map(function($k, $v) { return "$k=$v"; }, array_keys($params), array_values($params)));
$signature = hash('sha256', $signStr . CLOUD_API_SECRET);

// Preparar cURL
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => 'https://api.cloudinary.com/v1_1/' . CLOUD_NAME . '/image/upload',
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_POSTFIELDS => [
        'file' => new CURLFile($file['tmp_name'], $mime, $codigo . '.jpg'),
        'folder' => $folder,
        'public_id' => $publicId,
        'timestamp' => $timestamp,
        'api_key' => CLOUD_API_KEY,
        'signature' => $signature,
        'signature_algorithm' => 'sha256'
    ]
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) jsonError('Error cURL: ' . $curlError, 500);

$result = json_decode($response, true);
if (!$result || !isset($result['secure_url'])) {
    $errMsg = isset($result['error']['message']) ? $result['error']['message'] : 'Error desconocido';
    jsonError('Error Cloudinary: ' . $errMsg, 500);
}

$cloudUrl = $result['secure_url'];
$cloudPublicId = $result['public_id'];

// Guardar en BD
try {
    $db = getDB();
    $stmt = $db->prepare("INSERT INTO rapca_fotos (codigo, url_cloudinary, public_id, unidad, tipo, subtipo, lat, lon, fecha)
        VALUES (:codigo, :url, :pid, :unidad, :tipo, :subtipo, :lat, :lon, :fecha)
        ON DUPLICATE KEY UPDATE url_cloudinary = :url2, public_id = :pid2");
    $stmt->execute([
        ':codigo' => $codigo,
        ':url' => $cloudUrl,
        ':pid' => $cloudPublicId,
        ':unidad' => $unidad,
        ':tipo' => $tipo,
        ':subtipo' => $subtipo,
        ':lat' => $lat,
        ':lon' => $lon,
        ':fecha' => $fecha,
        ':url2' => $cloudUrl,
        ':pid2' => $cloudPublicId
    ]);
} catch (Exception $e) {
    // Foto subida a Cloudinary pero fallo BD - devolver URL igualmente
    jsonResponse([
        'ok' => true,
        'url' => $cloudUrl,
        'public_id' => $cloudPublicId,
        'warning' => 'Foto subida pero error BD: ' . $e->getMessage()
    ]);
}

jsonResponse([
    'ok' => true,
    'url' => $cloudUrl,
    'public_id' => $cloudPublicId,
    'codigo' => $codigo
]);
