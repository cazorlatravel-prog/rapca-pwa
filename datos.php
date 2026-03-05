<?php
require_once 'config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Método no permitido']); exit; }

$raw = file_get_contents('php://input');
$input = json_decode($raw, true);
if (!$input) { http_response_code(400); echo json_encode(['error' => 'JSON inválido']); exit; }

$action = trim($input['action'] ?? '');
$token = trim($input['token'] ?? '');

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Crear tabla de registros sincronizados
    $pdo->exec("CREATE TABLE IF NOT EXISTS registros_sync (
        id INT AUTO_INCREMENT PRIMARY KEY,
        registro_id BIGINT NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        fecha VARCHAR(20),
        zona VARCHAR(50),
        unidad VARCHAR(50),
        transecto VARCHAR(10),
        datos LONGTEXT,
        enviado TINYINT(1) DEFAULT 0,
        lat DOUBLE DEFAULT NULL,
        lon DOUBLE DEFAULT NULL,
        usuario_email VARCHAR(255),
        usuario_nombre VARCHAR(255),
        fecha_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_registro (registro_id, usuario_email),
        INDEX idx_usuario (usuario_email),
        INDEX idx_tipo (tipo),
        INDEX idx_unidad (unidad)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Añadir columnas lat/lon si no existen (migración)
    try { $pdo->exec("ALTER TABLE registros_sync ADD COLUMN lat DOUBLE DEFAULT NULL, ADD COLUMN lon DOUBLE DEFAULT NULL"); } catch (PDOException $ignore) {}

    // Crear tabla de infraestructuras
    $pdo->exec("CREATE TABLE IF NOT EXISTS infraestructuras_sync (
        id INT AUTO_INCREMENT PRIMARY KEY,
        infra_id BIGINT NOT NULL,
        provincia VARCHAR(100),
        idZona VARCHAR(50),
        idUnidad VARCHAR(50),
        codInfoca VARCHAR(50),
        nombre VARCHAR(200),
        superficie VARCHAR(50),
        pagoMaximo VARCHAR(50),
        municipio VARCHAR(100),
        pn VARCHAR(100),
        contrato VARCHAR(100),
        vegetacion VARCHAR(200),
        pendiente VARCHAR(50),
        distancia VARCHAR(50),
        lat DOUBLE DEFAULT NULL,
        lon DOUBLE DEFAULT NULL,
        extras LONGTEXT,
        usuario_email VARCHAR(255),
        fecha_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_infra (infra_id, usuario_email),
        INDEX idx_usuario_infra (usuario_email),
        INDEX idx_unidad_infra (idUnidad)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Crear tabla de ganaderos
    $pdo->exec("CREATE TABLE IF NOT EXISTS ganaderos_sync (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ganadero_id BIGINT NOT NULL,
        idGanadero VARCHAR(100),
        zonas VARCHAR(200),
        nombre VARCHAR(200),
        direccion VARCHAR(300),
        telefono VARCHAR(50),
        email VARCHAR(255),
        observaciones TEXT,
        extras LONGTEXT,
        usuario_email VARCHAR(255),
        fecha_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ganadero (ganadero_id, usuario_email),
        INDEX idx_usuario_gan (usuario_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Crear tabla de campos personalizados
    $pdo->exec("CREATE TABLE IF NOT EXISTS campos_extra_sync (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo ENUM('ganadero','infra') NOT NULL,
        campos LONGTEXT,
        usuario_email VARCHAR(255),
        fecha_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_campos (tipo, usuario_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

} catch (PDOException $e) {
    http_response_code(500);
    error_log('RAPCA datos DB error: ' . $e->getMessage());
    echo json_encode(['error' => 'Error de conexión con la base de datos']);
    exit;
}

// Validar sesión
function obtenerUsuario($pdo, $token) {
    if (!$token) return null;
    $stmt = $pdo->prepare("SELECT u.id, u.email, u.nombre, u.rol FROM usuarios u
                           INNER JOIN sesiones s ON s.usuario_id = u.id
                           WHERE s.token = ? AND u.activo = 1");
    $stmt->execute([$token]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

$user = obtenerUsuario($pdo, $token);
if (!$user) {
    http_response_code(401);
    echo json_encode(['error' => 'Sesión inválida']);
    exit;
}

switch ($action) {

    case 'guardar':
        $registro = $input['registro'] ?? null;
        if (!$registro) {
            echo json_encode(['error' => 'Registro vacío']);
            exit;
        }
        $stmt = $pdo->prepare("INSERT INTO registros_sync (registro_id, tipo, fecha, zona, unidad, transecto, datos, enviado, lat, lon, usuario_email, usuario_nombre)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE tipo=VALUES(tipo), fecha=VALUES(fecha), zona=VALUES(zona), unidad=VALUES(unidad),
                               transecto=VALUES(transecto), datos=VALUES(datos), enviado=VALUES(enviado), lat=VALUES(lat), lon=VALUES(lon), fecha_sync=NOW()");
        $stmt->execute([
            $registro['id'],
            $registro['tipo'] ?? '',
            $registro['fecha'] ?? '',
            $registro['zona'] ?? '',
            $registro['unidad'] ?? '',
            $registro['transecto'] ?? '',
            json_encode($registro['datos'] ?? []),
            $registro['enviado'] ? 1 : 0,
            $registro['lat'] ?? null,
            $registro['lon'] ?? null,
            $user['email'],
            $user['nombre']
        ]);
        echo json_encode(['ok' => true]);
        break;

    case 'listar':
        if ($user['rol'] === 'admin') {
            // Admin ve todos los registros
            $filtroEmail = trim($input['filtro_email'] ?? '');
            if ($filtroEmail) {
                $stmt = $pdo->prepare("SELECT * FROM registros_sync WHERE usuario_email = ? ORDER BY fecha_sync DESC");
                $stmt->execute([$filtroEmail]);
            } else {
                $stmt = $pdo->query("SELECT * FROM registros_sync ORDER BY fecha_sync DESC");
            }
        } else {
            // Operador solo ve los suyos
            $stmt = $pdo->prepare("SELECT * FROM registros_sync WHERE usuario_email = ? ORDER BY fecha_sync DESC");
            $stmt->execute([$user['email']]);
        }
        $registros = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Decodificar datos JSON
        foreach ($registros as &$r) {
            $r['datos'] = json_decode($r['datos'], true);
        }
        echo json_encode(['ok' => true, 'registros' => $registros]);
        break;

    case 'eliminar':
        $registroId = intval($input['registro_id'] ?? 0);
        if (!$registroId) {
            echo json_encode(['error' => 'ID de registro requerido']);
            exit;
        }
        if ($user['rol'] === 'admin') {
            $pdo->prepare("DELETE FROM registros_sync WHERE registro_id = ?")->execute([$registroId]);
        } else {
            $pdo->prepare("DELETE FROM registros_sync WHERE registro_id = ? AND usuario_email = ?")->execute([$registroId, $user['email']]);
        }
        echo json_encode(['ok' => true]);
        break;

    // --- Infraestructuras ---
    case 'guardar_infra':
        $infra = $input['infra'] ?? null;
        if (!$infra) {
            echo json_encode(['error' => 'Infraestructura vacía']);
            exit;
        }
        $stmt = $pdo->prepare("INSERT INTO infraestructuras_sync (infra_id, provincia, idZona, idUnidad, codInfoca, nombre, superficie, pagoMaximo, municipio, pn, contrato, vegetacion, pendiente, distancia, lat, lon, extras, usuario_email)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE provincia=VALUES(provincia), idZona=VALUES(idZona), idUnidad=VALUES(idUnidad), codInfoca=VALUES(codInfoca),
                               nombre=VALUES(nombre), superficie=VALUES(superficie), pagoMaximo=VALUES(pagoMaximo), municipio=VALUES(municipio),
                               pn=VALUES(pn), contrato=VALUES(contrato), vegetacion=VALUES(vegetacion), pendiente=VALUES(pendiente),
                               distancia=VALUES(distancia), lat=VALUES(lat), lon=VALUES(lon), extras=VALUES(extras), fecha_sync=NOW()");
        $stmt->execute([
            $infra['id'],
            $infra['provincia'] ?? '',
            $infra['idZona'] ?? '',
            $infra['idUnidad'] ?? '',
            $infra['codInfoca'] ?? '',
            $infra['nombre'] ?? '',
            $infra['superficie'] ?? '',
            $infra['pagoMaximo'] ?? '',
            $infra['municipio'] ?? '',
            $infra['pn'] ?? '',
            $infra['contrato'] ?? '',
            $infra['vegetacion'] ?? '',
            $infra['pendiente'] ?? '',
            $infra['distancia'] ?? '',
            $infra['lat'] ?? null,
            $infra['lon'] ?? null,
            json_encode($infra['extras'] ?? []),
            $user['email']
        ]);
        echo json_encode(['ok' => true]);
        break;

    case 'guardar_infras_lote':
        $infras = $input['infras'] ?? [];
        if (empty($infras)) {
            echo json_encode(['error' => 'Lista vacía']);
            exit;
        }
        $stmt = $pdo->prepare("INSERT INTO infraestructuras_sync (infra_id, provincia, idZona, idUnidad, codInfoca, nombre, superficie, pagoMaximo, municipio, pn, contrato, vegetacion, pendiente, distancia, lat, lon, extras, usuario_email)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE provincia=VALUES(provincia), idZona=VALUES(idZona), idUnidad=VALUES(idUnidad), codInfoca=VALUES(codInfoca),
                               nombre=VALUES(nombre), superficie=VALUES(superficie), pagoMaximo=VALUES(pagoMaximo), municipio=VALUES(municipio),
                               pn=VALUES(pn), contrato=VALUES(contrato), vegetacion=VALUES(vegetacion), pendiente=VALUES(pendiente),
                               distancia=VALUES(distancia), lat=VALUES(lat), lon=VALUES(lon), extras=VALUES(extras), fecha_sync=NOW()");
        $saved = 0;
        foreach ($infras as $infra) {
            $stmt->execute([
                $infra['id'],
                $infra['provincia'] ?? '',
                $infra['idZona'] ?? '',
                $infra['idUnidad'] ?? '',
                $infra['codInfoca'] ?? '',
                $infra['nombre'] ?? '',
                $infra['superficie'] ?? '',
                $infra['pagoMaximo'] ?? '',
                $infra['municipio'] ?? '',
                $infra['pn'] ?? '',
                $infra['contrato'] ?? '',
                $infra['vegetacion'] ?? '',
                $infra['pendiente'] ?? '',
                $infra['distancia'] ?? '',
                $infra['lat'] ?? null,
                $infra['lon'] ?? null,
                json_encode($infra['extras'] ?? []),
                $user['email']
            ]);
            $saved++;
        }
        echo json_encode(['ok' => true, 'guardadas' => $saved]);
        break;

    case 'listar_infras':
        if ($user['rol'] === 'admin') {
            $stmt = $pdo->query("SELECT * FROM infraestructuras_sync ORDER BY idUnidad ASC");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM infraestructuras_sync WHERE usuario_email = ? ORDER BY idUnidad ASC");
            $stmt->execute([$user['email']]);
        }
        $infras = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($infras as &$inf) {
            $inf['extras'] = json_decode($inf['extras'], true) ?: [];
        }
        echo json_encode(['ok' => true, 'infras' => $infras]);
        break;

    case 'eliminar_infra':
        $infraId = intval($input['infra_id'] ?? 0);
        if (!$infraId) {
            echo json_encode(['error' => 'ID de infraestructura requerido']);
            exit;
        }
        if ($user['rol'] === 'admin') {
            $pdo->prepare("DELETE FROM infraestructuras_sync WHERE infra_id = ?")->execute([$infraId]);
        } else {
            $pdo->prepare("DELETE FROM infraestructuras_sync WHERE infra_id = ? AND usuario_email = ?")->execute([$infraId, $user['email']]);
        }
        echo json_encode(['ok' => true]);
        break;

    // --- Ganaderos ---
    case 'guardar_ganadero':
        $ganadero = $input['ganadero'] ?? null;
        if (!$ganadero) {
            echo json_encode(['error' => 'Ganadero vacío']);
            exit;
        }
        $stmt = $pdo->prepare("INSERT INTO ganaderos_sync (ganadero_id, idGanadero, zonas, nombre, direccion, telefono, email, observaciones, extras, usuario_email)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE idGanadero=VALUES(idGanadero), zonas=VALUES(zonas), nombre=VALUES(nombre),
                               direccion=VALUES(direccion), telefono=VALUES(telefono), email=VALUES(email),
                               observaciones=VALUES(observaciones), extras=VALUES(extras), fecha_sync=NOW()");
        $stmt->execute([
            $ganadero['id'],
            $ganadero['idGanadero'] ?? '',
            $ganadero['zonas'] ?? '',
            $ganadero['nombre'] ?? '',
            $ganadero['direccion'] ?? '',
            $ganadero['telefono'] ?? '',
            $ganadero['email'] ?? '',
            $ganadero['observaciones'] ?? '',
            json_encode($ganadero['extras'] ?? []),
            $user['email']
        ]);
        echo json_encode(['ok' => true]);
        break;

    case 'guardar_ganaderos_lote':
        $ganaderos = $input['ganaderos'] ?? [];
        if (empty($ganaderos)) {
            echo json_encode(['error' => 'Lista vacía']);
            exit;
        }
        $stmt = $pdo->prepare("INSERT INTO ganaderos_sync (ganadero_id, idGanadero, zonas, nombre, direccion, telefono, email, observaciones, extras, usuario_email)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE idGanadero=VALUES(idGanadero), zonas=VALUES(zonas), nombre=VALUES(nombre),
                               direccion=VALUES(direccion), telefono=VALUES(telefono), email=VALUES(email),
                               observaciones=VALUES(observaciones), extras=VALUES(extras), fecha_sync=NOW()");
        $saved = 0;
        foreach ($ganaderos as $g) {
            $stmt->execute([
                $g['id'],
                $g['idGanadero'] ?? '',
                $g['zonas'] ?? '',
                $g['nombre'] ?? '',
                $g['direccion'] ?? '',
                $g['telefono'] ?? '',
                $g['email'] ?? '',
                $g['observaciones'] ?? '',
                json_encode($g['extras'] ?? []),
                $user['email']
            ]);
            $saved++;
        }
        echo json_encode(['ok' => true, 'guardados' => $saved]);
        break;

    case 'listar_ganaderos':
        if ($user['rol'] === 'admin') {
            $stmt = $pdo->query("SELECT * FROM ganaderos_sync ORDER BY idGanadero ASC");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM ganaderos_sync WHERE usuario_email = ? ORDER BY idGanadero ASC");
            $stmt->execute([$user['email']]);
        }
        $ganaderos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($ganaderos as &$g) {
            $g['extras'] = json_decode($g['extras'], true) ?: [];
        }
        echo json_encode(['ok' => true, 'ganaderos' => $ganaderos]);
        break;

    case 'eliminar_ganadero':
        $ganaderoId = intval($input['ganadero_id'] ?? 0);
        if (!$ganaderoId) {
            echo json_encode(['error' => 'ID de ganadero requerido']);
            exit;
        }
        if ($user['rol'] === 'admin') {
            $pdo->prepare("DELETE FROM ganaderos_sync WHERE ganadero_id = ?")->execute([$ganaderoId]);
        } else {
            $pdo->prepare("DELETE FROM ganaderos_sync WHERE ganadero_id = ? AND usuario_email = ?")->execute([$ganaderoId, $user['email']]);
        }
        echo json_encode(['ok' => true]);
        break;

    // --- Campos personalizados ---
    case 'guardar_campos':
        $tipo = trim($input['tipo'] ?? '');
        $campos = $input['campos'] ?? [];
        if (!in_array($tipo, ['ganadero', 'infra'])) {
            echo json_encode(['error' => 'Tipo inválido']);
            exit;
        }
        $stmt = $pdo->prepare("INSERT INTO campos_extra_sync (tipo, campos, usuario_email)
                               VALUES (?, ?, ?)
                               ON DUPLICATE KEY UPDATE campos=VALUES(campos), fecha_sync=NOW()");
        $stmt->execute([$tipo, json_encode($campos), $user['email']]);
        echo json_encode(['ok' => true]);
        break;

    case 'listar_campos':
        // Campos: el admin ve los suyos (son compartidos para todos)
        $stmt = $pdo->prepare("SELECT tipo, campos FROM campos_extra_sync WHERE usuario_email = ?");
        $stmt->execute([$user['email']]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $result = ['ganadero' => [], 'infra' => []];
        foreach ($rows as $row) {
            $result[$row['tipo']] = json_decode($row['campos'], true) ?: [];
        }
        // Si el usuario no tiene campos propios, buscar los del admin
        if (empty($result['ganadero']) || empty($result['infra'])) {
            $stmtAdmin = $pdo->query("SELECT tipo, campos FROM campos_extra_sync WHERE usuario_email IN (SELECT email FROM usuarios WHERE rol = 'admin') LIMIT 2");
            $adminRows = $stmtAdmin->fetchAll(PDO::FETCH_ASSOC);
            foreach ($adminRows as $row) {
                if (empty($result[$row['tipo']])) {
                    $result[$row['tipo']] = json_decode($row['campos'], true) ?: [];
                }
            }
        }
        echo json_encode(['ok' => true, 'campos' => $result]);
        break;

    default:
        echo json_encode(['error' => 'Acción no reconocida']);
        break;
}
