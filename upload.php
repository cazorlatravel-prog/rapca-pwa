<?php
// Capturar errores fatales para devolver JSON genérico
register_shutdown_function(function() {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        error_log('RAPCA upload fatal: ' . $err['message'] . ' in ' . $err['file'] . ':' . $err['line']);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode(['error' => 'Error interno del servidor. Contacte al administrador.']);
    }
});

require_once 'auth_helper.php';

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
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
    echo json_encode([
        'error' => 'Payload vacío. La foto puede exceder el límite del servidor.',
        'causa_probable' => 'Tamaño máximo de envío: ' . ini_get('post_max_size')
    ]);
    exit;
}

$rawLen = strlen($raw);
$input = json_decode($raw, true);
if (!$input) {
    http_response_code(400);
    echo json_encode([
        'error' => 'JSON inválido',
        'detalle' => 'Tamaño recibido: ' . round($rawLen / 1024) . ' KB'
    ]);
    exit;
}

// --- AUTENTICACIÓN ---
$pdo = getDBConnection();

// Crear tabla fotos si no existe (una vez)
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
try { $pdo->exec("ALTER TABLE fotos ADD UNIQUE INDEX idx_codigo_unico (codigo)"); } catch (PDOException $ignore) {}

$user = requireAuth($pdo, $input);

// Validar campos
$codigo = trim($input['codigo'] ?? '');
$imagen = $input['imagen'] ?? '';
$unidad = trim($input['unidad'] ?? '');
$tipo   = trim($input['tipo'] ?? '');

if (!$codigo || !$imagen || !$unidad || !$tipo) {
    http_response_code(400);
    echo json_encode(['error' => 'Faltan campos: codigo, imagen, unidad, tipo']);
    exit;
}

// Validar formato de tipo y unidad (prevenir path traversal en Cloudinary)
if (!preg_match('/^[A-Za-z0-9]{1,10}$/', $tipo)) {
    http_response_code(400);
    echo json_encode(['error' => 'Tipo inválido']);
    exit;
}
if (!preg_match('/^[A-Za-z0-9_\-]{1,50}$/', $unidad)) {
    http_response_code(400);
    echo json_encode(['error' => 'Unidad inválida']);
    exit;
}

$imagenLen = strlen($imagen);

// --- Subir a Cloudinary ---
if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode(['error' => 'cURL no disponible en el servidor']);
    exit;
}

$timestamp  = time();
$folder     = 'rapca/' . $tipo . '/' . $unidad;
$public_id  = $codigo;

$params_to_sign = 'folder=' . $folder . '&invalidate=true&overwrite=true&public_id=' . $public_id . '&timestamp=' . $timestamp;
$signature = sha1($params_to_sign . CLOUDINARY_API_SECRET);

$cloudinary_url = 'https://api.cloudinary.com/v1_1/' . CLOUDINARY_CLOUD_NAME . '/image/upload';

$post_fields = [
    'file'       => $imagen,
    'api_key'    => CLOUDINARY_API_KEY,
    'timestamp'  => $timestamp,
    'signature'  => $signature,
    'folder'     => $folder,
    'public_id'  => $public_id,
    'overwrite'  => 'true',
    'invalidate' => 'true'
];

$ch = curl_init($cloudinary_url);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $post_fields,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 120,
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_SSL_VERIFYPEER => true
]);

$result    = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
$curlErrno = curl_errno($ch);
curl_close($ch);

if ($curlError) {
    error_log("RAPCA upload curl error: $curlError ($curlErrno) for $codigo");
    http_response_code(500);
    $msg = 'Error de conexión con el servicio de fotos';
    if ($curlErrno === 28) $msg .= '. Timeout: la foto tardó demasiado.';
    if ($curlErrno === 35 || $curlErrno === 60) $msg .= '. Problema de conexión SSL.';
    echo json_encode(['error' => $msg]);
    exit;
}

$cloud = json_decode($result, true);

if ($httpCode !== 200 || !isset($cloud['secure_url'])) {
    error_log("RAPCA upload cloudinary HTTP $httpCode for $codigo: " . substr($result, 0, 500));
    http_response_code(500);
    $causas = [
        401 => 'Error de configuración del servidor.',
        400 => 'Imagen rechazada. Revisar formato.',
        413 => 'Foto demasiado grande.',
        420 => 'Demasiadas peticiones. Esperar unos minutos.',
        500 => 'Error del servicio de fotos. Reintentar más tarde.'
    ];
    echo json_encode([
        'error' => 'Error al subir foto (HTTP ' . $httpCode . ')',
        'causa' => $causas[$httpCode] ?? 'Error inesperado'
    ]);
    exit;
}

// --- Guardar en Base de Datos ---
try {
    $stmt = $pdo->prepare(
        'INSERT INTO fotos (codigo, unidad, tipo, cloudinary_url, public_id, ancho, alto, tamano)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE cloudinary_url=VALUES(cloudinary_url), public_id=VALUES(public_id),
            ancho=VALUES(ancho), alto=VALUES(alto), tamano=VALUES(tamano), fecha_subida=NOW()'
    );
    $stmt->execute([
        $codigo, $unidad, $tipo,
        $cloud['secure_url'], $cloud['public_id'],
        $cloud['width'] ?? null, $cloud['height'] ?? null, $cloud['bytes'] ?? null
    ]);
} catch (PDOException $e) {
    error_log('RAPCA upload DB error: ' . $e->getMessage());
}

echo json_encode([
    'ok'        => true,
    'url'       => $cloud['secure_url'],
    'public_id' => $cloud['public_id']
]);
