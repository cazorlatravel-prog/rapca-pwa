<?php
/**
 * RAPCA Campo — Mapa interactivo (Leaflet)
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
$user = requireAuth();
$pdo = getDB();

$pageTitle = 'Mapa — RAPCA Campo';

// Obtener registros con coordenadas
$registros = $pdo->query("
    SELECT r.id, r.tipo, r.fecha, r.unidad, r.zona, r.lat, r.lon,
           r.operador_nombre, r.transecto
    FROM registros r
    WHERE r.lat IS NOT NULL AND r.lon IS NOT NULL
    ORDER BY r.fecha DESC
")->fetchAll();

// Infraestructuras con coordenadas
$infras = $pdo->query("
    SELECT i.*,
    (SELECT COUNT(*) FROM registros r WHERE r.unidad = i.id_unidad AND r.tipo='VP') as cnt_vp,
    (SELECT COUNT(*) FROM registros r WHERE r.unidad = i.id_unidad AND r.tipo='EL') as cnt_el,
    (SELECT COUNT(*) FROM registros r WHERE r.unidad = i.id_unidad AND r.tipo='EI') as cnt_ei,
    (SELECT COUNT(*) FROM fotos f WHERE f.unidad = i.id_unidad) as cnt_fotos
    FROM infraestructuras i
    WHERE i.lat IS NOT NULL AND i.lon IS NOT NULL
")->fetchAll();

// Fotos con coordenadas
$fotos = $pdo->query("
    SELECT f.id, f.codigo, f.lat, f.lon, f.url_cloudinary, f.tipo_registro, f.unidad
    FROM fotos f
    WHERE f.lat IS NOT NULL AND f.lon IS NOT NULL
    LIMIT 500
")->fetchAll();

// Capas KML
$capas = $pdo->query("SELECT id, nombre, color, grosor, opacidad, visible FROM capas_kml ORDER BY nombre")->fetchAll();

// Operadores para filtro
$operadores = $pdo->query("SELECT DISTINCT operador_nombre FROM registros WHERE operador_nombre IS NOT NULL ORDER BY operador_nombre")->fetchAll();

require __DIR__ . '/includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-2">
    <h5 class="fw-bold mb-0"><i class="fas fa-map-marked-alt me-2"></i>Mapa</h5>
    <div class="d-flex gap-2 align-items-center">
        <select id="filtroOperador" class="form-select form-select-sm" style="width:200px" onchange="filtrarMapa()">
            <option value="">Todos los operadores</option>
            <?php foreach ($operadores as $op): ?>
            <option value="<?= htmlspecialchars($op['operador_nombre']) ?>"><?= htmlspecialchars($op['operador_nombre']) ?></option>
            <?php endforeach; ?>
        </select>
        <label class="form-check form-check-inline mb-0"><input type="checkbox" class="form-check-input" id="mostrarInfras" checked onchange="filtrarMapa()"> Infras</label>
        <label class="form-check form-check-inline mb-0"><input type="checkbox" class="form-check-input" id="mostrarFotos" onchange="filtrarMapa()"> Fotos</label>
        <button class="btn btn-sm btn-outline-primary" onclick="centrarEnMi()"><i class="fas fa-crosshairs me-1"></i>Mi posición</button>
        <label class="btn btn-sm btn-outline-secondary mb-0">
            <i class="fas fa-layer-group me-1"></i>KML
            <input type="file" accept=".kml,.kmz" style="display:none" onchange="cargarKML(this)">
        </label>
        <a href="/admin/api/capas_kml.php?action=export_kml" class="btn btn-sm btn-outline-secondary">
            <i class="fas fa-file-export me-1"></i>Exportar KML
        </a>
    </div>
</div>

<div id="map-container">
    <div id="mapa" style="width:100%;height:100%;"></div>
</div>

<!-- Capas KML sidebar -->
<div id="kmlSidebar" style="display:none; position:fixed; right:0; top:60px; width:300px; background:#fff; height:calc(100vh - 60px); box-shadow:-2px 0 8px rgba(0,0,0,0.1); z-index:1000; overflow-y:auto; padding:1rem;">
    <h6 class="fw-bold">Capas KML</h6>
    <div id="kmlList"></div>
</div>

</div><!-- /container -->

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
// Datos del servidor
const registrosData = <?= json_encode($registros, JSON_HEX_TAG | JSON_HEX_AMP) ?>;
const infrasData = <?= json_encode($infras, JSON_HEX_TAG | JSON_HEX_AMP) ?>;
const fotosData = <?= json_encode($fotos, JSON_HEX_TAG | JSON_HEX_AMP) ?>;
const capasData = <?= json_encode($capas, JSON_HEX_TAG | JSON_HEX_AMP) ?>;

// Colores por tipo
const COLORES = { VP: '#88d8b0', EL: '#2ecc71', EI: '#fd9853' };

// Inicializar mapa
const mapa = L.map('mapa').setView([37.78, -3.78], 8);

// Capas base
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 19
});
const pnoa = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {
    attribution: '&copy; IGN PNOA', maxZoom: 20
});
const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenTopoMap', maxZoom: 17
});

osm.addTo(mapa);
L.control.layers({ 'OpenStreetMap': osm, 'PNOA Ortofoto': pnoa, 'Topográfico': topo }).addTo(mapa);

// Cluster
const cluster = L.markerClusterGroup();
mapa.addLayer(cluster);

let marcadores = [];
let marcadoresInfra = [];
let marcadoresFotos = [];
let miPosicion = null;

function crearIcono(color, size) {
    return L.divIcon({
        html: '<div style="background:' + color + ';width:' + size + 'px;height:' + size + 'px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>',
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        className: ''
    });
}

function cargarMarcadores() {
    cluster.clearLayers();
    marcadores = [];
    marcadoresInfra = [];
    marcadoresFotos = [];

    const filtroOp = document.getElementById('filtroOperador').value;

    // Registros
    registrosData.forEach(r => {
        if (filtroOp && r.operador_nombre !== filtroOp) return;
        const m = L.marker([r.lat, r.lon], { icon: crearIcono(COLORES[r.tipo] || '#999', 14) });
        m.bindPopup('<strong>' + r.tipo + '</strong> — ' + r.unidad + '<br>' + r.fecha +
            (r.transecto ? ' (T' + r.transecto + ')' : '') +
            '<br><small>' + (r.operador_nombre || '') + '</small>');
        marcadores.push(m);
        cluster.addLayer(m);
    });

    // Infraestructuras
    if (document.getElementById('mostrarInfras').checked) {
        infrasData.forEach(inf => {
            const m = L.marker([inf.lat, inf.lon], {
                icon: crearIcono('#8e44ad', 18)
            });
            m.bindPopup('<strong>' + (inf.nombre || inf.id_unidad) + '</strong><br>' +
                '<span class="badge badge-vp">VP:' + inf.cnt_vp + '</span> ' +
                '<span class="badge badge-el">EL:' + inf.cnt_el + '</span> ' +
                '<span class="badge badge-ei">EI:' + inf.cnt_ei + '</span> ' +
                '<br><i class="fas fa-camera"></i> ' + inf.cnt_fotos + ' fotos');
            marcadoresInfra.push(m);
            cluster.addLayer(m);
        });
    }

    // Fotos
    if (document.getElementById('mostrarFotos').checked) {
        fotosData.forEach(f => {
            const m = L.marker([f.lat, f.lon], { icon: crearIcono('#3498db', 10) });
            let popup = '<strong>' + f.codigo + '</strong>';
            if (f.url_cloudinary) popup += '<br><img src="' + f.url_cloudinary + '" style="max-width:200px;border-radius:4px">';
            m.bindPopup(popup);
            marcadoresFotos.push(m);
            cluster.addLayer(m);
        });
    }
}

function filtrarMapa() { cargarMarcadores(); }

function centrarEnMi() {
    if (!navigator.geolocation) { alert('Geolocalización no disponible'); return; }
    navigator.geolocation.getCurrentPosition(function(pos) {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        mapa.setView([lat, lon], 15);
        if (miPosicion) mapa.removeLayer(miPosicion);
        miPosicion = L.circleMarker([lat, lon], { radius: 10, color: '#1a3d2e', fillColor: '#88d8b0', fillOpacity: 1 })
            .addTo(mapa).bindPopup('Tu posición').openPopup();
    }, function() { alert('No se pudo obtener la posición'); });
}

function cargarKML(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const formData = new FormData();
        formData.append('action', 'upload');
        formData.append('nombre', file.name);
        formData.append('contenido', e.target.result);

        fetch('/admin/api/capas_kml.php', {
            method: 'POST',
            headers: { 'X-CSRF-Token': '<?= csrfToken() ?>' },
            body: formData
        })
        .then(r => r.json())
        .then(res => {
            if (res.ok) {
                alert('Capa KML cargada');
                location.reload();
            }
        });
    };

    if (file.name.endsWith('.kmz')) {
        // KMZ needs JSZip
        alert('Formato KMZ no soportado aún. Usa KML.');
    } else {
        reader.readAsText(file);
    }
    input.value = '';
}

// Init
cargarMarcadores();

// Ajustar vista a marcadores
if (marcadores.length > 0) {
    const allMarkers = [...marcadores, ...marcadoresInfra];
    if (allMarkers.length > 0) {
        const group = L.featureGroup(allMarkers);
        mapa.fitBounds(group.getBounds().pad(0.1));
    }
}
</script>
</body>
</html>
