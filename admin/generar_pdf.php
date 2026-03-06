<?php
/**
 * RAPCA Campo — Generar PDF de registros
 * Genera HTML imprimible que se imprime con window.print()
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$id = (int)($_GET['id'] ?? 0);

if ($id > 0) {
    // PDF de un registro individual
    $stmt = $pdo->prepare("SELECT r.*, u.nombre as op_nombre FROM registros r LEFT JOIN usuarios u ON r.operador_id = u.id WHERE r.id = :id");
    $stmt->execute([':id' => $id]);
    $registros = [$stmt->fetch()];
    if (!$registros[0]) { die('Registro no encontrado'); }
} else {
    // PDF de todos los registros
    $where = '';
    $params = [];
    if ($user['rol'] !== 'admin') {
        $where = 'WHERE r.operador_id = :uid';
        $params = [':uid' => $user['id']];
    }
    $stmt = $pdo->prepare("SELECT r.*, u.nombre as op_nombre FROM registros r LEFT JOIN usuarios u ON r.operador_id = u.id {$where} ORDER BY r.fecha DESC, r.unidad");
    $stmt->execute($params);
    $registros = $stmt->fetchAll();
}

// Fotos para todos los registros
$fotosPorRegistro = [];
$ids = array_column($registros, 'id');
if (count($ids) > 0) {
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmtF = $pdo->prepare("SELECT * FROM fotos WHERE registro_id IN ({$placeholders}) ORDER BY codigo");
    $stmtF->execute($ids);
    foreach ($stmtF->fetchAll() as $f) {
        $fotosPorRegistro[$f['registro_id']][] = $f;
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>RAPCA — Informe <?= $id ? $registros[0]['tipo'] . ' ' . $registros[0]['unidad'] : 'Completo' ?></title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; font-size: 11pt; color: #333; padding: 20px; }
        .page-break { page-break-before: always; }
        .header { background: #1a3d2e; color: #fff; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 16pt; }
        .header .meta { font-size: 9pt; opacity: 0.8; }
        .section { border: 1px solid #ddd; border-radius: 6px; margin-bottom: 15px; overflow: hidden; }
        .section-title { background: #f5f5f0; padding: 8px 12px; font-weight: bold; font-size: 10pt; border-bottom: 1px solid #ddd; }
        .section-body { padding: 10px 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 9pt; }
        td, th { padding: 4px 8px; border: 1px solid #ddd; }
        th { background: #1a3d2e; color: #fff; font-weight: 500; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: bold; color: #fff; }
        .badge-vp { background: #88d8b0; color: #1a3d2e; }
        .badge-el { background: #2ecc71; }
        .badge-ei { background: #fd9853; }
        .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .photos img { width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 4px; }
        .photos-comp { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="text-align:center;margin-bottom:20px;">
        <button onclick="window.print()" style="padding:10px 30px;font-size:14pt;background:#1a3d2e;color:#fff;border:none;border-radius:8px;cursor:pointer">
            Imprimir / Guardar PDF
        </button>
    </div>

    <?php foreach ($registros as $idx => $reg):
        $datos = json_decode($reg['datos'], true) ?: [];
        $fotos = $fotosPorRegistro[$reg['id']] ?? [];
    ?>
    <?php if ($idx > 0): ?><div class="page-break"></div><?php endif; ?>

    <div class="header">
        <div>
            <h1>RAPCA Campo — Informe <?= $reg['tipo'] ?></h1>
            <div class="meta"><?= htmlspecialchars($reg['unidad']) ?> | <?= htmlspecialchars($reg['fecha']) ?><?= $reg['transecto'] ? ' | T' . $reg['transecto'] : '' ?></div>
        </div>
        <div style="text-align:right">
            <div class="meta">Operador: <?= htmlspecialchars($reg['op_nombre'] ?? $reg['operador_nombre'] ?? '-') ?></div>
            <div class="meta"><?= $reg['lat'] ? $reg['lat'] . ', ' . $reg['lon'] : '' ?></div>
        </div>
    </div>

    <!-- Info general -->
    <div class="section">
        <div class="section-title">Datos Generales</div>
        <div class="section-body">
            <table>
                <tr><td style="width:120px;font-weight:bold">Tipo</td><td><span class="badge badge-<?= strtolower($reg['tipo']) ?>"><?= $reg['tipo'] ?></span></td>
                    <td style="width:120px;font-weight:bold">Zona</td><td><?= htmlspecialchars($reg['zona'] ?? '-') ?></td></tr>
                <tr><td style="font-weight:bold">Unidad</td><td><?= htmlspecialchars($reg['unidad']) ?></td>
                    <td style="font-weight:bold">Fecha</td><td><?= htmlspecialchars($reg['fecha']) ?></td></tr>
            </table>
        </div>
    </div>

    <!-- Pastoreo -->
    <?php if (!empty($datos['pastoreo'])): ?>
    <div class="section">
        <div class="section-title">Grado de Pastoreo</div>
        <div class="section-body">
            <?php foreach ($datos['pastoreo'] as $i => $p): ?>
            <span class="badge" style="background:#5b8c5a;margin-right:4px">Punto <?= $i + 1 ?>: <?= htmlspecialchars($p) ?></span>
            <?php endforeach; ?>
            <?php if (!empty($datos['observacionPastoreo'])): ?>
            <table style="margin-top:8px">
                <tr><th>Señal paso</th><th>Veredas</th><th>Cagarrutas</th></tr>
                <tr>
                    <td><?= htmlspecialchars($datos['observacionPastoreo']['senal'] ?? '-') ?></td>
                    <td><?= htmlspecialchars($datos['observacionPastoreo']['veredas'] ?? '-') ?></td>
                    <td><?= htmlspecialchars($datos['observacionPastoreo']['cagarrutas'] ?? '-') ?></td>
                </tr>
            </table>
            <?php endif; ?>
        </div>
    </div>
    <?php endif; ?>

    <!-- Plantas EI -->
    <?php if ($reg['tipo'] === 'EI' && !empty($datos['plantas'])): ?>
    <div class="section">
        <div class="section-title">Plantas — Media: <?= htmlspecialchars($datos['plantasMedia'] ?? '-') ?></div>
        <div class="section-body">
            <table>
                <tr><th>Especie</th><?php for ($i = 1; $i <= 10; $i++) echo "<th>N{$i}</th>"; ?><th>Media</th></tr>
                <?php foreach ($datos['plantas'] as $pl): ?>
                <tr>
                    <td><em><?= htmlspecialchars($pl['nombre'] ?? '-') ?></em></td>
                    <?php foreach (($pl['notas'] ?? []) as $n): ?><td style="text-align:center"><?= $n ?></td><?php endforeach; ?>
                    <td style="text-align:center;font-weight:bold"><?= $pl['media'] ?? '-' ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>
    </div>
    <?php endif; ?>

    <!-- Palatables -->
    <?php if (!empty($datos['palatables'])): ?>
    <div class="section">
        <div class="section-title">Palatables — Media: <?= htmlspecialchars($datos['palatablesMedia'] ?? '-') ?></div>
        <div class="section-body">
            <table>
                <tr><th>Especie</th><?php for ($i = 1; $i <= 15; $i++) echo "<th>{$i}</th>"; ?><th>Media</th></tr>
                <?php foreach ($datos['palatables'] as $pl): ?>
                <tr>
                    <td><em><?= htmlspecialchars($pl['nombre'] ?? '-') ?></em></td>
                    <?php foreach (($pl['notas'] ?? []) as $n): ?><td style="text-align:center"><?= $n ?></td><?php endforeach; ?>
                    <td style="text-align:center;font-weight:bold"><?= $pl['media'] ?? '-' ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>
    </div>
    <?php endif; ?>

    <!-- Herbáceas -->
    <?php if (!empty($datos['herbaceas'])): ?>
    <div class="section">
        <div class="section-title">Herbáceas — Media: <?= htmlspecialchars($datos['herbaceasMedia'] ?? '-') ?></div>
        <div class="section-body">
            <table><tr><?php foreach ($datos['herbaceas'] as $i => $h): ?><th>H<?= $i + 1 ?></th><?php endforeach; ?></tr>
            <tr><?php foreach ($datos['herbaceas'] as $h): ?><td style="text-align:center"><?= $h ?></td><?php endforeach; ?></tr></table>
        </div>
    </div>
    <?php endif; ?>

    <!-- Matorral -->
    <?php if (!empty($datos['matorral'])): ?>
    <div class="section">
        <div class="section-title">Matorralización</div>
        <div class="section-body">
            <table>
                <tr><th>Punto</th><th>Cobertura (%)</th><th>Altura (cm)</th><th>Especie</th></tr>
                <?php for ($p = 1; $p <= 2; $p++): $pt = $datos['matorral']["punto{$p}"] ?? []; ?>
                <tr><td>Punto <?= $p ?></td><td><?= $pt['cobertura'] ?? '-' ?></td><td><?= $pt['altura'] ?? '-' ?></td><td><?= htmlspecialchars($pt['especie'] ?? '-') ?></td></tr>
                <?php endfor; ?>
                <tr style="font-weight:bold"><td>Media</td><td><?= $datos['matorral']['mediaCob'] ?? '-' ?>%</td><td><?= $datos['matorral']['mediaAlt'] ?? '-' ?> cm</td><td>Vol: <?= $datos['matorral']['volumen'] ?? '-' ?></td></tr>
            </table>
        </div>
    </div>
    <?php endif; ?>

    <!-- Observaciones -->
    <?php if (!empty($datos['observaciones'])): ?>
    <div class="section">
        <div class="section-title">Observaciones</div>
        <div class="section-body"><?= nl2br(htmlspecialchars($datos['observaciones'])) ?></div>
    </div>
    <?php endif; ?>

    <!-- Fotos -->
    <?php if (count($fotos) > 0): ?>
    <div class="section">
        <div class="section-title">Fotos (<?= count($fotos) ?>)</div>
        <div class="section-body">
            <div class="photos">
                <?php foreach ($fotos as $f): ?>
                <?php if ($f['url_cloudinary']): ?>
                <div>
                    <img src="<?= htmlspecialchars($f['url_cloudinary']) ?>" loading="lazy">
                    <small style="display:block;text-align:center;font-size:7pt;color:#999"><?= htmlspecialchars($f['codigo']) ?></small>
                </div>
                <?php endif; ?>
                <?php endforeach; ?>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <?php endforeach; ?>

    <script>
    // Auto-print después de cargar imágenes
    window.addEventListener('load', function() {
        setTimeout(function() { /* window.print(); */ }, 1000);
    });
    </script>
</body>
</html>
