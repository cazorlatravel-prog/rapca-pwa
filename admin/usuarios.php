<?php
/**
 * RAPCA Campo — Gestión de usuarios (solo admin)
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireRole('admin');
$pdo = getDB();

$pageTitle = 'Usuarios — RAPCA Campo';
$msg = '';
$msgType = 'success';

// Acciones POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!validateCsrf()) { die('CSRF inválido'); }

    $action = $_POST['action'] ?? '';

    if ($action === 'create') {
        $nombre = trim($_POST['nombre'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        $rol = $_POST['rol'] ?? 'operador';

        if ($nombre === '' || $email === '' || $password === '') {
            $msg = 'Todos los campos son obligatorios';
            $msgType = 'danger';
        } else {
            $exists = $pdo->prepare("SELECT id FROM usuarios WHERE email = :email");
            $exists->execute([':email' => $email]);
            if ($exists->fetch()) {
                $msg = 'Ya existe un usuario con ese email';
                $msgType = 'danger';
            } else {
                $stmt = $pdo->prepare("INSERT INTO usuarios (nombre, email, password, rol) VALUES (:nombre, :email, :password, :rol)");
                $stmt->execute([
                    ':nombre'   => $nombre,
                    ':email'    => $email,
                    ':password' => hashPw($password),
                    ':rol'      => $rol,
                ]);
                $msg = "Usuario '{$nombre}' creado correctamente";
            }
        }
    }

    if ($action === 'toggle') {
        $id = (int)($_POST['id'] ?? 0);
        $pdo->prepare("UPDATE usuarios SET activo = NOT activo WHERE id = :id")->execute([':id' => $id]);
        $msg = 'Estado del usuario actualizado';
    }

    if ($action === 'change_password') {
        $id = (int)($_POST['id'] ?? 0);
        $newPw = $_POST['new_password'] ?? '';
        if ($newPw !== '') {
            $pdo->prepare("UPDATE usuarios SET password = :pw WHERE id = :id")
                ->execute([':pw' => hashPw($newPw), ':id' => $id]);
            $msg = 'Contraseña actualizada';
        }
    }

    if ($action === 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        $target = $pdo->prepare("SELECT email FROM usuarios WHERE id = :id");
        $target->execute([':id' => $id]);
        $targetUser = $target->fetch();

        if ($targetUser && $targetUser['email'] !== $user['email']) {
            $pdo->prepare("DELETE FROM usuarios WHERE id = :id")->execute([':id' => $id]);
            $msg = 'Usuario eliminado';
        } else {
            $msg = 'No puedes eliminarte a ti mismo';
            $msgType = 'danger';
        }
    }
}

$usuarios = $pdo->query("SELECT * FROM usuarios ORDER BY rol, nombre")->fetchAll();

require __DIR__ . '/includes/header.php';
?>

<h5 class="fw-bold mb-3"><i class="fas fa-users-cog me-2"></i>Gestión de Usuarios</h5>

<?php if ($msg): ?>
<div class="alert alert-<?= $msgType ?> py-2"><?= htmlspecialchars($msg) ?></div>
<?php endif; ?>

<!-- Crear usuario -->
<div class="card p-3 mb-4">
    <h6 class="fw-bold mb-3"><i class="fas fa-user-plus me-2"></i>Nuevo Usuario</h6>
    <form method="POST">
        <?= csrfField() ?>
        <input type="hidden" name="action" value="create">
        <div class="row g-2">
            <div class="col-md-3">
                <input type="text" name="nombre" class="form-control form-control-sm" placeholder="Nombre" required>
            </div>
            <div class="col-md-3">
                <input type="email" name="email" class="form-control form-control-sm" placeholder="Email" required>
            </div>
            <div class="col-md-2">
                <input type="password" name="password" class="form-control form-control-sm" placeholder="Contraseña" required>
            </div>
            <div class="col-md-2">
                <select name="rol" class="form-select form-select-sm">
                    <option value="operador">Operador</option>
                    <option value="admin">Administrador</option>
                </select>
            </div>
            <div class="col-md-2">
                <button type="submit" class="btn btn-sm btn-dark w-100">
                    <i class="fas fa-plus me-1"></i>Crear
                </button>
            </div>
        </div>
    </form>
</div>

<!-- Lista de usuarios -->
<div class="card p-0">
    <div class="table-responsive">
        <table class="table table-rapca table-hover mb-0">
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Último login</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($usuarios as $u): ?>
                <tr class="<?= !$u['activo'] ? 'table-secondary' : '' ?>">
                    <td><?= htmlspecialchars($u['nombre']) ?></td>
                    <td class="small"><?= htmlspecialchars($u['email']) ?></td>
                    <td>
                        <span class="badge <?= $u['rol'] === 'admin' ? 'bg-dark' : 'bg-secondary' ?>">
                            <?= $u['rol'] ?>
                        </span>
                    </td>
                    <td>
                        <form method="POST" class="d-inline">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="toggle">
                            <input type="hidden" name="id" value="<?= $u['id'] ?>">
                            <button type="submit" class="btn btn-sm p-0 px-2 <?= $u['activo'] ? 'btn-outline-success' : 'btn-outline-danger' ?>">
                                <?= $u['activo'] ? 'Activo' : 'Inactivo' ?>
                            </button>
                        </form>
                    </td>
                    <td class="small text-muted"><?= $u['ultimo_login'] ? date('d/m/Y H:i', strtotime($u['ultimo_login'])) : 'Nunca' ?></td>
                    <td>
                        <!-- Cambiar contraseña -->
                        <button class="btn btn-sm btn-outline-warning p-0 px-1" onclick="cambiarPw(<?= $u['id'] ?>)" title="Cambiar contraseña">
                            <i class="fas fa-key"></i>
                        </button>
                        <!-- Eliminar -->
                        <?php if ($u['email'] !== $user['email']): ?>
                        <form method="POST" class="d-inline" onsubmit="return confirm('¿Eliminar usuario?')">
                            <?= csrfField() ?>
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="id" value="<?= $u['id'] ?>">
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

<!-- Form oculto para cambiar contraseña -->
<form id="formPw" method="POST" style="display:none">
    <?= csrfField() ?>
    <input type="hidden" name="action" value="change_password">
    <input type="hidden" name="id" id="pwUserId">
    <input type="hidden" name="new_password" id="pwNewPassword">
</form>

</div><!-- /container -->

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
function cambiarPw(id) {
    const pw = prompt('Nueva contraseña:');
    if (pw && pw.length >= 4) {
        document.getElementById('pwUserId').value = id;
        document.getElementById('pwNewPassword').value = pw;
        document.getElementById('formPw').submit();
    }
}
</script>
</body>
</html>
