<?php
/**
 * RAPCA Campo — Dashboard principal
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$pageTitle = 'Dashboard — RAPCA Campo';

// Estadísticas
$totalRegistros = $pdo->query("SELECT COUNT(*) FROM registros")->fetchColumn();
$totalVP = $pdo->query("SELECT COUNT(*) FROM registros WHERE tipo='VP'")->fetchColumn();
$totalEL = $pdo->query("SELECT COUNT(*) FROM registros WHERE tipo='EL'")->fetchColumn();
$totalEI = $pdo->query("SELECT COUNT(*) FROM registros WHERE tipo='EI'")->fetchColumn();
$totalInfras = $pdo->query("SELECT COUNT(*) FROM infraestructuras")->fetchColumn();
$totalFotos = $pdo->query("SELECT COUNT(*) FROM fotos")->fetchColumn();
$pendientesSync = $pdo->query("SELECT COUNT(*) FROM registros WHERE enviado=0")->fetchColumn();
$totalOperadores = $pdo->query("SELECT COUNT(*) FROM usuarios WHERE rol='operador' AND activo=1")->fetchColumn();

// Últimos 30 días — actividad por día
$actividad = $pdo->query("
    SELECT DATE(fecha) as dia, tipo, COUNT(*) as total
    FROM registros
    WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY dia, tipo
    ORDER BY dia
")->fetchAll();

// Agrupar para chart
$diasActividad = [];
foreach ($actividad as $row) {
    $dia = $row['dia'];
    if (!isset($diasActividad[$dia])) $diasActividad[$dia] = ['VP' => 0, 'EL' => 0, 'EI' => 0];
    $diasActividad[$dia][$row['tipo']] = (int)$row['total'];
}

// Últimos registros
$ultimosRegistros = $pdo->query("
    SELECT r.*, u.nombre as op_nombre
    FROM registros r
    LEFT JOIN usuarios u ON r.operador_id = u.id
    ORDER BY r.created_at DESC
    LIMIT 10
")->fetchAll();

// Unidades sin EI
$unidadesSinEI = $pdo->query("
    SELECT DISTINCT i.id_unidad, i.nombre
    FROM infraestructuras i
    LEFT JOIN registros r ON r.unidad = i.id_unidad AND r.tipo = 'EI'
    WHERE r.id IS NULL
    ORDER BY i.id_unidad
    LIMIT 20
")->fetchAll();

require __DIR__ . '/includes/header.php';
?>

<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card stat-card p-3">
            <div class="d-flex align-items-center">
                <div class="stat-icon" style="background:var(--rapca-dark);">
                    <i class="fas fa-clipboard-list"></i>
                </div>
                <div class="ms-3">
                    <div class="text-muted small">Total Registros</div>
                    <div class="fw-bold fs-4"><?= $totalRegistros ?></div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card stat-card p-3">
            <div class="d-flex align-items-center">
                <div class="stat-icon" style="background:var(--rapca-vp);">
                    <i class="fas fa-eye"></i>
                </div>
                <div class="ms-3">
                    <div class="text-muted small">Visitas Previas</div>
                    <div class="fw-bold fs-4"><?= $totalVP ?></div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card stat-card p-3">
            <div class="d-flex align-items-center">
                <div class="stat-icon" style="background:var(--rapca-el);">
                    <i class="fas fa-clipboard-check"></i>
                </div>
                <div class="ms-3">
                    <div class="text-muted small">Ev. Ligeras</div>
                    <div class="fw-bold fs-4"><?= $totalEL ?></div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card stat-card p-3">
            <div class="d-flex align-items-center">
                <div class="stat-icon" style="background:var(--rapca-ei);">
                    <i class="fas fa-microscope"></i>
                </div>
                <div class="ms-3">
                    <div class="text-muted small">Ev. Intensas</div>
                    <div class="fw-bold fs-4"><?= $totalEI ?></div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="row g-3 mb-4">
    <div class="col-6 col-md-3">
        <div class="card stat-card p-3">
            <div class="d-flex align-items-center">
                <div class="stat-icon" style="background:var(--rapca-infra);">
                    <i class="fas fa-building"></i>
                </div>
                <div class="ms-3">
                    <div class="text-muted small">Infraestructuras</div>
                    <div class="fw-bold fs-4"><?= $totalInfras ?></div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card stat-card p-3">
            <div class="d-flex align-items-center">
                <div class="stat-icon" style="background:var(--rapca-map);">
                    <i class="fas fa-camera"></i>
                </div>
                <div class="ms-3">
                    <div class="text-muted small">Fotos</div>
                    <div class="fw-bold fs-4"><?= $totalFotos ?></div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card stat-card p-3">
            <div class="d-flex align-items-center">
                <div class="stat-icon" style="background:var(--rapca-dash);">
                    <i class="fas fa-sync-alt"></i>
                </div>
                <div class="ms-3">
                    <div class="text-muted small">Pend. Sync</div>
                    <div class="fw-bold fs-4"><?= $pendientesSync ?></div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-6 col-md-3">
        <div class="card stat-card p-3">
            <div class="d-flex align-items-center">
                <div class="stat-icon" style="background:var(--rapca-green);">
                    <i class="fas fa-users"></i>
                </div>
                <div class="ms-3">
                    <div class="text-muted small">Operadores</div>
                    <div class="fw-bold fs-4"><?= $totalOperadores ?></div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="row g-3">
    <!-- Chart actividad -->
    <div class="col-md-8">
        <div class="card p-3">
            <h6 class="fw-bold mb-3"><i class="fas fa-chart-bar me-2"></i>Actividad últimos 30 días</h6>
            <canvas id="chartActividad" height="200"></canvas>
        </div>
    </div>

    <!-- Chart tipos -->
    <div class="col-md-4">
        <div class="card p-3">
            <h6 class="fw-bold mb-3"><i class="fas fa-chart-pie me-2"></i>Distribución por tipo</h6>
            <canvas id="chartTipos" height="200"></canvas>
        </div>
    </div>
</div>

<div class="row g-3 mt-1">
    <!-- Alertas -->
    <div class="col-md-4">
        <div class="card p-3">
            <h6 class="fw-bold mb-3"><i class="fas fa-exclamation-triangle me-2 text-warning"></i>Alertas</h6>
            <?php if ($pendientesSync > 0): ?>
            <div class="alert alert-warning py-2 mb-2">
                <i class="fas fa-sync-alt me-1"></i><?= $pendientesSync ?> registros pendientes de sincronizar
            </div>
            <?php endif; ?>
            <?php if (count($unidadesSinEI) > 0): ?>
            <div class="alert alert-info py-2 mb-2">
                <i class="fas fa-info-circle me-1"></i><?= count($unidadesSinEI) ?> unidades sin Evaluación Intensa
                <ul class="mb-0 mt-1 small">
                    <?php foreach (array_slice($unidadesSinEI, 0, 5) as $u): ?>
                    <li><?= htmlspecialchars($u['id_unidad']) ?></li>
                    <?php endforeach; ?>
                    <?php if (count($unidadesSinEI) > 5): ?>
                    <li>... y <?= count($unidadesSinEI) - 5 ?> más</li>
                    <?php endif; ?>
                </ul>
            </div>
            <?php endif; ?>
            <?php if ($pendientesSync == 0 && count($unidadesSinEI) == 0): ?>
            <p class="text-muted mb-0"><i class="fas fa-check-circle text-success me-1"></i>Sin alertas pendientes</p>
            <?php endif; ?>
        </div>
    </div>

    <!-- Últimos registros -->
    <div class="col-md-8">
        <div class="card p-3">
            <h6 class="fw-bold mb-3"><i class="fas fa-history me-2"></i>Últimos registros</h6>
            <div class="table-responsive">
                <table class="table table-rapca table-sm">
                    <thead>
                        <tr><th>Tipo</th><th>Fecha</th><th>Unidad</th><th>Operador</th><th>Sync</th></tr>
                    </thead>
                    <tbody>
                        <?php foreach ($ultimosRegistros as $r): ?>
                        <tr>
                            <td><span class="badge badge-<?= strtolower($r['tipo']) ?>"><?= $r['tipo'] ?></span></td>
                            <td><?= htmlspecialchars($r['fecha']) ?></td>
                            <td><?= htmlspecialchars($r['unidad']) ?></td>
                            <td><?= htmlspecialchars($r['op_nombre'] ?? $r['operador_nombre'] ?? '-') ?></td>
                            <td>
                                <?php if ($r['enviado']): ?>
                                <i class="fas fa-check-circle text-success"></i>
                                <?php else: ?>
                                <i class="fas fa-clock text-warning"></i>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

</div><!-- /container -->

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
// Datos para charts
const diasData = <?= json_encode($diasActividad, JSON_HEX_TAG | JSON_HEX_AMP) ?>;
const dias = Object.keys(diasData);
const vpData = dias.map(d => diasData[d].VP);
const elData = dias.map(d => diasData[d].EL);
const eiData = dias.map(d => diasData[d].EI);

// Chart actividad
new Chart(document.getElementById('chartActividad'), {
    type: 'bar',
    data: {
        labels: dias.map(d => d.slice(5)), // MM-DD
        datasets: [
            { label: 'VP', data: vpData, backgroundColor: '#88d8b0' },
            { label: 'EL', data: elData, backgroundColor: '#2ecc71' },
            { label: 'EI', data: eiData, backgroundColor: '#fd9853' }
        ]
    },
    options: {
        responsive: true,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } }
    }
});

// Chart tipos
new Chart(document.getElementById('chartTipos'), {
    type: 'doughnut',
    data: {
        labels: ['VP', 'EL', 'EI'],
        datasets: [{
            data: [<?= $totalVP ?>, <?= $totalEL ?>, <?= $totalEI ?>],
            backgroundColor: ['#88d8b0', '#2ecc71', '#fd9853']
        }]
    },
    options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } }
    }
});
</script>
</body>
</html>
