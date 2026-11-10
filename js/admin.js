/* ============================================
   MR VISUALS — page d'administration : statistiques
   Les chiffres viennent du Worker Cloudflare (voir analytics/LISEZMOI.md).
   Tout le contenu reçu est inséré via textContent (jamais innerHTML).
   ============================================ */
(function () {
    'use strict';

    var API = String((window.MRV && window.MRV.analytics) || '').replace(/\/$/, '');
    var NS = 'http://www.w3.org/2000/svg';
    var nf = new Intl.NumberFormat('fr-FR');
    var regionNames = null;
    try { regionNames = new Intl.DisplayNames(['fr'], { type: 'region' }); } catch (e) { /* ancien navigateur */ }

    var $ = function (id) { return document.getElementById(id); };
    var TIP = $('tip');   // l'infobulle est déplacée dans le graphique : on garde sa référence
    var state = { range: 30, pwd: '', timer: null, data: null, busy: false };

    /* ---------------------------------------------------------- utilitaires DOM */
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function svg(tag, attrs) {
        var n = document.createElementNS(NS, tag);
        for (var k in attrs) n.setAttribute(k, attrs[k]);
        return n;
    }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function num(v) { return nf.format(Math.round(v || 0)); }

    function duration(ms) {
        var s = Math.round((ms || 0) / 1000);
        if (s <= 0) return '—';
        if (s < 60) return s + ' s';
        var m = Math.floor(s / 60);
        return m + ' min ' + String(s % 60).padStart(2, '0') + ' s';
    }
    function mmss(ms) {
        var s = Math.round((ms || 0) / 1000);
        if (s <= 0) return '—';
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    function shortDuration(ms) {
        var s = Math.round((ms || 0) / 1000);
        if (s <= 0) return '';
        return s < 60 ? s + ' s' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    function ago(ts, now) {
        var s = Math.max(0, now - ts);
        if (s < 60) return 'à l\'instant';
        if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
        if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
        var d = Math.floor(s / 86400);
        return 'il y a ' + d + ' j';
    }
    function countryName(code) {
        if (!code) return 'Inconnu';
        try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
    }
    function flag(code) {
        if (!code || code.length !== 2) return '';
        return String.fromCodePoint.apply(null, code.toUpperCase().split('').map(function (c) { return 127397 + c.charCodeAt(0); }));
    }
    function parseDay(s) {
        var p = s.split('-');
        return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    }
    function dayList(from, to) {
        var out = [], d = parseDay(from), end = parseDay(to);
        while (d <= end) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
        return out;
    }
    function fmtDay(s, opts) {
        return parseDay(s).toLocaleDateString('fr-FR', Object.assign({ timeZone: 'UTC' }, opts));
    }

    var PAGE_NAMES = {
        '/': 'Accueil', '/gallery.html': 'Galerie', '/about.html': 'À propos',
        '/contact.html': 'Contact', '/confidentialite.html': 'Confidentialité'
    };
    function pageName(p) { return PAGE_NAMES[p] || p; }
    var COLLECTIONS = { all: 'Toutes les photos', golf: 'Golf', portrait: 'Portrait', danse: 'Danse', voiture: 'Automobile', nature: 'Nature', basket: 'Basket' };
    var SRC_COLORS = {
        Instagram: '#d6249f', Google: '#4285f4', LinkedIn: '#0a66c2', Facebook: '#1877f2', Direct: '#8a8a8a',
        TikTok: '#25f4ee', 'X / Twitter': '#d0d0d0', YouTube: '#ff0033', GitHub: '#a371f7', Bing: '#00a4ef',
        DuckDuckGo: '#de5833', Snapchat: '#fffc00', Pinterest: '#e60023', Email: '#b8945a', 'QR code': '#b8945a'
    };

    /* ---------------------------------------------------------- appels API */
    function api(path) {
        return fetch(API + path, { headers: { Authorization: 'Bearer ' + state.pwd } }).then(function (r) {
            if (r.status === 401) { var e = new Error('401'); e.code = 401; throw e; }
            if (r.status === 429) { var e2 = new Error('429'); e2.code = 429; throw e2; }
            if (!r.ok) { var e3 = new Error('http'); e3.code = r.status; throw e3; }
            return r.json();
        });
    }

    /* ---------------------------------------------------------- connexion */
    function showLogin(msg) {
        $('dash').hidden = true;
        $('login').hidden = false;
        var err = $('loginError');
        err.hidden = !msg;
        err.textContent = msg || '';
        stopTimer();
        setTimeout(function () { $('pwd').focus(); }, 50);
    }
    function showDash() {
        $('login').hidden = true;
        $('dash').hidden = false;
    }
    function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

    function boot() {
        if (!API || API.indexOf('REMPLACER') !== -1) {
            $('loginHint').textContent = 'Le compteur n\'est pas encore branché : voir analytics/LISEZMOI.md.';
            $('pwd').disabled = true;
            document.querySelector('.login__btn').disabled = true;
            return;
        }
        var saved = '';
        try { saved = sessionStorage.getItem('mrv_admin') || localStorage.getItem('mrv_admin') || ''; } catch (e) { /* ignoré */ }
        if (saved) {
            state.pwd = saved;
            load(true).catch(function () { showLogin(); });
        } else {
            showLogin();
        }
    }

    $('loginForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.querySelector('.login__btn');
        var pwd = $('pwd').value;
        if (!pwd) return;
        btn.disabled = true;
        $('loginError').hidden = true;
        state.pwd = pwd;
        api('/api/ping').then(function () {
            try {
                sessionStorage.setItem('mrv_admin', pwd);
                if ($('remember').checked) localStorage.setItem('mrv_admin', pwd);
                // première connexion : on cesse de compter les visites de cet appareil
                if (localStorage.getItem('mrv_no_track_set') !== '1') {
                    localStorage.setItem('mrv_no_track', '1');
                    localStorage.setItem('mrv_no_track_set', '1');
                }
            } catch (err) { /* ignoré */ }
            $('pwd').value = '';
            return load(true);
        }).catch(function (err) {
            state.pwd = '';
            if (err.code === 401) showLogin('Mot de passe incorrect.');
            else if (err.code === 429) showLogin('Trop d\'essais. Réessaie dans quelques minutes.');
            else showLogin('Impossible de joindre le compteur. Vérifie ta connexion et réessaie.');
        }).then(function () { btn.disabled = false; });
    });

    $('logout').addEventListener('click', function () {
        try { sessionStorage.removeItem('mrv_admin'); localStorage.removeItem('mrv_admin'); } catch (e) { /* ignoré */ }
        state.pwd = '';
        showLogin();
    });

    $('range').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-range]');
        if (!b) return;
        state.range = Number(b.dataset.range);
        Array.prototype.forEach.call($('range').children, function (x) { x.classList.toggle('is-active', x === b); });
        load(false);
    });
    $('refresh').addEventListener('click', function () { load(false); });

    var noTrack = $('noTrack');
    try { noTrack.checked = localStorage.getItem('mrv_no_track') === '1'; } catch (e) { /* ignoré */ }
    noTrack.addEventListener('change', function () {
        try {
            localStorage.setItem('mrv_no_track', noTrack.checked ? '1' : '0');
            localStorage.setItem('mrv_no_track_set', '1');
        } catch (e) { /* ignoré */ }
    });

    /* ---------------------------------------------------------- chargement */
    function load(first) {
        if (state.busy) return Promise.resolve();
        state.busy = true;
        $('refresh').classList.add('is-spinning');
        if (first) document.body.classList.add('is-loading');
        return api('/api/stats?range=' + state.range).then(function (d) {
            state.data = d;
            showDash();
            $('banner').hidden = true;
            render(d);
            if (!state.timer) state.timer = setInterval(function () { if (!document.hidden) load(false); }, 45000);
        }).catch(function (err) {
            if (!err.code) console.error('[admin]', err);
            if (err.code === 401) { showLogin('Session expirée : entre à nouveau ton mot de passe.'); throw err; }
            if (first) { showLogin('Impossible de joindre le compteur.'); throw err; }
            var b = $('banner');
            b.hidden = false;
            b.textContent = 'Impossible d\'actualiser les chiffres pour le moment. Ils se mettront à jour dès que la connexion revient.';
        }).then(function () {
            state.busy = false;
            document.body.classList.remove('is-loading');
            $('refresh').classList.remove('is-spinning');
        });
    }

    /* ---------------------------------------------------------- rendu */
    function render(d) {
        var cur = d.totals.current || {}, prev = d.totals.previous || {};
        var live = $('live');
        $('liveN').textContent = d.live || 0;
        live.classList.toggle('is-on', (d.live || 0) > 0);

        var titles = { 1: 'Aujourd\'hui', 7: '7 derniers jours', 30: '30 derniers jours', 90: '90 derniers jours', 365: '12 derniers mois' };
        $('periodTitle').textContent = titles[d.range] || '';
        $('periodSub').textContent = d.range === 1
            ? fmtDay(d.to, { weekday: 'long', day: 'numeric', month: 'long' })
            : 'Du ' + fmtDay(d.from, { day: 'numeric', month: 'long' }) + ' au ' + fmtDay(d.to, { day: 'numeric', month: 'long', year: 'numeric' })
              + (d.since ? ' · comptage depuis le ' + new Date(d.since * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

        renderKpis(cur, prev, d);
        renderChart(d);
        renderBars('sources', d.sources, function (r) { return { label: r.label, value: r.visitors, dot: SRC_COLORS[r.label] || '#b8945a' }; });
        renderPages(d);
        renderCollections(d);
        renderActions(d);
        renderPhotos(d);
        renderBars('countries', d.countries, function (r) { return { label: countryName(r.label), prefix: flag(r.label), value: r.visitors }; });
        renderBars('cities', d.cities, function (r) { return { label: r.label, small: r.country ? countryName(r.country) : '', value: r.visitors }; });
        renderHours(d.hours);
        renderBars('devices', d.devices, function (r) { return { label: cap(r.label), value: r.visitors }; });
        renderBars('browsers', d.browsers, function (r) { return { label: r.label, value: r.visitors }; });
        renderBars('systems', d.systems, function (r) { return { label: r.label, value: r.visitors }; });
        renderFeed(d);
        renderFunnel(d, cur);
        renderInsights(d);
    }

    function renderFunnel(d, cur) {
        var ev = {};
        (d.events || []).forEach(function (e) { ev[e.name] = e; });
        var contact = (d.pages || []).filter(function (p) { return p.path === '/contact.html'; })[0];
        var total = cur.visitors || 0;
        var rows = [
            { label: 'Ont visité le site', value: total },
            { label: 'Ont vu la page Contact', value: contact ? contact.visitors : 0 },
            { label: 'Ont commencé le formulaire', value: ev.contact_start ? ev.contact_start.people : 0 },
            { label: 'Ont envoyé un message', value: ev.contact_submit ? ev.contact_submit.people : 0 }
        ];
        renderBars('funnel', total ? rows : [], function (r) {
            return { label: r.label, value: r.value, extra: total ? Math.round((r.value / total) * 100) + ' %' : '' };
        });
    }

    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

    function delta(curV, prevV, invert) {
        var box = el('div', 'kpi__delta');
        if (!prevV && !curV) { box.appendChild(el('span', 'flat', '—')); return box; }
        if (!prevV) { box.appendChild(el('span', 'up', 'nouveau')); return box; }
        var pct = ((curV - prevV) / prevV) * 100;
        var good = invert ? pct < 0 : pct > 0;
        var cls = Math.abs(pct) < 0.5 ? 'flat' : (good ? 'up' : 'down');
        var arrow = Math.abs(pct) < 0.5 ? '＝' : (pct > 0 ? '▲' : '▼');
        box.appendChild(el('span', cls, arrow + '\u00a0' + Math.abs(Math.round(pct)) + '\u00a0%'));
        box.appendChild(el('span', 'vs', 'vs période précédente'));
        return box;
    }

    function countUp(node, target, formatter) {
        var t0 = performance.now(), dur = 900;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = formatter(target); return; }
        (function step(now) {
            var k = Math.min(1, (now - t0) / dur);
            k = 1 - Math.pow(1 - k, 3);
            node.textContent = formatter(target * k);
            if (k < 1) requestAnimationFrame(step);
        })(t0);
    }

    function renderKpis(cur, prev, d) {
        var box = $('kpis');
        clear(box);
        var visits = cur.visits || 0, pvisits = prev.visits || 0;
        var ppv = visits ? (cur.pageviews || 0) / visits : 0;
        var pppv = pvisits ? (prev.pageviews || 0) / pvisits : 0;
        var bounce = visits ? (cur.bounces || 0) / visits * 100 : 0;
        var pbounce = pvisits ? (prev.bounces || 0) / pvisits * 100 : 0;
        var items = [
            { label: 'Visiteurs', v: cur.visitors || 0, p: prev.visitors || 0, f: num },
            { label: 'Pages vues', v: cur.pageviews || 0, p: prev.pageviews || 0, f: num },
            { label: 'Pages par visite', v: ppv, p: pppv, f: function (x) { return x ? x.toFixed(1).replace('.', ',') : '—'; } },
            { label: 'Durée moyenne', v: cur.avg_ms || 0, p: prev.avg_ms || 0, f: function (x) { return mmss(x); }, noCount: true, unit: 'min' },
            { label: 'Taux de rebond', v: bounce, p: pbounce, f: function (x) { return visits ? Math.round(x) + ' %' : '—'; }, invert: true },
            { label: 'Contacts et clics', v: cur.actions || 0, p: prev.actions || 0, f: num }
        ];
        items.forEach(function (it) {
            var k = el('article', 'kpi');
            k.appendChild(el('span', 'kpi__label', it.label));
            var v = el('span', 'kpi__value', it.f(0));
            k.appendChild(v);
            k.appendChild(delta(it.v, it.p, it.invert));
            box.appendChild(k);
            if (it.noCount) {
                v.textContent = it.f(it.v);
                if (it.unit && it.v > 0) v.appendChild(el('small', null, it.unit));
            } else countUp(v, it.v, it.f);
        });
    }

    /* --- graphique principal --- */
    function niceMax(v) {
        if (v <= 4) return 4;
        var p = Math.pow(10, Math.floor(Math.log10(v)));
        var n = v / p;
        var steps = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10];
        for (var i = 0; i < steps.length; i++) if (n <= steps[i]) return steps[i] * p;
        return 10 * p;
    }

    function renderChart(d) {
        var host = $('chart');
        clear(host);
        var tip = TIP;
        tip.hidden = true;
        var legend = document.querySelector('.legend');
        if (legend) legend.style.display = d.range === 1 ? 'none' : '';
        var W = 1000, H = 320, L = 44, R = 12, T = 14, B = 34;
        var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Évolution des visiteurs et des pages vues' });

        var labels, vis, pv;
        if (d.range === 1) {
            $('chartTitle').textContent = 'Pages vues par heure';
            labels = []; vis = []; pv = [];
            var byHour = {};
            (d.hours || []).forEach(function (h) { byHour[h.hour] = h.pageviews; });
            for (var h = 0; h < 24; h++) { labels.push(h + ' h'); pv.push(byHour[h] || 0); vis.push(null); }
        } else {
            $('chartTitle').textContent = 'Visiteurs et pages vues';
            var days = dayList(d.from, d.to);
            var map = {};
            (d.series || []).forEach(function (r) { map[r.day] = r; });
            labels = days;
            vis = days.map(function (x) { return map[x] ? map[x].visitors : 0; });
            pv = days.map(function (x) { return map[x] ? map[x].pageviews : 0; });
        }
        var n = labels.length;
        var maxV = niceMax(Math.max.apply(null, pv.concat(vis.map(function (x) { return x || 0; })).concat([1])));
        var iw = W - L - R, ih = H - T - B;
        function X(i) { return L + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); }
        function Y(v) { return T + ih - (v / maxV) * ih; }

        // grille + axe Y
        for (var g = 0; g <= 4; g++) {
            var gy = T + (ih * g) / 4;
            s.appendChild(svg('line', { x1: L, x2: W - R, y1: gy, y2: gy, class: 'grid-line' }));
            var lab = svg('text', { x: L - 8, y: gy + 4, 'text-anchor': 'end', class: 'axis-label' });
            lab.textContent = num(maxV * (1 - g / 4));
            s.appendChild(lab);
        }
        // axe X
        var ticks = d.range === 1 ? [0, 3, 6, 9, 12, 15, 18, 21] : pickTicks(n, 7);
        ticks.forEach(function (i) {
            var t = svg('text', { x: X(i), y: H - 10, 'text-anchor': 'middle', class: 'axis-label' });
            t.textContent = d.range === 1 ? labels[i] : fmtDay(labels[i], d.range >= 90 ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
            s.appendChild(t);
        });

        var gradId = 'g' + Math.random().toString(36).slice(2, 7);
        var defs = svg('defs', {});
        var grad = svg('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
        grad.appendChild(svg('stop', { offset: '0%', 'stop-color': '#b8945a', 'stop-opacity': 0.42 }));
        grad.appendChild(svg('stop', { offset: '100%', 'stop-color': '#b8945a', 'stop-opacity': 0 }));
        defs.appendChild(grad);
        s.appendChild(defs);

        var cursorLine = svg('line', { y1: T, y2: T + ih, class: 'cursor-line', opacity: 0 });
        var dot = svg('circle', { r: 5, class: 'dot', opacity: 0 });

        if (d.range === 1) {
            var bw = (iw / n) * 0.62;
            pv.forEach(function (v, i) {
                var bx = L + (i + 0.5) * (iw / n) - bw / 2;
                var by = Y(v);
                var r = svg('rect', { x: bx, y: by, width: bw, height: Math.max(T + ih - by, 0), rx: 2, class: 'bar' });
                r.dataset.i = i;
                s.appendChild(r);
            });
        } else {
            var line = function (arr, cls) {
                var pts = arr.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v || 0).toFixed(1); }).join(' ');
                return svg('path', { d: pts, class: cls });
            };
            var areaD = vis.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v || 0).toFixed(1); }).join(' ')
                + ' L' + X(n - 1).toFixed(1) + ' ' + (T + ih) + ' L' + X(0).toFixed(1) + ' ' + (T + ih) + ' Z';
            s.appendChild(svg('path', { d: areaD, fill: 'url(#' + gradId + ')' }));
            var lp = line(pv, 'line-p');
            var lv = line(vis, 'line-v');
            s.appendChild(lp);
            s.appendChild(lv);
            requestAnimationFrame(function () {
                try { var len = lv.getTotalLength(); lv.style.setProperty('--len', len); lv.classList.add('draw'); } catch (e) { /* ignoré */ }
            });
        }
        s.appendChild(cursorLine);
        s.appendChild(dot);

        // survol : repère + infobulle
        var overlay = svg('rect', { x: L, y: T, width: iw, height: ih, fill: 'transparent' });
        s.appendChild(overlay);
        function move(ev) {
            var box = s.getBoundingClientRect();
            var px = ((ev.clientX - box.left) / box.width) * W;
            var i = d.range === 1
                ? Math.max(0, Math.min(n - 1, Math.floor(((px - L) / iw) * n)))
                : Math.max(0, Math.min(n - 1, Math.round(((px - L) / iw) * (n - 1))));
            var cx = d.range === 1 ? L + (i + 0.5) * (iw / n) : X(i);
            cursorLine.setAttribute('x1', cx); cursorLine.setAttribute('x2', cx); cursorLine.setAttribute('opacity', 1);
            if (d.range !== 1) { dot.setAttribute('cx', cx); dot.setAttribute('cy', Y(vis[i] || 0)); dot.setAttribute('opacity', 1); }
            tip.hidden = false;
            clear(tip);
            var title = d.range === 1 ? 'Entre ' + i + ' h et ' + (i + 1) + ' h' : fmtDay(labels[i], { weekday: 'long', day: 'numeric', month: 'long' });
            tip.appendChild(el('b', null, title));
            if (d.range !== 1) { tip.appendChild(document.createElement('br')); tip.appendChild(el('span', null, 'Visiteurs : ')); tip.appendChild(document.createTextNode(num(vis[i]))); }
            tip.appendChild(document.createElement('br'));
            tip.appendChild(el('span', null, 'Pages vues : '));
            tip.appendChild(document.createTextNode(num(pv[i])));
            var hostBox = host.getBoundingClientRect();
            tip.style.left = Math.max(70, Math.min(hostBox.width - 70, (cx / W) * hostBox.width)) + 'px';
            tip.style.top = (((d.range === 1 ? Y(pv[i]) : Y(Math.max(vis[i] || 0, pv[i]))) / H) * hostBox.height) + 'px';
        }
        function leave() {
            cursorLine.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); tip.hidden = true;
        }
        overlay.addEventListener('mousemove', move);
        overlay.addEventListener('mouseleave', leave);
        overlay.addEventListener('touchstart', function (e) { move(e.touches[0]); }, { passive: true });
        overlay.addEventListener('touchmove', function (e) { move(e.touches[0]); }, { passive: true });
        host.appendChild(s);
        host.appendChild(tip);
    }

    function pickTicks(n, count) {
        if (n <= count) return Array.from({ length: n }, function (_, i) { return i; });
        var out = [];
        for (var i = 0; i < count; i++) out.push(Math.round((i * (n - 1)) / (count - 1)));
        return out;
    }

    /* --- listes à barres --- */
    function renderBars(id, rows, map) {
        var ul = $(id);
        clear(ul);
        if (!rows || !rows.length) { ul.appendChild(el('li', 'empty', 'Pas encore de données.')); return; }
        var items = rows.map(map);
        var max = Math.max.apply(null, items.map(function (x) { return x.value; }).concat([1]));
        items.forEach(function (it) {
            var li = el('li');
            li.style.setProperty('--w', '0%');
            var l = el('div', 'l');
            if (it.dot) { var dtn = el('i', 'dot-src'); dtn.style.background = it.dot; l.appendChild(dtn); }
            if (it.prefix) l.appendChild(el('span', null, it.prefix));
            l.appendChild(el('span', 't', it.label));
            if (it.small) l.appendChild(el('small', null, it.small));
            var v = el('div', 'v', num(it.value));
            if (it.extra) v.appendChild(el('small', null, it.extra));
            li.appendChild(l); li.appendChild(v);
            ul.appendChild(li);
            requestAnimationFrame(function () { requestAnimationFrame(function () { li.style.setProperty('--w', Math.max(4, (it.value / max) * 100) + '%'); }); });
        });
    }

    function renderPages(d) {
        renderBars('pages', d.pages, function (r) {
            return { label: pageName(r.path), small: PAGE_NAMES[r.path] ? '' : '', value: r.views, extra: shortDuration(r.avg_ms) };
        });
    }

    function propsOf(d, name) {
        return (d.props || []).filter(function (p) { return p.name === name; });
    }

    function renderCollections(d) {
        var rows = propsOf(d, 'gallery_filter');
        renderBars('collections', rows, function (r) { return { label: COLLECTIONS[r.prop] || cap(r.prop), value: r.total }; });
    }

    function renderActions(d) {
        var ul = $('actions');
        clear(ul);
        var ev = {};
        (d.events || []).forEach(function (e) { ev[e.name] = e; });
        function tot(n) { return ev[n] ? ev[n].total : 0; }
        function people(n) { return ev[n] ? ev[n].people : 0; }
        var igWhere = propsOf(d, 'click_instagram').slice(0, 3).map(function (p) { return p.prop + ' (' + p.total + ')'; }).join(' · ');
        var started = tot('contact_start'), sent = tot('contact_submit');
        var items = [
            { n: tot('click_instagram'), t: 'Clics Instagram', d: igWhere || (people('click_instagram') + ' personne(s)'), gold: true },
            { n: sent, t: 'Messages envoyés', d: started ? started + ' formulaire(s) commencé(s)' : 'Formulaire de contact', gold: true },
            { n: tot('reel_view'), t: 'Reel regardé', d: people('reel_view') + ' personne(s), 3 s minimum' },
            { n: tot('gallery_open'), t: 'Photos ouvertes', d: people('gallery_open') + ' personne(s)' },
            { n: tot('swing_done'), t: '« Le geste » vu', d: 'jusqu\'à la 4e image' },
            { n: tot('click_linkedin') + tot('click_email'), t: 'LinkedIn et e-mail', d: tot('click_linkedin') + ' LinkedIn · ' + tot('click_email') + ' e-mail' }
        ];
        items.forEach(function (it) {
            var li = el('li', it.gold ? 'is-gold' : '');
            li.appendChild(el('span', 'n', num(it.n)));
            li.appendChild(el('span', 't', it.t));
            li.appendChild(el('span', 'd', it.d));
            ul.appendChild(li);
        });
    }

    function renderPhotos(d) {
        var box = $('photos');
        clear(box);
        var rows = propsOf(d, 'gallery_open').filter(function (p) { return /^[a-z]+\/[\w-]+$/i.test(p.prop); }).slice(0, 12);
        if (!rows.length) { box.appendChild(el('p', 'empty', 'Aucune photo ouverte sur cette période.')); return; }
        rows.forEach(function (r) {
            var f = el('figure', 'photo');
            var img = document.createElement('img');
            img.src = 'images/web/' + r.prop + '_s.webp';
            img.alt = 'Photo ' + r.prop.split('/')[1];
            img.loading = 'lazy';
            img.decoding = 'async';
            f.appendChild(img);
            f.appendChild(el('b', null, '×' + num(r.total)));
            f.title = r.prop;
            box.appendChild(f);
        });
    }

    function renderHours(hours) {
        var host = $('hours');
        clear(host);
        var by = {};
        (hours || []).forEach(function (h) { by[h.hour] = h.pageviews; });
        var vals = Array.from({ length: 24 }, function (_, h) { return by[h] || 0; });
        var max = Math.max.apply(null, vals.concat([1]));
        var peak = vals.indexOf(Math.max.apply(null, vals));
        var W = 480, H = 150, B = 22, bw = W / 24;
        var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Pages vues par heure de la journée' });
        vals.forEach(function (v, i) {
            var h = (v / max) * (H - B - 8);
            var r = svg('rect', { x: i * bw + 2, y: H - B - h, width: bw - 4, height: Math.max(h, v ? 2 : 0), rx: 2, class: 'bar' + (i === peak && v ? ' is-hover' : '') });
            var t = svg('title', {}); t.textContent = i + ' h : ' + num(v) + ' page(s) vue(s)';
            r.appendChild(t);
            s.appendChild(r);
            if (i % 3 === 0) {
                var tx = svg('text', { x: i * bw + bw / 2, y: H - 6, 'text-anchor': 'middle', fill: '#4a4a4a', 'font-size': 10, 'font-family': 'Outfit, sans-serif' });
                tx.textContent = i + 'h';
                s.appendChild(tx);
            }
        });
        host.appendChild(s);
    }

    /* --- activité récente --- */
    function renderFeed(d) {
        var ul = $('feed');
        clear(ul);
        if (!d.recent || !d.recent.length) { ul.appendChild(el('li', 'empty', 'Rien pour le moment. Les prochaines visites apparaîtront ici.')); return; }
        d.recent.forEach(function (r) {
            var li = el('li');
            li.appendChild(el('span', 'when', ago(r.ts, d.now)));
            var what = el('div', 'what');
            var verb = describe(r);
            what.appendChild(document.createTextNode(verb.pre));
            if (verb.strong) what.appendChild(el('b', null, verb.strong));
            if (verb.post) what.appendChild(document.createTextNode(verb.post));
            var who = [];
            if (r.city) who.push(r.city);
            if (r.country) who.push(countryName(r.country));
            if (r.device) who.push(r.device);
            var w = el('span', 'who', (who.join(' · ') || 'Lieu inconnu') + (r.entry && r.ref ? ' · via ' + r.ref : ''));
            what.appendChild(w);
            li.appendChild(what);
            ul.appendChild(li);
        });
    }

    function describe(r) {
        if (r.type === 'pv') return { pre: 'A vu la page ', strong: pageName(r.path) };
        var p = r.prop || '';
        switch (r.name) {
            case 'click_instagram': return { pre: 'A cliqué sur ', strong: 'Instagram', post: p ? ' (' + p + ')' : '' };
            case 'click_linkedin': return { pre: 'A cliqué sur ', strong: 'LinkedIn' };
            case 'click_email': return { pre: 'A cliqué sur ', strong: 'ton e-mail' };
            case 'contact_start': return { pre: 'A commencé ', strong: 'le formulaire de contact' };
            case 'contact_submit': return { pre: 'A envoyé ', strong: 'un message' };
            case 'reel_view': return { pre: 'A regardé ', strong: 'le reel' };
            case 'gallery_filter': return { pre: 'A ouvert la collection ', strong: COLLECTIONS[p] || p };
            case 'gallery_open': return { pre: 'A ouvert la photo ', strong: p.split('/')[1] || p };
            case 'swing_done': return { pre: 'A vu ', strong: '« Le geste »', post: ' jusqu\'au bout' };
            default: return { pre: 'Action ', strong: r.name };
        }
    }

    /* --- constats --- */
    function renderInsights(d) {
        var ul = $('insights');
        clear(ul);
        function chip(a, strong, b) {
            var li = el('li');
            li.appendChild(document.createTextNode(a));
            li.appendChild(el('b', null, strong));
            if (b) li.appendChild(document.createTextNode(b));
            ul.appendChild(li);
        }
        var cur = d.totals.current || {};
        if (!cur.visitors) { chip('Aucune visite sur cette période. ', 'Partage ton site pour voir les chiffres arriver.'); return; }
        var totalSrc = (d.sources || []).reduce(function (a, b) { return a + b.visitors; }, 0);
        if (d.sources && d.sources[0] && totalSrc) {
            chip('Première source : ', d.sources[0].label, ' (' + Math.round((d.sources[0].visitors / totalSrc) * 100) + ' %)');
        }
        if (d.range > 1 && d.series && d.series.length) {
            var best = d.series.slice().sort(function (a, b) { return b.visitors - a.visitors; })[0];
            chip('Meilleur jour : ', fmtDay(best.day, { weekday: 'long', day: 'numeric', month: 'long' }), ' (' + num(best.visitors) + ')');
        }
        if (d.hours && d.hours.length) {
            var pk = d.hours.slice().sort(function (a, b) { return b.pageviews - a.pageviews; })[0];
            chip('Heure de pointe : ', pk.hour + ' h');
        }
        if (d.pages && d.pages[0]) chip('Page la plus vue : ', pageName(d.pages[0].path));
        var mobile = (d.devices || []).filter(function (x) { return x.label === 'mobile'; })[0];
        var totalDev = (d.devices || []).reduce(function (a, b) { return a + b.visitors; }, 0);
        if (mobile && totalDev) chip('Sur mobile : ', Math.round((mobile.visitors / totalDev) * 100) + ' %');
    }

    boot();
})();
