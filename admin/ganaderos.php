<?php
/**
 * RAPCA Campo — Gestión de Ganaderos
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$pageTitle = 'Ganaderos — RAPCA Campo';
$msg = '';
$msgType = 'success';

// POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!validateCsrf()) { die('CSRF inválido'); }

    $action = $_POST['action'] ?? '';

    if ($action === 'save') {
        $id = (int)($_POST['id'] ?? 0);
        $data = [
            ':nombre'        => trim($_POST['nombre'] ?? ''),
            ':nif'           => trim($_POST['nif'] ?? ''),
            ':telefono'      => trim($_POST['telefono'] ?? ''),
            ':email'         => trim($_POST['email'] ?? ''),
            ':direccion'     => trim($_POST['direccion'] ?? ''),
            ':municipio'     => trim($_POST['municipio'] ?? ''),
            ':provincia'     => trim($_POST['provincia'] ?? ''),
            ':tipo_ganado'   => trim($_POST['tipo_ganado'] ?? ''),
            ':num_cabezas'   => ($_POST['num_cabezas'] ?? '') !== '' ? (int)$_POST['num_cabezas'] : null,
            ':observaciones' => trim($_POST['observaciones'] ?? ''),
        ];

        if ($data[':nombre'] === '') {
            $msg = 'El nombre es obligatorio';
            $msgType = 'danger';
        } else {
            if ($id > 0) {
                $data[':id'] = $id;
                $pdo->prepare("UPDATE ganaderos SET
                    nombre=:nombre, nif=:nif, telefono=:telefono, email=:email, direccion=:direccion,
                    municipio=:municipio, provincia=:provincia, tipo_ganado=:tipo_ganado,
                    num_cabezas=:num_cabezas, observaciones=:observaciones
                    WHERE id=:id")->execute($data);
                $msg = 'Ganadero actualizado';
            } else {
                $pdo->prepare("INSERT INTO ganaderos
                    (nombre, nif, telefono, email, direccion, municipio, provincia, tipo_ganado, num_cabezas, observaciones)
                    VALUES (:nombre, :nif, :telefono, :email, :direccion, :municipio, :provincia, :tipo_ganado, :num_cabezas, :observaciones)")
                    ->execute($data);
                $msg = 'Ganadero creado';
            }
        }
    }

    if ($action === 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        $pdo->prepare("DELETE FROM ganaderos WHERE id = :id")->execute([':id' => $id]);
        $msg = 'Ganadero eliminado';
    }
}

$buscar = $_GET['q'] ?? '';
$where = '';
$params = [];
if ($buscar) {
    $where = "WHERE nombre LIKE :q OR nif LIKE :q2 OR municipio LIKE :q3";
    $params = [':q' => "%{$buscar}%", ':q2' => "%{$buscar}%", ':q3' => "%{$buscar}%"];
}

$stmt = $pdo->prepare("SELECT * FROM ganaderos {$where} ORDER BY nombre LIMIT 200");
$stmt->execute($params);
$ganaderos = $stmt->fetchAll();

$editando = null;
if (isset($_GET['edit'])) {
    $stmtE = $pdo->prepare("SELECT * FROM ganaderos WHERE id = :id");
    $stmtE->execute([':id' => (int)$_GET['edit']]);
    $editando = $stmtE->fetch();
}

require __DIR__ . '/includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-3">
    <h5 class="fw-bold mb-0"><i class="fas fa-cow me-2"></i>Ganaderos</h5>
    <button class="btn btn-sm btn-dark" onclick="toggleForm()"><i class="fas fa-plus me-1"></i>Nuevo</button>
</div>

<?php if ($msg): ?>
<div class="alert alert-<?= $msgType ?> py-2"><?= htmlspecialchars($msg) ?></div>
<?php endif; ?>

<!-- Formulario -->
<div id="formGan" class="card p-3 mb-3" style="display:<?= $editando ? 'block' : 'none' ?>;">
    <h6 class="fw-bold mb-3"><?= $editando ? 'Editar' : 'Nuevo' ?> Ganadero</h6>
    <form method="POST">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="save">
        <input type="hidden" name="id" value="<?= $editando['id'] ?? '' ?>">
        <div class="row g-2">
            <div class="col-md-4"><label class="form-label small mb-0">Nombre *</label>
                <input type="text" name="nombre" class="form-control form-control-sm" value="<?= htmlspecialchars($editando['nombre'] ?? '') ?>" required></div>
            <div class="col-md-2"><label class="form-label small mb-0">NIF</label>
                <input type="text" name="nif" class="form-control form-control-sm" value="<?= htmlspecialchars($editando['nif'] ?? '') ?>"></div>
            <div class="col-md-2"><label class="form-label small mb-0">Teléfono</label>
                <input type="text" name="telefono" class="form-control form-control-sm" value="<?= htmlspecialchars($editando['telefono'] ?? '') ?>"></div>
            <div class="col-md-4"><label class="form-label small mb-0">Email</label>
                <input type="email" name="email" class="form-control form-control-sm" value="<?= htmlspecialchars($editando['email'] ?? '') ?>"></div>
            <div class="col-md-4"><label class="form-label small mb-0">Dirección</label>
                <input type="text" name="direccion" class="form-control form-control-sm" value="<?= htmlspecialchars($editando['direccion'] ?? '') ?>"></div>
            <div class="col-md-2"><label class="form-label small mb-0">Municipio</label>
                <input type="text" name="municipio" class="form-control form-control-sm" value="<?= htmlspecialchars($editando['municipio'] ?? '') ?>"></div>
            <div class="col-md-2"><label class="form-label small mb-0">Provincia</label>
                <input type="text" name="provincia" class="form-control form-control-sm" value="<?= htmlspecialchars($editando['provincia'] ?? '') ?>"></div>
            <div class="col-md-2"><label class="form-label small mb-0">Tipo ganado</label>
                <input type="text" name="tipo_ganado" class="form-control form-control-sm" value="<?= htmlspecialchars($editando['tipo_ganado'] ?? '') ?>"></div>
            <div class="col-md-2"><label class="form-label small mb-0">Cabezas</label>
                <input type="number" name="num_cabezas" class="form-control form-control-sm" value="<?= $editando['num_cabezas'] ?? '' ?>"></div>
            <div class="col-12"><label class="form-label small mb-0">Observaciones</label>
                <textarea name="observaciones" class="form-control form-control-sm" rows="2"><?= htmlspecialchars($editando['observaciones'] ?? '') ?></textarea></div>
        </div>
        <div class="mt-3">
            <button type="submit" class="btn btn-sm btn-dark"><i class="fas fa-save me-1"></i>Guardar</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleForm()">Cancelar</button>
        </div>
    </form>
</div>

<!-- Buscar -->
<div class="filter-bar">
    <form method="GET" class="row g-2">
        <div class="col"><input type="text" name="q" class="form-control form-control-sm" placeholder="Buscar..." value="<?= htmlspecialchars($buscar) ?>"></div>
        <div class="col-auto"><button type="submit" class="btn btn-sm btn-dark"><i class="fas fa-search"></i></button></div>
    </form>
</div>

<!-- Tabla -->
<div class="card p-0">
    <div class="table-responsive">
        <table class="table table-rapca table-hover table-sm mb-0">
            <thead><tr><th>Nombre</th><th>NIF</th><th>Teléfono</th><th>Municipio</th><th>Tipo</th><th>Cabezas</th><th>Acciones</th></tr></thead>
            <tbody>
                <?php foreach ($ganaderos as $g): ?>
                <tr>
                    <td><strong><?= htmlspecialchars($g['nombre']) ?></strong></td>
                    <td class="small"><?= htmlspecialchars($g['nif'] ?? '-') ?></td>
                    <td class="small"><?= htmlspecialchars($g['telefono'] ?? '-') ?></td>
                    <td class="small"><?= htmlspecialchars($g['municipio'] ?? '-') ?></td>
                    <td class="small"><?= htmlspecialchars($g['tipo_ganado'] ?? '-') ?></td>
                    <td><?= $g['num_cabezas'] ?? '-' ?></td>
                    <td>
                        <a href="?edit=<?= $g['id'] ?>" class="btn btn-sm btn-outline-primary p-0 px-1"><i class="fas fa-edit"></i></a>
                        <form method="POST" class="d-inline" onsubmit="return confirm('¿Eliminar?')">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="id" value="<?= $g['id'] ?>">
                            <button class="btn btn-sm btn-outline-danger p-0 px-1"><i class="fas fa-trash"></i></button>
                        </form>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>function toggleForm(){const f=document.getElementById('formGan');f.style.display=f.style.display==='none'?'block':'none';}</script>
</body></html>
