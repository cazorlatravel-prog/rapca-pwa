<?php
/**
 * RAPCA Campo — Timeline / Historial de inspecciones
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$pageTitle = 'Historial — RAPCA Campo';

// Filtros
$filtroTipo = $_GET['tipo'] ?? '';
$filtroUnidad = $_GET['unidad'] ?? '';

$where = [];
$params = [];

if ($filtroTipo) {
    $where[] = "r.tipo = :tipo";
    $params[':tipo'] = $filtroTipo;
}
if ($filtroUnidad) {
    $where[] = "r.unidad LIKE :unidad";
    $params[':unidad'] = "%{$filtroUnidad}%";
}
if ($user['rol'] !== 'admin') {
    $where[] = "r.operador_id = :uid";
    $params[':uid'] = $user['id'];
}

$whereSQL = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

$registros = $pdo->prepare("
    SELECT r.*, u.nombre as op_nombre
    FROM registros r
    LEFT JOIN usuarios u ON r.operador_id = u.id
    {$whereSQL}
    ORDER BY r.fecha DESC, r.created_at DESC
    LIMIT 100
");
$registros->execute($params);
$registros = $registros->fetchAll();

// Fotos por registro
$fotosPorRegistro = [];
if (count($registros) > 0) {
    $ids = array_column($registros, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmtF = $pdo->prepare("SELECT * FROM fotos WHERE registro_id IN ({$placeholders}) ORDER BY codigo");
    $stmtF->execute($ids);
    foreach ($stmtF->fetchAll() as $f) {
        $fotosPorRegistro[$f['registro_id']][] = $f;
    }
}

require __DIR__ . '/includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-3">
    <h5 class="fw-bold mb-0"><i class="fas fa-stream me-2"></i>Historial</h5>
</div>

<!-- Filtros -->
<div class="filter-bar">
    <form method="GET" class="row g-2 align-items-end">
        <div class="col-auto">
            <select name="tipo" class="form-select form-select-sm">
                <option value="">Todos</option>
                <option value="VP" <?= $filtroTipo === 'VP' ? 'selected' : '' ?>>VP</option>
                <option value="EL" <?= $filtroTipo === 'EL' ? 'selected' : '' ?>>EL</option>
                <option value="EI" <?= $filtroTipo === 'EI' ? 'selected' : '' ?>>EI</option>
            </select>
        </div>
        <div class="col"><input type="text" name="unidad" class="form-control form-control-sm" placeholder="Buscar unidad..." value="<?= htmlspecialchars($filtroUnidad) ?>"></div>
        <div class="col-auto">
            <button type="submit" class="btn btn-sm btn-dark"><i class="fas fa-filter me-1"></i>Filtrar</button>
            <a href="/admin/timeline.php" class="btn btn-sm btn-outline-secondary">Limpiar</a>
        </div>
    </form>
</div>

<!-- Timeline -->
<?php if (count($registros) === 0): ?>
<p class="text-center text-muted py-4">No hay registros</p>
<?php endif; ?>

<?php
$currentDate = '';
foreach ($registros as $r):
    $datos = json_decode($r['datos'], true) ?: [];
    $fotos = $fotosPorRegistro[$r['id']] ?? [];

    if ($r['fecha'] !== $currentDate):
        $currentDate = $r['fecha'];
?>
<h6 class="fw-bold mt-4 mb-2 text-muted">
    <i class="fas fa-calendar me-1"></i><?= date('d/m/Y', strtotime($currentDate)) ?>
</h6>
<?php endif; ?>

<div class="timeline-item tipo-<?= strtolower($r['tipo']) ?>">
    <div class="d-flex justify-content-between align-items-start">
        <div>
            <span class="badge badge-<?= strtolower($r['tipo']) ?> me-2"><?= $r['tipo'] ?></span>
            <strong><?= htmlspecialchars($r['unidad']) ?></strong>
            <?php if ($r['transecto']): ?>
            <span class="badge bg-secondary ms-1">T<?= $r['transecto'] ?></span>
            <?php endif; ?>
            <span class="text-muted ms-2 small"><?= htmlspecialchars($r['zona'] ?? '') ?></span>
        </div>
        <small class="text-muted">
            <i class="fas fa-user me-1"></i><?= htmlspecialchars($r['op_nombre'] ?? $r['operador_nombre'] ?? '-') ?>
        </small>
    </div>

    <?php if (!empty($datos['observaciones'])): ?>
    <p class="mb-1 mt-1 small"><?= htmlspecialchars($datos['observaciones']) ?></p>
    <?php endif; ?>

    <?php if (count($fotos) > 0): ?>
    <div class="photo-grid mt-2">
        <?php foreach ($fotos as $idx => $f): ?>
        <img src="<?= htmlspecialchars($f['url_cloudinary'] ?? '') ?>"
             alt="<?= htmlspecialchars($f['codigo']) ?>"
             onclick="abrirLightbox(<?= $r['id'] ?>, <?= $idx ?>)"
             onerror="this.style.display='none'"
             loading="lazy">
        <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <div class="mt-1 d-flex gap-2">
        <a href="/admin/ver_registro.php?id=<?= $r['id'] ?>" class="small text-primary">
            <i class="fas fa-eye me-1"></i>Ver detalle
        </a>
        <a href="/admin/generar_pdf.php?id=<?= $r['id'] ?>" class="small text-secondary">
            <i class="fas fa-file-pdf me-1"></i>PDF
        </a>
    </div>
</div>
<?php endforeach; ?>

<!-- Lightbox -->
<div id="lightbox" class="lightbox-overlay" onclick="cerrarLightbox(event)">
    <button onclick="navLightbox(-1)" style="position:absolute;left:10px;top:50%;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer"><i class="fas fa-chevron-left"></i></button>
    <img id="lightboxImg" src="" alt="Foto">
    <button onclick="navLightbox(1)" style="position:absolute;right:10px;top:50%;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer"><i class="fas fa-chevron-right"></i></button>
    <button onclick="cerrarLightbox()" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer"><i class="fas fa-times"></i></button>
</div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
const fotosRegistro = <?= json_encode($fotosPorRegistro) ?>;
let lbRegistroId = null, lbIdx = 0, lbFotos = [];

function abrirLightbox(regId, idx) {
    lbRegistroId = regId;
    lbFotos = fotosRegistro[regId] || [];
    lbIdx = idx;
    mostrarFotoLB();
    document.getElementById('lightbox').classList.add('active');
}

function mostrarFotoLB() {
    if (lbFotos[lbIdx]) {
        document.getElementById('lightboxImg').src = lbFotos[lbIdx].url_cloudinary || '';
    }
}

function navLightbox(dir) {
    lbIdx = (lbIdx + dir + lbFotos.length) % lbFotos.length;
    mostrarFotoLB();
    event.stopPropagation();
}

function cerrarLightbox(e) {
    if (!e || e.target.id === 'lightbox') {
        document.getElementById('lightbox').classList.remove('active');
    }
}

document.addEventListener('keydown', function(e) {
    if (!document.getElementById('lightbox').classList.contains('active')) return;
    if (e.key === 'Escape') cerrarLightbox();
    if (e.key === 'ArrowLeft') navLightbox(-1);
    if (e.key === 'ArrowRight') navLightbox(1);
});
</script>
</body>
</html>
