<?php
/**
 * RAPCA Campo — Comparador de fotos entre fechas
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$pageTitle = 'Comparador — RAPCA Campo';

// Unidades con fotos comparativas
$unidades = $pdo->query("
    SELECT DISTINCT r.unidad
    FROM registros r
    INNER JOIN fotos f ON f.registro_id = r.id
    ORDER BY r.unidad
")->fetchAll(PDO::FETCH_COLUMN);

require __DIR__ . '/includes/header.php';
?>

<h5 class="fw-bold mb-3"><i class="fas fa-columns me-2"></i>Comparador de Fotos</h5>

<div class="card p-3 mb-3">
    <div class="row g-2 align-items-end">
        <div class="col-md-3">
            <label class="form-label small mb-0">Unidad</label>
            <select id="selUnidad" class="form-select form-select-sm" onchange="cargarFechas()">
                <option value="">Seleccionar unidad...</option>
                <?php foreach ($unidades as $u): ?>
                <option value="<?= htmlspecialchars($u) ?>"><?= htmlspecialchars($u) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="col-md-3">
            <label class="form-label small mb-0">Fecha 1</label>
            <select id="selFecha1" class="form-select form-select-sm" onchange="cargarFotos()">
                <option value="">—</option>
            </select>
        </div>
        <div class="col-md-3">
            <label class="form-label small mb-0">Fecha 2</label>
            <select id="selFecha2" class="form-select form-select-sm" onchange="cargarFotos()">
                <option value="">—</option>
            </select>
        </div>
        <div class="col-md-3">
            <div class="btn-group w-100">
                <button class="btn btn-sm btn-dark active" id="btnSlider" onclick="setModo('slider')">
                    <i class="fas fa-sliders-h me-1"></i>Slider
                </button>
                <button class="btn btn-sm btn-outline-dark" id="btnSide" onclick="setModo('side')">
                    <i class="fas fa-columns me-1"></i>Lado a lado
                </button>
            </div>
        </div>
    </div>
</div>

<div id="comparadorResult"></div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
let modo = 'slider';
let fotos1 = [], fotos2 = [];

async function cargarFechas() {
    const unidad = document.getElementById('selUnidad').value;
    if (!unidad) return;

    const res = await fetch('/admin/api/comparador.php?action=fechas&unidad=' + encodeURIComponent(unidad));
    const data = await res.json();

    ['selFecha1', 'selFecha2'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '<option value="">—</option>';
        data.fechas.forEach(f => {
            sel.innerHTML += '<option value="' + f.id + '">' + f.fecha + ' (' + f.tipo + ')</option>';
        });
    });
}

async function cargarFotos() {
    const r1 = document.getElementById('selFecha1').value;
    const r2 = document.getElementById('selFecha2').value;
    if (!r1 || !r2) return;

    const res = await fetch('/admin/api/comparador.php?action=fotos&r1=' + r1 + '&r2=' + r2);
    const data = await res.json();
    fotos1 = data.fotos1;
    fotos2 = data.fotos2;
    renderComparador();
}

function setModo(m) {
    modo = m;
    document.getElementById('btnSlider').className = 'btn btn-sm ' + (m === 'slider' ? 'btn-dark active' : 'btn-outline-dark');
    document.getElementById('btnSide').className = 'btn btn-sm ' + (m === 'side' ? 'btn-dark active' : 'btn-outline-dark');
    renderComparador();
}

function renderComparador() {
    const container = document.getElementById('comparadorResult');
    if (fotos1.length === 0 && fotos2.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">Sin fotos para comparar</p>';
        return;
    }

    const maxLen = Math.max(fotos1.length, fotos2.length);
    let html = '';

    if (modo === 'side') {
        html = '<div class="row g-3">';
        for (let i = 0; i < maxLen; i++) {
            const f1 = fotos1[i];
            const f2 = fotos2[i];
            html += '<div class="col-md-6"><div class="card p-2">';
            html += '<div class="row g-1">';
            html += '<div class="col-6">' + (f1 ? '<img src="' + f1.url_cloudinary + '" class="w-100" style="border-radius:8px"><small class="text-muted">' + f1.codigo + '</small>' : '<div class="bg-light p-4 text-center text-muted rounded">Sin foto</div>') + '</div>';
            html += '<div class="col-6">' + (f2 ? '<img src="' + f2.url_cloudinary + '" class="w-100" style="border-radius:8px"><small class="text-muted">' + f2.codigo + '</small>' : '<div class="bg-light p-4 text-center text-muted rounded">Sin foto</div>') + '</div>';
            html += '</div></div></div>';
        }
        html += '</div>';
    } else {
        // Slider mode
        for (let i = 0; i < maxLen; i++) {
            const f1 = fotos1[i];
            const f2 = fotos2[i];
            if (!f1 || !f2) continue;

            html += '<div class="card p-2 mb-3">';
            html += '<div class="comparador-container" style="position:relative;overflow:hidden;" data-idx="' + i + '">';
            html += '<img src="' + f2.url_cloudinary + '" class="w-100" style="display:block">';
            html += '<div style="position:absolute;top:0;left:0;width:50%;height:100%;overflow:hidden;" class="slider-clip">';
            html += '<img src="' + f1.url_cloudinary + '" style="width:200%;max-width:none;height:100%;object-fit:cover">';
            html += '</div>';
            html += '<div class="comparador-slider" style="left:50%"></div>';
            html += '</div>';
            html += '<div class="d-flex justify-content-between small text-muted mt-1"><span>' + f1.codigo + '</span><span>' + f2.codigo + '</span></div>';
            html += '</div>';
        }
    }

    container.innerHTML = html;

    // Activar sliders
    if (modo === 'slider') {
        document.querySelectorAll('.comparador-container').forEach(initSlider);
    }
}

function initSlider(container) {
    const slider = container.querySelector('.comparador-slider');
    const clip = container.querySelector('.slider-clip');
    let dragging = false;

    function move(x) {
        const rect = container.getBoundingClientRect();
        let pct = ((x - rect.left) / rect.width) * 100;
        pct = Math.max(0, Math.min(100, pct));
        slider.style.left = pct + '%';
        clip.style.width = pct + '%';
    }

    slider.addEventListener('mousedown', () => dragging = true);
    slider.addEventListener('touchstart', () => dragging = true);
    document.addEventListener('mousemove', e => { if (dragging) move(e.clientX); });
    document.addEventListener('touchmove', e => { if (dragging) move(e.touches[0].clientX); });
    document.addEventListener('mouseup', () => dragging = false);
    document.addEventListener('touchend', () => dragging = false);
}
</script>
</body>
</html>
