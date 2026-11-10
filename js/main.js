/* ============================================
   MR VISUALS — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Mesure d'audience anonyme : js/analytics.js écoute cet événement (rien n'est envoyé sans lui)
    const fire = (name, prop) => document.dispatchEvent(new CustomEvent('mrv:event', { detail: { name, prop } }));
    const saveData = !!(navigator.connection && navigator.connection.saveData);

    // --- Navigation scroll effect ---
    const nav = document.getElementById('nav');
    if (nav && !nav.classList.contains('nav--solid')) {
        const onScroll = () => nav.classList.toggle('nav--scrolled', window.scrollY > 60);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // --- Scroll progress bar ---
    const progress = document.getElementById('progress');
    if (progress) {
        let ticking = false;
        const update = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            progress.style.setProperty('--p', max > 0 ? Math.min(window.scrollY / max, 1).toFixed(4) : 0);
            ticking = false;
        };
        window.addEventListener('scroll', () => {
            if (!ticking) { ticking = true; requestAnimationFrame(update); }
        }, { passive: true });
        update();
    }

    // --- Mobile burger menu ---
    const burger = document.getElementById('navBurger');
    const navLinks = document.getElementById('navLinks');
    if (burger && navLinks) {
        const setMenu = (open) => {
            burger.classList.toggle('active', open);
            navLinks.classList.toggle('open', open);
            burger.setAttribute('aria-expanded', String(open));
            document.body.style.overflow = open ? 'hidden' : '';
        };
        burger.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
        navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navLinks.classList.contains('open')) setMenu(false);
        });
    }

    // --- Scroll reveal ---
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    if (revealElements.length > 0) {
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
            revealElements.forEach(el => observer.observe(el));
        } else {
            revealElements.forEach(el => el.classList.add('visible'));
        }
    }

    // --- Looping videos (hero + reel) ---
    // Lecture automatique tant que la vidéo est visible ; bouton pause ; aucune lecture si
    // l'utilisateur a demandé moins d'animations ou le mode économie de données.
    function setupLoopVideo(video, toggleBtn, { lazy = false } = {}) {
        if (!video) return;
        let userPaused = false;
        const label = toggleBtn && toggleBtn.querySelector('.js-label');

        const reflect = () => {
            if (!toggleBtn) return;
            const paused = video.paused;
            toggleBtn.classList.toggle('is-paused', paused);
            toggleBtn.setAttribute('aria-pressed', String(paused));
            toggleBtn.setAttribute('aria-label', paused ? 'Lire la vidéo' : 'Mettre la vidéo en pause');
            if (label) label.textContent = paused ? 'Lecture' : 'Pause';
        };
        const play = () => {
            const p = video.play();
            if (p && p.catch) p.catch(() => { /* lecture auto refusée : l'affiche reste visible */ });
        };

        if (prefersReducedMotion || saveData) {
            userPaused = true;
            video.removeAttribute('autoplay');
            video.pause();
            if (!lazy) {
                // annule le téléchargement : l'affiche (première image) suffit
                video.querySelectorAll('source').forEach(s => s.remove());
                video.removeAttribute('src');
                video.load();
            }
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                if (video.paused) { userPaused = false; play(); } else { userPaused = true; video.pause(); }
            });
        }
        video.addEventListener('play', reflect);
        video.addEventListener('pause', reflect);

        if (lazy) {
            let viewTimer = null, counted = false;
            video.addEventListener('play', () => {
                if (!counted) viewTimer = setTimeout(() => { counted = true; fire('reel_view'); }, 3000);
            });
            video.addEventListener('pause', () => clearTimeout(viewTimer));
        }

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        if (!userPaused) play();
                    } else if (!video.paused) {
                        video.pause();
                    }
                });
            }, { threshold: lazy ? 0.4 : 0.05 });
            io.observe(video);
        } else if (!userPaused) {
            play();
        }
        reflect();
    }

    setupLoopVideo(document.getElementById('heroVideo'), document.getElementById('heroToggle'));
    setupLoopVideo(document.getElementById('reelVideo'), document.getElementById('reelToggle'), { lazy: true });

    // --- Gallery filter ---
    const filterBtns = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery__item');
    const comingSoonItems = document.querySelectorAll('.gallery__coming-soon');

    function filterGallery(filter) {
        let visibleIndex = 0;
        galleryItems.forEach(item => {
            item.classList.remove('gallery__item--appear');
            if (filter === 'all' || item.dataset.category === filter) {
                item.classList.remove('hidden');
                void item.offsetWidth; // relance l'animation d'apparition à chaque filtre
                item.style.setProperty('--appear-delay', `${Math.min(visibleIndex * 0.04, 0.5)}s`);
                item.classList.add('gallery__item--appear');
                visibleIndex++;
            } else {
                item.classList.add('hidden');
            }
        });
        comingSoonItems.forEach(item => {
            item.classList.toggle('hidden', !(filter !== 'all' && item.dataset.category === filter));
        });
    }

    function activateFilter(filter, { updateHash = true } = {}) {
        const btn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
        if (!btn) return false;
        filterBtns.forEach(b => b.classList.toggle('active', b === btn));
        filterGallery(filter);
        fire('gallery_filter', filter);
        if (updateHash) history.replaceState(null, '', filter === 'all' ? location.pathname : `#${filter}`);
        btn.scrollIntoView({ block: 'nearest', inline: 'center' });
        return true;
    }

    if (filterBtns.length > 0 && galleryItems.length > 0) {
        const hash = window.location.hash.replace('#', '');
        if (hash) activateFilter(hash, { updateHash: false });
        filterBtns.forEach(btn => btn.addEventListener('click', () => activateFilter(btn.dataset.filter)));
        window.addEventListener('hashchange', () => {
            activateFilter(window.location.hash.replace('#', '') || 'all', { updateHash: false });
        });
    }

    // --- Galerie : les photos entrent en cascade quand elles apparaissent à l'écran ---
    if (galleryItems.length > 0) {
        if ('IntersectionObserver' in window && !prefersReducedMotion) {
            const gio = new IntersectionObserver((entries) => {
                let k = 0;
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    el.style.transitionDelay = `${k++ * 70}ms`;
                    el.classList.add('in');
                    gio.unobserve(el);
                    setTimeout(() => { el.style.transitionDelay = ''; }, 1400);
                });
            }, { threshold: 0.05, rootMargin: '0px 0px -5% 0px' });
            galleryItems.forEach(item => gio.observe(item));
        } else {
            galleryItems.forEach(item => item.classList.add('in'));
        }
    }

    // --- Lightbox ---
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxCounter = document.getElementById('lightboxCounter');
    const lightboxCat = document.getElementById('lightboxCat');
    let currentItems = [];
    let currentIndex = 0;
    let lastFocus = null;
    let loadToken = 0;
    let flipFrom = null;          // rectangle de la miniature d'où part l'image à l'ouverture

    function show(index, direction = 0) {
        currentIndex = (index + currentItems.length) % currentItems.length;
        const item = currentItems[currentIndex];
        const src = item.dataset.full || item.href;
        const token = ++loadToken;

        lightbox.classList.remove('is-loaded');
        if (direction) lightboxImg.style.transform = `translateX(${direction * 24}px)`;

        const loader = new Image();
        loader.onload = loader.onerror = () => {
            if (token !== loadToken) return; // un autre affichage a pris le relais
            lightboxImg.src = src;
            lightboxImg.alt = item.querySelector('img').alt;
            if (flipFrom && !prefersReducedMotion && lightboxImg.animate) {
                // l'image « vole » depuis sa miniature jusqu'à sa place dans la visionneuse
                const from = flipFrom;
                flipFrom = null;
                lightbox.classList.add('is-loaded');
                lightboxImg.style.transition = 'none';
                lightboxImg.style.transform = 'none';
                lightboxImg.style.opacity = '1';
                const to = lightboxImg.getBoundingClientRect();
                const reset = () => {
                    lightboxImg.style.transition = '';
                    lightboxImg.style.transform = '';
                    lightboxImg.style.opacity = '';
                };
                if (to.width > 0) {
                    const dx = from.left - to.left, dy = from.top - to.top;
                    const sx = from.width / to.width, sy = from.height / to.height;
                    const anim = lightboxImg.animate([
                        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                        { transformOrigin: 'top left', transform: 'none' }
                    ], { duration: 780, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
                    anim.onfinish = anim.oncancel = reset;
                } else {
                    reset();
                }
                return;
            }
            requestAnimationFrame(() => {
                lightboxImg.style.transform = '';
                lightbox.classList.add('is-loaded');
            });
        };
        loader.src = src;

        const cat = item.querySelector('.gallery__item-cat');
        if (lightboxCat) lightboxCat.textContent = cat ? cat.textContent : '';
        if (lightboxCounter) lightboxCounter.textContent = `${currentIndex + 1} / ${currentItems.length}`;

        // précharge les voisines
        [currentIndex + 1, currentIndex - 1].forEach(i => {
            const n = currentItems[(i + currentItems.length) % currentItems.length];
            if (n) new Image().src = n.dataset.full || n.href;
        });
    }

    function openLightbox(item) {
        currentItems = Array.from(document.querySelectorAll('.gallery__item:not(.hidden)'));
        lastFocus = item;
        flipFrom = item.querySelector('img').getBoundingClientRect();
        const full = (item.dataset.full || '').match(/web\/([^/]+)\/([^/.]+)\.webp$/);
        fire('gallery_open', full ? `${full[1]}/${full[2]}` : item.dataset.category);
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        show(currentItems.indexOf(item));
        lightbox.querySelector('.lightbox__close').focus({ preventScroll: true });
    }

    function closeLightbox() {
        // retour en vol vers la miniature si elle est encore visible à l'écran
        const item = currentItems[currentIndex];
        const thumb = item && item.querySelector('img');
        const r = thumb && thumb.getBoundingClientRect();
        const visible = r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
        let flying = false;
        if (visible && !prefersReducedMotion && lightbox.classList.contains('is-loaded') && lightboxImg.animate) {
            const to = lightboxImg.getBoundingClientRect();
            if (to.width > 0) {
                const dx = r.left - to.left, dy = r.top - to.top;
                const sx = r.width / to.width, sy = r.height / to.height;
                lightboxImg.style.transition = 'none';
                const anim = lightboxImg.animate([
                    { transformOrigin: 'top left', transform: 'none' },
                    { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }
                ], { duration: 560, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
                flying = true;
                anim.onfinish = () => {
                    anim.cancel();
                    lightboxImg.style.transition = '';
                    lightbox.classList.remove('is-loaded');
                };
            }
        }
        lightbox.classList.remove('active');
        if (!flying) lightbox.classList.remove('is-loaded');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        loadToken++;
        if (lastFocus) lastFocus.focus({ preventScroll: true });
    }

    if (lightbox && galleryItems.length > 0) {
        galleryItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                openLightbox(item);
            });
        });

        lightbox.querySelector('.lightbox__close').addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target === lightbox.querySelector('.lightbox__content')) closeLightbox();
        });
        lightbox.querySelector('.lightbox__prev').addEventListener('click', (e) => { e.stopPropagation(); show(currentIndex - 1, -1); });
        lightbox.querySelector('.lightbox__next').addEventListener('click', (e) => { e.stopPropagation(); show(currentIndex + 1, 1); });

        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') show(currentIndex - 1, -1);
            if (e.key === 'ArrowRight') show(currentIndex + 1, 1);
        });

        // glisser pour changer de photo (mobile)
        let startX = 0, startY = 0;
        lightbox.addEventListener('touchstart', (e) => {
            startX = e.changedTouches[0].clientX;
            startY = e.changedTouches[0].clientY;
        }, { passive: true });
        lightbox.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - startX;
            const dy = e.changedTouches[0].clientY - startY;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) show(currentIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
            else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.6) closeLightbox();
        }, { passive: true });
    }

    // --- Contact form ---
    const contactForm = document.getElementById('contactForm');
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData);
            const submitBtn = contactForm.querySelector('.form__submit');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.querySelector('span').textContent = 'Envoi…';
            }

            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: formData,
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    fire('contact_submit', data.subject || '');
                    contactForm.innerHTML = `
                        <div class="form__success">
                            <span class="form__success-icon">&check;</span>
                            <h3>Message envoyé</h3>
                            <p>Merci ${escapeHtml(data.name || '')}, je vous répondrai très vite.</p>
                        </div>
                    `;
                } else {
                    throw new Error('Envoi échoué');
                }
            } catch (err) {
                contactForm.innerHTML = `
                    <div class="form__success">
                        <span class="form__success-icon" style="color:#c44;">!</span>
                        <h3>Une erreur est survenue</h3>
                        <p>Merci de réessayer ou d'écrire directement à mathis.rouvreau@gmail.com.</p>
                    </div>
                `;
            }
        });
    }

});
