/**
 * RAPCA Campo — Offline sync queue
 */
;(function() {
    'use strict';

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/public/sw.js')
            .then(reg => console.log('SW registrado:', reg.scope))
            .catch(err => console.warn('SW error:', err));
    }

    // PWA install prompt
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
    });

    window.instalarApp = function() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(result => {
                deferredPrompt = null;
                if (result.outcome === 'accepted') {
                    window.showToast('App instalada', 'success');
                }
            });
        }
    };
})();
