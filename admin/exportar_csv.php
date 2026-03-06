<?php
/**
 * RAPCA Campo — Exportar registros como CSV
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

// Mismos filtros que registros.php
$where = [];
$params = [];

$filtroTipo = $_GET['tipo'] ?? '';
$filtroUnidad = $_GET['unidad'] ?? '';
$filtroOperador = $_GET['operador'] ?? '';
$filtroFechaDesde = $_GET['desde'] ?? '';
$filtroFechaHasta = $_GET['hasta'] ?? '';

if ($filtroTipo) { $where[] = "r.tipo = :tipo"; $params[':tipo'] = $filtroTipo; }
if ($filtroUnidad) { $where[] = "r.unidad LIKE :unidad"; $params[':unidad'] = "%{$filtroUnidad}%"; }
if ($filtroOperador) { $where[] = "r.operador_email = :op"; $params[':op'] = $filtroOperador; }
if ($filtroFechaDesde) { $where[] = "r.fecha >= :desde"; $params[':desde'] = $filtroFechaDesde; }
if ($filtroFechaHasta) { $where[] = "r.fecha <= :hasta"; $params[':hasta'] = $filtroFechaHasta; }
if ($user['rol'] !== 'admin') { $where[] = "r.operador_id = :uid"; $params[':uid'] = $user['id']; }

$whereSQL = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

$stmt = $pdo->prepare("SELECT r.*, u.nombre as op_nombre FROM registros r LEFT JOIN usuarios u ON r.operador_id = u.id {$whereSQL} ORDER BY r.fecha DESC");
$stmt->execute($params);
$registros = $stmt->fetchAll();

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename=registros_rapca_' . date('Ymd') . '.csv');

$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF"); // BOM
fputcsv($out, ['Tipo','Fecha','Zona','Unidad','Transecto','Operador','Email','Lat','Lon','Enviado','Pastoreo','Obs Pastoreo','Plantas Media','Palatables Media','Herbáceas Media','Matorral Cob','Matorral Alt','Matorral Vol','Observaciones'], ';');

foreach ($registros as $r) {
    $datos = json_decode($r['datos'], true) ?: [];
    $pastoreo = implode(', ', $datos['pastoreo'] ?? []);
    $obsPast = '';
    if (!empty($datos['observacionPastoreo'])) {
        $op = $datos['observacionPastoreo'];
        $obsPast = "Señal:{$op['senal']} Veredas:{$op['veredas']} Cagarrutas:{$op['cagarrutas']}";
    }

    fputcsv($out, [
        $r['tipo'],
        $r['fecha'],
        $r['zona'] ?? '',
        $r['unidad'],
        $r['transecto'] ?? '',
        $r['op_nombre'] ?? $r['operador_nombre'] ?? '',
        $r['operador_email'] ?? '',
        $r['lat'] ?? '',
        $r['lon'] ?? '',
        $r['enviado'] ? 'Sí' : 'No',
        $pastoreo,
        $obsPast,
        $datos['plantasMedia'] ?? '',
        $datos['palatablesMedia'] ?? '',
        $datos['herbaceasMedia'] ?? '',
        $datos['matorral']['mediaCob'] ?? '',
        $datos['matorral']['mediaAlt'] ?? '',
        $datos['matorral']['volumen'] ?? '',
        $datos['observaciones'] ?? '',
    ], ';');
}

fclose($out);
