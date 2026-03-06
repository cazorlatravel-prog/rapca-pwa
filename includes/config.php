<?php
/**
 * RAPCA Campo — Configuración global
 */

// -----------------------------------------------------------
// Cargar variables de entorno desde .env
// -----------------------------------------------------------
$_ENV_VARS = [];
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (strpos($line, '=') === false) continue;
        [$key, $value] = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value);
        if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'")) {
            $value = substr($value, 1, -1);
        }
        $_ENV_VARS[$key] = $value;
    }
}

function env(string $key, string $default = ''): string {
    global $_ENV_VARS;
    return $_ENV_VARS[$key] ?? $default;
}

// -----------------------------------------------------------
// Base de datos
// -----------------------------------------------------------
define('DB_HOST', env('DB_HOST', 'localhost'));
define('DB_NAME', env('DB_NAME', 'rapca_campo'));
define('DB_USER', env('DB_USER', 'root'));
$dbPass = env('DB_PASS');
if ($dbPass === '') $dbPass = env('DB_PASSWORD');
define('DB_PASS', $dbPass);
define('DB_CHARSET', 'utf8mb4');

// -----------------------------------------------------------
// Cloudinary
// -----------------------------------------------------------
define('CLOUDINARY_CLOUD_NAME', env('CLOUDINARY_CLOUD_NAME'));
define('CLOUDINARY_API_KEY',    env('CLOUDINARY_API_KEY'));
define('CLOUDINARY_API_SECRET', env('CLOUDINARY_API_SECRET'));

// -----------------------------------------------------------
// Google Forms sync
// -----------------------------------------------------------
define('GOOGLE_FORM_URL', env('GOOGLE_FORM_URL'));
define('GOOGLE_FORM_ENTRIES', [
    'tipo'      => env('GOOGLE_FORM_ENTRY_TIPO', 'entry.437432431'),
    'fecha'     => env('GOOGLE_FORM_ENTRY_FECHA', 'entry.1468491774'),
    'zona'      => env('GOOGLE_FORM_ENTRY_ZONA', 'entry.226003494'),
    'unidad'    => env('GOOGLE_FORM_ENTRY_UNIDAD', 'entry.1028582203'),
    'transecto' => env('GOOGLE_FORM_ENTRY_TRANSECTO', 'entry.1651846022'),
    'datos'     => env('GOOGLE_FORM_ENTRY_DATOS', 'entry.1220105245'),
]);

// -----------------------------------------------------------
// App
// -----------------------------------------------------------
$_appUrl = env('APP_URL');
if ($_appUrl === '') {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $_appUrl = $scheme . '://' . $host;
}
define('APP_URL', rtrim($_appUrl, '/'));
define('APP_NAME', 'RAPCA Campo');

// -----------------------------------------------------------
// Especies vegetales (para autocompletado)
// -----------------------------------------------------------
define('PLANTAS', [
    'Arbutus unedo','Asparagus acutifolius','Chamaerops humilis','Cistus sp.',
    'Crataegus monogyna','Cytisus sp.','Daphne gnidium','Dittrichia viscosa',
    'Foeniculum vulgare','Genista sp.','Halimium sp.','Helichrysum stoechas',
    'Juncus spp.','Juniperus sp.','Lavandula latifolia','Myrtus communis',
    'Olea europaea var. sylvestris','Phillyrea angustifolia','Phlomis purpurea',
    'Pistacia lentiscus','Quercus coccifera','Quercus ilex','Quercus sp.',
    'Retama sphaerocarpa','Rhamnus sp.','Rosa sp.','Rosmarinus officinalis',
    'Rubus ulmifolius','Salvia rosmarinus','Spartium junceum','Thymus sp.','Ulex sp.'
]);

// -----------------------------------------------------------
// Conexión PDO (singleton)
// -----------------------------------------------------------
function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}
