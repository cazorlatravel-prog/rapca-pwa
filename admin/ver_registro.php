<?php
/**
 * RAPCA Campo — Ver detalle de un registro
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) { header('Location: /admin/registros.php'); exit; }

$stmt = $pdo->prepare("SELECT r.*, u.nombre as op_nombre FROM registros r LEFT JOIN usuarios u ON r.operador_id = u.id WHERE r.id = :id");
$stmt->execute([':id' => $id]);
$reg = $stmt->fetch();
if (!$reg) { header('Location: /admin/registros.php'); exit; }

$stmtF = $pdo->prepare("SELECT * FROM fotos WHERE registro_id = :id ORDER BY codigo");
$stmtF->execute([':id' => $id]);
$fotos = $stmtF->fetchAll();

$datos = json_decode($reg['datos'], true) ?: [];
$pageTitle = $reg['tipo'] . ' — ' . $reg['unidad'] . ' — RAPCA';

require __DIR__ . '/includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-3">
    <h5 class="fw-bold mb-0">
        <span class="badge badge-<?= strtolower($reg['tipo']) ?> me-2"><?= $reg['tipo'] ?></span>
        <?= htmlspecialchars($reg['unidad']) ?>
        <?php if ($reg['transecto']): ?>
        <span class="badge bg-secondary">T<?= $reg['transecto'] ?></span>
        <?php endif; ?>
    </h5>
    <div>
        <a href="/admin/generar_pdf.php?id=<?= $reg['id'] ?>" class="btn btn-sm btn-outline-secondary">
            <i class="fas fa-file-pdf me-1"></i>PDF
        </a>
        <a href="/admin/registros.php" class="btn btn-sm btn-outline-dark">
            <i class="fas fa-arrow-left me-1"></i>Volver
        </a>
    </div>
</div>

<div class="row g-3">
    <!-- Info general -->
    <div class="col-md-6">
        <div class="card p-3">
            <h6 class="fw-bold mb-3"><i class="fas fa-info-circle me-2"></i>Información General</h6>
            <table class="table table-sm mb-0">
                <tr><td class="text-muted">Tipo</td><td><span class="badge badge-<?= strtolower($reg['tipo']) ?>"><?= $reg['tipo'] ?></span></td></tr>
                <tr><td class="text-muted">Fecha</td><td><?= htmlspecialchars($reg['fecha']) ?></td></tr>
                <tr><td class="text-muted">Zona</td><td><?= htmlspecialchars($reg['zona'] ?? '-') ?></td></tr>
                <tr><td class="text-muted">Unidad</td><td><strong><?= htmlspecialchars($reg['unidad']) ?></strong></td></tr>
                <?php if ($reg['transecto']): ?>
                <tr><td class="text-muted">Transecto</td><td>T<?= $reg['transecto'] ?></td></tr>
                <?php endif; ?>
                <tr><td class="text-muted">Operador</td><td><?= htmlspecialchars($reg['op_nombre'] ?? $reg['operador_nombre'] ?? '-') ?><br><small class="text-muted"><?= htmlspecialchars($reg['operador_email'] ?? '') ?></small></td></tr>
                <tr><td class="text-muted">Coordenadas</td><td><?= $reg['lat'] ? $reg['lat'] . ', ' . $reg['lon'] : '-' ?></td></tr>
                <tr><td class="text-muted">Sincronizado</td><td><?= $reg['enviado'] ? '<i class="fas fa-check text-success"></i> Sí' : '<i class="fas fa-clock text-warning"></i> No' ?></td></tr>
            </table>
        </div>
    </div>

    <!-- Datos específicos del tipo -->
    <div class="col-md-6">
        <div class="card p-3">
            <h6 class="fw-bold mb-3"><i class="fas fa-clipboard me-2"></i>Datos de Evaluación</h6>

            <?php if (!empty($datos['pastoreo'])): ?>
            <p class="mb-1"><strong>Grado de Pastoreo:</strong></p>
            <div class="d-flex gap-1 mb-2">
                <?php foreach ($datos['pastoreo'] as $p): ?>
                <span class="badge bg-secondary"><?= htmlspecialchars($p) ?></span>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>

            <?php if (!empty($datos['observacionPastoreo'])): ?>
            <p class="mb-1"><strong>Observación Pastoreo:</strong></p>
            <table class="table table-sm mb-2">
                <?php foreach ($datos['observacionPastoreo'] as $k => $v): ?>
                <tr><td class="text-muted small"><?= htmlspecialchars(ucfirst($k)) ?></td><td><?= htmlspecialchars($v) ?></td></tr>
                <?php endforeach; ?>
            </table>
            <?php endif; ?>

            <?php if (!empty($datos['observaciones'])): ?>
            <p class="mb-1"><strong>Observaciones:</strong></p>
            <p class="small"><?= nl2br(htmlspecialchars($datos['observaciones'])) ?></p>
            <?php endif; ?>

            <?php if ($reg['tipo'] === 'EI'): ?>
                <?php if (!empty($datos['plantasMedia'])): ?>
                <p class="mb-1"><strong>Media Plantas:</strong> <span class="badge bg-primary"><?= htmlspecialchars($datos['plantasMedia']) ?></span></p>
                <?php endif; ?>
                <?php if (!empty($datos['palatablesMedia'])): ?>
                <p class="mb-1"><strong>Media Palatables:</strong> <span class="badge bg-info"><?= htmlspecialchars($datos['palatablesMedia']) ?></span></p>
                <?php endif; ?>
                <?php if (!empty($datos['herbaceasMedia'])): ?>
                <p class="mb-1"><strong>Media Herbáceas:</strong> <span class="badge bg-success"><?= htmlspecialchars($datos['herbaceasMedia']) ?></span></p>
                <?php endif; ?>
                <?php if (!empty($datos['matorral'])): ?>
                <p class="mb-1"><strong>Matorral:</strong></p>
                <table class="table table-sm">
                    <?php if (!empty($datos['matorral']['mediaCob'])): ?>
                    <tr><td class="text-muted">Media Cobertura</td><td><?= htmlspecialchars($datos['matorral']['mediaCob']) ?>%</td></tr>
                    <?php endif; ?>
                    <?php if (!empty($datos['matorral']['mediaAlt'])): ?>
                    <tr><td class="text-muted">Media Altura</td><td><?= htmlspecialchars($datos['matorral']['mediaAlt']) ?> cm</td></tr>
                    <?php endif; ?>
                    <?php if (!empty($datos['matorral']['volumen'])): ?>
                    <tr><td class="text-muted">Volumen</td><td><?= htmlspecialchars($datos['matorral']['volumen']) ?></td></tr>
                    <?php endif; ?>
                </table>
                <?php endif; ?>
            <?php endif; ?>
        </div>
    </div>

    <!-- Plantas (EI) -->
    <?php if ($reg['tipo'] === 'EI' && !empty($datos['plantas'])): ?>
    <div class="col-12">
        <div class="card p-3">
            <h6 class="fw-bold mb-3"><i class="fas fa-seedling me-2"></i>Plantas (10 puntos x 10 notas)</h6>
            <div class="table-responsive">
                <table class="table table-sm table-bordered mb-0">
                    <thead><tr><th>Especie</th><?php for ($i = 1; $i <= 10; $i++) echo "<th>N{$i}</th>"; ?><th>Media</th></tr></thead>
                    <tbody>
                        <?php foreach ($datos['plantas'] as $pl): ?>
                        <tr>
                            <td class="small"><em><?= htmlspecialchars($pl['nombre'] ?? '-') ?></em></td>
                            <?php foreach (($pl['notas'] ?? []) as $n): ?>
                            <td class="text-center"><?= $n ?></td>
                            <?php endforeach; ?>
                            <td class="fw-bold text-center"><?= $pl['media'] ?? '-' ?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- Fotos -->
    <div class="col-12">
        <div class="card p-3">
            <h6 class="fw-bold mb-3"><i class="fas fa-camera me-2"></i>Fotos (<?= count($fotos) ?>)</h6>
            <?php if (count($fotos) > 0): ?>
            <div class="photo-grid">
                <?php foreach ($fotos as $idx => $f): ?>
                <div>
                    <img src="<?= htmlspecialchars($f['url_cloudinary'] ?? '') ?>"
                         alt="<?= htmlspecialchars($f['codigo']) ?>"
                         onclick="abrirLightbox(<?= $idx ?>)"
                         onerror="this.parentElement.innerHTML='<div class=\'bg-light p-2 text-center small text-muted rounded\'>Sin imagen</div>'"
                         loading="lazy">
                    <small class="d-block text-muted text-center"><?= htmlspecialchars($f['codigo']) ?></small>
                </div>
                <?php endforeach; ?>
            </div>
            <?php else: ?>
            <p class="text-muted">Sin fotos asociadas</p>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- Lightbox -->
<div id="lightbox" class="lightbox-overlay" onclick="if(event.target===this)cerrarLB()">
    <button onclick="navLB(-1)" style="position:absolute;left:10px;top:50%;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer"><i class="fas fa-chevron-left"></i></button>
    <img id="lbImg" src="">
    <button onclick="navLB(1)" style="position:absolute;right:10px;top:50%;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer"><i class="fas fa-chevron-right"></i></button>
    <button onclick="cerrarLB()" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer"><i class="fas fa-times"></i></button>
</div>

</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
const fotosArr = <?= json_encode(array_column($fotos, 'url_cloudinary')) ?>;
let lbIdx = 0;

function abrirLightbox(i) {
    lbIdx = i;
    document.getElementById('lbImg').src = fotosArr[i] || '';
    document.getElementById('lightbox').classList.add('active');
}
function navLB(d) { lbIdx = (lbIdx + d + fotosArr.length) % fotosArr.length; document.getElementById('lbImg').src = fotosArr[lbIdx] || ''; event.stopPropagation(); }
function cerrarLB() { document.getElementById('lightbox').classList.remove('active'); }
document.addEventListener('keydown', e => {
    if (!document.getElementById('lightbox').classList.contains('active')) return;
    if (e.key === 'Escape') cerrarLB();
    if (e.key === 'ArrowLeft') navLB(-1);
    if (e.key === 'ArrowRight') navLB(1);
});
</script>
</body></html>
