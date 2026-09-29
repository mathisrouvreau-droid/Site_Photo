"""
MR VISUALS — Reel Instagram "Golden Hour" (1080x1920, 30 fps, ~20 s).

Montage calé sur 120 BPM (une coupe toutes les 0,5 s) : n'importe quel son tendance
de la bibliothèque Instagram tombera juste.

Structure :
    0.0 - 1.0   stop-motion du swing (4 photos alignées) -> accroche
    1.0 - 2.5   arrêt sur la fin du swing + titre "Golden Hour"
    2.5 - 9.5   rafale de photos, une par temps, avec un éclair "obturateur"
    9.5 - 16.5  trois plans lents (portrait, complicité, panoramique)
    16.5 - 20   carte finale : logo + @mpict_rv12

Sorties :
    instagram/reel-golden-hour.mp4          1080x1920 (à publier sur Instagram)
    instagram/reel-golden-hour-cover.jpg    image de couverture 1080x1920
    videos/reel.mp4 + reel-poster.jpg       version légère 720x1280 pour le site

    python tools/make_reel.py            (rendu complet)
    python tools/make_reel.py --preview  (planche-contact seulement, rapide)
"""
import os
import sys

import cv2
import numpy as np

import video_lib as vl
from video_lib import (GOLD, GOLD_LIGHT, WHITE, Motion, ease_in_out, ease_out, lerp, clamp01)

FPS = 30
W, H = 1080, 1920
DURATION = 20.0
BEAT = 0.5

OUT_IG = os.path.join(vl.ROOT, "instagram")
OUT_WEB = os.path.join(vl.ROOT, "videos")


# --------------------------------------------------------------------------- plans
class Shot:
    """Un plan photo : cadrage animé entre start et start+dur."""

    def __init__(self, name, start, dur, z=(1.0, 1.08), cx=(0.5, 0.5), cy=(0.5, 0.5),
                 gray=False, ease=ease_out, flash=True, dissolve=0.0, img=None):
        self.name, self.start, self.dur = name, start, dur
        self.motion = Motion(z, cx, cy, ease)
        self.gray, self.flash, self.dissolve = gray, flash, dissolve
        self._img = img

    @property
    def img(self):
        if self._img is None:
            self._img = vl.load_for(self.name, W, H, k=1.3, gray=self.gray)
        return self._img

    def frame(self, t):
        u = clamp01((t - self.start) / self.dur)
        z, cx, cy = self.motion.at(u)
        return vl.render_window(self.img, W, H, z, cx, cy)


def build_shots():
    shots = []

    # --- 1) stop-motion du swing : 4 photos alignées sur le décor fixe -----------------
    swing = ["DSCF3371", "DSCF3381", "DSCF3382", "DSCF3386"]
    aligned = vl.align_stack(swing, W, H, k=1.3)
    for i, arr in enumerate(aligned):
        shots.append(Shot(swing[i], i * 0.25, 0.25, z=(1.12 + i * 0.006, 1.125 + i * 0.006),
                          cx=(0.5, 0.5), cy=(0.55, 0.55), flash=False, img=arr))
    # arrêt sur la fin du swing (dernière image, poursuite du zoom)
    shots.append(Shot("DSCF3386", 1.0, 1.5, z=(1.143, 1.26), cx=(0.5, 0.5), cy=(0.55, 0.42),
                      ease=ease_in_out, flash=False, img=aligned[3]))

    # --- 2) rafale : une photo par temps (0,5 s) -----------------------------------------
    t = 2.5
    burst = [
        # nom,        zoom,        cx,          cy,          gris
        ("DSCF3226", (1.00, 1.08), (0.5, 0.5), (0.35, 0.55), False),
        ("DSCF3270", (1.06, 1.00), (0.5, 0.5), (0.50, 0.50), False),
        ("DSCF3307", (1.00, 1.07), (0.5, 0.5), (0.45, 0.55), False),
        ("DSCF3237", (1.08, 1.00), (0.5, 0.5), (0.50, 0.50), False),
        ("DSCF3516", (1.00, 1.08), (0.5, 0.5), (0.35, 0.40), False),
        # série portrait
        ("DSCF3058", (1.15, 1.21), (0.5, 0.5), (0.85, 0.80), False),
        ("DSCF3065", (1.07, 1.00), (0.5, 0.5), (0.50, 0.50), False),
        ("DSCF3084", (1.12, 1.18), (0.5, 0.5), (0.80, 0.75), False),
        ("DSCF3080", (1.20, 1.14), (0.5, 0.5), (0.85, 0.85), False),
        # noir & blanc puis couleur
        ("DSCF3062", (1.00, 1.07), (0.5, 0.5), (0.55, 0.55), False),
        ("DSCF3165", (1.07, 1.00), (0.5, 0.5), (0.50, 0.50), False),
        ("DSCF3472", (1.00, 1.10), (0.36, 0.36), (0.5, 0.5), False),
        ("DSCF3069", (1.06, 1.00), (0.5, 0.5), (0.55, 0.55), False),
        ("DSCF3604", (1.00, 1.07), (0.5, 0.5), (0.50, 0.50), False),
    ]
    for name, z, cx, cy, g in burst:
        shots.append(Shot(name, t, BEAT, z=z, cx=cx, cy=cy, gray=g))
        t += BEAT
    assert abs(t - 9.5) < 1e-6, t

    # --- 3) plans lents ------------------------------------------------------------------
    shots.append(Shot("DSCF3314", 9.5, 2.5, z=(1.00, 1.14), cy=(0.35, 0.30), ease=ease_in_out))
    shots.append(Shot("DSCF3603", 12.0, 2.0, z=(1.05, 1.15), cx=(0.30, 0.62), ease=ease_in_out,
                      flash=False, dissolve=0.3))
    shots.append(Shot("DSCF3491", 14.0, 2.5, z=(1.02, 1.12), cx=(0.30, 0.85), ease=ease_in_out,
                      flash=False, dissolve=0.3))
    return shots


# --------------------------------------------------------------------------- calques
def shadowed(text, kind, size, color, tracking=0.0, blur=10, strength=0.55):
    rgb, a = vl.text_sprite(text, kind, size, color, tracking, pad=int(size * 0.5))
    sh = cv2.GaussianBlur(a, (0, 0), blur) * strength
    sh_rgb = np.zeros_like(rgb)
    return (sh_rgb, sh), (rgb, a)


class Overlays:
    def __init__(self):
        self.vig = vl.vignette_mask(W, H, strength=0.38, power=2.0)
        # dégradé sombre en bas pour la lisibilité du titre
        y = np.linspace(0, 1, H, dtype=np.float32)
        self.bottom = (1 - 0.62 * np.clip((y - 0.42) / 0.5, 0, 1) ** 1.6)[:, None, None]
        self.title = shadowed("Golden Hour", "serif_italic", 156, WHITE, tracking=0.02, blur=14)
        self.sub = shadowed("SÉRIE GOLF  ·  MR VISUALS", "sans", 34, WHITE, tracking=0.40,
                            blur=7, strength=0.9)
        self.line = np.full((2, 260, 3), GOLD, dtype=np.float32), np.ones((2, 260), np.float32)
        # carte finale
        self.logo = vl.logo_sprite("white", 470)
        self.tag = shadowed("Capturer l'instant, sublimer l'émotion", "serif_italic", 50, WHITE,
                            tracking=0.01, blur=1, strength=0.0)
        self.handle = shadowed("@mpict_rv12", "sans", 44, GOLD, tracking=0.34, blur=1, strength=0.0)
        self.cats = shadowed("GOLF  ·  PORTRAIT  ·  DANSE  ·  AUTO", "sans_light", 27, (150, 146, 140),
                             tracking=0.34, blur=1, strength=0.0)

    def title_block(self, f, t):
        """Titre 'Golden Hour' : apparition 1.15 -> 1.75, maintien, sortie au cut."""
        a_in = ease_out((t - 1.15) / 0.7)
        a_out = 1 - ease_in_out((t - 2.32) / 0.18)
        a = a_in * a_out
        if a <= 0:
            return f
        g = 1 - (1 - self.bottom) * a
        f = f * g
        dy = (1 - ease_out((t - 1.15) / 0.9)) * 34
        cx = W / 2
        for layer in self.title:
            vl.paste_sprite(f, layer, cx, 1290, a, dy)
        for layer in self.sub:
            vl.paste_sprite(f, layer, cx, 1425, a * clamp01((t - 1.4) / 0.5), dy * 0.6)
        vl.paste_sprite(f, self.line, cx, 1375, a * clamp01((t - 1.3) / 0.5), dy * 0.8)
        return f

    def end_card(self, t, t0=16.5):
        f = np.zeros((H, W, 3), np.float32)
        f[...] = (8, 8, 8)
        # léger halo doré en fond
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - 900) / (H * 0.42)) ** 2)
        halo = np.clip(1 - d, 0, 1)[..., None] ** 2 * 0.10
        f += halo * np.array(GOLD, np.float32)
        u = t - t0
        vl.paste_sprite(f, self.logo, W / 2, 800, ease_out(u / 0.7), (1 - ease_out(u / 0.9)) * 30)
        vl.paste_sprite(f, self.line, W / 2, 985, ease_out((u - 0.35) / 0.6))
        for layer in self.tag:
            vl.paste_sprite(f, layer, W / 2, 1065, ease_out((u - 0.5) / 0.6) * 0.92,
                            (1 - ease_out((u - 0.5) / 0.9)) * 24)
        for layer in self.handle:
            vl.paste_sprite(f, layer, W / 2, 1180, ease_out((u - 0.85) / 0.6),
                            (1 - ease_out((u - 0.85) / 0.9)) * 24)
        for layer in self.cats:
            vl.paste_sprite(f, layer, W / 2, 1255, ease_out((u - 1.15) / 0.6) * 0.9)
        return f


# --------------------------------------------------------------------------- rendu
class Reel:
    def __init__(self):
        self.shots = build_shots()
        self.ov = Overlays()
        self.starts = [s.start for s in self.shots]
        self.end_start = 16.5

    def _shot_index(self, t):
        idx = 0
        for i, s in enumerate(self.shots):
            if s.start <= t + 1e-9:
                idx = i
        return idx

    def frame(self, t):
        if t >= self.end_start:
            # fondu enchaîné depuis le dernier plan vers la carte finale (0,6 s)
            card = self.ov.end_card(t, self.end_start)
            u = (t - self.end_start) / 0.6
            if u < 1:
                last = self.shots[-1].frame(t)
                base = last.astype(np.float32) * self.ov.vig
                return vl.to_u8(base * (1 - ease_in_out(u)) + card * ease_in_out(u))
            return vl.to_u8(card)

        i = self._shot_index(t)
        s = self.shots[i]
        img = s.frame(t)
        if s.dissolve and i > 0 and (t - s.start) < s.dissolve:
            prev = self.shots[i - 1].frame(t)
            img = vl.crossfade(prev, img, ease_in_out((t - s.start) / s.dissolve))
        f = img.astype(np.float32) * self.ov.vig
        f = self.ov.title_block(f, t)
        if s.flash:
            dt = (t - s.start) * FPS
            if 0 <= dt < 6:
                f = vl.flash(f, 0.30 * (1 - dt / 6) ** 2)
        # fondu d'ouverture très court (2 images) pour éviter une coupe sèche au bouclage
        return vl.to_u8(f)


def render(preview=False):
    reel = Reel()
    n = int(round(DURATION * FPS))

    if preview:
        pts = [0.05, 0.3, 0.55, 0.8, 1.4, 2.2, 2.6, 3.1, 3.6, 4.1, 4.6, 5.1, 5.6, 6.1, 6.6, 7.1, 7.6, 8.1,
               8.6, 9.1, 10.5, 12.5, 15.0, 16.8, 17.4, 18.0, 19.0, 19.9]
        frames = [reel.frame(t) for t in pts]
        vl.contact_sheet(frames, os.path.join(vl.ROOT, "tools", "_preview_reel.jpg"), cols=7, scale=0.2)
        print("planche écrite : tools/_preview_reel.jpg")
        return

    os.makedirs(OUT_IG, exist_ok=True)
    os.makedirs(OUT_WEB, exist_ok=True)
    master = os.path.join(OUT_IG, "reel-golden-hour.mp4")
    w = vl.Writer(master, W, H, FPS, crf=17, preset="slow", audio_silence=True, maxrate="16M")
    for k in range(n):
        w.write(reel.frame(k / FPS))
        if k % 60 == 0:
            print(f"  {k}/{n}", flush=True)
    w.close()

    vl.save_frame(reel.frame(2.2), os.path.join(OUT_IG, "reel-golden-hour-cover.jpg"), 92)

    # version légère pour le site
    web = os.path.join(OUT_WEB, "reel.mp4")
    os.system(f'ffmpeg -y -loglevel error -i "{master}" -vf "scale=720:1280:flags=lanczos" -an '
              f'-c:v libx264 -profile:v high -preset slow -crf 25 -pix_fmt yuv420p '
              f'-colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart "{web}"')
    vl.save_frame(cv2.resize(reel.frame(2.2), (720, 1280), interpolation=cv2.INTER_AREA),
                  os.path.join(OUT_WEB, "reel-poster.jpg"), 82)
    print("ok :", master, "|", web)


if __name__ == "__main__":
    render(preview="--preview" in sys.argv)
