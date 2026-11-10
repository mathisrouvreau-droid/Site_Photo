/* ============================================
   MR VISUALS — administration : onglet « Photos »
   Ajouter, retirer et décrire les photos de la galerie, depuis le navigateur.

   Comment ça marche
   - les photos sont réduites ici, dans le navigateur (WebP : grande version 2000 px + vignette), comme le fait
     tools/optimize_images.py sur l'ordinateur ;
   - elles sont envoyées dans le dépôt GitHub (une seule « sauvegarde » avec la liste mise à jour,
     images/web/manifest.json) grâce à une clé d'accès personnelle, gardée uniquement dans ce navigateur ;
   - GitHub reconstruit alors la galerie, les pages de collection et le plan du site
     (.github/workflows/reconstruire-galerie.yml) et publie le site : 1 à 3 minutes.

   Tout texte venant du réseau est inséré via textContent (jamais innerHTML).
   ============================================ */
(function () {
    'use strict';

    var OWNER = 'mathisrouvreau-droid';
    var REPO = 'Site_Photo';
    var BRANCH = 'main';
    var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
    var TOKEN_KEY = 'mrv_gh_token';

    var CATS = [
        { key: 'golf', label: 'Golf' },
        { key: 'portrait', label: 'Portrait' },
        { key: 'danse', label: 'Danse' },
        { key: 'voiture', label: 'Automobile' },
        { key: 'nature', label: 'Nature' }
    ];
    var CAT_LABEL = {};
    CATS.forEach(function (c) { CAT_LABEL[c.key] = c.label; });

    var LARGE = 2000, SMALL_W = 900, SMALL_H = 1350;   // mêmes tailles que tools/optimize_images.py
    var Q_LARGE = 0.82, Q_SMALL = 0.78;
    var MAX_FILES = 30, MAX_BYTES = 80 * 1024 * 1024;
    var HAND_PAGES = ['index.html', 'about.html', 'contact.html'];   // pages écrites à la main qui montrent des photos précises

    var $ = function (id) { return document.getElementById(id); };
    var state = {
        token: '', manifest: null, filter: 'all', drafts: [], selected: {}, busy: false,
        inited: false, newKeys: {}, previews: {}, watchTimer: null
    };

    /* ---------------------------------------------------------- petits outils */
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function keyOf(p) { return p.cat + '/' + p.stem; }
    function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

    function banner(kind, text, link) {
        var err = $('phBanner'), ok = $('phOk');
        err.hidden = ok.hidden = true;
        if (!text) return;
        var box = kind === 'ok' ? ok : err;
        clear(box);
        box.appendChild(document.createTextNode(text));
        if (link) {
            box.appendChild(document.createTextNode(' '));
            var a = el('a', null, link.label);
            a.href = link.href; a.target = '_blank'; a.rel = 'noopener';
            box.appendChild(a);
        }
        box.hidden = false;
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function fmtDate(iso) {
        var d = new Date(iso);
        if (isNaN(d)) return '';
        return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    /* ---------------------------------------------------------- fenêtre de confirmation */
    function ask(title, lines, okLabel, danger, cancelLabel) {
        return new Promise(function (resolve) {
            if (typeof HTMLDialogElement === 'undefined') {
                resolve(window.confirm(title + '\n\n' + lines.join('\n')));
                return;
            }
            var d = el('dialog', 'ph-dialog');
            d.appendChild(el('h3', null, title));
            lines.forEach(function (l) { d.appendChild(el('p', null, l)); });
            var bar = el('div', 'ph-bar');
            var no = el('button', 'btn btn--ghost'); no.type = 'button'; no.appendChild(el('span', null, cancelLabel || 'Annuler'));
            bar.appendChild(no);
            var yes = null;
            if (okLabel) {
                yes = el('button', 'btn ' + (danger ? 'btn--danger' : 'btn--solid')); yes.type = 'button';
                yes.appendChild(el('span', null, okLabel));
                bar.appendChild(yes);
            }
            d.appendChild(bar);
            var done = false;
            function finish(v) { if (done) return; done = true; try { d.close(); } catch (e) { /* ignoré */ } resolve(v); }
            no.addEventListener('click', function () { finish(false); });
            if (yes) yes.addEventListener('click', function () { finish(true); });
            d.addEventListener('cancel', function () { finish(false); });
            d.addEventListener('close', function () { if (d.parentNode) d.parentNode.removeChild(d); finish(false); });
            document.body.appendChild(d);
            d.showModal();
        });
    }

    /* ---------------------------------------------------------- GitHub */
    function headers(accept) {
        return { Authorization: 'Bearer ' + state.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    }
    function ghError(r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
            var e = new Error((j && j.message) || ('HTTP ' + r.status));
            e.code = r.status;
            e.rate = r.headers.get('x-ratelimit-remaining') === '0';
            return e;
        });
    }
    function gh(path, body, method) {
        var opt = { method: method || (body ? 'POST' : 'GET'), headers: headers(), cache: 'no-store' };
        if (body) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
        return fetch(API + path, opt).then(function (r) {
            if (r.ok) return r.json();
            return ghError(r).then(function (e) { throw e; });
        });
    }
    function getRaw(path, ref) {
        var url = API + '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(ref);
        return fetch(url, { headers: headers('application/vnd.github.raw+json'), cache: 'no-store' }).then(function (r) {
            if (r.status === 404) return null;
            if (!r.ok) return ghError(r).then(function (e) { throw e; });
            return r.text();
        });
    }

    function explain(e) {
        if (!e) return 'Une erreur est survenue.';
        if (e.code === 401) return 'La clé GitHub n\'est plus valable (expirée ou supprimée). Reconnecte GitHub.';
        if (e.rate) return 'GitHub limite temporairement les requêtes. Réessaie dans quelques minutes.';
        if (e.code === 403 || e.code === 404) return 'La clé GitHub n\'a pas les droits nécessaires. Refais-en une avec le dépôt « Site_Photo » et la permission « Contents : Read and write ».';
        if (e.code === 409 || e.code === 422) return 'Le site vient d\'être modifié en même temps. Réessaie dans un instant.';
        if (e.name === 'TypeError') return 'Impossible de joindre GitHub. Vérifie ta connexion et réessaie.';
        return e.message || 'Une erreur est survenue.';
    }

    /**
     * Applique un changement au dépôt en une seule sauvegarde (commit).
     * mutate(ctx) reçoit le manifeste à jour et renvoie { manifest, upload:[{path,base64}], remove:[chemins], text:[{path,text}] }.
     * En cas de modification simultanée (le robot de reconstruction pousse aussi), on recommence sur la dernière version.
     */
    var blobCache = {};
    function applyChange(message, mutate) {
        function attempt(n) {
            var headSha, baseTree, manifest, ctx, change;
            return gh('/git/ref/heads/' + BRANCH).then(function (ref) {
                headSha = ref.object.sha;
                return gh('/git/commits/' + headSha);
            }).then(function (head) {
                baseTree = head.tree.sha;
                return getRaw('images/web/manifest.json', headSha);
            }).then(function (txt) {
                manifest = JSON.parse(txt || '[]');
                ctx = {
                    manifest: manifest,
                    getRaw: function (p) { return getRaw(p, headSha); },
                    paths: function () {
                        return gh('/git/trees/' + baseTree + '?recursive=1').then(function (t) {
                            var s = {};
                            (t.tree || []).forEach(function (x) { s[x.path] = true; });
                            return s;
                        });
                    }
                };
                return mutate(ctx);
            }).then(function (c) {
                change = c;
                var entries = [];
                return (change.upload || []).reduce(function (chain, up) {
                    return chain.then(function () {
                        var ck = up.path + ':' + up.base64.length;
                        if (blobCache[ck]) { entries.push({ path: up.path, mode: '100644', type: 'blob', sha: blobCache[ck] }); return; }
                        return gh('/git/blobs', { content: up.base64, encoding: 'base64' }).then(function (b) {
                            blobCache[ck] = b.sha;
                            entries.push({ path: up.path, mode: '100644', type: 'blob', sha: b.sha });
                        });
                    });
                }, Promise.resolve()).then(function () {
                    entries.push({ path: 'images/web/manifest.json', mode: '100644', type: 'blob', content: JSON.stringify(change.manifest, null, 1) });
                    (change.text || []).forEach(function (t) { entries.push({ path: t.path, mode: '100644', type: 'blob', content: t.text }); });
                    (change.remove || []).forEach(function (p) { entries.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
                    return gh('/git/trees', { base_tree: baseTree, tree: entries });
                });
            }).then(function (tree) {
                return gh('/git/commits', { message: message, tree: tree.sha, parents: [headSha] });
            }).then(function (commit) {
                return gh('/git/refs/heads/' + BRANCH, { sha: commit.sha, force: false }, 'PATCH').then(function () {
                    return { commit: commit, manifest: change.manifest, change: change };
                });
            }).catch(function (e) {
                if ((e.code === 422 || e.code === 409) && n < 3) return sleep(900).then(function () { return attempt(n + 1); });
                throw e;
            });
        }
        return attempt(0);
    }

    /* ---------------------------------------------------------- traitement des images (dans le navigateur) */
    function fit(w, h, mw, mh) {
        var s = Math.min(mw / w, mh / h, 1);
        return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
    }
    function toBlob(canvas, q) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (b) {
                if (!b || b.type !== 'image/webp') reject(new Error('Ce navigateur ne sait pas créer d\'images WebP. Utilise Chrome, Edge ou Firefox.'));
                else resolve(b);
            }, 'image/webp', q);
        });
    }
    function decode(file) {
        return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
    }
    function makeVariants(file) {
        return decode(file).then(function (bmp) {
            var bs = fit(bmp.width, bmp.height, LARGE, LARGE);
            var big = document.createElement('canvas');
            big.width = bs.w; big.height = bs.h;
            var c = big.getContext('2d');
            c.imageSmoothingQuality = 'high';
            c.drawImage(bmp, 0, 0, bs.w, bs.h);
            if (bmp.close) bmp.close();
            var ss = fit(bs.w, bs.h, SMALL_W, SMALL_H);
            var small = document.createElement('canvas');
            small.width = ss.w; small.height = ss.h;
            var c2 = small.getContext('2d');
            c2.imageSmoothingQuality = 'high';
            c2.drawImage(big, 0, 0, ss.w, ss.h);
            return Promise.all([toBlob(big, Q_LARGE), toBlob(small, Q_SMALL)]).then(function (b) {
                return { big: b[0], small: b[1], lw: bs.w, lh: bs.h, w: ss.w, h: ss.h };
            });
        });
    }
    function toBase64(blob) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onload = function () { resolve(String(r.result).split(',')[1]); };
            r.onerror = function () { reject(r.error); };
            r.readAsDataURL(blob);
        });
    }
    function slug(name) {
        var s = name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
        return s || 'photo';
    }

    /* ---------------------------------------------------------- affichage de la bibliothèque */
    function library() {
        return (state.manifest || []).filter(function (p) { return CAT_LABEL[p.cat]; }).sort(function (a, b) {
            var x = a.added || '', y = b.added || '';
            if (x !== y) return x < y ? 1 : -1;      // les plus récentes d'abord
            return a.stem < b.stem ? -1 : 1;
        });
    }
    function selectedKeys() { return Object.keys(state.selected).filter(function (k) { return state.selected[k]; }); }

    function thumb(p) {
        var img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        if (state.previews[keyOf(p)]) { img.src = state.previews[keyOf(p)]; return img; }   // photo qu'on vient d'envoyer : copie locale
        var rel = 'images/web/' + p.cat + '/' + p.stem + '_s.webp';
        img.src = rel;
        var tried = false;
        img.addEventListener('error', function () {
            if (tried) return;            // pas encore publiée par GitHub Pages : on prend la copie du dépôt
            tried = true;
            img.src = 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/' + BRANCH + '/' + rel;
        });
        return img;
    }

    function renderFilters(list) {
        var box = $('phFilters');
        clear(box);
        var counts = { all: list.length };
        list.forEach(function (p) { counts[p.cat] = (counts[p.cat] || 0) + 1; });
        [{ key: 'all', label: 'Tout' }].concat(CATS).forEach(function (c) {
            var b = el('button', state.filter === c.key ? 'is-active' : '', c.label);
            b.type = 'button';
            b.dataset.filter = c.key;
            b.appendChild(el('sup', null, String(counts[c.key] || 0)));
            box.appendChild(b);
        });
    }

    function renderGrid() {
        var all = library();
        renderFilters(all);
        var list = state.filter === 'all' ? all : all.filter(function (p) { return p.cat === state.filter; });
        var grid = $('phGrid');
        clear(grid);
        list.forEach(function (p) {
            var k = keyOf(p);
            var li = el('li', 'ph-card' + (state.selected[k] ? ' is-selected' : '') + (state.newKeys[k] ? ' is-new' : ''));
            li.dataset.key = k;
            var pick = el('button', 'ph-card__pick'); pick.type = 'button';
            pick.setAttribute('aria-pressed', state.selected[k] ? 'true' : 'false');
            pick.setAttribute('aria-label', 'Sélectionner la photo ' + p.stem);
            pick.appendChild(thumb(p));
            pick.appendChild(el('span', 'ph-card__check', '✓'));
            li.appendChild(pick);
            var body = el('div', 'ph-card__body');
            body.appendChild(el('span', 'ph-card__cat', CAT_LABEL[p.cat]));
            var alt = p.alt || '';
            body.appendChild(el('p', 'ph-card__alt' + (alt ? '' : ' is-empty'), alt || 'Sans description'));
            var edit = el('button', 'ph-card__edit', alt ? 'Modifier la description' : 'Ajouter une description');
            edit.type = 'button'; edit.dataset.action = 'edit';
            body.appendChild(edit);
            li.appendChild(body);
            grid.appendChild(li);
        });
        $('phEmpty').hidden = list.length > 0;
        $('phLibNote').textContent = plural(all.length, 'photo', 'photos') + ' sur le site';
        renderSelectBar();
    }

    function renderSelectBar() {
        var n = selectedKeys().length;
        $('phSelectBar').hidden = n === 0;
        $('phSelectCount').textContent = plural(n, 'photo sélectionnée', 'photos sélectionnées');
    }

    function editAlt(li) {
        var k = li.dataset.key;
        var p = (state.manifest || []).filter(function (x) { return keyOf(x) === k; })[0];
        if (!p) return;
        var body = li.querySelector('.ph-card__body');
        clear(body);
        body.appendChild(el('span', 'ph-card__cat', CAT_LABEL[p.cat]));
        var form = el('form', 'ph-card__form');
        var input = el('input', 'ph-input'); input.type = 'text'; input.maxLength = 220; input.value = p.alt || '';
        input.placeholder = 'Ce qu\'on voit sur la photo';
        input.setAttribute('aria-label', 'Description de la photo');
        var row = el('div');
        var save = el('button', null, 'Enregistrer'); save.type = 'submit';
        var cancel = el('button', null, 'Annuler'); cancel.type = 'button';
        row.appendChild(save); row.appendChild(cancel);
        form.appendChild(input); form.appendChild(row);
        body.appendChild(form);
        input.focus();
        cancel.addEventListener('click', renderGrid);
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var text = input.value.trim().replace(/\s+/g, ' ');
            if (text === (p.alt || '')) { renderGrid(); return; }
            save.disabled = true;
            banner();
            applyChange('Admin : description de la photo ' + k, function (ctx) {
                var cur = ctx.manifest.filter(function (x) { return keyOf(x) === k; })[0];
                if (!cur) throw new Error('Cette photo n\'est plus sur le site.');
                if (text) cur.alt = text; else delete cur.alt;
                return { manifest: ctx.manifest };
            }).then(function (res) {
                state.manifest = res.manifest;
                renderGrid();
                published('Description enregistrée.');
            }).catch(function (err) { save.disabled = false; failure(err); });
        });
    }

    /* ---------------------------------------------------------- suivi de la mise en ligne */
    function loadBuildInfo() {
        return fetch('images/web/build-info.json?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }
    function showBuilt(info, pending) {
        var box = $('phBuilt');
        if (pending) box.textContent = 'Mise à jour du site en cours…';
        else if (info && info.built) box.textContent = 'Site à jour · dernière reconstruction : ' + fmtDate(info.built);
        else box.textContent = '';
        $('phFoot').hidden = false;
    }
    function watchLive(sinceMs) {
        if (state.watchTimer) clearTimeout(state.watchTimer);
        showBuilt(null, true);
        var started = Date.now();
        (function tick() {
            loadBuildInfo().then(function (info) {
                if (info && info.built && Date.parse(info.built) >= sinceMs - 5000) {
                    showBuilt(info, false);
                    banner('ok', 'Le site est à jour : les changements sont visibles pour tout le monde.');
                    return;
                }
                if (Date.now() - started > 9 * 60 * 1000) {
                    $('phBuilt').textContent = 'La mise à jour prend plus de temps que d\'habitude. Elle se terminera toute seule.';
                    return;
                }
                state.watchTimer = setTimeout(tick, 15000);
            });
        })();
    }
    function published(text) {
        banner('ok', text + ' Le site se met à jour tout seul : compte 1 à 3 minutes.');
        watchLive(Date.now());
    }
    function failure(err) {
        if (err && err.code === 401) { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignoré */ } state.token = ''; showConnect(); }
        console.error('[admin-photos]', err);
        banner('err', explain(err));
        setBusy(false);
    }

    /* ---------------------------------------------------------- ajout de photos */
    function setBusy(b) {
        state.busy = b;
        $('phPublish').disabled = b;
        $('phDraftCancel').disabled = b;
        $('phDelete').disabled = b;
        $('phAddBtn').classList.toggle('is-busy', b);
        $('phFile').disabled = b;
    }
    function progress(text) {
        var box = $('phProgress');
        box.hidden = !text;
        $('phProgressText').textContent = text || '';
    }

    function draftCard(d) {
        var li = el('li', 'ph-draft-card');
        var img = el('img'); img.alt = ''; img.src = d.url;
        li.appendChild(img);
        var body = el('div', 'ph-draft-card__body');
        body.appendChild(el('span', 'ph-draft-card__name', d.file.name));
        var row = el('div', 'ph-draft-card__row');
        var sel = el('select', 'ph-select'); sel.setAttribute('aria-label', 'Collection');
        CATS.forEach(function (c) {
            var o = el('option', null, c.label); o.value = c.key;
            if (c.key === d.cat) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', function () { d.cat = sel.value; });
        row.appendChild(sel);
        body.appendChild(row);
        var alt = el('input', 'ph-input'); alt.type = 'text'; alt.maxLength = 220; alt.value = d.alt || '';
        alt.placeholder = 'Décris ce qu\'on voit : Golfeuse en plein swing, lumière dorée de fin de journée';
        alt.setAttribute('aria-label', 'Description de la photo');
        alt.addEventListener('input', function () { d.alt = alt.value; alt.classList.remove('is-invalid'); err.hidden = true; });
        d.altInput = alt;
        body.appendChild(alt);
        var err = el('span', 'ph-draft-card__err', 'Décris la photo en quelques mots (au moins 8 lettres).');
        err.hidden = true;
        d.errEl = err;
        body.appendChild(err);
        li.appendChild(body);
        var rm = el('button', 'ph-remove', '×'); rm.type = 'button';
        rm.setAttribute('aria-label', 'Ne pas ajouter cette photo');
        rm.addEventListener('click', function () {
            if (state.busy) return;
            URL.revokeObjectURL(d.url);
            state.drafts = state.drafts.filter(function (x) { return x !== d; });
            renderDrafts();
        });
        li.appendChild(rm);
        return li;
    }
    function renderDrafts() {
        var box = $('phDrafts');
        clear(box);
        state.drafts.forEach(function (d) { box.appendChild(draftCard(d)); });
        $('phDraft').hidden = state.drafts.length === 0;
        $('phDraftCount').textContent = plural(state.drafts.length, 'photo', 'photos');
        if (state.drafts.length) $('phPublish').firstChild.textContent = 'Publier ' + (state.drafts.length > 1 ? 'les ' + state.drafts.length + ' photos' : 'la photo') + ' sur le site';
    }

    function addFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        if (!files.length) return;
        var ok = [], skipped = [];
        files.forEach(function (f) {
            if (!/^image\/(jpeg|png|webp)$/.test(f.type)) skipped.push(f.name + ' (format non pris en charge : utilise JPEG, PNG ou WebP)');
            else if (f.size > MAX_BYTES) skipped.push(f.name + ' (fichier trop lourd)');
            else ok.push(f);
        });
        if (state.drafts.length + ok.length > MAX_FILES) {
            skipped.push('Maximum ' + MAX_FILES + ' photos à la fois : les suivantes sont ignorées.');
            ok = ok.slice(0, Math.max(0, MAX_FILES - state.drafts.length));
        }
        var cat = state.filter !== 'all' ? state.filter : 'golf';
        ok.forEach(function (f) {
            state.drafts.push({ file: f, url: URL.createObjectURL(f), cat: cat, alt: '' });
        });
        renderDrafts();
        banner(skipped.length ? 'err' : '', skipped.length ? 'Photos ignorées : ' + skipped.join(' · ') : '');
        if (state.drafts.length) $('phDraft').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function cancelDrafts() {
        state.drafts.forEach(function (d) { URL.revokeObjectURL(d.url); });
        state.drafts = [];
        renderDrafts();
        progress('');
    }

    function uniqueStem(base, cat, taken) {
        var s = base, i = 2;
        while (taken[cat + '/' + s]) { s = base + '-' + i; i++; }
        taken[cat + '/' + s] = true;
        return s;
    }

    function publish() {
        if (state.busy || !state.drafts.length) return;
        var bad = state.drafts.filter(function (d) { return (d.alt || '').trim().length < 8; });
        if (bad.length) {
            bad.forEach(function (d) { d.altInput.classList.add('is-invalid'); d.errEl.hidden = false; });
            bad[0].altInput.focus();
            banner('err', 'Décris chaque photo en quelques mots avant de publier : c\'est ce que lit Google Images.');
            return;
        }
        banner();
        setBusy(true);
        var drafts = state.drafts.slice();
        var n = drafts.length;
        var base = Date.now();
        var prepared = [];
        drafts.reduce(function (chain, d, i) {
            return chain.then(function () {
                progress('Préparation des photos : ' + (i + 1) + ' sur ' + n + '…');
                return makeVariants(d.file).then(function (v) {
                    return Promise.all([toBase64(v.big), toBase64(v.small)]).then(function (b) {
                        prepared.push({ d: d, v: v, big64: b[0], small64: b[1] });
                    });
                });
            });
        }, Promise.resolve()).then(function () {
            progress('Envoi vers GitHub…');
            var msg = 'Admin : ajout de ' + plural(n, 'photo', 'photos') + ' (' + prepared.map(function (x) { return CAT_LABEL[x.d.cat]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ')';
            return applyChange(msg, function (ctx) {
                var taken = {};
                ctx.manifest.forEach(function (p) { taken[keyOf(p)] = true; });
                return ctx.getRaw('images/web/removed.json').then(function (txt) {
                    var removed = [];
                    try { removed = JSON.parse(txt || '[]'); } catch (e) { removed = []; }
                    removed.forEach(function (k) { taken[k] = true; });     // un nom déjà retiré du site ne sert plus
                    var upload = [], added = [];
                    prepared.forEach(function (x, i) {
                        var stem = uniqueStem(slug(x.d.file.name), x.d.cat, taken);
                        var dir = 'images/web/' + x.d.cat + '/';
                        upload.push({ path: dir + stem + '.webp', base64: x.big64 });
                        upload.push({ path: dir + stem + '_s.webp', base64: x.small64 });
                        // la première photo choisie est la plus récente (affichée en premier)
                        var when = new Date(base + (n - 1 - i) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
                        var entry = {
                            cat: x.d.cat, stem: stem, w: x.v.w, h: x.v.h, lw: x.v.lw, lh: x.v.lh, series: '',
                            alt: x.d.alt.trim().replace(/\s+/g, ' '), added: when, src: 'admin'
                        };
                        ctx.manifest.push(entry);
                        added.push(entry);
                    });
                    return { manifest: ctx.manifest, upload: upload, added: added };
                });
            });
        }).then(function (res) {
            var before = {};
            (state.manifest || []).forEach(function (p) { before[keyOf(p)] = true; });
            state.manifest = res.manifest;
            state.newKeys = {};
            res.manifest.forEach(function (p) { if (!before[keyOf(p)]) state.newKeys[keyOf(p)] = true; });
            (res.change.added || []).forEach(function (entry, i) {
                if (prepared[i]) state.previews[keyOf(entry)] = URL.createObjectURL(prepared[i].v.small);
            });
            drafts.forEach(function (d) { URL.revokeObjectURL(d.url); });
            state.drafts = [];
            state.filter = 'all';
            renderDrafts();
            progress('');
            renderGrid();
            setBusy(false);
            published(plural(n, 'photo ajoutée.', 'photos ajoutées.'));
            $('phLibrary').scrollIntoView({ block: 'start', behavior: 'smooth' });
        }).catch(function (err) { progress(''); failure(err); });
    }

    /* ---------------------------------------------------------- retrait de photos */
    function usedOnHandPages(keys) {
        return Promise.all(HAND_PAGES.map(function (page) {
            return getRaw(page, BRANCH).then(function (txt) { return { page: page, text: txt || '' }; });
        })).then(function (pages) {
            var found = [];
            keys.forEach(function (k) {
                var parts = k.split('/');
                var a = 'images/web/' + parts[0] + '/' + parts[1] + '.', b = 'images/web/' + parts[0] + '/' + parts[1] + '_s.';
                pages.forEach(function (pg) {
                    if (pg.text.indexOf(a) !== -1 || pg.text.indexOf(b) !== -1) found.push({ key: k, page: pg.page });
                });
            });
            return found;
        });
    }

    function deleteSelected() {
        var keys = selectedKeys();
        if (!keys.length || state.busy) return;
        banner();
        setBusy(true);
        usedOnHandPages(keys).then(function (used) {
            if (used.length) {
                var names = {};
                used.forEach(function (u) { (names[u.key] = names[u.key] || []).push(u.page); });
                var lines = Object.keys(names).map(function (k) { return k.split('/')[1] + ' est utilisée dans ' + names[k].join(', ') + '.'; });
                lines.push('Ces pages sont écrites à la main : demande-moi de remplacer la photo d\'abord, ou désélectionne-la.');
                setBusy(false);
                return ask('Photo utilisée sur une page', lines, null, false, 'Compris').then(function () { return null; });
            }
            var lines2 = [
                plural(keys.length, 'photo va être retirée', 'photos vont être retirées') + ' du site (galerie et collection).',
                'Les fichiers sont supprimés du site. Une sauvegarde reste dans l\'historique GitHub, donc rien n\'est perdu pour de bon.'
            ];
            return ask('Retirer du site ?', lines2, 'Retirer', true).then(function (yes) {
                if (!yes) { setBusy(false); return null; }
                progress('Retrait en cours…');
                return applyChange('Admin : retrait de ' + plural(keys.length, 'photo', 'photos'), function (ctx) {
                    return Promise.all([ctx.paths(), ctx.getRaw('images/web/removed.json')]).then(function (r) {
                        var existing = r[0], removed = [];
                        try { removed = JSON.parse(r[1] || '[]'); } catch (e) { removed = []; }
                        var gone = {}, remove = [], keepOut = false;
                        keys.forEach(function (k) { gone[k] = true; });
                        var next = ctx.manifest.filter(function (p) {
                            var k = keyOf(p);
                            if (!gone[k]) return true;
                            ['.webp', '_s.webp'].forEach(function (suf) {
                                var path = 'images/web/' + p.cat + '/' + p.stem + suf;
                                if (existing[path]) remove.push(path);
                            });
                            // photo d'origine (avec original dans le dépôt) : on la note pour que le script de l'ordinateur ne la recrée pas
                            if (p.src !== 'admin' && removed.indexOf(k) === -1) { removed.push(k); keepOut = true; }
                            return false;
                        });
                        var out = { manifest: next, remove: remove };
                        if (keepOut) out.text = [{ path: 'images/web/removed.json', text: JSON.stringify(removed.sort(), null, 1) }];
                        return out;
                    });
                }).then(function (res) {
                    state.manifest = res.manifest;
                    keys.forEach(function (k) {
                        if (state.previews[k]) { URL.revokeObjectURL(state.previews[k]); delete state.previews[k]; }
                    });
                    state.selected = {};
                    progress('');
                    renderGrid();
                    setBusy(false);
                    published(plural(keys.length, 'photo retirée.', 'photos retirées.'));
                });
            });
        }).catch(function (err) { progress(''); failure(err); });
    }

    /* ---------------------------------------------------------- connexion GitHub */
    function showConnect() {
        $('phConnect').hidden = false;
        $('phLibrary').hidden = true;
        $('phActions').hidden = true;
        $('phFoot').hidden = true;
        $('phSub').textContent = 'Connecte GitHub une seule fois pour pouvoir publier depuis cette page.';
    }
    function showManager() {
        $('phConnect').hidden = true;
        $('phLibrary').hidden = false;
        $('phActions').hidden = false;
        $('phFoot').hidden = false;
        $('phSub').textContent = 'Ajoute ou retire des photos : le site se met à jour tout seul. Les plus récentes passent en tête de leur collection.';
    }

    function loadLibrary() {
        banner();
        return getRaw('images/web/manifest.json', BRANCH).then(function (txt) {
            state.manifest = JSON.parse(txt || '[]');
            showManager();
            renderGrid();
            return loadBuildInfo();
        }).then(function (info) { showBuilt(info, false); });
    }

    function connect(token) {
        state.token = token;
        return gh('').then(function (repo) {
            if (repo && repo.permissions && repo.permissions.push === false) {
                var e = new Error('perm'); e.code = 403; throw e;
            }
            try { localStorage.setItem(TOKEN_KEY, token); } catch (e2) { /* ignoré */ }
            return loadLibrary();
        });
    }

    function initPhotos() {
        if (state.inited) return;
        state.inited = true;
        var saved = '';
        try { saved = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* ignoré */ }
        if (!saved) { showConnect(); return; }
        $('phSub').textContent = 'Chargement des photos…';
        connect(saved).catch(function (err) {
            state.token = '';
            if (err.code === 401) { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignoré */ } }
            showConnect();
            banner('err', explain(err));
        });
    }

    /* ---------------------------------------------------------- événements */
    $('tabs').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-view]');
        if (!b) return;
        var photos = b.dataset.view === 'photos';
        Array.prototype.forEach.call($('tabs').children, function (x) {
            var on = x === b;
            x.classList.toggle('is-active', on);
            x.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        $('statsView').hidden = photos;
        $('photosView').hidden = !photos;
        document.body.classList.toggle('view-photos', photos);
        if (photos) initPhotos();
        window.scrollTo(0, 0);
    });

    $('phConnectForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var token = $('phToken').value.trim();
        if (!token) return;
        var btn = e.target.querySelector('button');
        btn.disabled = true;
        banner();
        connect(token).then(function () { $('phToken').value = ''; }).catch(function (err) {
            state.token = '';
            banner('err', err.code === 401 ? 'Cette clé n\'est pas acceptée par GitHub. Vérifie que tu as bien copié toute la clé.' : explain(err));
        }).then(function () { btn.disabled = false; });
    });

    $('phLogoutGh').addEventListener('click', function () {
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignoré */ }
        state.token = ''; state.manifest = null; state.inited = false;
        cancelDrafts();
        banner('ok', 'GitHub est déconnecté de cet appareil.');
        showConnect();
    });

    $('phFile').addEventListener('change', function (e) {
        addFiles(e.target.files);
        e.target.value = '';
    });
    $('phDraftCancel').addEventListener('click', cancelDrafts);
    $('phPublish').addEventListener('click', publish);

    $('phFilters').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-filter]');
        if (!b) return;
        state.filter = b.dataset.filter;
        renderGrid();
    });

    $('phGrid').addEventListener('click', function (e) {
        var li = e.target.closest('.ph-card');
        if (!li) return;
        if (e.target.closest('[data-action="edit"]')) { editAlt(li); return; }
        if (e.target.closest('.ph-card__pick')) {
            var k = li.dataset.key;
            state.selected[k] = !state.selected[k];
            li.classList.toggle('is-selected', !!state.selected[k]);
            li.querySelector('.ph-card__pick').setAttribute('aria-pressed', state.selected[k] ? 'true' : 'false');
            renderSelectBar();
        }
    });
    $('phSelectClear').addEventListener('click', function () { state.selected = {}; renderGrid(); });
    $('phDelete').addEventListener('click', deleteSelected);

    // utile pour les essais automatiques
    window.__mrvPhotos = { state: state, slug: slug, fit: fit };
})();
