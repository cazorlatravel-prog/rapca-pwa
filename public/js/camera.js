/**
 * RAPCA Campo — Módulo Cámara + GPS + Brújula + Anotaciones
 */
;(function() {
    'use strict';

    const CFG = window.RAPCA;
    let state;

    // Camera state
    let stream = null;
    let camaraTipo = '';
    let camaraSubtipo = '';
    let capturedImageData = null;
    let previewCanvas = null;
    let previewCtx = null;
    let anotaciones = [];
    let modoAnotacion = false;
    let pendingCodigo = null;

    function $(id) { return document.getElementById(id); }

    // ==============================================================
    // OPEN CAMERA
    // ==============================================================
    window.abrirCamara = async function(tipo, subtipo) {
        state = window.RAPCA_STATE;
        camaraTipo = tipo;
        camaraSubtipo = subtipo;

        // Generate photo code
        pendingCodigo = generarCodigoFoto(tipo, subtipo);
        $('camera-code').textContent = pendingCodigo;

        const modal = $('camera-modal');
        modal.classList.add('active');

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });
            $('camera-feed').srcObject = stream;
        } catch (e) {
            alert('No se pudo acceder a la cámara: ' + e.message);
            cerrarCamara();
        }

        // Update compass + coords display
        updateCameraOverlay();
    };

    function updateCameraOverlay() {
        if (!$('camera-modal').classList.contains('active')) return;

        $('camera-heading').textContent = Math.round(state.currentHeading) + '\u00B0';
        if (state.currentLat) {
            $('camera-coords').textContent =
                state.currentLat.toFixed(5) + ', ' + state.currentLon.toFixed(5) +
                (state.currentUTM ? '\n' + state.currentUTM : '');
        }

        requestAnimationFrame(updateCameraOverlay);
    }

    function generarCodigoFoto(tipo, subtipo) {
        const page = tipo === 'EI' ? 'ev' : tipo.toLowerCase();
        const unidad = $(page + '-unidad')?.value || 'SIN_UNIDAD';
        const key = unidad + '_' + tipo + '_' + (subtipo || 'G');
        if (!state.contadores[tipo]) state.contadores[tipo] = {};
        state.contadores[tipo][key] = (state.contadores[tipo][key] || 0) + 1;
        const num = String(state.contadores[tipo][key]).padStart(3, '0');
        if (subtipo === 'G') return unidad + '_' + tipo + '_G_' + num;
        return unidad + '_' + tipo + '_' + subtipo + '_' + num;
    }

    // ==============================================================
    // CLOSE CAMERA
    // ==============================================================
    window.cerrarCamara = function() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        $('camera-modal').classList.remove('active');

        // Decrement counter since photo was cancelled
        if (pendingCodigo) {
            const parts = pendingCodigo.split('_');
            const tipo = parts[1];
            const subtipo = parts[2];
            const unidad = parts[0];
            const key = unidad + '_' + tipo + '_' + subtipo;
            if (state.contadores[tipo] && state.contadores[tipo][key] > 0) {
                state.contadores[tipo][key]--;
            }
            pendingCodigo = null;
        }
    };

    // ==============================================================
    // CAPTURE PHOTO
    // ==============================================================
    window.capturarFoto = function() {
        const video = $('camera-feed');
        if (!video || !video.videoWidth) return;

        // Create high-res canvas (3060 x 4080)
        const canvas = document.createElement('canvas');
        const W = 3060, H = 4080;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Draw video frame (cover)
        const vw = video.videoWidth, vh = video.videoHeight;
        const scale = Math.max(W / vw, H / vh);
        const sx = (vw - W / scale) / 2, sy = (vh - H / scale) / 2;
        ctx.drawImage(video, sx, sy, W / scale, H / scale, 0, 0, W, H);

        // Draw watermark overlay
        drawWatermark(ctx, W, H);

        // Store for preview
        capturedImageData = canvas.toDataURL('image/jpeg', 0.95);

        // Show preview
        mostrarPreview();

        // Stop camera
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        $('camera-modal').classList.remove('active');

        try { if (navigator.vibrate) navigator.vibrate(50); } catch(e) {}
    };

    function drawWatermark(ctx, W, H) {
        const margin = 40;
        const barH = 280;

        // Bottom bar background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, H - barH, W, barH);

        // RAPCA branding
        ctx.fillStyle = '#88d8b0';
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText('RAPCA Campo', margin, H - barH + 60);

        // Date + code
        ctx.fillStyle = '#fff';
        ctx.font = '36px sans-serif';
        const dateStr = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
        ctx.fillText(dateStr, margin, H - barH + 110);
        ctx.fillText(pendingCodigo || '', margin, H - barH + 155);

        // Compass
        ctx.fillText('Rumbo: ' + Math.round(state.currentHeading) + '\u00B0', margin, H - barH + 200);

        // GPS
        if (state.currentLat) {
            ctx.font = '32px sans-serif';
            ctx.fillText(state.currentLat.toFixed(6) + ', ' + state.currentLon.toFixed(6), margin, H - barH + 240);
            if (state.currentUTM) {
                ctx.fillText('UTM: ' + state.currentUTM, margin + 800, H - barH + 240);
            }
        }

        // Top-right: mini-compass circle
        const cx = W - 120, cy = 120, r = 80;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Compass needle
        const headingRad = (state.currentHeading || 0) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r + 10);
        ctx.lineTo(cx - 8, cy + 10);
        ctx.lineTo(cx + 8, cy + 10);
        ctx.closePath();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-headingRad);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = '#e74c3c';
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('N', cx, cy - r - 10);
        ctx.textAlign = 'left';
    }

    // ==============================================================
    // PREVIEW & ANNOTATIONS
    // ==============================================================
    let lastTapTime = 0;
    let previewScale = 1; // ratio preview canvas / original (3060)

    function mostrarPreview() {
        previewCanvas = $('preview-canvas');
        previewCtx = previewCanvas.getContext('2d');
        anotaciones = [];
        modoAnotacion = false;

        // Reset UI
        const tools = $('preview-tools');
        if (tools) tools.classList.remove('show');
        const btnA = $('btnAnotar');
        if (btnA) { btnA.textContent = '\uD83D\uDD34 Anotar'; btnA.classList.remove('active'); }
        const btnAc = $('btnAceptar');
        if (btnAc) btnAc.textContent = '\u2714 Aceptar';

        const container = $('preview-container');
        const img = new Image();
        img.onload = function() {
            // Calcular tamaño responsivo manteniendo 3:4
            const cW = container.clientWidth || 300;
            const cH = container.clientHeight || 400;
            const aspect = 3 / 4;
            let pW, pH;
            if (cW / cH > aspect) { pH = cH; pW = Math.round(pH * aspect); }
            else { pW = cW; pH = Math.round(pW / aspect); }

            previewCanvas.width = pW;
            previewCanvas.height = pH;
            previewScale = pW / 3060;
            previewCtx.drawImage(img, 0, 0, 3060, 4080, 0, 0, pW, pH);
        };
        img.src = capturedImageData;

        $('preview-modal').classList.add('active');

        // Limpiar listeners previos clonando el canvas
        const oldCanvas = previewCanvas;
        const newCanvas = oldCanvas.cloneNode(true);
        oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
        previewCanvas = newCanvas;
        previewCtx = previewCanvas.getContext('2d');

        // Redibujar después de clonar
        const img2 = new Image();
        img2.onload = function() {
            const cW = container.clientWidth || 300;
            const cH = container.clientHeight || 400;
            const aspect = 3 / 4;
            let pW, pH;
            if (cW / cH > aspect) { pH = cH; pW = Math.round(pH * aspect); }
            else { pW = cW; pH = Math.round(pW / aspect); }
            previewCanvas.width = pW;
            previewCanvas.height = pH;
            previewScale = pW / 3060;
            previewCtx.drawImage(img2, 0, 0, 3060, 4080, 0, 0, pW, pH);
        };
        img2.src = capturedImageData;

        // Touch para móvil
        previewCanvas.addEventListener('touchend', function(e) {
            if (!modoAnotacion) return;
            e.preventDefault();
            const t = e.changedTouches[0];
            handleAnnotationTap(t.clientX, t.clientY);
        }, { passive: false });

        // Click para desktop
        previewCanvas.addEventListener('click', function(e) {
            handleAnnotationTap(e.clientX, e.clientY);
        });
    }

    function handleAnnotationTap(cx, cy) {
        if (!modoAnotacion) return;
        // Debounce touch+click
        const now = Date.now();
        if (now - lastTapTime < 300) return;
        lastTapTime = now;

        const rect = previewCanvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const relX = cx - rect.left;
        const relY = cy - rect.top;
        // Validar dentro del canvas
        if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return;

        // Escalar de visual a coordenadas originales (3060x4080)
        const scaleX = previewCanvas.width / rect.width;
        const scaleY = previewCanvas.height / rect.height;
        const canvasX = relX * scaleX;
        const canvasY = relY * scaleY;
        const s = previewScale || 1;
        const fullX = Math.max(0, Math.min(3060, canvasX / s));
        const fullY = Math.max(0, Math.min(4080, canvasY / s));

        const radio = parseInt(($('circleSize') || {}).value, 10) || 200;
        const texto = ($('annotationText') || {}).value || '';
        anotaciones.push({ x: fullX, y: fullY, radio: radio, texto: texto.trim(), num: anotaciones.length + 1 });
        if ($('annotationText')) $('annotationText').value = '';

        dibujarVistaPrevia();
        window.showToast('Punto ' + anotaciones.length + ' marcado', 'success');
    }

    window.cerrarPreview = function() {
        $('preview-modal').classList.remove('active');
        abrirCamara(camaraTipo, camaraSubtipo);
    };

    window.toggleAnotacion = function() {
        modoAnotacion = !modoAnotacion;
        const btn = $('btnAnotar');
        const tools = $('preview-tools');
        if (modoAnotacion) {
            if (btn) { btn.textContent = '\u2716 Cerrar'; btn.classList.add('active'); }
            if (tools) tools.classList.add('show');
        } else {
            if (btn) { btn.textContent = '\uD83D\uDD34 Anotar'; btn.classList.remove('active'); }
            if (tools) tools.classList.remove('show');
        }
        dibujarVistaPrevia();
    };

    window.deshacerAnotacion = function() {
        if (anotaciones.length === 0) { window.showToast('Sin anotaciones', 'info'); return; }
        anotaciones.pop();
        dibujarVistaPrevia();
        window.showToast('Anotación eliminada', 'info');
    };

    function dibujarVistaPrevia() {
        const img = new Image();
        img.onload = function() {
            const s = previewScale || 1;
            previewCtx.drawImage(img, 0, 0, 3060, 4080, 0, 0, previewCanvas.width, previewCanvas.height);

            for (let i = 0; i < anotaciones.length; i++) {
                const a = anotaciones[i];
                const ax = a.x * s, ay = a.y * s, ar = a.radio * s;

                previewCtx.strokeStyle = '#FF0000';
                previewCtx.lineWidth = Math.max(2, ar * 0.1);
                previewCtx.beginPath();
                previewCtx.arc(ax, ay, ar, 0, Math.PI * 2);
                previewCtx.stroke();
                previewCtx.fillStyle = 'rgba(255,0,0,0.15)';
                previewCtx.fill();

                previewCtx.fillStyle = '#FF0000';
                previewCtx.font = 'bold ' + Math.max(12, Math.round(ar * 0.6)) + 'px Arial';
                previewCtx.textAlign = 'center';
                previewCtx.textBaseline = 'middle';
                previewCtx.fillText(String(i + 1), ax, ay);
            }
            previewCtx.textAlign = 'left';
            previewCtx.textBaseline = 'alphabetic';

            // Actualizar botón aceptar con conteo
            const btnAc = $('btnAceptar');
            if (btnAc) btnAc.textContent = anotaciones.length > 0
                ? '\u2714 Aceptar (' + anotaciones.length + ')'
                : '\u2714 Aceptar';
        };
        img.src = capturedImageData;
    }

    function dibujarAnotacionesEnCanvas(ctx, w, h) {
        // Dibujar círculos en coordenadas originales (3060x4080)
        for (let i = 0; i < anotaciones.length; i++) {
            const a = anotaciones[i];
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = Math.max(8, a.radio * 0.12);
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.radio, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,0,0,0.12)';
            ctx.fill();
            ctx.fillStyle = '#FF0000';
            ctx.font = 'bold ' + Math.max(40, Math.round(a.radio * 0.7)) + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 6;
            ctx.fillText(String(i + 1), a.x, a.y);
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Banner de advertencia con lista de anotaciones
        const bannerH = 75 + anotaciones.length * 55;
        ctx.fillStyle = 'rgba(180,0,0,0.85)';
        ctx.beginPath();
        ctx.roundRect(20, 20, w - 40, bannerH, 20);
        ctx.fill();
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 55px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('\u26A0 ANOTACIONES:', 50, 35);
        ctx.fillStyle = '#fff';
        ctx.font = '42px Arial';
        for (let i = 0; i < anotaciones.length; i++) {
            ctx.fillText((i + 1) + '. ' + (anotaciones[i].texto || 'Punto señalado'), 50, 90 + i * 55);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    // ==============================================================
    // ACCEPT PHOTO
    // ==============================================================
    window.aceptarFoto = function() {
        if (!pendingCodigo) return;

        // Crear canvas a resolución original (3060x4080) con anotaciones
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = 3060;
        fullCanvas.height = 4080;
        const fullCtx = fullCanvas.getContext('2d');

        const img = new Image();
        img.onload = function() {
            fullCtx.drawImage(img, 0, 0, 3060, 4080);

            // Dibujar anotaciones en la imagen final
            if (anotaciones.length > 0) {
                dibujarAnotacionesEnCanvas(fullCtx, 3060, 4080);
            }

            // Thumbnail (400x533 @ 50%)
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 400;
            thumbCanvas.height = 533;
            thumbCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, 3060, 4080, 0, 0, 400, 533);
            const thumbData = thumbCanvas.toDataURL('image/jpeg', 0.5);

            // Save thumbnail to IndexedDB + memory
            if (window.RAPCA_STATE.fotosDB) {
                const tx = window.RAPCA_STATE.fotosDB.transaction('fotos', 'readwrite');
                tx.objectStore('fotos').put({ codigo: pendingCodigo, data: thumbData, fecha: Date.now() });
            }
            window.RAPCA_STATE.fotosCacheMemoria[pendingCodigo] = thumbData;

            // Queue upload (85% quality, mitad de resolución)
            const upCanvas = document.createElement('canvas');
            upCanvas.width = 1530;
            upCanvas.height = 2040;
            upCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, 3060, 4080, 0, 0, 1530, 2040);
            const uploadData = upCanvas.toDataURL('image/jpeg', 0.85);

            const page = camaraTipo === 'EI' ? 'ev' : camaraTipo.toLowerCase();
            const unidad = document.getElementById(page + '-unidad')?.value || '';

            if (window.RAPCA_STATE.fotosDB) {
                const tx2 = window.RAPCA_STATE.fotosDB.transaction('subidas_pendientes', 'readwrite');
                tx2.objectStore('subidas_pendientes').put({
                    codigo: pendingCodigo, data: uploadData,
                    unidad, tipo: camaraTipo, fecha: Date.now()
                });
            }

            // Auto-download full res (95% quality)
            fullCanvas.toBlob(function(b) {
                const u = URL.createObjectURL(b);
                const link = document.createElement('a');
                link.href = u;
                link.download = pendingCodigo + '.jpg';
                link.click();
                setTimeout(function() { URL.revokeObjectURL(u); }, 5000);
            }, 'image/jpeg', 0.95);

            // Add to form
            agregarFotoALista(pendingCodigo);

            const online = window.RAPCA_STATE.isOnline;
            window.showToast(online ? '\uD83D\uDCF7\u2601\uFE0F ' + pendingCodigo : '\uD83D\uDCF7 ' + pendingCodigo + ' (offline)', 'success');
            if (online) window.procesarSubidasPendientes();
            pendingCodigo = null;
            anotaciones = [];
            modoAnotacion = false;
        };
        img.src = capturedImageData;

        $('preview-modal').classList.remove('active');
    };

    function agregarFotoALista(codigo) {
        const page = camaraTipo === 'EI' ? 'ev' : camaraTipo.toLowerCase();
        const lista = document.getElementById(page + '-fotos-lista');
        if (lista) {
            const tag = document.createElement('span');
            tag.className = 'foto-tag';
            tag.textContent = codigo;
            lista.appendChild(tag);
        }

        // Also append to text input
        const input = document.getElementById(page + '-fotos');
        if (input) {
            const current = input.value.trim();
            input.value = current ? current + ', ' + codigo : codigo;
        }
    }

})();
