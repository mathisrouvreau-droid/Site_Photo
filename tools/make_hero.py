"""
MR VISUALS — boucle vidéo du hero de la page d'accueil (1920x1080, 30 fps, sans son).

Sept "scènes" en triptyque (trois panneaux verticaux qui dérivent à des vitesses
différentes) s'enchaînent en fondu. La boucle est parfaitement fermée : la dernière
scène se fond dans la première, et la toute première image est celle de ta photo
d'accueil (DSC_8825) — elle sert aussi d'affiche (poster) le temps du chargement.

Sur mobile, le navigateur recadre au centre (object-fit: cover) : le panneau central
de chaque scène est donc toujours le sujet principal.

Sorties :
    videos/hero.mp4                boucle du hero (bureau, 16:9)
    videos/hero-poster.jpg         première image (affiche)
    videos/hero-mobile.mp4         version verticale 720x1280 pour téléphone
    videos/hero-mobile-poster.jpg  affiche mobile

    python tools/make_hero.py            (rendu complet)
    python tools/make_hero.py --mobile   (version téléphone)
    python tools/make_hero.py --preview  (planche-contact seulement)
"""
import os
import sys

import cv2
import numpy as np

import video_lib as vl
from video_lib import Motion, ease_in_out, clamp01

FPS = 30
W, H = 1920, 1080
GAP = 6                      # filet noir entre les panneaux
FADE = 1.5                   # durée d'un changement de scène
STAGGER = 0.28               # décalage entre panneaux pendant le changement
SCENE = 5.2                  # durée d'une scène (fondus inclus)
OUT = os.path.join(vl.ROOT, "videos")


class Panel:
    def __init__(self, name, x, w, direction=1, gray=False, cx=0.5, zoom=(1.07, 1.14)):
        self.name, self.x, self.w = name, x, w
        self.direction = direction
        self.cx = cx
        self.zoom = zoom
        self.gray = gray
        self._img = None

    @property
    def img(self):
        if self._img is None:
            self._img = vl.load_for(self.name, self.w, H, k=1.25, gray=self.gray)
        return self._img

    def frame(self, u):
        # dérive verticale douce, en sens opposé d'un panneau à l'autre
        e = ease_in_out(u)
        z = self.zoom[0] + (self.zoom[1] - self.zoom[0]) * u
        cy = 0.5 + self.direction * (e - 0.5) * 0.55
        return vl.render_window(self.img, self.w, H, z, self.cx, cy)


class Scene:
    def __init__(self, panels):
        self.panels = panels

    def frame(self, u):
        canvas = np.full((H, W, 3), 8, dtype=np.uint8)
        for p in self.panels:
            canvas[:, p.x:p.x + p.w] = p.frame(u)
        return canvas

    def parts(self, u):
        """[(x, largeur, image)] : permet un fondu panneau par panneau."""
        return [(p.x, p.w, p.frame(u)) for p in self.panels]


def triptych(names, gray=(False, False, False), cxs=(0.5, 0.5, 0.5), dirs=(-1, 1, -1)):
    w = (W - 2 * GAP) // 3
    xs = [0, w + GAP, 2 * (w + GAP)]
    ws = [w, w, W - xs[2]]
    return Scene([Panel(n, x, wi, d, g, c) for n, x, wi, d, g, c in zip(names, xs, ws, dirs, gray, cxs)])


def duo(names, gray=(False, False), cxs=(0.5, 0.5), dirs=(1, -1)):
    w = (W - GAP) // 2
    xs = [0, w + GAP]
    ws = [w, W - xs[1]]
    return Scene([Panel(n, x, wi, d, g, c, zoom=(1.03, 1.10))
                  for n, x, wi, d, g, c in zip(names, xs, ws, dirs, gray, cxs)])


def single(name, gray=False):
    """Scène plein cadre (version verticale pour téléphone)."""
    return Scene([Panel(name, 0, W, 1, gray, 0.5, zoom=(1.06, 1.15))])


def build_scenes_mobile():
    return [single(n) for n in
            ["DSC_8825", "DSCF3270", "DSCF3314", "DSCF3062", "DSCF9558-2", "DSCF3381", "DSCF0893"]]


def build_scenes():
    return [
        # 0 — la photo d'accueil, entourée de cerisiers en fleurs
        triptych(["DSCF0178", "DSC_8825", "DSCF0170"], dirs=(1, -1, 1)),
        # 1 — golden hour : silhouette, swing, coup d'approche
        triptych(["DSCF3226", "DSCF3270", "DSCF3237"], dirs=(-1, 1, -1)),
        # 2 — portraits en lumière dorée
        triptych(["DSCF3084", "DSCF3314", "DSCF3080"], dirs=(1, -1, 1), cxs=(0.5, 0.5, 0.5)),
        # 3 — noir & blanc
        triptych(["DSCF3062", "DSCF3165", "DSCF0721"], gray=(True, True, True), dirs=(-1, 1, -1)),
        # 4 — danse
        triptych(["DSCF9558", "DSCF9558-2", "DSCF9553"], gray=(False, False, False), cxs=(0.5, 0.5, 0.5),
                 dirs=(1, -1, 1)),
        # 5 — la décomposition du swing
        triptych(["DSCF3371", "DSCF3381", "DSCF3386"], dirs=(-1, 1, -1)),
        # 6 — automobile
        duo(["DSCF0909", "DSCF0893"]),
    ]


class Hero:
    def __init__(self, mobile=False):
        self.scenes = build_scenes_mobile() if mobile else build_scenes()
        n = len(self.scenes)
        self.step = SCENE - FADE
        self.loop = n * self.step
        self.vig = vl.vignette_mask(W, H, strength=0.30, power=2.0)

    def scene_u(self, i, tau):
        """Avancement (0..1) de la scène i à l'instant cyclique tau, ou None si elle n'est pas visible."""
        start = i * self.step
        for shift in (0.0, self.loop):
            local = tau + shift - start
            if 0 <= local <= SCENE:
                return local / SCENE, local
        return None

    def frame(self, t):
        # Décalage : l'image 0 est la scène 0 pleinement visible (poster = photo d'accueil)
        tau = (t + FADE) % self.loop
        # scène de fond = la plus ancienne visible ; la plus récente se fond par-dessus
        vis = []
        for i in range(len(self.scenes)):
            r = self.scene_u(i, tau)
            if r is not None:
                vis.append((i, r[0], r[1]))
        # tri par ordre d'apparition cyclique (celle qui a le plus avancé en premier)
        vis.sort(key=lambda v: -v[2])
        base = self.scenes[vis[0][0]].frame(vis[0][1])
        for i, u, local in vis[1:]:
            # la nouvelle scène apparaît panneau par panneau (gauche -> droite), décalée de STAGGER
            for k, (x, w, img) in enumerate(self.scenes[i].parts(u)):
                a = ease_in_out((local - k * STAGGER) / (FADE - 2 * STAGGER))
                if a > 0:
                    base[:, x:x + w] = vl.crossfade(np.ascontiguousarray(base[:, x:x + w]), img, a)
        return vl.to_u8(base.astype(np.float32) * self.vig)


def main(preview=False, mobile=False):
    global W, H
    if mobile:
        W, H = 720, 1280
    hero = Hero(mobile)
    n = int(round(hero.loop * FPS))
    print(f"boucle : {hero.loop:.1f} s ({n} images)")
    if preview:
        pts = np.linspace(0, hero.loop - 0.05, 24)
        frames = [hero.frame(float(t)) for t in pts]
        vl.contact_sheet(frames, os.path.join(vl.ROOT, "tools", "_preview_hero.jpg"),
                         cols=8 if mobile else 4, scale=0.3 if mobile else 0.24)
        print("planche écrite : tools/_preview_hero.jpg")
        return

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "hero-mobile.mp4" if mobile else "hero.mp4")
    w = vl.Writer(path, W, H, FPS, crf=29 if mobile else 30, preset="slow", maxrate="3M")
    for k in range(n):
        w.write(hero.frame(k / FPS))
        if k % 90 == 0:
            print(f"  {k}/{n}", flush=True)
    w.close()
    vl.save_frame(hero.frame(0.0), os.path.join(OUT, "hero-mobile-poster.jpg" if mobile else "hero-poster.jpg"), 80)
    print("ok :", path, f"{os.path.getsize(path) / 1e6:.1f} Mo")


if __name__ == "__main__":
    main(preview="--preview" in sys.argv, mobile="--mobile" in sys.argv)
