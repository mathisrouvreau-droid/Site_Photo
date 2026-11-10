/* ============================================
   MR VISUALS — mesure d'audience anonyme

   - aucun cookie, aucun identifiant stocké dans le navigateur
   - pas d'adresse IP conservée (le serveur ne garde qu'un hachage qui change chaque jour)
   - respecte « Ne pas me suivre » (DNT) et Global Privacy Control
   - on peut s'exclure : localStorage.mrv_no_track = '1' (fait automatiquement depuis admin.html)
   ============================================ */
(function () {
    'use strict';

    var cfg = window.MRV || {};
    var endpoint = cfg.analytics;
    if (!endpoint || endpoint.indexOf('REMPLACER') !== -1) return;

    try { if (localStorage.getItem('mrv_no_track') === '1') return; } catch (e) { /* stockage indisponible */ }
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1') return;
    if (navigator.globalPrivacyControl) return;

    var url = endpoint.replace(/\/$/, '') + '/collect';

    function send(payload) {
        var body = JSON.stringify(payload);
        try {
            if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
        } catch (e) { /* on retente avec fetch */ }
        try { fetch(url, { method: 'POST', body: body, keepalive: true, mode: 'cors', credentials: 'omit' }); } catch (e) { /* silencieux */ }
    }

    // Première page de la visite ? (pas un rechargement, pas une navigation interne)
    function isEntry() {
        try {
            var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
            if (nav && (nav.type === 'reload' || nav.type === 'back_forward')) return false;
        } catch (e) { /* ignoré */ }
        var ref = document.referrer;
        if (!ref) return true;
        try { return new URL(ref).origin !== location.origin; } catch (e) { return true; }
    }

    var params = new URLSearchParams(location.search);
    var entry = isEntry();
    send({
        t: 'pv',
        p: location.pathname,
        e: entry ? 1 : 0,
        r: entry ? document.referrer : '',
        u: entry ? (params.get('utm_source') || params.get('ref') || '') : ''
    });

    // Temps passé sur la page (uniquement quand l'onglet est visible)
    var visibleMs = 0;
    var since = document.visibilityState === 'visible' ? performance.now() : 0;
    function flush() {
        if (since) { visibleMs += performance.now() - since; since = 0; }
        if (visibleMs >= 500) {
            send({ t: 'leave', p: location.pathname, ms: Math.round(visibleMs) });
            visibleMs = 0;
        }
    }
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flush(); else since = performance.now();
    });
    window.addEventListener('pagehide', flush);

    // Actions
    function track(name, prop) {
        send({ t: 'ev', n: name, x: prop || '', p: location.pathname });
    }
    window.mrvTrack = track;
    document.addEventListener('mrv:event', function (e) {
        var d = e.detail || {};
        if (d.name) track(d.name, d.prop);
    });

    function place(el) {
        if (el.closest('.nav')) return 'menu';
        if (el.closest('.footer')) return 'pied de page';
        if (el.closest('.phone')) return 'reel';
        if (el.closest('.film')) return 'section film';
        if (el.closest('.cta-band')) return 'fin de page';
        if (el.closest('.about')) return 'à propos';
        if (el.closest('.contact-main, .contact-hero')) return 'contact';
        return 'autre';
    }

    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        var href = a.getAttribute('href') || '';
        if (/instagram\.com/i.test(href)) track('click_instagram', place(a));
        else if (/linkedin\.com/i.test(href)) track('click_linkedin', place(a));
        else if (/^mailto:/i.test(href)) track('click_email', place(a));
    }, true);

    var form = document.getElementById('contactForm');
    if (form) {
        var started = false;
        form.addEventListener('focusin', function () {
            if (!started) { started = true; track('contact_start'); }
        });
    }
})();
