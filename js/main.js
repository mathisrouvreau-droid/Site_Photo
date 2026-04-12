/* ============================================
   PHORO — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // --- Navigation scroll effect ---
    const nav = document.getElementById('nav');
    if (nav && !nav.classList.contains('nav--solid')) {
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            if (scrollY > 60) {
                nav.classList.add('nav--scrolled');
            } else {
                nav.classList.remove('nav--scrolled');
            }
            lastScroll = scrollY;
        }, { passive: true });
    }

    // --- Mobile burger menu ---
    const burger = document.getElementById('navBurger');
    const navLinks = document.getElementById('navLinks');
    if (burger && navLinks) {
        burger.addEventListener('click', () => {
            burger.classList.toggle('active');
            navLinks.classList.toggle('open');
            document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                burger.classList.remove('active');
                navLinks.classList.remove('open');
                document.body.style.overflow = '';
            });
        });
    }

    // --- Scroll reveal ---
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    if (revealElements.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.12,
            rootMargin: '0px 0px -40px 0px'
        });

        revealElements.forEach(el => observer.observe(el));
    }

    // --- Gallery filter ---
    const filterBtns = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery__item');
    const comingSoonItems = document.querySelectorAll('.gallery__coming-soon');

    if (filterBtns.length > 0 && galleryItems.length > 0) {
        // Handle hash-based category on load
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            const targetBtn = document.querySelector(`.filter-btn[data-filter="${hash}"]`);
            if (targetBtn) {
                filterBtns.forEach(b => b.classList.remove('active'));
                targetBtn.classList.add('active');
                filterGallery(hash);
            }
        }

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                filterGallery(filter);
            });
        });
    }

    function filterGallery(filter) {
        galleryItems.forEach(item => {
            if (filter === 'all' || item.dataset.category === filter) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });
        comingSoonItems.forEach(item => {
            if (filter === 'all' || item.dataset.category === filter) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });
    }

    // --- Lightbox ---
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxCounter = document.getElementById('lightboxCounter');
    let currentImages = [];
    let currentIndex = 0;

    if (lightbox && galleryItems.length > 0) {
        galleryItems.forEach(item => {
            item.addEventListener('click', () => {
                // Build array of currently visible images
                currentImages = Array.from(document.querySelectorAll('.gallery__item:not(.hidden) img'));
                const clickedImg = item.querySelector('img');
                currentIndex = currentImages.indexOf(clickedImg);

                openLightbox(currentImages[currentIndex].src);
            });
        });

        // Close
        lightbox.querySelector('.lightbox__close').addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target === lightbox.querySelector('.lightbox__content')) {
                closeLightbox();
            }
        });

        // Navigation
        lightbox.querySelector('.lightbox__prev').addEventListener('click', (e) => {
            e.stopPropagation();
            navigate(-1);
        });
        lightbox.querySelector('.lightbox__next').addEventListener('click', (e) => {
            e.stopPropagation();
            navigate(1);
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') navigate(-1);
            if (e.key === 'ArrowRight') navigate(1);
        });
    }

    function openLightbox(src) {
        // Load higher resolution version
        const highResSrc = src.replace(/\/\d+\/\d+$/, '/1200/800');
        lightboxImg.src = highResSrc;
        lightboxImg.style.opacity = '0';
        lightboxImg.style.transform = 'scale(0.95)';

        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        updateCounter();

        // Animate in
        requestAnimationFrame(() => {
            lightboxImg.style.opacity = '1';
            lightboxImg.style.transform = 'scale(1)';
        });
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function navigate(direction) {
        currentIndex += direction;
        if (currentIndex < 0) currentIndex = currentImages.length - 1;
        if (currentIndex >= currentImages.length) currentIndex = 0;

        lightboxImg.style.opacity = '0';
        lightboxImg.style.transform = direction > 0 ? 'translateX(20px)' : 'translateX(-20px)';

        setTimeout(() => {
            const src = currentImages[currentIndex].src;
            const highResSrc = src.replace(/\/\d+\/\d+$/, '/1200/800');
            lightboxImg.src = highResSrc;

            requestAnimationFrame(() => {
                lightboxImg.style.transform = 'translateX(0)';
                lightboxImg.style.opacity = '1';
            });

            updateCounter();
        }, 200);
    }

    function updateCounter() {
        if (lightboxCounter) {
            lightboxCounter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
        }
    }

    // --- Contact form ---
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData);

            // Show success state
            contactForm.innerHTML = `
                <div class="form__success">
                    <span class="form__success-icon">&check;</span>
                    <h3>Message envoy\u00e9</h3>
                    <p>Merci ${data.name}, je vous r\u00e9pondrai tr\u00e8s vite.</p>
                </div>
            `;
        });
    }

});
