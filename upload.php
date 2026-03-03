<?php
// Capturar errores fatales (memory_limit, etc.) para devolver JSON en vez de 500 genérico
register_shutdown_function(function() {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode([
            'error' => 'Error fatal PHP: ' . $err['message'],
            'file'  => basename($err['file']),
            'line'  => $err['line'],
            'diagnostico' => [
                'memory_limit'    => ini_get('memory_limit'),
                'memory_used_mb'  => round(memory_get_peak_usage(true) / 1048576, 1),
                'post_max_size'   => ini_get('post_max_size'),
                'max_execution_time' => ini_get('max_execution_time')
            ]
        ]);
    }
});

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

// --- Diagnóstico de límites PHP ---
$phpLimits = [
    'post_max_size'      => ini_get('post_max_size'),
    'upload_max_filesize' => ini_get('upload_max_filesize'),
    'memory_limit'       => ini_get('memory_limit'),
    'max_execution_time' => ini_get('max_execution_time')
];

// Leer JSON del body
$raw = file_get_contents('php://input');
if (empty($raw)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Payload vacío. El body no llegó al servidor.',
        'causa_probable' => 'La foto excede post_max_size (' . $phpLimits['post_max_size'] . '). PHP descarta el body completo cuando se supera este límite.',
        'solucion' => 'Aumentar post_max_size en php.ini (recomendado: 50M)',
        'php_limits' => $phpLimits
    ]);
    exit;
}

$rawLen = strlen($raw);
$input = json_decode($raw, true);
if (!$input) {
    $jsonErr = json_last_error_msg();
    http_response_code(400);
    echo json_encode([
        'error' => 'JSON inválido',
        'detalle' => 'Tamaño recibido: ' . round($rawLen / 1024) . ' KB, json_error: ' . $jsonErr,
        'causa_probable' => $rawLen < 1000 ? 'Truncamiento por post_max_size (' . $phpLimits['post_max_size'] . ')' : 'JSON malformado',
        'php_limits' => $phpLimits
    ]);
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

$imagenLen = strlen($imagen);

// --- Subir a Cloudinary ---
if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode(['error' => 'cURL no disponible en el servidor. Contactar con el hosting.']);
    exit;
}

$timestamp  = time();
$folder     = 'rapca/' . $tipo . '/' . $unidad;
$public_id  = $codigo;

// Firma: parámetros ordenados alfabéticamente + API secret
// Incluir invalidate y overwrite para permitir reintentos y resubidas
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
    http_response_code(500);
    $msg = 'Error de conexión con Cloudinary: ' . $curlError . ' (código cURL: ' . $curlErrno . ')';
    if ($curlErrno === 28) $msg .= '. Timeout: la foto tardó demasiado. Tamaño imagen: ' . round($imagenLen / 1024) . ' KB';
    if ($curlErrno === 35 || $curlErrno === 60) $msg .= '. Problema SSL del servidor.';
    echo json_encode([
        'error'      => $msg,
        'foto_size_kb' => round($imagenLen / 1024)
    ]);
    exit;
}

$cloud = json_decode($result, true);

if ($httpCode !== 200 || !isset($cloud['secure_url'])) {
    http_response_code(500);

    // Mensajes específicos según código HTTP de Cloudinary
    $causas = [
        401 => 'Credenciales de Cloudinary inválidas (API key o secret). Revisar config.php.',
        400 => 'Petición rechazada por Cloudinary. ' . ($cloud['error']['message'] ?? 'Revisar formato de imagen.'),
        413 => 'Foto demasiado grande para Cloudinary. Tamaño: ' . round($imagenLen / 1024) . ' KB.',
        420 => 'Demasiadas peticiones a Cloudinary (rate limit). Esperar unos minutos.',
        500 => 'Error interno de Cloudinary. Reintentar más tarde.'
    ];

    echo json_encode([
        'error'          => 'Error Cloudinary (HTTP ' . $httpCode . ')',
        'causa'          => $causas[$httpCode] ?? ('Respuesta inesperada de Cloudinary: HTTP ' . $httpCode),
        'cloudinary_msg' => $cloud['error']['message'] ?? ($cloud['error'] ?? null),
        'foto_size_kb'   => round($imagenLen / 1024),
        'php_limits'     => $phpLimits
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

    // Añadir índice único si no existe (para upsert en reintentos)
    try { $pdo->exec("ALTER TABLE fotos ADD UNIQUE INDEX idx_codigo_unico (codigo)"); } catch (PDOException $ignore) {}

    $stmt = $pdo->prepare(
        'INSERT INTO fotos (codigo, unidad, tipo, cloudinary_url, public_id, ancho, alto, tamano)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE cloudinary_url=VALUES(cloudinary_url), public_id=VALUES(public_id),
            ancho=VALUES(ancho), alto=VALUES(alto), tamano=VALUES(tamano), fecha_subida=NOW()'
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
