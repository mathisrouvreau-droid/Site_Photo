/* ============================================
   MR VISUALS — configuration de la mesure d'audience
   ============================================ */
window.MRV = (function () {
    var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    return {
        // Adresse du Worker Cloudflare qui enregistre les visites (voir analytics/LISEZMOI.md).
        // En local (test), on parle au Worker de développement ; tant que l'adresse contient
        // « REMPLACER », aucune mesure n'est faite.
        analytics: local ? 'http://localhost:8787' : 'https://mrvisuals-stats.mrvisuals-stats.workers.dev'
    };
})();
