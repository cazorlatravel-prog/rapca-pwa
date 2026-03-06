<?php
/**
 * RAPCA Campo — Gestión de Infraestructuras
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$pageTitle = 'Infraestructuras — RAPCA Campo';
$msg = '';
$msgType = 'success';

// Acciones POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!validateCsrf()) { die('CSRF inválido'); }

    $action = $_POST['action'] ?? '';

    if ($action === 'save') {
        $id = (int)($_POST['id'] ?? 0);
        $data = [
            ':provincia'    => trim($_POST['provincia'] ?? ''),
            ':id_zona'      => trim($_POST['id_zona'] ?? ''),
            ':id_unidad'    => trim($_POST['id_unidad'] ?? ''),
            ':cod_infoca'   => trim($_POST['cod_infoca'] ?? ''),
            ':nombre'       => trim($_POST['nombre'] ?? ''),
            ':superficie'   => trim($_POST['superficie'] ?? ''),
            ':pago_maximo'  => trim($_POST['pago_maximo'] ?? ''),
            ':municipio'    => trim($_POST['municipio'] ?? ''),
            ':pn'           => trim($_POST['pn'] ?? ''),
            ':contrato'     => trim($_POST['contrato'] ?? ''),
            ':vegetacion'   => trim($_POST['vegetacion'] ?? ''),
            ':pendiente'    => trim($_POST['pendiente'] ?? ''),
            ':distancia'    => trim($_POST['distancia'] ?? ''),
        ];

        if ($data[':id_unidad'] === '') {
            $msg = 'ID Unidad es obligatorio';
            $msgType = 'danger';
        } else {
            if ($id > 0) {
                $data[':id'] = $id;
                $pdo->prepare("UPDATE infraestructuras SET
                    provincia=:provincia, id_zona=:id_zona, id_unidad=:id_unidad, cod_infoca=:cod_infoca,
                    nombre=:nombre, superficie=:superficie, pago_maximo=:pago_maximo, municipio=:municipio,
                    pn=:pn, contrato=:contrato, vegetacion=:vegetacion, pendiente=:pendiente, distancia=:distancia
                    WHERE id=:id")->execute($data);
                $msg = 'Infraestructura actualizada';
            } else {
                $pdo->prepare("INSERT INTO infraestructuras
                    (provincia, id_zona, id_unidad, cod_infoca, nombre, superficie, pago_maximo, municipio, pn, contrato, vegetacion, pendiente, distancia)
                    VALUES (:provincia, :id_zona, :id_unidad, :cod_infoca, :nombre, :superficie, :pago_maximo, :municipio, :pn, :contrato, :vegetacion, :pendiente, :distancia)")
                    ->execute($data);
                $msg = 'Infraestructura creada';
            }
        }
    }

    if ($action === 'delete') {
        if ($user['rol'] !== 'admin') {
            $msg = 'Solo administradores pueden eliminar';
            $msgType = 'danger';
        } else {
            $id = (int)($_POST['id'] ?? 0);
            $pdo->prepare("DELETE FROM infraestructuras WHERE id = :id")->execute([':id' => $id]);
            $msg = 'Infraestructura eliminada';
        }
    }

    if ($action === 'import_excel') {
        // Se procesa vía AJAX en admin/api/infraestructuras.php
    }
}

// Buscar
$buscar = $_GET['q'] ?? '';
$where = '';
$params = [];
if ($buscar) {
    $where = "WHERE id_unidad LIKE :q OR nombre LIKE :q2 OR provincia LIKE :q3 OR municipio LIKE :q4";
    $params = [':q' => "%{$buscar}%", ':q2' => "%{$buscar}%", ':q3' => "%{$buscar}%", ':q4' => "%{$buscar}%"];
}

$stmt = $pdo->prepare("SELECT i.*,
    (SELECT COUNT(*) FROM registros r WHERE r.unidad = i.id_unidad AND r.tipo='VP') as cnt_vp,
    (SELECT COUNT(*) FROM registros r WHERE r.unidad = i.id_unidad AND r.tipo='EL') as cnt_el,
    (SELECT COUNT(*) FROM registros r WHERE r.unidad = i.id_unidad AND r.tipo='EI') as cnt_ei
    FROM infraestructuras i {$where}
    ORDER BY i.id_unidad
    LIMIT 200");
$stmt->execute($params);
$infras = $stmt->fetchAll();

// Editar
$editando = null;
if (isset($_GET['edit'])) {
    $stmtE = $pdo->prepare("SELECT * FROM infraestructuras WHERE id = :id");
    $stmtE->execute([':id' => (int)$_GET['edit']]);
    $editando = $stmtE->fetch();
}

require __DIR__ . '/includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-3">
    <h5 class="fw-bold mb-0"><i class="fas fa-building me-2"></i>Infraestructuras</h5>
    <div>
        <button class="btn btn-sm btn-outline-success" onclick="document.getElementById('importFile').click()">
            <i class="fas fa-file-excel me-1"></i>Importar Excel
        </button>
        <a href="/admin/api/infraestructuras.php?action=export_excel" class="btn btn-sm btn-outline-secondary">
            <i class="fas fa-download me-1"></i>Exportar Excel
        </a>
        <button class="btn btn-sm btn-dark" onclick="toggleForm()">
            <i class="fas fa-plus me-1"></i>Nueva
        </button>
    </div>
    <input type="file" id="importFile" accept=".xlsx,.xls" style="display:none" onchange="importarExcel(this)">
</div>

<?php if ($msg): ?>
<div class="alert alert-<?= $msgType ?> py-2"><?= htmlspecialchars($msg) ?></div>
<?php endif; ?>

<!-- Formulario crear/editar -->
<div id="formInfra" class="card p-3 mb-3" style="display:<?= $editando ? 'block' : 'none' ?>;">
    <h6 class="fw-bold mb-3"><?= $editando ? 'Editar' : 'Nueva' ?> Infraestructura</h6>
    <form method="POST">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="save">
        <input type="hidden" name="id" value="<?= $editando['id'] ?? '' ?>">
        <div class="row g-2">
            <?php
            $campos = [
                ['provincia','PROVINCIA'], ['id_zona','ID ZONA'], ['id_unidad','ID UNIDAD *'],
                ['cod_infoca','COD INFOCA'], ['nombre','NOMBRE'], ['superficie','SUPERFICIE'],
                ['pago_maximo','PAGO MAXIMO'], ['municipio','MUNICIPIO'], ['pn','PN'],
                ['contrato','CONTRATO'], ['vegetacion','VEGETACION'], ['pendiente','PENDIENTE'],
                ['distancia','DISTANCIA']
            ];
            foreach ($campos as $c): ?>
            <div class="col-md-3 col-6">
                <label class="form-label small mb-0"><?= $c[1] ?></label>
                <input type="text" name="<?= $c[0] ?>" class="form-control form-control-sm"
                       value="<?= htmlspecialchars($editando[$c[0]] ?? '') ?>"
                       <?= $c[0] === 'id_unidad' ? 'required' : '' ?>>
            </div>
            <?php endforeach; ?>
        </div>
        <div class="mt-3">
            <button type="submit" class="btn btn-sm btn-dark"><i class="fas fa-save me-1"></i>Guardar</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleForm()">Cancelar</button>
        </div>
    </form>
</div>

<!-- Buscar -->
<div class="filter-bar">
    <form method="GET" class="row g-2 align-items-end">
        <div class="col">
            <input type="text" name="q" class="form-control form-control-sm" placeholder="Buscar unidad, nombre, provincia..." value="<?= htmlspecialchars($buscar) ?>">
        </div>
        <div class="col-auto">
            <button type="submit" class="btn btn-sm btn-dark"><i class="fas fa-search me-1"></i>Buscar</button>
        </div>
    </form>
</div>

<!-- Tabla -->
<div class="card p-0">
    <div class="table-responsive">
        <table class="table table-rapca table-hover table-sm mb-0">
            <thead>
                <tr>
                    <th>ID Unidad</th>
                    <th>Nombre</th>
                    <th>Provincia</th>
                    <th>Municipio</th>
                    <th>PN</th>
                    <th>VP</th>
                    <th>EL</th>
                    <th>EI</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($infras as $inf): ?>
                <tr>
                    <td><strong><?= htmlspecialchars($inf['id_unidad']) ?></strong></td>
                    <td><?= htmlspecialchars($inf['nombre'] ?? '-') ?></td>
                    <td class="small"><?= htmlspecialchars($inf['provincia'] ?? '-') ?></td>
                    <td class="small"><?= htmlspecialchars($inf['municipio'] ?? '-') ?></td>
                    <td class="small"><?= htmlspecialchars($inf['pn'] ?? '-') ?></td>
                    <td><span class="badge badge-vp"><?= $inf['cnt_vp'] ?></span></td>
                    <td><span class="badge badge-el"><?= $inf['cnt_el'] ?></span></td>
                    <td><span class="badge badge-ei"><?= $inf['cnt_ei'] ?></span></td>
                    <td>
                        <a href="?edit=<?= $inf['id'] ?>&q=<?= urlencode($buscar) ?>" class="btn btn-sm btn-outline-primary p-0 px-1" title="Editar">
                            <i class="fas fa-edit"></i>
                        </a>
                        <?php if ($user['rol'] === 'admin'): ?>
                        <form method="POST" class="d-inline" onsubmit="return confirm('¿Eliminar?')">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="id" value="<?= $inf['id'] ?>">
                            <button type="submit" class="btn btn-sm btn-outline-danger p-0 px-1"><i class="fas fa-trash"></i></button>
                        </form>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

</div><!-- /container -->

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js"></script>
<script>
function toggleForm() {
    const f = document.getElementById('formInfra');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

function importarExcel(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);

        fetch('/admin/api/infraestructuras.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': '<?= csrfToken() ?>'
            },
            body: JSON.stringify({ action: 'import', data: data })
        })
        .then(r => r.json())
        .then(res => {
            if (res.ok) {
                alert('Importadas ' + res.count + ' infraestructuras');
                location.reload();
            } else {
                alert('Error: ' + res.error);
            }
        });
    };
    reader.readAsBinaryString(file);
    input.value = '';
}
</script>
</body>
</html>
