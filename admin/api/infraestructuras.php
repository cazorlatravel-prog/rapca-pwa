<?php
/**
 * RAPCA Campo — API Infraestructuras
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
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Import Excel
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals(csrfToken(), $token)) {
        echo json_encode(['ok' => false, 'error' => 'CSRF inválido']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';

    if ($action === 'import') {
        $data = $input['data'] ?? [];
        $count = 0;

        // Map column names (Spanish headers from Excel)
        $columnMap = [
            'PROVINCIA' => 'provincia', 'ID ZONA' => 'id_zona', 'ID UNIDAD' => 'id_unidad',
            'COD INFOCA' => 'cod_infoca', 'NOMBRE' => 'nombre', 'SUPERFICIE' => 'superficie',
            'PAGO MAXIMO' => 'pago_maximo', 'MUNICIPIO' => 'municipio', 'PN' => 'pn',
            'CONTRATO' => 'contrato', 'VEGETACION' => 'vegetacion', 'PENDIENTE' => 'pendiente',
            'DISTANCIA' => 'distancia',
        ];

        $stmt = $pdo->prepare("INSERT INTO infraestructuras
            (provincia, id_zona, id_unidad, cod_infoca, nombre, superficie, pago_maximo, municipio, pn, contrato, vegetacion, pendiente, distancia)
            VALUES (:provincia, :id_zona, :id_unidad, :cod_infoca, :nombre, :superficie, :pago_maximo, :municipio, :pn, :contrato, :vegetacion, :pendiente, :distancia)
            ON DUPLICATE KEY UPDATE
            provincia=VALUES(provincia), nombre=VALUES(nombre), municipio=VALUES(municipio),
            superficie=VALUES(superficie), pago_maximo=VALUES(pago_maximo), pn=VALUES(pn),
            contrato=VALUES(contrato), vegetacion=VALUES(vegetacion), pendiente=VALUES(pendiente),
            distancia=VALUES(distancia), cod_infoca=VALUES(cod_infoca)");

        foreach ($data as $row) {
            $mapped = [];
            foreach ($columnMap as $excelCol => $dbCol) {
                $val = '';
                // Try exact match first, then case-insensitive
                foreach ($row as $k => $v) {
                    if (strtoupper(trim($k)) === $excelCol) {
                        $val = trim((string)$v);
                        break;
                    }
                }
                $mapped[$dbCol] = $val;
            }

            if ($mapped['id_unidad'] === '') continue;

            try {
                $stmt->execute([
                    ':provincia'   => $mapped['provincia'],
                    ':id_zona'     => $mapped['id_zona'],
                    ':id_unidad'   => $mapped['id_unidad'],
                    ':cod_infoca'  => $mapped['cod_infoca'],
                    ':nombre'      => $mapped['nombre'],
                    ':superficie'  => $mapped['superficie'],
                    ':pago_maximo' => $mapped['pago_maximo'],
                    ':municipio'   => $mapped['municipio'],
                    ':pn'          => $mapped['pn'],
                    ':contrato'    => $mapped['contrato'],
                    ':vegetacion'  => $mapped['vegetacion'],
                    ':pendiente'   => $mapped['pendiente'],
                    ':distancia'   => $mapped['distancia'],
                ]);
                $count++;
            } catch (PDOException $e) {
                // Skip duplicates
            }
        }

        echo json_encode(['ok' => true, 'count' => $count]);
        exit;
    }
}

// Export Excel (redirect to download)
if ($action === 'export_excel') {
    $infras = $pdo->query("SELECT * FROM infraestructuras ORDER BY id_unidad")->fetchAll();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename=infraestructuras_' . date('Ymd') . '.csv');

    $out = fopen('php://output', 'w');
    // BOM for Excel UTF-8
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['PROVINCIA','ID ZONA','ID UNIDAD','COD INFOCA','NOMBRE','SUPERFICIE','PAGO MAXIMO','MUNICIPIO','PN','CONTRATO','VEGETACION','PENDIENTE','DISTANCIA'], ';');

    foreach ($infras as $i) {
        fputcsv($out, [
            $i['provincia'], $i['id_zona'], $i['id_unidad'], $i['cod_infoca'],
            $i['nombre'], $i['superficie'], $i['pago_maximo'], $i['municipio'],
            $i['pn'], $i['contrato'], $i['vegetacion'], $i['pendiente'], $i['distancia']
        ], ';');
    }
    fclose($out);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Acción no válida']);
