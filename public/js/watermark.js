/**
 * RAPCA Campo — Canvas watermark rendering
 * (Included in camera.js drawWatermark for now)
 * This module can be extended for preloaded OSM tiles
 */
;(function() {
    'use strict';

    const mapTilesLoaded = [];

    /**
     * Preload OSM tiles for mini-map overlay
     */
    window.precargarMapTiles = function(lat, lon) {
        if (!lat || !lon) return;
        const zoom = 16;
        const n = Math.pow(2, zoom);
        const xtile = Math.floor((lon + 180) / 360 * n);
        const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);

        // 3x3 grid
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = `https://tile.openstreetmap.org/${zoom}/${xtile + dx}/${ytile + dy}.png`;
                mapTilesLoaded.push({ img, dx, dy });
            }
        }
    };

    /**
     * Draw mini-map on canvas
     */
    window.dibujarMapaEnCanvas = function(ctx, x, y, w, h) {
        if (mapTilesLoaded.length === 0) return;

        const tileSize = w / 3;
        mapTilesLoaded.forEach(t => {
            const tx = x + (t.dx + 1) * tileSize;
            const ty = y + (t.dy + 1) * tileSize;
            try {
                ctx.drawImage(t.img, tx, ty, tileSize, tileSize);
            } catch(e) {}
        });

        // Center marker
        ctx.beginPath();
        ctx.arc(x + w/2, y + h/2, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#e74c3c';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
    };
})();
