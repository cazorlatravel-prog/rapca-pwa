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

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de base de datos: ' . $e->getMessage()]);
    exit;
}

switch ($action) {

    case 'listar':
        // Filtros opcionales
        $unidad = trim($input['unidad'] ?? '');
        $tipo = trim($input['tipo'] ?? '');
        $desde = trim($input['desde'] ?? '');
        $hasta = trim($input['hasta'] ?? '');
        $limit = intval($input['limit'] ?? 500);
        $offset = intval($input['offset'] ?? 0);
        if ($limit > 1000) $limit = 1000;

        $where = [];
        $params = [];

        if ($unidad) {
            $where[] = 'unidad = ?';
            $params[] = $unidad;
        }
        if ($tipo) {
            $where[] = 'tipo = ?';
            $params[] = $tipo;
        }
        if ($desde) {
            $where[] = 'fecha_subida >= ?';
            $params[] = $desde . ' 00:00:00';
        }
        if ($hasta) {
            $where[] = 'fecha_subida <= ?';
            $params[] = $hasta . ' 23:59:59';
        }

        $sql = 'SELECT codigo, unidad, tipo, cloudinary_url, ancho, alto, tamano, fecha_subida FROM fotos';
        if (count($where) > 0) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' ORDER BY fecha_subida DESC LIMIT ' . $limit . ' OFFSET ' . $offset;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $fotos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Contar total
        $sqlCount = 'SELECT COUNT(*) FROM fotos';
        if (count($where) > 0) $sqlCount .= ' WHERE ' . implode(' AND ', $where);
        $stmtC = $pdo->prepare($sqlCount);
        $stmtC->execute($params);
        $total = $stmtC->fetchColumn();

        // Obtener lista de unidades y tipos disponibles para filtros
        $unidades = $pdo->query("SELECT DISTINCT unidad FROM fotos ORDER BY unidad")->fetchAll(PDO::FETCH_COLUMN);
        $tipos = $pdo->query("SELECT DISTINCT tipo FROM fotos ORDER BY tipo")->fetchAll(PDO::FETCH_COLUMN);

        echo json_encode([
            'ok' => true,
            'fotos' => $fotos,
            'total' => intval($total),
            'unidades' => $unidades,
            'tipos' => $tipos
        ]);
        break;

    case 'estadisticas':
        // Resumen de fotos por unidad y tipo
        $stmt = $pdo->query("SELECT unidad, tipo, COUNT(*) as total, MAX(fecha_subida) as ultima FROM fotos GROUP BY unidad, tipo ORDER BY unidad, tipo");
        $stats = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $totalFotos = $pdo->query("SELECT COUNT(*) FROM fotos")->fetchColumn();
        echo json_encode(['ok' => true, 'stats' => $stats, 'total' => intval($totalFotos)]);
        break;

    default:
        echo json_encode(['error' => 'Acción no reconocida: ' . $action]);
        break;
}
