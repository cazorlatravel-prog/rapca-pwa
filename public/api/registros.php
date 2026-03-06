<?php
/**
 * RAPCA Campo — API Registros (operador)
 */
declare(strict_types=1);

require_once __DIR__ . '/../../includes/auth.php';

header('Content-Type: application/json');

if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'No autenticado']);
    exit;
}

$pdo = getDB();
$user = currentUser();

// GET: listar registros o individual por ID
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Registro individual
    $id = (int)($_GET['id'] ?? 0);
    if ($id > 0) {
        $stmt = $pdo->prepare("SELECT r.* FROM registros r WHERE r.id = :id");
        $stmt->execute([':id' => $id]);
        $reg = $stmt->fetch();
        if ($reg && ($user['rol'] === 'admin' || (int)$reg['operador_id'] === $user['id'])) {
            echo json_encode(['registro' => $reg]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'No encontrado']);
        }
        exit;
    }

    $tipo = $_GET['tipo'] ?? '';
    $q = $_GET['q'] ?? '';

    $where = [];
    $params = [];

    if ($tipo) {
        $where[] = "r.tipo = :tipo";
        $params[':tipo'] = $tipo;
    }
    if ($q) {
        $where[] = "r.unidad LIKE :q";
        $params[':q'] = "%{$q}%";
    }
    // Operadores solo ven sus registros
    if ($user['rol'] !== 'admin') {
        $where[] = "r.operador_id = :uid";
        $params[':uid'] = $user['id'];
    }

    $whereSQL = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
    $stmt = $pdo->prepare("SELECT r.* FROM registros r {$whereSQL} ORDER BY r.fecha DESC, r.created_at DESC LIMIT 100");
    $stmt->execute($params);

    echo json_encode(['registros' => $stmt->fetchAll()]);
    exit;
}

// POST: save / delete
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals(csrfToken(), $token)) {
        echo json_encode(['ok' => false, 'error' => 'CSRF inválido']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $action = $input['action'] ?? '';

    if ($action === 'save') {
        $tipo = $input['tipo'] ?? '';
        $fecha = $input['fecha'] ?? '';
        $zona = $input['zona'] ?? '';
        $unidad = $input['unidad'] ?? '';
        $transecto = isset($input['transecto']) && $input['transecto'] ? (int)$input['transecto'] : null;
        $datos = $input['datos'] ?? '{}';
        $lat = isset($input['lat']) ? $input['lat'] : null;
        $lon = isset($input['lon']) ? $input['lon'] : null;
        $operadorEmail = $input['operador_email'] ?? $user['email'];
        $operadorNombre = $input['operador_nombre'] ?? $user['nombre'];

        if ($tipo === '' || $fecha === '' || $unidad === '') {
            echo json_encode(['ok' => false, 'error' => 'Tipo, fecha y unidad son obligatorios']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO registros (tipo, fecha, zona, unidad, transecto, datos, lat, lon, operador_id, operador_email, operador_nombre)
            VALUES (:tipo, :fecha, :zona, :unidad, :transecto, :datos, :lat, :lon, :op_id, :op_email, :op_nombre)");
        $stmt->execute([
            ':tipo'      => $tipo,
            ':fecha'     => $fecha,
            ':zona'      => $zona,
            ':unidad'    => $unidad,
            ':transecto' => $transecto,
            ':datos'     => $datos,
            ':lat'       => $lat,
            ':lon'       => $lon,
            ':op_id'     => $user['id'],
            ':op_email'  => $operadorEmail,
            ':op_nombre' => $operadorNombre,
        ]);

        echo json_encode(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
        exit;
    }

    if ($action === 'delete') {
        $id = (int)($input['id'] ?? 0);
        if ($id > 0) {
            // Check ownership
            $stmt = $pdo->prepare("SELECT operador_id FROM registros WHERE id = :id");
            $stmt->execute([':id' => $id]);
            $reg = $stmt->fetch();

            if ($reg && ($user['rol'] === 'admin' || (int)$reg['operador_id'] === $user['id'])) {
                $pdo->prepare("DELETE FROM fotos WHERE registro_id = :id")->execute([':id' => $id]);
                $pdo->prepare("DELETE FROM registros WHERE id = :id")->execute([':id' => $id]);
                echo json_encode(['ok' => true]);
            } else {
                echo json_encode(['ok' => false, 'error' => 'No autorizado']);
            }
            exit;
        }
    }
}

echo json_encode(['ok' => false, 'error' => 'Acción no válida']);
