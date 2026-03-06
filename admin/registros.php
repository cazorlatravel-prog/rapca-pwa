<?php
/**
 * RAPCA Campo — Gestión de registros (VP/EL/EI)
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$pageTitle = 'Registros — RAPCA Campo';

// Filtros
$filtroTipo = $_GET['tipo'] ?? '';
$filtroUnidad = $_GET['unidad'] ?? '';
$filtroOperador = $_GET['operador'] ?? '';
$filtroFechaDesde = $_GET['desde'] ?? '';
$filtroFechaHasta = $_GET['hasta'] ?? '';

// DELETE
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete') {
    if (!validateCsrf()) { die('CSRF inválido'); }
    $id = (int)($_POST['id'] ?? 0);
    if ($id > 0) {
        $pdo->prepare("DELETE FROM fotos WHERE registro_id = :id")->execute([':id' => $id]);
        $pdo->prepare("DELETE FROM registros WHERE id = :id")->execute([':id' => $id]);
        header('Location: /admin/registros.php?' . http_build_query($_GET));
        exit;
    }
}

// Sync individual
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'sync') {
    if (!validateCsrf()) { die('CSRF inválido'); }
    $id = (int)($_POST['id'] ?? 0);
    if ($id > 0) {
        $pdo->prepare("UPDATE registros SET enviado = 1 WHERE id = :id")->execute([':id' => $id]);
        header('Location: /admin/registros.php?' . http_build_query($_GET));
        exit;
    }
}

// Query
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
if ($filtroOperador) {
    $where[] = "(r.operador_email LIKE :op OR r.operador_nombre LIKE :op2)";
    $params[':op'] = "%{$filtroOperador}%";
    $params[':op2'] = "%{$filtroOperador}%";
}
if ($filtroFechaDesde) {
    $where[] = "r.fecha >= :desde";
    $params[':desde'] = $filtroFechaDesde;
}
if ($filtroFechaHasta) {
    $where[] = "r.fecha <= :hasta";
    $params[':hasta'] = $filtroFechaHasta;
}

// Solo propios si operador
if ($user['rol'] !== 'admin') {
    $where[] = "r.operador_id = :uid";
    $params[':uid'] = $user['id'];
}

$whereSQL = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

$sql = "SELECT r.*, u.nombre as op_nombre,
        (SELECT COUNT(*) FROM fotos f WHERE f.registro_id = r.id) as num_fotos
        FROM registros r
        LEFT JOIN usuarios u ON r.operador_id = u.id
        {$whereSQL}
        ORDER BY r.fecha DESC, r.created_at DESC
        LIMIT 200";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$registros = $stmt->fetchAll();

// Operadores para filtro — desde tabla usuarios (incluye los que aún no tienen registros)
$operadores = $pdo->query("SELECT id, nombre, email FROM usuarios WHERE activo = 1 ORDER BY nombre")->fetchAll();

// Unidades para filtro
$unidades = $pdo->query("SELECT DISTINCT unidad FROM registros ORDER BY unidad")->fetchAll();

require __DIR__ . '/includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-3">
    <h5 class="fw-bold mb-0"><i class="fas fa-clipboard-list me-2"></i>Registros</h5>
    <div>
        <a href="/admin/exportar_csv.php?<?= http_build_query($_GET) ?>" class="btn btn-sm btn-outline-secondary">
            <i class="fas fa-file-csv me-1"></i>Exportar CSV
        </a>
        <a href="/admin/generar_pdf.php" class="btn btn-sm btn-outline-secondary">
            <i class="fas fa-file-pdf me-1"></i>Exportar PDF
        </a>
    </div>
</div>

<!-- Filtros -->
<div class="filter-bar">
    <form method="GET" class="row g-2 align-items-end">
        <div class="col-auto">
            <label class="form-label small mb-0">Tipo</label>
            <select name="tipo" class="form-select form-select-sm">
                <option value="">Todos</option>
                <option value="VP" <?= $filtroTipo === 'VP' ? 'selected' : '' ?>>VP</option>
                <option value="EL" <?= $filtroTipo === 'EL' ? 'selected' : '' ?>>EL</option>
                <option value="EI" <?= $filtroTipo === 'EI' ? 'selected' : '' ?>>EI</option>
            </select>
        </div>
        <div class="col-auto">
            <label class="form-label small mb-0">Unidad</label>
            <input type="text" name="unidad" class="form-control form-control-sm" value="<?= htmlspecialchars($filtroUnidad) ?>" placeholder="Buscar...">
        </div>
        <div class="col-auto">
            <label class="form-label small mb-0">Operador</label>
            <select name="operador" class="form-select form-select-sm">
                <option value="">Todos</option>
                <?php foreach ($operadores as $op): ?>
                <option value="<?= htmlspecialchars($op['email']) ?>"
                    <?= $filtroOperador === $op['email'] ? 'selected' : '' ?>>
                    <?= htmlspecialchars($op['nombre']) ?> (<?= htmlspecialchars($op['email']) ?>)
                </option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="col-auto">
            <label class="form-label small mb-0">Desde</label>
            <input type="date" name="desde" class="form-control form-control-sm" value="<?= htmlspecialchars($filtroFechaDesde) ?>">
        </div>
        <div class="col-auto">
            <label class="form-label small mb-0">Hasta</label>
            <input type="date" name="hasta" class="form-control form-control-sm" value="<?= htmlspecialchars($filtroFechaHasta) ?>">
        </div>
        <div class="col-auto">
            <button type="submit" class="btn btn-sm btn-dark"><i class="fas fa-filter me-1"></i>Filtrar</button>
            <a href="/admin/registros.php" class="btn btn-sm btn-outline-secondary">Limpiar</a>
        </div>
    </form>
</div>

<!-- Tabla -->
<div class="card p-0">
    <div class="table-responsive">
        <table class="table table-rapca table-hover mb-0">
            <thead>
                <tr>
                    <th>Tipo</th>
                    <th>Fecha</th>
                    <th>Zona</th>
                    <th>Unidad</th>
                    <th>T</th>
                    <th>Operador</th>
                    <th>Fotos</th>
                    <th>Sync</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                <?php if (count($registros) === 0): ?>
                <tr><td colspan="9" class="text-center text-muted py-4">No hay registros</td></tr>
                <?php endif; ?>
                <?php foreach ($registros as $r): ?>
                <tr>
                    <td><span class="badge badge-<?= strtolower($r['tipo']) ?>"><?= $r['tipo'] ?></span></td>
                    <td><?= htmlspecialchars($r['fecha']) ?></td>
                    <td><?= htmlspecialchars($r['zona'] ?? '-') ?></td>
                    <td><strong><?= htmlspecialchars($r['unidad']) ?></strong></td>
                    <td><?= $r['transecto'] ? 'T' . $r['transecto'] : '-' ?></td>
                    <td class="small"><?= htmlspecialchars($r['op_nombre'] ?? $r['operador_nombre'] ?? '-') ?></td>
                    <td>
                        <?php if ($r['num_fotos'] > 0): ?>
                        <span class="badge bg-primary"><?= $r['num_fotos'] ?></span>
                        <?php else: ?>
                        <span class="text-muted">0</span>
                        <?php endif; ?>
                    </td>
                    <td>
                        <?php if ($r['enviado']): ?>
                        <i class="fas fa-check-circle text-success" title="Enviado"></i>
                        <?php else: ?>
                        <form method="POST" class="d-inline">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="sync">
                            <input type="hidden" name="id" value="<?= $r['id'] ?>">
                            <button type="submit" class="btn btn-sm btn-outline-warning p-0 px-1" title="Marcar como enviado">
                                <i class="fas fa-clock"></i>
                            </button>
                        </form>
                        <?php endif; ?>
                    </td>
                    <td>
                        <a href="/admin/ver_registro.php?id=<?= $r['id'] ?>" class="btn btn-sm btn-outline-primary p-0 px-1" title="Ver">
                            <i class="fas fa-eye"></i>
                        </a>
                        <a href="/admin/generar_pdf.php?id=<?= $r['id'] ?>" class="btn btn-sm btn-outline-secondary p-0 px-1" title="PDF">
                            <i class="fas fa-file-pdf"></i>
                        </a>
                        <?php if ($user['rol'] === 'admin'): ?>
                        <form method="POST" class="d-inline" onsubmit="return confirm('¿Eliminar este registro?')">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="id" value="<?= $r['id'] ?>">
                            <button type="submit" class="btn btn-sm btn-outline-danger p-0 px-1" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </form>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<p class="text-muted small mt-2">Mostrando <?= count($registros) ?> registros (máx. 200)</p>

</div><!-- /container -->

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
