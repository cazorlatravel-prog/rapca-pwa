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
    // PREVIEW
    // ==============================================================
    function mostrarPreview() {
        previewCanvas = $('preview-canvas');
        previewCtx = previewCanvas.getContext('2d');
        anotaciones = [];
        modoAnotacion = false;

        const img = new Image();
        img.onload = function() {
            previewCanvas.width = img.width;
            previewCanvas.height = img.height;
            previewCtx.drawImage(img, 0, 0);
        };
        img.src = capturedImageData;

        $('preview-modal').classList.add('active');

        // Touch/click for annotations
        previewCanvas.onclick = function(e) {
            if (!modoAnotacion) return;
            const rect = previewCanvas.getBoundingClientRect();
            const scaleX = previewCanvas.width / rect.width;
            const scaleY = previewCanvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            anotaciones.push({ x, y, num: anotaciones.length + 1 });
            dibujarAnotaciones();
        };
    }

    window.cerrarPreview = function() {
        $('preview-modal').classList.remove('active');
        // Reopen camera
        abrirCamara(camaraTipo, camaraSubtipo);
    };

    window.toggleAnotacion = function() {
        modoAnotacion = !modoAnotacion;
        const btn = document.querySelector('.btn-annotate');
        if (btn) btn.classList.toggle('active', modoAnotacion);
    };

    function dibujarAnotaciones() {
        // Redraw image
        const img = new Image();
        img.onload = function() {
            previewCtx.drawImage(img, 0, 0);
            // Draw circles
            anotaciones.forEach(a => {
                previewCtx.beginPath();
                previewCtx.arc(a.x, a.y, 60, 0, Math.PI * 2);
                previewCtx.strokeStyle = '#e74c3c';
                previewCtx.lineWidth = 6;
                previewCtx.stroke();

                previewCtx.fillStyle = '#e74c3c';
                previewCtx.beginPath();
                previewCtx.arc(a.x, a.y, 30, 0, Math.PI * 2);
                previewCtx.fill();

                previewCtx.fillStyle = '#fff';
                previewCtx.font = 'bold 36px sans-serif';
                previewCtx.textAlign = 'center';
                previewCtx.textBaseline = 'middle';
                previewCtx.fillText(String(a.num), a.x, a.y);
            });
        };
        img.src = capturedImageData;
    }

    // ==============================================================
    // ACCEPT PHOTO
    // ==============================================================
    window.aceptarFoto = function() {
        if (!previewCanvas || !pendingCodigo) return;

        // Get final image (with annotations)
        const finalDataUrl = previewCanvas.toDataURL('image/jpeg', 0.95);

        // Create thumbnail (400x533 @ 50% quality)
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 400;
        thumbCanvas.height = 533;
        const thumbCtx = thumbCanvas.getContext('2d');
        const img = new Image();
        img.onload = function() {
            thumbCtx.drawImage(img, 0, 0, 400, 533);
            const thumbData = thumbCanvas.toDataURL('image/jpeg', 0.5);

            // Save thumbnail to IndexedDB + memory
            if (window.RAPCA_STATE.fotosDB) {
                const tx = window.RAPCA_STATE.fotosDB.transaction('fotos', 'readwrite');
                tx.objectStore('fotos').put({ codigo: pendingCodigo, data: thumbData, fecha: Date.now() });
            }
            window.RAPCA_STATE.fotosCacheMemoria[pendingCodigo] = thumbData;

            // Queue upload (85% quality)
            const uploadCanvas = document.createElement('canvas');
            uploadCanvas.width = previewCanvas.width;
            uploadCanvas.height = previewCanvas.height;
            uploadCanvas.getContext('2d').drawImage(previewCanvas, 0, 0);
            const uploadData = uploadCanvas.toDataURL('image/jpeg', 0.85);

            const page = camaraTipo === 'EI' ? 'ev' : camaraTipo.toLowerCase();
            const unidad = document.getElementById(page + '-unidad')?.value || '';

            if (window.RAPCA_STATE.fotosDB) {
                const tx2 = window.RAPCA_STATE.fotosDB.transaction('subidas_pendientes', 'readwrite');
                tx2.objectStore('subidas_pendientes').put({
                    codigo: pendingCodigo, data: uploadData,
                    unidad, tipo: camaraTipo, fecha: Date.now()
                });
            }

            // Auto-download full res
            const link = document.createElement('a');
            link.href = finalDataUrl;
            link.download = pendingCodigo + '.jpg';
            link.click();

            // Add to form
            agregarFotoALista(pendingCodigo);

            window.showToast('Foto guardada: ' + pendingCodigo, 'success');
            pendingCodigo = null;
        };
        img.src = finalDataUrl;

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
