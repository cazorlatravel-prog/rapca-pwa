<?php
require_once 'config.php';

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

// Leer JSON del body
$raw = file_get_contents('php://input');
if (empty($raw)) {
    http_response_code(400);
    echo json_encode(['error' => 'Payload vacío. Verificar post_max_size en php.ini']);
    exit;
}

$input = json_decode($raw, true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON inválido']);
    exit;
}

$codigo = trim($input['codigo'] ?? '');
$imagen = $input['imagen'] ?? '';
$unidad = trim($input['unidad'] ?? '');
$tipo   = trim($input['tipo'] ?? '');

if (!$codigo || !$imagen || !$unidad || !$tipo) {
    http_response_code(400);
    echo json_encode(['error' => 'Faltan campos: codigo, imagen, unidad, tipo']);
    exit;
}

// --- Subir a Cloudinary ---
if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode(['error' => 'cURL no disponible en el servidor']);
    exit;
}

$timestamp  = time();
$folder     = 'rapca/' . $tipo . '/' . $unidad;
$public_id  = $codigo;

// Firma: parámetros ordenados alfabéticamente + API secret
$params_to_sign = 'folder=' . $folder . '&public_id=' . $public_id . '&timestamp=' . $timestamp;
$signature = sha1($params_to_sign . CLOUDINARY_API_SECRET);

$cloudinary_url = 'https://api.cloudinary.com/v1_1/' . CLOUDINARY_CLOUD_NAME . '/image/upload';

$post_fields = [
    'file'      => $imagen,
    'api_key'   => CLOUDINARY_API_KEY,
    'timestamp' => $timestamp,
    'signature' => $signature,
    'folder'    => $folder,
    'public_id' => $public_id
];

$ch = curl_init($cloudinary_url);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $post_fields,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_SSL_VERIFYPEER => true
]);

$result    = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(['error' => 'Error cURL: ' . $curlError]);
    exit;
}

$cloud = json_decode($result, true);

if ($httpCode !== 200 || !isset($cloud['secure_url'])) {
    http_response_code(500);
    echo json_encode([
        'error'     => 'Error Cloudinary',
        'http_code' => $httpCode,
        'response'  => $cloud
    ]);
    exit;
}

// --- Guardar en Base de Datos ---
$db_error = null;
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Crear tabla si no existe
    $pdo->exec("CREATE TABLE IF NOT EXISTS fotos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(100) NOT NULL,
        unidad VARCHAR(50) NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        cloudinary_url VARCHAR(500),
        public_id VARCHAR(200),
        ancho INT,
        alto INT,
        tamano INT,
        fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_unidad (unidad),
        INDEX idx_tipo (tipo),
        INDEX idx_codigo (codigo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $stmt = $pdo->prepare(
        'INSERT INTO fotos (codigo, unidad, tipo, cloudinary_url, public_id, ancho, alto, tamano)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $codigo,
        $unidad,
        $tipo,
        $cloud['secure_url'],
        $cloud['public_id'],
        $cloud['width']  ?? null,
        $cloud['height'] ?? null,
        $cloud['bytes']  ?? null
    ]);
} catch (PDOException $e) {
    $db_error = $e->getMessage();
}

// Respuesta exitosa
echo json_encode([
    'ok'        => true,
    'url'       => $cloud['secure_url'],
    'public_id' => $cloud['public_id'],
    'db_error'  => $db_error
]);
