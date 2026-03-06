<?php
/**
 * RAPCA Campo — Interfaz del Operador de Campo
 *
 * App móvil PWA con 3 modos: VP, EL, EI
 * Incluye cámara, GPS, autocompletado de plantas, transectos
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/config.php';

if (session_status() === PHP_SESSION_NONE) session_start();

$userId = (int)($_SESSION['user_id'] ?? 0);
$userRol = $_SESSION['user_rol'] ?? '';
$userName = $_SESSION['user_name'] ?? 'Operador';
$userEmail = $_SESSION['user_email'] ?? '';

if ($userId <= 0) {
    header('Location: /public/login.php');
    exit;
}

$pdo = getDB();

// Obtener plantas para autocompletado
$plantas = json_encode(PLANTAS);

// Infraestructuras para autocompletado de unidades
$infras = $pdo->query("SELECT id_unidad, nombre, id_zona FROM infraestructuras ORDER BY id_unidad")->fetchAll();
$infrasJson = json_encode($infras);

// CSRF token
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrf = $_SESSION['csrf_token'];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>RAPCA Campo</title>
    <link rel="manifest" href="/public/manifest.json">
    <meta name="theme-color" content="#1a3d2e">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="icon" href="/public/icons/icon-192.png">
    <link rel="apple-touch-icon" href="/public/icons/icon-192.png">
    <link rel="stylesheet" href="/public/css/operador.css">
    <link rel="stylesheet" href="/public/css/camera.css">
</head>
<body>

<!-- ========== NAV BAR ========== -->
<nav id="nav-bar">
    <button class="nav-btn active" data-page="menu" onclick="showPage('menu')">
        <span class="nav-icon">&#9776;</span><span>Menú</span>
    </button>
    <button class="nav-btn" data-page="vp" onclick="showPage('vp')">
        <span class="nav-icon">&#128065;</span><span>VP</span>
    </button>
    <button class="nav-btn" data-page="el" onclick="showPage('el')">
        <span class="nav-icon">&#9989;</span><span>EL</span>
    </button>
    <button class="nav-btn" data-page="ev" onclick="showPage('ev')">
        <span class="nav-icon">&#128300;</span><span>EI</span>
    </button>
    <button class="nav-btn" data-page="panel" onclick="showPage('panel')">
        <span class="nav-icon">&#128203;</span><span>Panel</span>
    </button>
</nav>

<!-- ========== PAGE: MENU ========== -->
<div id="page-menu" class="page active">
    <div class="top-bar">
        <h1>RAPCA Campo</h1>
        <div class="top-actions">
            <button id="btnContraste" onclick="toggleAltoContraste()" title="Alto contraste">&#9728;&#65039;</button>
            <span id="syncIndicator" class="sync-dot online" title="Online"></span>
        </div>
    </div>

    <div class="user-card">
        <div class="user-avatar"><?= strtoupper(substr($userName, 0, 1)) ?></div>
        <div>
            <div class="user-name"><?= htmlspecialchars($userName) ?></div>
            <div class="user-role"><?= htmlspecialchars($userEmail) ?> (<?= $userRol ?>)</div>
        </div>
        <a href="/public/login.php?action=logout" class="btn-logout" title="Cerrar sesión">&#10005;</a>
    </div>

    <h3 class="menu-section-title">Trabajo de campo</h3>
    <div class="menu-grid">
        <button class="menu-btn vp" onclick="showPage('vp')">
            <span class="menu-icon">&#128065;</span>
            <span>Visita Previa</span>
        </button>
        <button class="menu-btn el" onclick="showPage('el')">
            <span class="menu-icon">&#9989;</span>
            <span>Ev. Ligera</span>
        </button>
        <button class="menu-btn ei" onclick="showPage('ev')">
            <span class="menu-icon">&#128300;</span>
            <span>Ev. Intensa</span>
        </button>
        <button class="menu-btn panel-btn" onclick="showPage('panel')">
            <span class="menu-icon">&#128203;</span>
            <span>Panel</span>
        </button>
    </div>

    <h3 class="menu-section-title">Herramientas</h3>
    <div class="menu-grid">
        <button class="menu-btn sync-btn" onclick="syncPending()">
            <span class="menu-icon">&#128259;</span>
            <span>Sincronizar</span>
        </button>
        <button class="menu-btn" onclick="procesarSubidasPendientes()">
            <span class="menu-icon">&#9729;&#65039;</span>
            <span>Subir Fotos</span>
        </button>
    </div>

    <div class="gps-status" id="gpsStatus">
        <span id="gpsLat">--</span>, <span id="gpsLon">--</span>
        <span id="gpsUTM" class="utm-label"></span>
    </div>
</div>

<!-- ========== PAGE: VP ========== -->
<div id="page-vp" class="page">
    <div class="form-header vp-header">
        <h2>Visita Previa (VP)</h2>
    </div>
    <div class="form-body">
        <div class="field-group">
            <label>Fecha</label>
            <input type="date" id="vp-fecha">
        </div>
        <div class="field-row">
            <div class="field-group"><label>Zona</label><input type="text" id="vp-zona" placeholder="Zona"></div>
            <div class="field-group"><label>Unidad</label><input type="text" id="vp-unidad" placeholder="ID Unidad" list="lista-unidades"></div>
        </div>

        <div class="section-toggle" onclick="toggleSection('vp-pastoreo-section')">
            <span>Grado de Pastoreo</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="vp-pastoreo-section" class="section-content open">
            <div class="pastoreo-grid">
                <?php for ($i = 1; $i <= 3; $i++): ?>
                <div class="pastoreo-item">
                    <label>Punto <?= $i ?></label>
                    <select id="vp-past<?= $i ?>">
                        <option value="">--</option>
                        <option value="NP">NP</option>
                        <option value="PL">PL</option>
                        <option value="PM">PM</option>
                        <option value="PI">PI</option>
                        <option value="PMI">PMI</option>
                    </select>
                </div>
                <?php endfor; ?>
            </div>
            <div class="obs-pastoreo">
                <div class="field-row">
                    <div class="field-group"><label>Señal paso</label>
                        <select id="vp-senal"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                    <div class="field-group"><label>Veredas</label>
                        <select id="vp-veredas"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                    <div class="field-group"><label>Cagarrutas</label>
                        <select id="vp-cagarrutas"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                </div>
            </div>
        </div>

        <div class="section-toggle" onclick="toggleSection('vp-fotos-section')">
            <span>Fotos</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="vp-fotos-section" class="section-content open">
            <div class="foto-buttons">
                <button class="btn-foto" onclick="abrirCamara('VP','G')">&#128247; Foto General</button>
                <button class="btn-foto comp" onclick="abrirCamara('VP','W1')">&#128247; Comparativa W1</button>
                <button class="btn-foto comp" onclick="abrirCamara('VP','W2')">&#128247; Comparativa W2</button>
            </div>
            <div id="vp-fotos-lista" class="fotos-lista"></div>
            <div class="field-group">
                <label>Códigos foto (manual)</label>
                <input type="text" id="vp-fotos" placeholder="Ej: UNIDAD_VP_G_001, ...">
            </div>
        </div>

        <div class="field-group">
            <label>Observaciones</label>
            <textarea id="vp-observaciones" rows="3" placeholder="Observaciones..."></textarea>
        </div>

        <div class="form-actions">
            <button class="btn-save" onclick="guardarVP()">&#128190; Guardar VP</button>
            <button class="btn-secondary" onclick="guardarBorrador('vp')">Guardar borrador</button>
        </div>
    </div>
</div>

<!-- ========== PAGE: EL ========== -->
<div id="page-el" class="page">
    <div class="form-header el-header">
        <h2>Evaluación Ligera (EL)</h2>
    </div>
    <div class="form-body">
        <div class="field-group">
            <label>Fecha</label>
            <input type="date" id="el-fecha">
        </div>
        <div class="field-row">
            <div class="field-group"><label>Zona</label><input type="text" id="el-zona" placeholder="Zona"></div>
            <div class="field-group"><label>Unidad</label><input type="text" id="el-unidad" placeholder="ID Unidad" list="lista-unidades"></div>
        </div>

        <div class="section-toggle" onclick="toggleSection('el-pastoreo-section')">
            <span>Grado de Pastoreo</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="el-pastoreo-section" class="section-content open">
            <div class="pastoreo-grid">
                <?php for ($i = 1; $i <= 3; $i++): ?>
                <div class="pastoreo-item">
                    <label>Punto <?= $i ?></label>
                    <select id="el-past<?= $i ?>">
                        <option value="">--</option>
                        <option value="NP">NP</option><option value="PL">PL</option>
                        <option value="PM">PM</option><option value="PI">PI</option><option value="PMI">PMI</option>
                    </select>
                </div>
                <?php endfor; ?>
            </div>
            <div class="obs-pastoreo">
                <div class="field-row">
                    <div class="field-group"><label>Señal paso</label>
                        <select id="el-senal"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                    <div class="field-group"><label>Veredas</label>
                        <select id="el-veredas"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                    <div class="field-group"><label>Cagarrutas</label>
                        <select id="el-cagarrutas"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                </div>
            </div>
        </div>

        <div class="section-toggle" onclick="toggleSection('el-fotos-section')">
            <span>Fotos</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="el-fotos-section" class="section-content open">
            <div class="foto-buttons">
                <button class="btn-foto" onclick="abrirCamara('EL','G')">&#128247; Foto General</button>
                <button class="btn-foto comp" onclick="abrirCamara('EL','W1')">&#128247; Comparativa W1</button>
                <button class="btn-foto comp" onclick="abrirCamara('EL','W2')">&#128247; Comparativa W2</button>
            </div>
            <div id="el-fotos-lista" class="fotos-lista"></div>
            <div class="field-group">
                <label>Códigos foto (manual)</label>
                <input type="text" id="el-fotos" placeholder="Ej: UNIDAD_EL_G_001, ...">
            </div>
        </div>

        <div class="field-group">
            <label>Observaciones</label>
            <textarea id="el-observaciones" rows="3" placeholder="Observaciones..."></textarea>
        </div>

        <div class="form-actions">
            <button class="btn-save el-save" onclick="guardarEL()">&#128190; Guardar EL</button>
            <button class="btn-secondary" onclick="guardarBorrador('el')">Guardar borrador</button>
        </div>
    </div>
</div>

<!-- ========== PAGE: EI (Evaluación Intensa) ========== -->
<div id="page-ev" class="page">
    <div class="form-header ei-header">
        <h2>Evaluación Intensa (EI)</h2>
        <div class="transecto-tabs">
            <button class="t-tab active" onclick="setTransecto(1)">T1</button>
            <button class="t-tab" onclick="setTransecto(2)">T2</button>
            <button class="t-tab" onclick="setTransecto(3)">T3</button>
        </div>
    </div>
    <div class="form-body">
        <div class="field-group">
            <label>Fecha</label>
            <input type="date" id="ev-fecha">
        </div>
        <div class="field-row">
            <div class="field-group"><label>Zona</label><input type="text" id="ev-zona" placeholder="Zona"></div>
            <div class="field-group"><label>Unidad</label><input type="text" id="ev-unidad" placeholder="ID Unidad" list="lista-unidades"></div>
        </div>

        <!-- Pastoreo -->
        <div class="section-toggle" onclick="toggleSection('ev-pastoreo-section')">
            <span>Grado de Pastoreo</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="ev-pastoreo-section" class="section-content open">
            <div class="pastoreo-grid">
                <?php for ($i = 1; $i <= 3; $i++): ?>
                <div class="pastoreo-item">
                    <label>Punto <?= $i ?></label>
                    <select id="ev-past<?= $i ?>">
                        <option value="">--</option>
                        <option value="NP">NP</option><option value="PL">PL</option>
                        <option value="PM">PM</option><option value="PI">PI</option><option value="PMI">PMI</option>
                    </select>
                </div>
                <?php endfor; ?>
            </div>
            <div class="obs-pastoreo">
                <div class="field-row">
                    <div class="field-group"><label>Señal paso</label>
                        <select id="ev-senal"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                    <div class="field-group"><label>Veredas</label>
                        <select id="ev-veredas"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                    <div class="field-group"><label>Cagarrutas</label>
                        <select id="ev-cagarrutas"><option value="">--</option><option>A</option><option>B</option><option>M</option><option>N</option></select></div>
                </div>
            </div>
        </div>

        <!-- Plantas (10 x 10 notas) -->
        <div class="section-toggle" onclick="toggleSection('ev-plantas-section')">
            <span>Plantas (10 puntos)</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="ev-plantas-section" class="section-content">
            <div id="ev-plantas-container"></div>
            <div class="media-display">Media plantas: <strong id="ev-plantas-media">--</strong></div>
        </div>

        <!-- Palatables (3 x 15 notas) -->
        <div class="section-toggle" onclick="toggleSection('ev-palatables-section')">
            <span>Palatables (3 especies)</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="ev-palatables-section" class="section-content">
            <div id="ev-palatables-container"></div>
            <div class="media-display">Media palatables: <strong id="ev-palatables-media">--</strong></div>
        </div>

        <!-- Herbáceas (7 items) -->
        <div class="section-toggle" onclick="toggleSection('ev-herbaceas-section')">
            <span>Herbáceas (H1-H7)</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="ev-herbaceas-section" class="section-content">
            <div id="ev-herbaceas-container"></div>
            <div class="media-display">Media herbáceas: <strong id="ev-herbaceas-media">--</strong></div>
        </div>

        <!-- Matorral -->
        <div class="section-toggle" onclick="toggleSection('ev-matorral-section')">
            <span>Matorralización</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="ev-matorral-section" class="section-content">
            <?php for ($p = 1; $p <= 2; $p++): ?>
            <div class="matorral-punto">
                <h4>Punto <?= $p ?></h4>
                <div class="field-row">
                    <div class="field-group"><label>Cobertura (%)</label><input type="number" id="ev-mat<?= $p ?>cob" min="0" max="100" onchange="calcularMatorral()"></div>
                    <div class="field-group"><label>Altura (cm)</label><input type="number" id="ev-mat<?= $p ?>alt" min="0" onchange="calcularMatorral()"></div>
                    <div class="field-group"><label>Especie</label><input type="text" id="ev-mat<?= $p ?>esp" list="lista-plantas" placeholder="Especie"></div>
                </div>
            </div>
            <?php endfor; ?>
            <div class="matorral-resumen">
                <span>Cob media: <strong id="ev-mat-medcob">--</strong>%</span>
                <span>Alt media: <strong id="ev-mat-medalt">--</strong> cm</span>
                <span>Vol: <strong id="ev-mat-vol">--</strong> m³/ha</span>
            </div>
        </div>

        <!-- Fotos EI -->
        <div class="section-toggle" onclick="toggleSection('ev-fotos-section')">
            <span>Fotos</span><span class="toggle-arrow">&#9660;</span>
        </div>
        <div id="ev-fotos-section" class="section-content open">
            <div class="foto-buttons">
                <button class="btn-foto" onclick="abrirCamara('EI','G')">&#128247; Foto General</button>
                <button class="btn-foto comp" onclick="abrirCamara('EI','W1')">&#128247; Comparativa W1</button>
                <button class="btn-foto comp" onclick="abrirCamara('EI','W2')">&#128247; Comparativa W2</button>
            </div>
            <div id="ev-fotos-lista" class="fotos-lista"></div>
            <div class="field-group">
                <label>Códigos foto (manual)</label>
                <input type="text" id="ev-fotos" placeholder="Ej: UNIDAD_EI_G_001, ...">
            </div>
        </div>

        <div class="field-group">
            <label>Observaciones</label>
            <textarea id="ev-observaciones" rows="3" placeholder="Observaciones..."></textarea>
        </div>

        <div class="form-actions">
            <button class="btn-save ei-save" onclick="guardarEV()">&#128190; Guardar EI</button>
            <button class="btn-secondary" onclick="guardarBorrador('ev')">Guardar borrador</button>
        </div>
    </div>
</div>

<!-- ========== PAGE: PANEL ========== -->
<div id="page-panel" class="page">
    <div class="form-header panel-header">
        <h2>Panel de Registros</h2>
    </div>
    <div class="form-body">
        <div class="panel-filters">
            <select id="panel-tipo" onchange="loadPanel()">
                <option value="">Todos</option>
                <option value="VP">VP</option>
                <option value="EL">EL</option>
                <option value="EI">EI</option>
            </select>
            <input type="text" id="panel-buscar" placeholder="Buscar unidad..." oninput="loadPanel()">
        </div>
        <div id="panel-lista"></div>
        <div class="form-actions">
            <button class="btn-secondary" onclick="syncPending()">&#128259; Sincronizar todo</button>
            <button class="btn-secondary" onclick="exportarTodosPDF()">&#128196; Exportar PDF</button>
        </div>
    </div>
</div>

<!-- ========== CAMERA MODAL ========== -->
<div id="camera-modal" class="camera-modal">
    <video id="camera-feed" autoplay playsinline></video>
    <div class="camera-overlay">
        <div id="camera-heading" class="compass-display">--°</div>
        <div id="camera-coords" class="coords-display">--</div>
    </div>
    <div class="camera-controls">
        <button class="camera-btn close-btn" onclick="cerrarCamara()">&#10005;</button>
        <button class="camera-btn capture-btn" onclick="capturarFoto()">&#9679;</button>
        <div class="camera-btn info-btn" id="camera-code">--</div>
    </div>
</div>

<!-- ========== PREVIEW MODAL ========== -->
<div id="preview-modal" class="preview-modal">
    <div id="preview-container" class="preview-container">
        <canvas id="preview-canvas"></canvas>
    </div>
    <div id="preview-tools" class="preview-tools">
        <div class="tools-row">
            <label>Tamaño: <input type="range" id="circleSize" min="80" max="600" value="200"></label>
            <button class="btn-undo" onclick="deshacerAnotacion()">&#8630; Deshacer</button>
        </div>
        <div class="tools-row">
            <input type="text" id="annotationText" placeholder="Descripción del punto..." class="annotation-input">
        </div>
    </div>
    <div class="preview-controls">
        <button class="btn-secondary" onclick="cerrarPreview()">&#128247; Retomar</button>
        <button class="btn-annotate" id="btnAnotar" onclick="toggleAnotacion()">&#128308; Anotar</button>
        <button class="btn-save" id="btnAceptar" onclick="aceptarFoto()">&#10004; Aceptar</button>
    </div>
</div>

<!-- ========== TOAST ========== -->
<div id="toast" class="toast"></div>

<!-- ========== LOADING ========== -->
<div id="loading" class="loading-overlay">
    <div class="loading-spinner"></div>
</div>

<!-- Datalists -->
<datalist id="lista-unidades">
    <?php foreach ($infras as $inf): ?>
    <option value="<?= htmlspecialchars($inf['id_unidad']) ?>"><?= htmlspecialchars($inf['nombre'] ?? '') ?></option>
    <?php endforeach; ?>
</datalist>
<datalist id="lista-plantas">
    <?php foreach (PLANTAS as $p): ?>
    <option value="<?= htmlspecialchars($p) ?>">
    <?php endforeach; ?>
</datalist>

<!-- Config for JS -->
<script>
window.RAPCA = {
    userId: <?= $userId ?>,
    userEmail: <?= json_encode($userEmail) ?>,
    userName: <?= json_encode($userName) ?>,
    userRol: <?= json_encode($userRol) ?>,
    csrf: <?= json_encode($csrf) ?>,
    plantas: <?= $plantas ?>,
    infras: <?= $infrasJson ?>,
    uploadUrl: '/public/subir.php',
    apiUrl: '/public/api',
    googleFormUrl: <?= json_encode(GOOGLE_FORM_URL) ?>,
    googleFormEntries: <?= json_encode(GOOGLE_FORM_ENTRIES) ?>
};
</script>
<script src="/public/js/operador.js"></script>
<script src="/public/js/camera.js"></script>
<script src="/public/js/upload.js"></script>
<script src="/public/js/watermark.js"></script>
<script src="/public/js/offline.js"></script>
</body>
</html>
