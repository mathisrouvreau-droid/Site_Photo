/* ============================================
   MR VISUALS — Motion design
   Rideau de transition, texte animé, parallaxe, section « Le geste » pilotée
   par le défilement, curseur, boutons magnétiques.
   Aucune dépendance. Tout est neutralisé si l'utilisateur demande moins
   d'animations (classe html.no-motion) ou si une erreur survient.
   ============================================ */

(() => {
    const doc = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    if (reduce) doc.classList.add('no-motion');

    try {
        init();
    } catch (err) {
        console.error('[motion]', err);
        doc.classList.add('no-motion');
        doc.classList.add('is-loaded');
    }

    function init() {
        const curtain = $('#curtain');

        /* -------------------------------------------------------------
           1. Rideau de page : se lève à l'arrivée, retombe avant de quitter
           ------------------------------------------------------------- */
        const fontsReady = document.fonts && document.fonts.ready
            ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1400))])
            : Promise.resolve();
        const minShow = new Promise(r => setTimeout(r, reduce ? 0 : 350));
        Promise.all([fontsReady, minShow]).then(() => requestAnimationFrame(() => {
            doc.classList.add('is-loaded');
            startIntro();
        }));
        setTimeout(() => doc.classList.add('is-loaded'), 3500); // sécurité

        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                doc.classList.remove('is-leaving');
                if (curtain) curtain.style.cssText = '';
                doc.classList.add('is-loaded');
            }
        });

        if (curtain && !reduce) {
            document.addEventListener('click', (e) => {
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                const a = e.target.closest('a[href]');
                if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
                const url = new URL(a.href, location.href);
                if (url.origin !== location.origin) return;
                if (url.pathname === location.pathname) return;          // ancre / même page : pas de rideau
                if (!/\.html?$|\/$/.test(url.pathname)) return;
                e.preventDefault();
                curtain.style.transition = 'none';
                curtain.style.transform = 'translateY(101%)';
                void curtain.offsetHeight;
                curtain.style.transition = '';
                doc.classList.add('is-leaving');
                curtain.style.transform = 'translateY(0)';
                setTimeout(() => { location.href = url.href; }, 620);
            });
        }

        /* -------------------------------------------------------------
           2. Texte animé : lettres / mots qui montent sous un masque
           ------------------------------------------------------------- */
        function splitText(el, mode) {
            if (el.dataset.splitDone) return;
            el.dataset.splitDone = '1';
            const label = el.textContent.replace(/\s+/g, ' ').trim();
            let i = 0;
            const make = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };

            const walk = (node) => {
                Array.from(node.childNodes).forEach(child => {
                    if (child.nodeType === 3) {
                        const words = child.textContent.replace(/\s+/g, ' ').split(' ');
                        const frag = document.createDocumentFragment();
                        words.forEach((word, wi) => {
                            if (word === '') { if (wi > 0 || words.length === 1) frag.appendChild(document.createTextNode(' ')); return; }
                            if (mode === 'chars') {
                                const wrap = make('span', 'word');
                                for (const ch of word) {
                                    const c = make('span', 'ch');
                                    const inner = document.createElement('span');
                                    inner.textContent = ch;
                                    inner.style.setProperty('--i', i++);
                                    c.appendChild(inner);
                                    wrap.appendChild(c);
                                }
                                frag.appendChild(wrap);
                            } else {
                                const w = make('span', 'w');
                                const inner = make('span', 'wi');
                                inner.textContent = word;
                                inner.style.setProperty('--i', i++);
                                w.appendChild(inner);
                                frag.appendChild(w);
                            }
                            if (wi < words.length - 1) frag.appendChild(document.createTextNode(' '));
                        });
                        node.replaceChild(frag, child);
                    } else if (child.nodeType === 1 && child.tagName !== 'BR') {
                        walk(child);
                    }
                });
            };
            walk(el);
            // accessibilité : le texte complet pour les lecteurs d'écran, le découpage masqué
            const wrapper = document.createElement('span');
            wrapper.setAttribute('aria-hidden', 'true');
            while (el.firstChild) wrapper.appendChild(el.firstChild);
            const sr = make('span', 'sr-only');
            sr.textContent = label;
            el.appendChild(sr);
            el.appendChild(wrapper);
            el.classList.add(mode === 'chars' ? 'split-chars' : 'split-words');
        }

        const splitEls = $$('[data-split]');
        splitEls.forEach(el => splitText(el, el.dataset.split === 'chars' ? 'chars' : 'words'));

        const scrubEls = $$('[data-scrub]');
        scrubEls.forEach(el => { splitText(el, 'words'); el.classList.add('scrub'); });

        // Éléments déclenchés au défilement
        const revealTargets = $$('[data-split]:not([data-split-hero]), [data-reveal]');
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    if (el.matches('[data-split]')) el.classList.add('in');
                    if (el.matches('[data-reveal]')) el.classList.add('visible');
                    io.unobserve(el);
                });
            }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
            revealTargets.forEach(el => io.observe(el));
        } else {
            revealTargets.forEach(el => el.classList.add('in', 'visible'));
        }

        // Le titre du hero attend la levée du rideau
        function startIntro() {
            $$('[data-split-hero]').forEach(el => el.classList.add('in'));
        }

        /* -------------------------------------------------------------
           3. Compteurs
           ------------------------------------------------------------- */
        const counters = $$('[data-count]');
        if (counters.length && 'IntersectionObserver' in window) {
            const cio = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    cio.unobserve(entry.target);
                    const el = entry.target;
                    const end = parseFloat(el.dataset.count);
                    const dec = parseInt(el.dataset.decimals || '0', 10);
                    const suffix = el.dataset.suffix || '';
                    const prefix = el.dataset.prefix || '';
                    if (reduce) { el.textContent = prefix + end.toFixed(dec) + suffix; return; }
                    const t0 = performance.now();
                    const dur = 1700;
                    const step = (now) => {
                        const k = easeOut((now - t0) / dur);
                        el.textContent = prefix + (end * k).toFixed(dec) + suffix;
                        if (k < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                });
            }, { threshold: 0.6 });
            counters.forEach(el => cio.observe(el));
        }

        /* -------------------------------------------------------------
           4. Boucle de défilement : hero, parallaxe, texte qui s'allume, bandeau, swing
           ------------------------------------------------------------- */
        const hero = $('.hero');
        const heroVideo = $('#heroVideo');
        const parallaxEls = $$('[data-parallax]');
        const marquee = $('.marquee');
        const marqueeTrack = $('.marquee__track');
        const swing = $('#geste');

        let lastY = window.scrollY;
        let vel = 0;
        let marqueeX = 0;
        let marqueeDir = 1;
        let marqueeHalf = 0;

        if (marquee && marqueeTrack && !reduce) {
            marquee.classList.add('is-js');
            const measure = () => { marqueeHalf = marqueeTrack.scrollWidth / 2; };
            measure();
            window.addEventListener('resize', measure);
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
        }

        /* --- Hero : label de scène synchronisé sur la vidéo --- */
        const SCENES = ['Portrait', 'Golf · Golden Hour', 'Portrait · Golden Hour', 'Golf · Noir & blanc',
            'Danse', 'Golf · Le swing', 'Automobile'];
        const LOOP = 25.9, STEP = 3.7, FADE = 1.5;
        const sceneNum = $('#heroSceneNum');
        const sceneName = $('#heroSceneName');
        const sceneBox = $('#heroScene');
        let sceneIdx = -1;
        function updateScene() {
            if (!sceneBox || !heroVideo) return;
            const t = heroVideo.currentTime || 0;
            const tau = (t + FADE) % LOOP;
            const idx = Math.floor((((tau - 0.75) % LOOP) + LOOP) % LOOP / STEP) % SCENES.length;
            if (idx === sceneIdx) return;
            sceneIdx = idx;
            sceneNum.textContent = String(idx + 1).padStart(2, '0');
            sceneName.textContent = SCENES[idx];
            sceneBox.classList.remove('tick');
            void sceneBox.offsetWidth;
            sceneBox.classList.add('tick');
        }

        /* --- Texte qui s'allume au fil du défilement --- */
        const scrubData = scrubEls.map(el => ({ el, words: $$('.w', el) }));
        function updateScrub(vh) {
            scrubData.forEach(({ el, words }) => {
                const r = el.getBoundingClientRect();
                if (r.bottom < -100 || r.top > vh + 100) return;
                const p = clamp((vh * 0.86 - r.top) / (r.height + vh * 0.32));
                const n = words.length;
                words.forEach((w, i) => w.classList.toggle('on', i / n < p * 1.06));
            });
        }

        /* --- Parallaxe des images --- */
        function updateParallax(vh) {
            parallaxEls.forEach(el => {
                const host = el.parentElement.getBoundingClientRect();
                if (host.bottom < -200 || host.top > vh + 200) return;
                const speed = parseFloat(el.dataset.parallax) || 0.1;
                const c = host.top + host.height / 2 - vh / 2;
                el.style.setProperty('--py', (-c * speed).toFixed(1) + 'px');
            });
        }

        /* --- Section « Le geste » (swing décomposé au défilement) --- */
        let swingIdx = -1;
        const swingFrames = swing ? $$('.swing__img', swing) : [];
        const swingSteps = swing ? $$('.swing__steps li', swing) : [];
        const swingBar = swing ? $('.swing__bar i', swing) : null;
        const swingFile = swing ? $('#swingFile') : null;
        const swingCount = swing ? $('#swingCount') : null;
        const swingExif = swing ? $('#swingExif') : null;
        const swingAf = swing ? $('.swing__af', swing) : null;
        const swingView = swing ? $('.swing__viewport', swing) : null;
        const SWING = [
            { file: 'DSCF3371', exif: ['f/5.6', '1/1900', 'ISO 1600', '54mm'], af: [45, 21] },
            { file: 'DSCF3381', exif: ['f/5.6', '1/2000', 'ISO 1600', '54mm'], af: [41, 21] },
            { file: 'DSCF3382', exif: ['f/5.6', '1/2000', 'ISO 1600', '54mm'], af: [45, 23] },
            { file: 'DSCF3386', exif: ['f/5.6', '1/2000', 'ISO 1600', '54mm'], af: [34, 18] },
        ];
        function scrambleTo(el, finalText, ms = 320) {
            if (reduce) { el.textContent = finalText; return; }
            const t0 = performance.now();
            const step = (now) => {
                const k = clamp((now - t0) / ms);
                let out = '';
                for (let i = 0; i < finalText.length; i++) {
                    const ch = finalText[i];
                    out += (/\d/.test(ch) && k < (i + 1) / (finalText.length + 1)) ? String((Math.random() * 10) | 0) : ch;
                }
                el.textContent = out;
                if (k < 1) requestAnimationFrame(step); else el.textContent = finalText;
            };
            requestAnimationFrame(step);
        }
        let swingDone = false;
        function setSwing(idx, animate = true) {
            if (idx === swingIdx) return;
            swingIdx = idx;
            if (idx === 3 && !swingDone) {
                swingDone = true;
                document.dispatchEvent(new CustomEvent('mrv:event', { detail: { name: 'swing_done' } }));
            }
            swingFrames.forEach((f, i) => f.classList.toggle('is-active', i === idx));
            swingSteps.forEach((s, i) => { s.classList.toggle('is-active', i === idx); s.classList.toggle('is-done', i < idx); });
            const d = SWING[idx];
            if (swingFile) scrambleTo(swingFile, d.file);
            if (swingCount) swingCount.textContent = `0${idx + 1} / 04`;
            if (swingExif) {
                swingExif.innerHTML = d.exif.map((x, k) => `<span${k === 0 ? ' class="gold"' : ''}>${x}</span>`).join('');
            }
            if (swingAf) {
                swingAf.style.setProperty('--ax', d.af[0] + '%');
                swingAf.style.setProperty('--ay', d.af[1] + '%');
                swingAf.classList.remove('lock');
                void swingAf.offsetWidth;
                swingAf.classList.add('lock');
            }
            if (swingView && animate) {
                swingView.classList.remove('flash');
                void swingView.offsetWidth;
                swingView.classList.add('flash');
            }
        }
        function updateSwing(vh) {
            if (!swing) return;
            const r = swing.getBoundingClientRect();
            const total = r.height - vh;
            const p = clamp(-r.top / total);
            if (swingBar) swingBar.style.transform = `scaleY(${p.toFixed(4)})`;
            const idx = Math.min(SWING.length - 1, Math.floor(p * SWING.length * 0.999));
            setSwing(idx);
        }
        if (swing) setSwing(0, false);

        /* --- Boucle principale --- */
        let ticking = false;
        function frame() {
            const y = window.scrollY;
            const vh = window.innerHeight;
            vel = lerp(vel, y - lastY, 0.18);
            lastY = y;

            if (hero) {
                const hp = clamp(y / (hero.offsetHeight * 0.9));
                hero.style.setProperty('--hp', hp.toFixed(4));
            }
            if (!reduce) {
                updateParallax(vh);
                if (marquee && marqueeHalf) {
                    if (Math.abs(vel) > 0.4) marqueeDir = vel > 0 ? 1 : -1;
                    marqueeX -= (0.55 + Math.min(Math.abs(vel) * 0.55, 16)) * marqueeDir;
                    if (marqueeX <= -marqueeHalf) marqueeX += marqueeHalf;
                    if (marqueeX > 0) marqueeX -= marqueeHalf;
                    marqueeTrack.style.transform = `translate3d(${marqueeX.toFixed(2)}px,0,0)`;
                }
            }
            updateScrub(vh);
            updateSwing(vh);
            updateScene();
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);

        /* -------------------------------------------------------------
           5. Curseur, boutons magnétiques, inclinaison du téléphone
           ------------------------------------------------------------- */
        if (finePointer && !reduce) {
            const ring = document.createElement('div');
            ring.className = 'cursor';
            ring.setAttribute('aria-hidden', 'true');
            ring.innerHTML = '<span class="cursor__label"></span>';
            document.body.appendChild(ring);
            const label = $('.cursor__label', ring);
            let mx = -100, my = -100, cx = -100, cy = -100;
            window.addEventListener('mousemove', (e) => {
                mx = e.clientX; my = e.clientY;
                ring.classList.add('is-on');
            }, { passive: true });
            document.addEventListener('mouseleave', () => ring.classList.remove('is-on'));
            const loop = () => {
                cx = lerp(cx, mx, 0.2); cy = lerp(cy, my, 0.2);
                ring.style.transform = `translate3d(${cx}px,${cy}px,0)`;
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
            document.addEventListener('mouseover', (e) => {
                const t = e.target.closest('[data-cursor], a, button, .gallery__item');
                ring.classList.toggle('is-link', !!t);
                const text = t && t.dataset ? t.dataset.cursor : '';
                ring.classList.toggle('has-label', !!text);
                label.textContent = text || '';
            });

            // boutons magnétiques
            $$('.btn, .nav__ig, .phone__follow, .filter-btn').forEach(btn => {
                btn.addEventListener('mousemove', (e) => {
                    const r = btn.getBoundingClientRect();
                    const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
                    const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
                    btn.style.translate = `${(dx * 10).toFixed(1)}px ${(dy * 8).toFixed(1)}px`;
                });
                btn.addEventListener('mouseleave', () => { btn.style.translate = ''; });
            });

            // téléphone : inclinaison 3D douce
            const phone = $('.phone');
            if (phone) {
                const host = phone.closest('.film') || phone;
                host.addEventListener('mousemove', (e) => {
                    const r = phone.getBoundingClientRect();
                    const dx = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1);
                    const dy = clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1);
                    phone.style.setProperty('--rx', (-dy * 7).toFixed(2) + 'deg');
                    phone.style.setProperty('--ry', (dx * 9).toFixed(2) + 'deg');
                });
                host.addEventListener('mouseleave', () => {
                    phone.style.setProperty('--rx', '0deg');
                    phone.style.setProperty('--ry', '0deg');
                });
            }
        }
    }
})();
