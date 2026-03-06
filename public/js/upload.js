/**
 * RAPCA Campo — Upload logic
 */
;(function() {
    'use strict';

    /**
     * Upload a single photo to the server with retries
     */
    window.subirFotoConReintentos = async function(codigo, dataUrl, unidad, tipo, maxRetries) {
        maxRetries = maxRetries || 3;
        const CFG = window.RAPCA;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const formData = new FormData();
                formData.append('codigo', codigo);
                formData.append('data', dataUrl);
                formData.append('unidad', unidad || '');
                formData.append('tipo', tipo || '');

                const res = await fetch(CFG.uploadUrl, {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': CFG.csrf },
                    body: formData
                });

                const result = await res.json();
                if (result.ok) return result;
                throw new Error(result.error || 'Upload failed');
            } catch (e) {
                if (attempt === maxRetries) throw e;
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    };
})();
