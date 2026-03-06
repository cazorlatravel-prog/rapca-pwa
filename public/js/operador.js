/**
 * RAPCA Campo — App del Operador de Campo
 * Vanilla JS ES6+, sin framework ni build
 */
;(function() {
    'use strict';

    const CFG = window.RAPCA;

    // ==============================================================
    // STATE
    // ==============================================================
    const state = {
        transectoActual: 1,
        editandoId: null,
        isOnline: navigator.onLine,
        contadores: { VP: {}, EL: {}, EI: {} },
        currentLat: null,
        currentLon: null,
        currentUTM: null,
        currentHeading: 0,
        currentAlt: null,
        currentAcc: null,
        fotosCacheMemoria: {},
        fotosDB: null,
        anotaciones: [],
        modoAnotacion: false,
    };

    // ==============================================================
    // NAVIGATION
    // ==============================================================
    window.showPage = function(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const el = document.getElementById('page-' + page);
        if (el) el.classList.add('active');

        const btn = document.querySelector(`.nav-btn[data-page="${page}"]`);
        if (btn) btn.classList.add('active');

        if (page === 'panel') loadPanel();
        vibrar(15);
    };

    window.toggleSection = function(id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('open');
    };

    window.setTransecto = function(n) {
        state.transectoActual = n;
        document.querySelectorAll('.t-tab').forEach((t, i) => {
            t.classList.toggle('active', i + 1 === n);
        });
        vibrar(20);
    };

    // ==============================================================
    // UTILITIES
    // ==============================================================
    function vibrar(ms) {
        try { if (navigator.vibrate) navigator.vibrate(ms || 30); } catch(e) {}
    }

    function escapeHTML(s) {
        if (!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function showToast(msg, type) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast show ' + (type || '');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
    window.showToast = showToast;

    function showLoading(show) {
        document.getElementById('loading').classList.toggle('show', !!show);
    }

    function $(id) { return document.getElementById(id); }

    // ==============================================================
    // HIGH CONTRAST
    // ==============================================================
    window.toggleAltoContraste = function() {
        document.body.classList.toggle('high-contrast');
        const activo = document.body.classList.contains('high-contrast');
        localStorage.setItem('rapca_alto_contraste', activo ? '1' : '0');
        const btn = $('btnContraste');
        if (btn) btn.textContent = activo ? '\u{1F319}' : '\u{2600}\u{FE0F}';
        vibrar(30);
    };

    // ==============================================================
    // GPS & UTM
    // ==============================================================
    function iniciarGeolocalizacion() {
        if (!navigator.geolocation) return;
        navigator.geolocation.watchPosition(
            pos => {
                state.currentLat = pos.coords.latitude;
                state.currentLon = pos.coords.longitude;
                state.currentAlt = pos.coords.altitude;
                state.currentAcc = pos.coords.accuracy;
                state.currentUTM = latLonToUTM(state.currentLat, state.currentLon);

                $('gpsLat').textContent = state.currentLat.toFixed(5);
                $('gpsLon').textContent = state.currentLon.toFixed(5);
                $('gpsUTM').textContent = state.currentUTM || '';
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 5000 }
        );
    }

    function latLonToUTM(lat, lon) {
        // Simplified UTM conversion
        const zone = Math.floor((lon + 180) / 6) + 1;
        const k0 = 0.9996;
        const a = 6378137;
        const e = 0.081819191;
        const e2 = e * e;
        const latRad = lat * Math.PI / 180;
        const lonRad = lon * Math.PI / 180;
        const lonOrigin = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
        const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
        const T = Math.tan(latRad) * Math.tan(latRad);
        const C = (e2 / (1 - e2)) * Math.cos(latRad) * Math.cos(latRad);
        const A = Math.cos(latRad) * (lonRad - lonOrigin);
        const M = a * ((1 - e2/4 - 3*e2*e2/64) * latRad
            - (3*e2/8 + 3*e2*e2/32) * Math.sin(2*latRad)
            + (15*e2*e2/256) * Math.sin(4*latRad));
        const easting = k0 * N * (A + (1-T+C)*A*A*A/6) + 500000;
        const northing = k0 * (M + N * Math.tan(latRad) * (A*A/2 + (5-T+9*C+4*C*C)*A*A*A*A/24));
        const band = 'CDEFGHJKLMNPQRSTUVWX'[Math.floor((lat + 80) / 8)];
        return zone + band + ' ' + Math.round(easting) + ' ' + Math.round(northing < 0 ? northing + 10000000 : northing);
    }

    // ==============================================================
    // COMPASS
    // ==============================================================
    function initCompass() {
        window.addEventListener('deviceorientationabsolute', e => {
            if (e.alpha != null) state.currentHeading = 360 - e.alpha;
        });
        window.addEventListener('deviceorientation', e => {
            if (e.webkitCompassHeading != null) state.currentHeading = e.webkitCompassHeading;
            else if (e.alpha != null) state.currentHeading = 360 - e.alpha;
        });
    }

    // ==============================================================
    // INDEXEDDB (Fotos)
    // ==============================================================
    function initFotosDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('RAPCA_Fotos', 3);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos', { keyPath: 'codigo' });
                if (!db.objectStoreNames.contains('subidas_pendientes')) db.createObjectStore('subidas_pendientes', { keyPath: 'codigo' });
                if (!db.objectStoreNames.contains('capas_kml')) db.createObjectStore('capas_kml', { keyPath: 'nombre' });
            };
            req.onsuccess = e => { state.fotosDB = e.target.result; resolve(); };
            req.onerror = () => reject();
        });
    }

    function guardarFotoEnDB(codigo, dataUrl) {
        state.fotosCacheMemoria[codigo] = dataUrl;
        if (!state.fotosDB) return;
        const tx = state.fotosDB.transaction('fotos', 'readwrite');
        tx.objectStore('fotos').put({ codigo, data: dataUrl, fecha: Date.now() });
    }

    function guardarSubidaPendiente(codigo, dataUrl, unidad, tipo) {
        if (!state.fotosDB) return;
        const tx = state.fotosDB.transaction('subidas_pendientes', 'readwrite');
        tx.objectStore('subidas_pendientes').put({ codigo, data: dataUrl, unidad, tipo, fecha: Date.now() });
    }

    // ==============================================================
    // PHOTO COUNTER
    // ==============================================================
    function getContadorKey(tipo, subtipo, unidad) {
        return unidad + '_' + tipo + '_' + (subtipo || 'G');
    }

    function getNextFotoNum(tipo, subtipo) {
        const page = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
        const unidad = $(page + '-unidad').value || 'SIN_UNIDAD';
        const key = getContadorKey(tipo, subtipo, unidad);
        if (!state.contadores[tipo]) state.contadores[tipo] = {};
        state.contadores[tipo][key] = (state.contadores[tipo][key] || 0) + 1;
        return state.contadores[tipo][key];
    }

    function generarCodigoFoto(tipo, subtipo) {
        const page = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
        const unidad = $(page + '-unidad').value || 'SIN_UNIDAD';
        const num = getNextFotoNum(tipo, subtipo);
        const numStr = String(num).padStart(3, '0');
        if (subtipo === 'G') return unidad + '_' + tipo + '_G_' + numStr;
        return unidad + '_' + tipo + '_' + subtipo + '_' + numStr;
    }

    // ==============================================================
    // FORM DATA (VP / EL / EI)
    // ==============================================================
    function obtenerDatosVP() {
        return {
            pastoreo: [$('vp-past1').value, $('vp-past2').value, $('vp-past3').value],
            observacionPastoreo: {
                senal: $('vp-senal').value,
                veredas: $('vp-veredas').value,
                cagarrutas: $('vp-cagarrutas').value
            },
            fotos: $('vp-fotos').value,
            observaciones: $('vp-observaciones').value
        };
    }

    function obtenerDatosEL() {
        return {
            pastoreo: [$('el-past1').value, $('el-past2').value, $('el-past3').value],
            observacionPastoreo: {
                senal: $('el-senal').value,
                veredas: $('el-veredas').value,
                cagarrutas: $('el-cagarrutas').value
            },
            fotos: $('el-fotos').value,
            observaciones: $('el-observaciones').value
        };
    }

    function obtenerDatosEV() {
        const plantas = [];
        for (let i = 1; i <= 10; i++) {
            const nombre = $('ev-planta' + i + '-nombre');
            if (!nombre) continue;
            const notas = [];
            for (let j = 1; j <= 10; j++) {
                const inp = $('ev-planta' + i + '-n' + j);
                notas.push(inp ? parseInt(inp.value) || 0 : 0);
            }
            const media = notas.length > 0 ? (notas.reduce((a,b) => a+b, 0) / notas.length).toFixed(2) : '0';
            plantas.push({ nombre: nombre.value, notas, media });
        }

        const palatables = [];
        for (let i = 1; i <= 3; i++) {
            const nombre = $('ev-palatable' + i + '-nombre');
            if (!nombre) continue;
            const notas = [];
            for (let j = 1; j <= 15; j++) {
                const inp = $('ev-palatable' + i + '-n' + j);
                notas.push(inp ? parseInt(inp.value) || 0 : 0);
            }
            const media = notas.length > 0 ? (notas.reduce((a,b) => a+b, 0) / notas.length).toFixed(2) : '0';
            palatables.push({ nombre: nombre.value, notas, media });
        }

        const herbaceas = [];
        for (let i = 1; i <= 7; i++) {
            const inp = $('ev-herb' + i);
            herbaceas.push(inp ? parseInt(inp.value) || 0 : 0);
        }

        const mat = {
            punto1: {
                cobertura: $('ev-mat1cob') ? $('ev-mat1cob').value : '',
                altura: $('ev-mat1alt') ? $('ev-mat1alt').value : '',
                especie: $('ev-mat1esp') ? $('ev-mat1esp').value : ''
            },
            punto2: {
                cobertura: $('ev-mat2cob') ? $('ev-mat2cob').value : '',
                altura: $('ev-mat2alt') ? $('ev-mat2alt').value : '',
                especie: $('ev-mat2esp') ? $('ev-mat2esp').value : ''
            }
        };

        const c1 = parseFloat(mat.punto1.cobertura) || 0;
        const c2 = parseFloat(mat.punto2.cobertura) || 0;
        const a1 = parseFloat(mat.punto1.altura) || 0;
        const a2 = parseFloat(mat.punto2.altura) || 0;
        mat.mediaCob = ((c1 + c2) / 2).toFixed(1);
        mat.mediaAlt = ((a1 + a2) / 2).toFixed(1);
        mat.volumen = ((parseFloat(mat.mediaCob) / 100) * (parseFloat(mat.mediaAlt) / 100) * 10000).toFixed(1) + ' m\u00B3/ha';

        const allPlantasNotas = plantas.flatMap(p => p.notas);
        const plantasMedia = allPlantasNotas.length > 0 ? (allPlantasNotas.reduce((a,b) => a+b, 0) / allPlantasNotas.length).toFixed(2) : '0';

        const allPalatablesNotas = palatables.flatMap(p => p.notas);
        const palatablesMedia = allPalatablesNotas.length > 0 ? (allPalatablesNotas.reduce((a,b) => a+b, 0) / allPalatablesNotas.length).toFixed(2) : '0';

        const herbaceasMedia = herbaceas.length > 0 ? (herbaceas.reduce((a,b) => a+b, 0) / herbaceas.length).toFixed(2) : '0';

        return {
            pastoreo: [$('ev-past1').value, $('ev-past2').value, $('ev-past3').value],
            observacionPastoreo: {
                senal: $('ev-senal').value,
                veredas: $('ev-veredas').value,
                cagarrutas: $('ev-cagarrutas').value
            },
            plantas, plantasMedia,
            palatables, palatablesMedia,
            herbaceas, herbaceasMedia,
            matorral: mat,
            fotos: $('ev-fotos').value,
            observaciones: $('ev-observaciones').value
        };
    }

    // ==============================================================
    // SAVE RECORDS
    // ==============================================================
    function crearRegistro(tipo, page) {
        const fecha = $(page + '-fecha').value;
        const zona = $(page + '-zona').value;
        const unidad = $(page + '-unidad').value;

        if (!fecha || !unidad) {
            showToast('Fecha y Unidad son obligatorios', 'error');
            return null;
        }

        let datos;
        if (tipo === 'VP') datos = obtenerDatosVP();
        else if (tipo === 'EL') datos = obtenerDatosEL();
        else datos = obtenerDatosEV();

        return {
            tipo,
            fecha,
            zona,
            unidad,
            transecto: tipo === 'EI' ? state.transectoActual : null,
            datos: JSON.stringify(datos),
            lat: state.currentLat,
            lon: state.currentLon,
            operador_email: CFG.userEmail,
            operador_nombre: CFG.userName,
        };
    }

    async function guardarRegistro(registro) {
        showLoading(true);
        try {
            const res = await fetch(CFG.apiUrl + '/registros.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': CFG.csrf
                },
                body: JSON.stringify({ action: 'save', ...registro })
            });
            const data = await res.json();
            if (data.ok) {
                showToast(registro.tipo + ' guardado correctamente', 'success');
                // Also try Google Forms sync
                enviarGoogleForm(registro);
                return data.id;
            } else {
                throw new Error(data.error || 'Error al guardar');
            }
        } catch (e) {
            // Guardar localmente si no hay conexión
            guardarLocal(registro);
            showToast('Guardado localmente (sin conexión)', 'success');
            return null;
        } finally {
            showLoading(false);
        }
    }

    function guardarLocal(registro) {
        const registros = JSON.parse(localStorage.getItem('rapca_registros') || '[]');
        registro.id = Date.now();
        registro.enviado = 0;
        registros.push(registro);
        localStorage.setItem('rapca_registros', JSON.stringify(registros));
    }

    window.guardarVP = async function() {
        const reg = crearRegistro('VP', 'vp');
        if (!reg) return;
        await guardarRegistro(reg);
        limpiarFormulario('vp');
    };

    window.guardarEL = async function() {
        const reg = crearRegistro('EL', 'el');
        if (!reg) return;
        await guardarRegistro(reg);
        limpiarFormulario('el');
    };

    window.guardarEV = async function() {
        const reg = crearRegistro('EI', 'ev');
        if (!reg) return;
        await guardarRegistro(reg);

        if (state.transectoActual < 3) {
            state.transectoActual++;
            setTransecto(state.transectoActual);
            limpiarDatosEV();
            showToast('T' + (state.transectoActual - 1) + ' guardado. Ahora T' + state.transectoActual, 'success');
        } else {
            limpiarFormulario('ev');
            state.transectoActual = 1;
            setTransecto(1);
            showToast('T3 guardado. Unidad completa.', 'success');
        }
    };

    function limpiarFormulario(page) {
        const inputs = document.querySelectorAll(`#page-${page} input, #page-${page} select, #page-${page} textarea`);
        inputs.forEach(inp => {
            if (inp.type === 'date') inp.value = new Date().toISOString().slice(0, 10);
            else if (inp.tagName === 'SELECT') inp.selectedIndex = 0;
            else inp.value = '';
        });
        const fotosLista = $(`${page}-fotos-lista`);
        if (fotosLista) fotosLista.innerHTML = '';
    }

    function limpiarDatosEV() {
        // Solo limpia puntuaciones, mantiene fecha/zona/unidad
        document.querySelectorAll('#page-ev .nota-input').forEach(inp => inp.value = '');
        document.querySelectorAll('#page-ev .planta-nombre').forEach(inp => inp.value = '');
        ['ev-mat1cob','ev-mat1alt','ev-mat1esp','ev-mat2cob','ev-mat2alt','ev-mat2esp'].forEach(id => {
            if ($(id)) $(id).value = '';
        });
        for (let i = 1; i <= 7; i++) { if ($('ev-herb' + i)) $('ev-herb' + i).value = ''; }
        $('ev-observaciones').value = '';
        $('ev-fotos').value = '';
        const fl = $('ev-fotos-lista');
        if (fl) fl.innerHTML = '';
    }

    // ==============================================================
    // GOOGLE FORMS SYNC
    // ==============================================================
    function enviarGoogleForm(registro) {
        if (!CFG.googleFormUrl) return;
        const entries = CFG.googleFormEntries;
        const body = new URLSearchParams();
        body.append(entries.tipo, registro.tipo);
        body.append(entries.fecha, registro.fecha);
        body.append(entries.zona, registro.zona || '');
        body.append(entries.unidad, registro.unidad);
        body.append(entries.transecto, registro.transecto || '');
        body.append(entries.datos, registro.datos);

        fetch(CFG.googleFormUrl, { method: 'POST', mode: 'no-cors', body }).catch(() => {});
    }

    // ==============================================================
    // SYNC PENDING
    // ==============================================================
    window.syncPending = async function() {
        const registros = JSON.parse(localStorage.getItem('rapca_registros') || '[]');
        const pendientes = registros.filter(r => !r.enviado);
        if (pendientes.length === 0) {
            showToast('Todo sincronizado', 'success');
            return;
        }

        showLoading(true);
        let ok = 0;
        for (const reg of pendientes) {
            try {
                const res = await fetch(CFG.apiUrl + '/registros.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CFG.csrf },
                    body: JSON.stringify({ action: 'save', ...reg })
                });
                const data = await res.json();
                if (data.ok) {
                    reg.enviado = 1;
                    enviarGoogleForm(reg);
                    ok++;
                }
            } catch(e) { /* skip */ }
            await new Promise(r => setTimeout(r, 600));
        }

        localStorage.setItem('rapca_registros', JSON.stringify(registros));
        showLoading(false);
        showToast(`Sincronizados ${ok}/${pendientes.length}`, ok === pendientes.length ? 'success' : 'error');
    };

    // ==============================================================
    // PANEL
    // ==============================================================
    window.loadPanel = function() {
        const tipo = $('panel-tipo') ? $('panel-tipo').value : '';
        const buscar = $('panel-buscar') ? $('panel-buscar').value.toLowerCase() : '';

        // Load from server + local
        fetch(CFG.apiUrl + '/registros.php?tipo=' + tipo + '&q=' + encodeURIComponent(buscar), {
            headers: { 'X-CSRF-Token': CFG.csrf }
        })
        .then(r => r.json())
        .then(data => {
            const lista = $('panel-lista');
            if (!lista) return;

            const registros = data.registros || [];
            // Also add local unsynced
            const locales = JSON.parse(localStorage.getItem('rapca_registros') || '[]')
                .filter(r => !r.enviado)
                .filter(r => !tipo || r.tipo === tipo)
                .filter(r => !buscar || (r.unidad || '').toLowerCase().includes(buscar));

            const all = [...locales.map(r => ({...r, local: true})), ...registros];

            if (all.length === 0) {
                lista.innerHTML = '<p style="text-align:center;color:#888;padding:2rem">Sin registros</p>';
                return;
            }

            lista.innerHTML = all.map(r => {
                const datos = typeof r.datos === 'string' ? JSON.parse(r.datos || '{}') : (r.datos || {});
                return `<div class="panel-item tipo-${(r.tipo||'').toLowerCase()}">
                    <div class="panel-item-header">
                        <span class="panel-item-title">${escapeHTML(r.unidad)}</span>
                        <span class="panel-badge ${(r.tipo||'').toLowerCase()}">${r.tipo}${r.transecto ? ' T' + r.transecto : ''}</span>
                    </div>
                    <div class="panel-item-meta">
                        ${r.fecha} — ${escapeHTML(r.operador_nombre || '')}
                        ${r.local ? ' <span style="color:#e74c3c">(local)</span>' : ''}
                        ${r.enviado ? '' : ' <span style="color:#f39c12">(pendiente)</span>'}
                    </div>
                    <div class="panel-item-actions">
                        ${r.id ? `<button onclick="exportarPDF(${r.id}, ${!!r.local})">PDF</button>` : ''}
                        ${r.id && !r.local ? `<button onclick="editarRegistro(${r.id})">Editar</button>` : ''}
                        ${r.id ? `<button class="delete" onclick="eliminarRegistro(${r.id}, ${!!r.local})">Eliminar</button>` : ''}
                    </div>
                </div>`;
            }).join('');
        })
        .catch(() => {
            // Offline: solo mostrar locales
            const locales = JSON.parse(localStorage.getItem('rapca_registros') || '[]');
            const lista = $('panel-lista');
            if (!lista) return;
            lista.innerHTML = locales.map(r => `<div class="panel-item tipo-${(r.tipo||'').toLowerCase()}">
                <div class="panel-item-header">
                    <span class="panel-item-title">${escapeHTML(r.unidad)}</span>
                    <span class="panel-badge ${(r.tipo||'').toLowerCase()}">${r.tipo}</span>
                </div>
                <div class="panel-item-meta">${r.fecha} (local)</div>
            </div>`).join('') || '<p style="text-align:center;color:#888">Sin registros locales</p>';
        });
    };

    window.editarRegistro = async function(id) {
        try {
            const res = await fetch(CFG.apiUrl + '/registros.php?id=' + id, {
                headers: { 'X-CSRF-Token': CFG.csrf }
            });
            const data = await res.json();
            const reg = data.registro;
            if (!reg) { showToast('Registro no encontrado', 'error'); return; }

            const datos = typeof reg.datos === 'string' ? JSON.parse(reg.datos || '{}') : (reg.datos || {});
            const tipo = reg.tipo;
            const page = tipo === 'EI' ? 'ev' : tipo.toLowerCase();

            state.editandoId = reg.id;

            // Cargar campos comunes
            if ($(page + '-fecha')) $(page + '-fecha').value = reg.fecha || '';
            if ($(page + '-zona')) $(page + '-zona').value = reg.zona || '';
            if ($(page + '-unidad')) $(page + '-unidad').value = reg.unidad || '';

            // Pastoreo
            if (datos.pastoreo) {
                for (let i = 0; i < datos.pastoreo.length; i++) {
                    const el = $(page + '-past' + (i + 1));
                    if (el) el.value = datos.pastoreo[i] || '';
                }
            }
            if (datos.observacionPastoreo) {
                if ($(page + '-senal')) $(page + '-senal').value = datos.observacionPastoreo.senal || '';
                if ($(page + '-veredas')) $(page + '-veredas').value = datos.observacionPastoreo.veredas || '';
                if ($(page + '-cagarrutas')) $(page + '-cagarrutas').value = datos.observacionPastoreo.cagarrutas || '';
            }

            // Fotos
            if ($(page + '-fotos')) $(page + '-fotos').value = datos.fotos || '';
            if ($(page + '-observaciones')) $(page + '-observaciones').value = datos.observaciones || '';

            // Datos EI específicos
            if (tipo === 'EI') {
                if (reg.transecto) setTransecto(parseInt(reg.transecto));

                // Plantas
                if (datos.plantas) {
                    datos.plantas.forEach((pl, i) => {
                        const idx = i + 1;
                        const nombre = $('ev-planta' + idx + '-nombre');
                        if (nombre) nombre.value = pl.nombre || '';
                        (pl.notas || []).forEach((n, j) => {
                            const inp = $('ev-planta' + idx + '-n' + (j + 1));
                            if (inp) inp.value = n || '';
                        });
                    });
                }
                // Palatables
                if (datos.palatables) {
                    datos.palatables.forEach((pl, i) => {
                        const idx = i + 1;
                        const nombre = $('ev-palatable' + idx + '-nombre');
                        if (nombre) nombre.value = pl.nombre || '';
                        (pl.notas || []).forEach((n, j) => {
                            const inp = $('ev-palatable' + idx + '-n' + (j + 1));
                            if (inp) inp.value = n || '';
                        });
                    });
                }
                // Herbáceas
                if (datos.herbaceas) {
                    datos.herbaceas.forEach((h, i) => {
                        const inp = $('ev-herb' + (i + 1));
                        if (inp) inp.value = h || '';
                    });
                }
                // Matorral
                if (datos.matorral) {
                    for (let p = 1; p <= 2; p++) {
                        const pt = datos.matorral['punto' + p] || {};
                        if ($('ev-mat' + p + 'cob')) $('ev-mat' + p + 'cob').value = pt.cobertura || '';
                        if ($('ev-mat' + p + 'alt')) $('ev-mat' + p + 'alt').value = pt.altura || '';
                        if ($('ev-mat' + p + 'esp')) $('ev-mat' + p + 'esp').value = pt.especie || '';
                    }
                    calcularMatorral();
                }
                calcularMedias();
            }

            showPage(page);
            showToast('Registro cargado para editar', 'success');
        } catch(e) {
            showToast('Error al cargar registro: ' + e.message, 'error');
        }
    };

    window.eliminarRegistro = function(id, local) {
        if (!confirm('¿Eliminar este registro?')) return;
        if (local) {
            const registros = JSON.parse(localStorage.getItem('rapca_registros') || '[]');
            const filtered = registros.filter(r => r.id !== id);
            localStorage.setItem('rapca_registros', JSON.stringify(filtered));
            loadPanel();
        } else {
            fetch(CFG.apiUrl + '/registros.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CFG.csrf },
                body: JSON.stringify({ action: 'delete', id })
            }).then(() => loadPanel());
        }
    };

    // ==============================================================
    // GENERATE EI FORM INPUTS
    // ==============================================================
    function generarPlantas() {
        const container = $('ev-plantas-container');
        if (!container) return;
        let html = '';
        for (let i = 1; i <= 10; i++) {
            html += `<div class="planta-box">
                <div class="planta-header"><span>Planta ${i}</span><span class="media" id="ev-planta${i}-media">--</span></div>
                <input type="text" id="ev-planta${i}-nombre" class="planta-nombre" list="lista-plantas" placeholder="Especie...">
                <div class="notas-grid">`;
            for (let j = 1; j <= 10; j++) {
                html += `<input type="number" id="ev-planta${i}-n${j}" class="nota-input" min="0" max="5" placeholder="${j}" onchange="calcularMedias()">`;
            }
            html += '</div></div>';
        }
        container.innerHTML = html;
    }

    function generarPalatables() {
        const container = $('ev-palatables-container');
        if (!container) return;
        let html = '';
        for (let i = 1; i <= 3; i++) {
            html += `<div class="planta-box">
                <div class="planta-header"><span>Palatable ${i}</span><span class="media" id="ev-palatable${i}-media">--</span></div>
                <input type="text" id="ev-palatable${i}-nombre" class="planta-nombre" list="lista-plantas" placeholder="Especie...">
                <div class="notas-grid">`;
            for (let j = 1; j <= 15; j++) {
                html += `<input type="number" id="ev-palatable${i}-n${j}" class="nota-input" min="0" max="5" placeholder="${j}" onchange="calcularMedias()">`;
            }
            html += '</div></div>';
        }
        container.innerHTML = html;
    }

    function generarHerbaceas() {
        const container = $('ev-herbaceas-container');
        if (!container) return;
        let html = '<div class="herb-grid">';
        for (let i = 1; i <= 7; i++) {
            html += `<div class="herb-item">
                <label>H${i}</label>
                <input type="number" id="ev-herb${i}" class="nota-input" min="0" max="5" onchange="calcularMedias()">
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    window.calcularMedias = function() {
        // Plantas
        for (let i = 1; i <= 10; i++) {
            let sum = 0, cnt = 0;
            for (let j = 1; j <= 10; j++) {
                const v = parseInt($('ev-planta' + i + '-n' + j)?.value);
                if (!isNaN(v)) { sum += v; cnt++; }
            }
            const el = $('ev-planta' + i + '-media');
            if (el) el.textContent = cnt > 0 ? (sum / cnt).toFixed(2) : '--';
        }

        // Palatables
        for (let i = 1; i <= 3; i++) {
            let sum = 0, cnt = 0;
            for (let j = 1; j <= 15; j++) {
                const v = parseInt($('ev-palatable' + i + '-n' + j)?.value);
                if (!isNaN(v)) { sum += v; cnt++; }
            }
            const el = $('ev-palatable' + i + '-media');
            if (el) el.textContent = cnt > 0 ? (sum / cnt).toFixed(2) : '--';
        }

        // Herbáceas
        let herbSum = 0, herbCnt = 0;
        for (let i = 1; i <= 7; i++) {
            const v = parseInt($('ev-herb' + i)?.value);
            if (!isNaN(v)) { herbSum += v; herbCnt++; }
        }
        const herbMedia = $('ev-herbaceas-media');
        if (herbMedia) herbMedia.textContent = herbCnt > 0 ? (herbSum / herbCnt).toFixed(2) : '--';

        // Global medias
        let allPlantSum = 0, allPlantCnt = 0;
        for (let i = 1; i <= 10; i++) for (let j = 1; j <= 10; j++) {
            const v = parseInt($('ev-planta' + i + '-n' + j)?.value);
            if (!isNaN(v)) { allPlantSum += v; allPlantCnt++; }
        }
        const pm = $('ev-plantas-media');
        if (pm) pm.textContent = allPlantCnt > 0 ? (allPlantSum / allPlantCnt).toFixed(2) : '--';

        let allPalSum = 0, allPalCnt = 0;
        for (let i = 1; i <= 3; i++) for (let j = 1; j <= 15; j++) {
            const v = parseInt($('ev-palatable' + i + '-n' + j)?.value);
            if (!isNaN(v)) { allPalSum += v; allPalCnt++; }
        }
        const palM = $('ev-palatables-media');
        if (palM) palM.textContent = allPalCnt > 0 ? (allPalSum / allPalCnt).toFixed(2) : '--';
    };

    window.calcularMatorral = function() {
        const c1 = parseFloat($('ev-mat1cob')?.value) || 0;
        const c2 = parseFloat($('ev-mat2cob')?.value) || 0;
        const a1 = parseFloat($('ev-mat1alt')?.value) || 0;
        const a2 = parseFloat($('ev-mat2alt')?.value) || 0;
        const medCob = (c1 + c2) / 2;
        const medAlt = (a1 + a2) / 2;
        const vol = (medCob / 100) * (medAlt / 100) * 10000;

        $('ev-mat-medcob').textContent = medCob.toFixed(1);
        $('ev-mat-medalt').textContent = medAlt.toFixed(1);
        $('ev-mat-vol').textContent = vol.toFixed(1);
    };

    // ==============================================================
    // DRAFTS
    // ==============================================================
    window.guardarBorrador = function(page) {
        const key = 'rapca_borrador_' + page;
        const inputs = {};
        document.querySelectorAll(`#page-${page} input, #page-${page} select, #page-${page} textarea`).forEach(el => {
            if (el.id) inputs[el.id] = el.value;
        });
        localStorage.setItem(key, JSON.stringify(inputs));
        showToast('Borrador guardado', 'success');
    };

    function cargarBorradores() {
        ['vp', 'el', 'ev'].forEach(page => {
            const key = 'rapca_borrador_' + page;
            const data = localStorage.getItem(key);
            if (!data) return;
            try {
                const inputs = JSON.parse(data);
                Object.entries(inputs).forEach(([id, val]) => {
                    const el = $(id);
                    if (el) el.value = val;
                });
            } catch(e) {}
        });
    }

    // ==============================================================
    // PDF EXPORT
    // ==============================================================
    function generarHTMLRegistro(reg) {
        const datos = typeof reg.datos === 'string' ? JSON.parse(reg.datos || '{}') : (reg.datos || {});
        const tipo = reg.tipo || '';
        const badgeColor = tipo === 'VP' ? '#88d8b0' : tipo === 'EL' ? '#2ecc71' : '#fd9853';
        const badgeText = tipo === 'VP' ? '#1a3d2e' : '#fff';

        let html = `<div style="page-break-inside:avoid;margin-bottom:30px;">
        <div style="background:#1a3d2e;color:#fff;padding:15px 20px;border-radius:8px;margin-bottom:15px;display:flex;justify-content:space-between;align-items:center">
            <div><h2 style="margin:0;font-size:16pt">RAPCA Campo — Informe ${escapeHTML(tipo)}</h2>
            <div style="font-size:9pt;opacity:0.8">${escapeHTML(reg.unidad)} | ${escapeHTML(reg.fecha)}${reg.transecto ? ' | T' + reg.transecto : ''}</div></div>
            <div style="text-align:right"><div style="font-size:9pt;opacity:0.8">Operador: ${escapeHTML(reg.operador_nombre || '')}</div>
            ${reg.lat ? `<div style="font-size:9pt;opacity:0.8">${reg.lat}, ${reg.lon}</div>` : ''}</div>
        </div>`;

        // Datos generales
        html += `<div style="border:1px solid #ddd;border-radius:6px;margin-bottom:12px;overflow:hidden">
            <div style="background:#f5f5f0;padding:8px 12px;font-weight:bold;font-size:10pt;border-bottom:1px solid #ddd">Datos Generales</div>
            <div style="padding:10px 12px">
                <table style="width:100%;border-collapse:collapse;font-size:9pt">
                <tr><td style="width:100px;font-weight:bold;padding:4px 8px;border:1px solid #ddd">Tipo</td><td style="padding:4px 8px;border:1px solid #ddd"><span style="background:${badgeColor};color:${badgeText};padding:2px 8px;border-radius:4px;font-size:8pt;font-weight:bold">${tipo}</span></td>
                <td style="width:100px;font-weight:bold;padding:4px 8px;border:1px solid #ddd">Zona</td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHTML(reg.zona || '-')}</td></tr>
                <tr><td style="font-weight:bold;padding:4px 8px;border:1px solid #ddd">Unidad</td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHTML(reg.unidad)}</td>
                <td style="font-weight:bold;padding:4px 8px;border:1px solid #ddd">Fecha</td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHTML(reg.fecha)}</td></tr>
                </table>
            </div></div>`;

        // Pastoreo
        if (datos.pastoreo && datos.pastoreo.length > 0) {
            html += `<div style="border:1px solid #ddd;border-radius:6px;margin-bottom:12px;overflow:hidden">
                <div style="background:#f5f5f0;padding:8px 12px;font-weight:bold;font-size:10pt;border-bottom:1px solid #ddd">Grado de Pastoreo</div>
                <div style="padding:10px 12px">`;
            datos.pastoreo.forEach((p, i) => {
                html += `<span style="background:#5b8c5a;color:#fff;padding:2px 8px;border-radius:4px;font-size:9pt;margin-right:4px">Punto ${i+1}: ${escapeHTML(p)}</span>`;
            });
            if (datos.observacionPastoreo) {
                const obs = datos.observacionPastoreo;
                html += `<table style="width:100%;border-collapse:collapse;font-size:9pt;margin-top:8px">
                    <tr><th style="background:#1a3d2e;color:#fff;padding:4px 8px;border:1px solid #ddd">Señal paso</th><th style="background:#1a3d2e;color:#fff;padding:4px 8px;border:1px solid #ddd">Veredas</th><th style="background:#1a3d2e;color:#fff;padding:4px 8px;border:1px solid #ddd">Cagarrutas</th></tr>
                    <tr><td style="text-align:center;padding:4px 8px;border:1px solid #ddd">${escapeHTML(obs.senal || '-')}</td><td style="text-align:center;padding:4px 8px;border:1px solid #ddd">${escapeHTML(obs.veredas || '-')}</td><td style="text-align:center;padding:4px 8px;border:1px solid #ddd">${escapeHTML(obs.cagarrutas || '-')}</td></tr></table>`;
            }
            html += '</div></div>';
        }

        // Plantas (EI)
        if (tipo === 'EI' && datos.plantas && datos.plantas.length > 0) {
            html += `<div style="border:1px solid #ddd;border-radius:6px;margin-bottom:12px;overflow:hidden">
                <div style="background:#f5f5f0;padding:8px 12px;font-weight:bold;font-size:10pt;border-bottom:1px solid #ddd">Plantas — Media: ${escapeHTML(datos.plantasMedia || '-')}</div>
                <div style="padding:10px 12px"><table style="width:100%;border-collapse:collapse;font-size:8pt">
                <tr><th style="background:#1a3d2e;color:#fff;padding:3px 6px;border:1px solid #ddd">Especie</th>`;
            for (let i = 1; i <= 10; i++) html += `<th style="background:#1a3d2e;color:#fff;padding:3px 4px;border:1px solid #ddd">N${i}</th>`;
            html += '<th style="background:#1a3d2e;color:#fff;padding:3px 6px;border:1px solid #ddd">Media</th></tr>';
            datos.plantas.forEach(pl => {
                html += `<tr><td style="padding:3px 6px;border:1px solid #ddd"><em>${escapeHTML(pl.nombre || '-')}</em></td>`;
                (pl.notas || []).forEach(n => { html += `<td style="text-align:center;padding:3px 4px;border:1px solid #ddd">${n}</td>`; });
                html += `<td style="text-align:center;font-weight:bold;padding:3px 6px;border:1px solid #ddd">${pl.media || '-'}</td></tr>`;
            });
            html += '</table></div></div>';
        }

        // Palatables
        if (datos.palatables && datos.palatables.length > 0) {
            html += `<div style="border:1px solid #ddd;border-radius:6px;margin-bottom:12px;overflow:hidden">
                <div style="background:#f5f5f0;padding:8px 12px;font-weight:bold;font-size:10pt;border-bottom:1px solid #ddd">Palatables — Media: ${escapeHTML(datos.palatablesMedia || '-')}</div>
                <div style="padding:10px 12px"><table style="width:100%;border-collapse:collapse;font-size:8pt">
                <tr><th style="background:#1a3d2e;color:#fff;padding:3px 6px;border:1px solid #ddd">Especie</th>`;
            for (let i = 1; i <= 15; i++) html += `<th style="background:#1a3d2e;color:#fff;padding:3px 4px;border:1px solid #ddd">${i}</th>`;
            html += '<th style="background:#1a3d2e;color:#fff;padding:3px 6px;border:1px solid #ddd">Media</th></tr>';
            datos.palatables.forEach(pl => {
                html += `<tr><td style="padding:3px 6px;border:1px solid #ddd"><em>${escapeHTML(pl.nombre || '-')}</em></td>`;
                (pl.notas || []).forEach(n => { html += `<td style="text-align:center;padding:3px 4px;border:1px solid #ddd">${n}</td>`; });
                html += `<td style="text-align:center;font-weight:bold;padding:3px 6px;border:1px solid #ddd">${pl.media || '-'}</td></tr>`;
            });
            html += '</table></div></div>';
        }

        // Herbáceas
        if (datos.herbaceas && datos.herbaceas.length > 0) {
            html += `<div style="border:1px solid #ddd;border-radius:6px;margin-bottom:12px;overflow:hidden">
                <div style="background:#f5f5f0;padding:8px 12px;font-weight:bold;font-size:10pt;border-bottom:1px solid #ddd">Herbáceas — Media: ${escapeHTML(datos.herbaceasMedia || '-')}</div>
                <div style="padding:10px 12px"><table style="width:100%;border-collapse:collapse;font-size:9pt"><tr>`;
            datos.herbaceas.forEach((h, i) => { html += `<th style="background:#1a3d2e;color:#fff;padding:4px 8px;border:1px solid #ddd">H${i+1}</th>`; });
            html += '</tr><tr>';
            datos.herbaceas.forEach(h => { html += `<td style="text-align:center;padding:4px 8px;border:1px solid #ddd">${h}</td>`; });
            html += '</tr></table></div></div>';
        }

        // Matorral
        if (datos.matorral) {
            const mat = datos.matorral;
            html += `<div style="border:1px solid #ddd;border-radius:6px;margin-bottom:12px;overflow:hidden">
                <div style="background:#f5f5f0;padding:8px 12px;font-weight:bold;font-size:10pt;border-bottom:1px solid #ddd">Matorralización</div>
                <div style="padding:10px 12px"><table style="width:100%;border-collapse:collapse;font-size:9pt">
                <tr><th style="background:#1a3d2e;color:#fff;padding:4px 8px;border:1px solid #ddd">Punto</th><th style="background:#1a3d2e;color:#fff;padding:4px 8px;border:1px solid #ddd">Cobertura (%)</th><th style="background:#1a3d2e;color:#fff;padding:4px 8px;border:1px solid #ddd">Altura (cm)</th><th style="background:#1a3d2e;color:#fff;padding:4px 8px;border:1px solid #ddd">Especie</th></tr>`;
            for (let p = 1; p <= 2; p++) {
                const pt = mat['punto' + p] || {};
                html += `<tr><td style="padding:4px 8px;border:1px solid #ddd">Punto ${p}</td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHTML(pt.cobertura || '-')}</td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHTML(pt.altura || '-')}</td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHTML(pt.especie || '-')}</td></tr>`;
            }
            html += `<tr style="font-weight:bold"><td style="padding:4px 8px;border:1px solid #ddd">Media</td><td style="padding:4px 8px;border:1px solid #ddd">${mat.mediaCob || '-'}%</td><td style="padding:4px 8px;border:1px solid #ddd">${mat.mediaAlt || '-'} cm</td><td style="padding:4px 8px;border:1px solid #ddd">Vol: ${escapeHTML(mat.volumen || '-')}</td></tr>`;
            html += '</table></div></div>';
        }

        // Observaciones
        if (datos.observaciones) {
            html += `<div style="border:1px solid #ddd;border-radius:6px;margin-bottom:12px;overflow:hidden">
                <div style="background:#f5f5f0;padding:8px 12px;font-weight:bold;font-size:10pt;border-bottom:1px solid #ddd">Observaciones</div>
                <div style="padding:10px 12px">${escapeHTML(datos.observaciones).replace(/\n/g, '<br>')}</div></div>`;
        }

        // Fotos (desde IndexedDB + memory cache)
        const fotoCodes = (datos.fotos || '').split(',').map(s => s.trim()).filter(Boolean);
        if (fotoCodes.length > 0) {
            html += `<div style="border:1px solid #ddd;border-radius:6px;margin-bottom:12px;overflow:hidden">
                <div style="background:#f5f5f0;padding:8px 12px;font-weight:bold;font-size:10pt;border-bottom:1px solid #ddd">Fotos (${fotoCodes.length})</div>
                <div style="padding:10px 12px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px">`;
            fotoCodes.forEach(code => {
                const dataUrl = state.fotosCacheMemoria[code];
                if (dataUrl) {
                    html += `<div><img src="${dataUrl}" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:4px"><small style="display:block;text-align:center;font-size:7pt;color:#999">${escapeHTML(code)}</small></div>`;
                } else {
                    html += `<div style="background:#eee;padding:8px;border-radius:4px;text-align:center;font-size:8pt;color:#999">${escapeHTML(code)}</div>`;
                }
            });
            html += '</div></div>';
        }

        html += '</div>';
        return html;
    }

    function abrirVentanaPDF(htmlContent, titulo) {
        const win = window.open('', '_blank');
        if (!win) { showToast('Permite ventanas emergentes para PDF', 'error'); return; }
        win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
            <title>${escapeHTML(titulo)}</title>
            <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;font-size:11pt;color:#333;padding:20px}
            .page-break{page-break-before:always}
            @media print{body{padding:0}.no-print{display:none!important}.page-break{page-break-before:always}}</style>
            </head><body>
            <div class="no-print" style="text-align:center;margin-bottom:20px">
                <button onclick="window.print()" style="padding:10px 30px;font-size:14pt;background:#1a3d2e;color:#fff;border:none;border-radius:8px;cursor:pointer">Imprimir / Guardar PDF</button>
            </div>
            ${htmlContent}</body></html>`);
        win.document.close();
    }

    window.exportarPDF = async function(id, local) {
        let registro = null;
        if (local) {
            const registros = JSON.parse(localStorage.getItem('rapca_registros') || '[]');
            registro = registros.find(r => r.id === id);
        } else {
            try {
                const res = await fetch(CFG.apiUrl + '/registros.php?id=' + id, {
                    headers: { 'X-CSRF-Token': CFG.csrf }
                });
                const data = await res.json();
                registro = data.registro || (data.registros || [])[0];
            } catch(e) {
                // Intentar desde local
                const registros = JSON.parse(localStorage.getItem('rapca_registros') || '[]');
                registro = registros.find(r => r.id === id);
            }
        }
        if (!registro) { showToast('Registro no encontrado', 'error'); return; }
        const html = generarHTMLRegistro(registro);
        abrirVentanaPDF(html, 'RAPCA — ' + registro.tipo + ' ' + registro.unidad);
    };

    window.exportarTodosPDF = async function() {
        showLoading(true);
        let allRegs = [];
        try {
            const res = await fetch(CFG.apiUrl + '/registros.php', {
                headers: { 'X-CSRF-Token': CFG.csrf }
            });
            const data = await res.json();
            allRegs = data.registros || [];
        } catch(e) {}
        // Agregar locales no sincronizados
        const locales = JSON.parse(localStorage.getItem('rapca_registros') || '[]').filter(r => !r.enviado);
        allRegs = [...locales, ...allRegs];

        if (allRegs.length === 0) { showLoading(false); showToast('Sin registros', 'error'); return; }

        let html = '';
        allRegs.forEach((r, idx) => {
            if (idx > 0) html += '<div class="page-break"></div>';
            html += generarHTMLRegistro(r);
        });
        showLoading(false);
        abrirVentanaPDF(html, 'RAPCA — Informe Completo (' + allRegs.length + ' registros)');
    };

    // ==============================================================
    // ONLINE/OFFLINE
    // ==============================================================
    function updateSyncStatus() {
        state.isOnline = navigator.onLine;
        const dot = $('syncIndicator');
        if (dot) {
            dot.className = 'sync-dot ' + (state.isOnline ? 'online' : 'offline');
            dot.title = state.isOnline ? 'Online' : 'Offline';
        }
    }

    // ==============================================================
    // PHOTO UPLOAD (from camera)
    // ==============================================================
    window.procesarSubidasPendientes = async function() {
        if (!state.fotosDB) return;
        const tx = state.fotosDB.transaction('subidas_pendientes', 'readonly');
        const store = tx.objectStore('subidas_pendientes');
        const req = store.getAll();

        req.onsuccess = async function() {
            const pendientes = req.result || [];
            if (pendientes.length === 0) {
                showToast('Sin fotos pendientes', 'success');
                return;
            }

            showToast(`Subiendo ${pendientes.length} fotos...`);
            let ok = 0;

            for (const foto of pendientes) {
                try {
                    const formData = new FormData();
                    formData.append('codigo', foto.codigo);
                    formData.append('data', foto.data);
                    formData.append('unidad', foto.unidad || '');
                    formData.append('tipo', foto.tipo || '');

                    const res = await fetch(CFG.uploadUrl, {
                        method: 'POST',
                        headers: { 'X-CSRF-Token': CFG.csrf },
                        body: formData
                    });
                    const data = await res.json();
                    if (data.ok) {
                        // Remove from pending
                        const delTx = state.fotosDB.transaction('subidas_pendientes', 'readwrite');
                        delTx.objectStore('subidas_pendientes').delete(foto.codigo);
                        ok++;
                    }
                } catch(e) { /* retry later */ }
            }

            showToast(`Subidas: ${ok}/${pendientes.length}`, ok === pendientes.length ? 'success' : 'error');
        };
    };

    // ==============================================================
    // INIT
    // ==============================================================
    async function init() {
        // Set today's date
        ['vp-fecha', 'el-fecha', 'ev-fecha'].forEach(id => {
            const el = $(id);
            if (el) el.value = new Date().toISOString().slice(0, 10);
        });

        // Generate EI form inputs
        generarPlantas();
        generarPalatables();
        generarHerbaceas();

        // Init systems
        iniciarGeolocalizacion();
        initCompass();
        await initFotosDB().catch(() => {});
        cargarBorradores();
        updateSyncStatus();

        // Restore high contrast
        if (localStorage.getItem('rapca_alto_contraste') === '1') {
            document.body.classList.add('high-contrast');
            const btn = $('btnContraste');
            if (btn) btn.textContent = '\u{1F319}';
        }

        // Load counters
        ['VP', 'EL', 'EI'].forEach(tipo => {
            const saved = localStorage.getItem('rapca_contadores_' + tipo);
            if (saved) state.contadores[tipo] = JSON.parse(saved);
        });

        // Events
        window.addEventListener('online', () => { updateSyncStatus(); procesarSubidasPendientes(); });
        window.addEventListener('offline', updateSyncStatus);
        window.addEventListener('beforeunload', () => {
            ['vp','el','ev'].forEach(p => guardarBorrador(p));
            ['VP','EL','EI'].forEach(t => localStorage.setItem('rapca_contadores_' + t, JSON.stringify(state.contadores[t])));
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) ['vp','el','ev'].forEach(p => guardarBorrador(p));
        });
    }

    // Expose state for camera.js
    window.RAPCA_STATE = state;

    document.addEventListener('DOMContentLoaded', init);
})();
