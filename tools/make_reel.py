"""
MR VISUALS — Reel Instagram "Golden Hour" v2 · motion design (1080x1920, 30 fps, 20 s).

Habillage « viseur d'appareil photo » avec les VRAIS réglages de chaque photo (lus dans l'EXIF) :
    - cadre d'angles + collimateur d'autofocus qui cherche puis se verrouille (vert)
    - nom de fichier, compteur, ouverture / vitesse / ISO / focale qui « défilent » à chaque coupe
    - titre « Golden Hour » lettre par lettre (typo du site), légendes animées
    - transitions variées : éclair d'obturateur, volet à liseré doré, zoom-punch, diaphragme, poussée
    - mise au point qui se fait sur chaque photo (flou -> net), halos de lumière dorée
    - carte finale : logo révélé au volet, slogan, @mpict_rv12 tapé à la machine, bouton « Suivre »

Montage calé sur 120 BPM (une coupe toutes les 0,5 s).

Sorties :
    instagram/reel-golden-hour.mp4          1080x1920 (à publier sur Instagram)
    instagram/reel-golden-hour-cover.jpg    couverture
    videos/reel.mp4 + reel-poster.jpg       version légère 720x1280 pour le site

    python tools/make_reel.py            (rendu complet)
    python tools/make_reel.py --preview  (planche-contact seulement)
"""
import math
import os
import random
import sys

import cv2
import numpy as np

import motion as mo
import textlib as tx
import video_lib as vl
from video_lib import (GOLD, GOLD_LIGHT, WHITE, Motion, clamp01, ease_in_out, ease_out, lerp)

FPS = 30
W, H = 1080, 1920
DURATION = 20.0
BEAT = 0.5

OUT_IG = os.path.join(vl.ROOT, "instagram")
OUT_WEB = os.path.join(vl.ROOT, "videos")

SAFE = (54, 240, 1026, 1500)          # zone de confiance (l'interface d'Instagram couvre le reste)
END_START = 16.5

# Position du sujet (visage / tête) dans la photo d'origine, en fraction (x, y) : le collimateur s'y accroche.
SUBJECT = {
    "DSCF3371": (0.58, 0.24), "DSCF3381": (0.53, 0.23), "DSCF3382": (0.55, 0.25), "DSCF3386": (0.52, 0.18),
    "DSCF3226": (0.55, 0.48), "DSCF3270": (0.56, 0.25), "DSCF3307": (0.43, 0.25), "DSCF3237": (0.40, 0.32),
    "DSCF3516": (0.62, 0.36), "DSCF3058": (0.53, 0.30), "DSCF3065": (0.42, 0.38), "DSCF3084": (0.60, 0.38),
    "DSCF3080": (0.40, 0.31), "DSCF3062": (0.42, 0.27), "DSCF3165": (0.48, 0.27), "DSCF3472": (0.39, 0.33),
    "DSCF3069": (0.43, 0.24), "DSCF3604": (0.55, 0.20), "DSCF3314": (0.35, 0.36), "DSCF3603": (0.49, 0.47),
    "DSCF3491": (0.72, 0.30),
}


# --------------------------------------------------------------------------- plans
class Trans:
    """Transition d'entrée d'un plan : kind + durée (s)."""

    def __init__(self, kind="cut", dur=0.0, **kw):
        self.kind, self.dur, self.kw = kind, dur, kw


class Shot:
    def __init__(self, name, start, dur, z=(1.0, 1.08), cx=(0.5, 0.5), cy=(0.5, 0.5), gray=False,
                 ease=ease_out, trans=None, img=None, hold=False, focus_in=0.22, label=True):
        self.name, self.start, self.dur = name, start, dur
        self.motion = Motion(z, cx, cy, ease)
        self.gray = gray
        self.trans = trans or Trans("cut")
        self._img = img
        self.hold = hold                  # prolongation du plan précédent (même photo) : pas de nouveau réglage
        self.focus_in = focus_in
        self.label = label
        self.idx = 0                      # numéro d'ordre affiché (rempli plus bas)

    @property
    def img(self):
        if self._img is None:
            self._img = vl.load_for(self.name, W, H, k=1.3, gray=self.gray)
        return self._img

    def geom(self, t):
        u = clamp01((t - self.start) / self.dur)
        z, cx, cy = self.motion.at(u)
        h, w = self.img.shape[:2]
        if w / h > W / H:
            ch0, cw0 = h, h * W / H
        else:
            cw0, ch0 = w, w * H / W
        cw = cw0 / z
        x0 = (w - cw) * cx
        y0 = (h - cw0 / z * H / W) * cy
        return z, cx, cy, x0, y0, W / cw

    def render(self, t, focus=True):
        u = clamp01((t - self.start) / self.dur)
        z, cx, cy = self.motion.at(u)
        f = vl.render_window(self.img, W, H, z, cx, cy)
        if focus and self.focus_in > 0:
            k = (t - self.start) / self.focus_in
            if 0 <= k < 1:
                f = mo.focus_pull(f, 13 * (1 - ease_out(k, 3)))
        return f

    def subject_xy(self, t):
        nx, ny = SUBJECT.get(self.name, (0.5, 0.4))
        _, _, _, x0, y0, s = self.geom(t)
        h, w = self.img.shape[:2]
        x = (nx * w - x0) * s
        y = (ny * h - y0) * s
        return float(np.clip(x, 150, W - 150)), float(np.clip(y, 330, 1380))


def build_shots():
    shots = []

    # 1) stop-motion du swing : 4 photos alignées sur le décor fixe (aucune transition : c'est de l'animation)
    swing = ["DSCF3371", "DSCF3381", "DSCF3382", "DSCF3386"]
    aligned = vl.align_stack(swing, W, H, k=1.3)
    for i, arr in enumerate(aligned):
        shots.append(Shot(swing[i], i * 0.25, 0.25, z=(1.12 + i * 0.006, 1.125 + i * 0.006),
                          cy=(0.55, 0.55), img=arr, focus_in=0.0))
    shots.append(Shot("DSCF3386", 1.0, 1.5, z=(1.143, 1.26), cy=(0.55, 0.42), ease=ease_in_out,
                      img=aligned[3], hold=True, focus_in=0.0))

    # 2) rafale sur le temps (0,5 s) avec des transitions qui changent de langage
    burst = [
        # nom         zoom          cx          cy           gris   transition
        ("DSCF3226", (1.00, 1.08), (0.5, 0.5), (0.35, 0.55), False, Trans("zoom", 0.30)),
        ("DSCF3270", (1.06, 1.00), (0.5, 0.5), (0.50, 0.50), False, Trans("flash", 0.20)),
        ("DSCF3307", (1.00, 1.07), (0.5, 0.5), (0.45, 0.55), False, Trans("wipe", 0.24, axis="x")),
        ("DSCF3237", (1.08, 1.00), (0.5, 0.5), (0.50, 0.50), False, Trans("flash", 0.20)),
        ("DSCF3516", (1.00, 1.08), (0.5, 0.5), (0.35, 0.40), False, Trans("wipe", 0.24, axis="x", reverse=True)),
        ("DSCF3058", (1.15, 1.21), (0.5, 0.5), (0.85, 0.80), False, Trans("iris", 0.32)),
        ("DSCF3065", (1.07, 1.00), (0.5, 0.5), (0.50, 0.50), False, Trans("flash", 0.20)),
        ("DSCF3084", (1.12, 1.18), (0.5, 0.5), (0.80, 0.75), False, Trans("wipe", 0.24, axis="y")),
        ("DSCF3080", (1.20, 1.14), (0.5, 0.5), (0.85, 0.85), False, Trans("flash", 0.20)),
        ("DSCF3062", (1.00, 1.07), (0.5, 0.5), (0.55, 0.55), False, Trans("zoom", 0.28)),
        ("DSCF3165", (1.07, 1.00), (0.5, 0.5), (0.50, 0.50), False, Trans("wipe", 0.24, axis="x")),
        ("DSCF3472", (1.00, 1.10), (0.36, 0.36), (0.5, 0.5), False, Trans("flash", 0.20)),
        ("DSCF3069", (1.06, 1.00), (0.5, 0.5), (0.55, 0.55), False, Trans("wipe", 0.24, axis="x", reverse=True)),
        ("DSCF3604", (1.00, 1.07), (0.5, 0.5), (0.50, 0.50), False, Trans("flash", 0.20)),
    ]
    t = 2.5
    for name, z, cx, cy, g, tr in burst:
        shots.append(Shot(name, t, BEAT, z=z, cx=cx, cy=cy, gray=g, trans=tr))
        t += BEAT
    assert abs(t - 9.5) < 1e-6, t

    # 3) plans lents avec légendes
    shots.append(Shot("DSCF3314", 9.5, 2.5, z=(1.00, 1.14), cy=(0.35, 0.30), ease=ease_in_out,
                      trans=Trans("iris", 0.42), focus_in=0.5))
    shots.append(Shot("DSCF3603", 12.0, 2.0, z=(1.05, 1.15), cx=(0.30, 0.62), ease=ease_in_out,
                      trans=Trans("push", 0.42, axis="y"), focus_in=0.4))
    shots.append(Shot("DSCF3491", 14.0, 2.5, z=(1.02, 1.12), cx=(0.30, 0.85), ease=ease_in_out,
                      trans=Trans("wipe", 0.5, axis="x"), focus_in=0.4))

    n = 0
    for s in shots:
        if not s.hold:
            n += 1
        s.idx = n
    return shots, n


CAPTIONS = [  # (début, fin, numéro, texte)
    (9.75, 12.0, "01", "Le regard"),
    (12.25, 14.0, "02", "La complicité"),
    (14.25, 16.4, "03", "Le geste"),
]


# --------------------------------------------------------------------------- rendu
class Reel:
    def __init__(self):
        self.shots, self.total = build_shots()
        self.vig = vl.vignette_mask(W, H, strength=0.38, power=2.0)
        y = np.linspace(0, 1, H, dtype=np.float32)
        self.bottom = (1 - 0.66 * np.clip((y - 0.40) / 0.5, 0, 1) ** 1.5)[:, None, None]
        self.band = (1 - 0.42 * np.exp(-(((np.arange(H, dtype=np.float32) - 1090) / 340) ** 2)))[:, None, None]
        self.hud = mo.Hud(W, H)
        self.logo = vl.logo_sprite("white", 500)
        lh, lw = self.logo[1].shape
        self.logo_wh = (lw, lh)

    # --- utilitaires ---------------------------------------------------
    def shot_index(self, t):
        idx = 0
        for i, s in enumerate(self.shots):
            if s.start <= t + 1e-9:
                idx = i
        return idx

    def base(self, t):
        """Image de fond (photo + transition d'entrée), en float32 avant habillage."""
        i = self.shot_index(t)
        s = self.shots[i]
        B = s.render(t)
        tr = s.trans
        if i > 0 and tr.kind != "cut" and (t - s.start) < tr.dur:
            p = (t - s.start) / tr.dur
            A = self.shots[i - 1].render(t, focus=False)
            sx, sy = s.subject_xy(t)
            if tr.kind == "wipe":
                return tx_wipe(A, B, p, tr)
            if tr.kind == "zoom":
                return mo.tr_zoom(A, B, p, sx, sy)
            if tr.kind == "iris":
                return mo.tr_iris(A, B, p)
            if tr.kind == "push":
                return mo.tr_push(A, B, p, axis=tr.kw.get("axis", "y"), reverse=tr.kw.get("reverse", False))
            if tr.kind == "flash":
                f = B.astype(np.float32)
                return mo.shutter_flash(f, 0.55 * (1 - p) ** 2)
        return B.astype(np.float32)

    # --- HUD -----------------------------------------------------------
    def draw_hud(self, f, t):
        i = self.shot_index(t)
        s = self.shots[i]
        hud = self.hud
        hud.reset()
        x0, y0, x1, y1 = SAFE

        # cadre d'angles : pousse au démarrage
        arm = 74 * ease_out(t / 0.45, 3)
        hud.brackets(hud.white, x0, y0, x1, y1, arm, 3)

        lt = t - s.start
        sx, sy = s.subject_xy(t)
        # collimateur : cherche (grand, blanc) puis se verrouille (petit, vert)
        if not s.hold or lt < 0.001:
            hunt = clamp01(lt / 0.2) if s.dur < 1 else clamp01(lt / 0.32)
        else:
            hunt = 1.0
        if i < 4:                    # stop-motion : le collimateur reste verrouillé
            hunt = clamp01(t / 0.3)
        size = lerp(430, 190, ease_out(hunt, 3))
        bx = lerp(W / 2, sx, ease_out(hunt, 2))
        by = lerp(880, sy, ease_out(hunt, 2))
        locked = hunt >= 1.0
        pulse = 1.0 + (0.06 * max(0.0, 1 - (lt - (0.2 if s.dur < 1 else 0.32)) / 0.18) if locked else 0.0)
        layer = hud.green if locked else hud.white
        if end_progress(t) < 1:
            hud.af_box(layer, bx, by, size * pulse, 3)

        # échelle d'exposition : le repère glisse vers 0 à chaque coupe
        ty = SAFE[3] - 70
        tx0, tx1 = 80, 480
        for k in range(21):
            xx = lerp(tx0, tx1, k / 20)
            ln = 20 if k % 5 == 0 else 10
            hud.line(hud.white, (xx, ty), (xx, ty + ln), 2 if k % 5 == 0 else 1)
        mark = lerp(-8, 0, ease_out(clamp01(lt / 0.35), 3)) if not s.hold else 0
        mx = lerp(tx0, tx1, 0.5 + mark / 20)
        hud.line(hud.gold, (mx, ty - 12), (mx, ty - 2), 3)
        hud.composite(f, white_op=0.62, gold_op=1.0, green_op=1.0)

        # textes du viseur
        rnd = random.Random(int(t * FPS) * 7 + i)
        prog = clamp01(lt / 0.28)
        name = s.name if not s.hold else self.shots[i - 1].name
        label = mo.scramble(name, prog, rnd) if not s.hold else name
        tx.draw_text(f, "of", label, 30, x0 + 6, y0 + 58, WHITE, 0.85, tracking=0.16, align="left")
        count = f"{s.idx:02d} / {self.total:02d}"
        tx.draw_text(f, "of", count, 30, x1 - 6, y0 + 58, WHITE, 0.85, tracking=0.16, align="right")
        fields = mo.exif_fields(name)
        cur, xcur = None, x0 + 26
        for k, fld in enumerate(fields):
            txt = mo.scramble(fld, prog, rnd) if not s.hold else fld
            tx.draw_text(f, "of-m", txt, 33, xcur, SAFE[3] - 100, WHITE if k else GOLD_LIGHT, 0.95,
                         tracking=0.06, align="left")
            xcur += tx.text_width("of-m", fld, 33, 0.06) + 40
        return f

    # --- titres --------------------------------------------------------
    def draw_title(self, f, t):
        if not (1.05 < t < 2.6):
            return f
        # entrée lettre par lettre (montée sous masque, espacement qui se resserre) puis sortie vers le haut
        a_out = ease_in_out((t - 2.3) / 0.22)
        tracking = lerp(0.34, 0.0, ease_out((t - 1.1) / 1.0, 3))
        for line, style, size, base_y, color, delay in (("Golden", "cg", 250, 970, WHITE, 1.10),
                                                        ("Hour", "cg-i", 250, 1195, GOLD_LIGHT, 1.28)):
            asc, desc = tx.ascent(style, size), tx.descent(style, size)
            clip = (base_y - asc * 0.98, base_y + desc * 0.30)

            def letter(i, size=size, delay=delay):
                u = ease_out((t - delay - i * 0.045) / 0.6, 4)
                dy = (1 - u) * size * 0.95 - a_out * size * 1.05
                return (clamp01(u * 4) * (1 - a_out * 0.5), dy, 0.0, 1.0)

            tx.draw_text(f, style, line, size, W / 2, base_y, color, 1.0, tracking=tracking, align="center",
                         letter=letter, clip=clip)
        # sous-titre + filet
        u = clamp01((t - 1.55) / 0.5) * (1 - a_out)
        if u > 0:
            tx.draw_text(f, "of-m", "SÉRIE GOLF  ·  MR VISUALS", 30, W / 2, 1302, WHITE, 0.95 * u,
                         tracking=0.42, align="center")
            wline = 150 * ease_out(clamp01((t - 1.45) / 0.6), 3)
            f[1250:1252, int(W / 2 - wline):int(W / 2 + wline)] = np.asarray(GOLD, np.float32)
        return f

    def draw_captions(self, f, t):
        for (a, b, num, text) in CAPTIONS:
            if not (a - 0.05 < t < b + 0.3):
                continue
            u_in = t - a
            fade = 1 - ease_in_out((t - b) / 0.25)
            size, base_y, x = 118, 1330, 80
            asc, desc = tx.ascent("cg-i", size), tx.descent("cg-i", size)
            clip = (base_y - asc * 0.98, base_y + desc * 0.32)

            def letter(i):
                u = ease_out((u_in - i * 0.035) / 0.55, 4)
                return (clamp01(u * 4) * fade, (1 - u) * size * 0.95, 0.0, 1.0)

            tx.draw_text(f, "cg-i", text, size, x, base_y, WHITE, 1.0, tracking=0.0, align="left",
                         letter=letter, clip=clip)
            # numéro + filet qui se dessine
            lu = ease_out(u_in / 0.6, 3)
            tx.draw_text(f, "of-m", num, 30, x + 4, base_y - 132, GOLD_LIGHT, lu * fade, tracking=0.3, align="left")
            wl = int(150 * lu)
            f[base_y - 143:base_y - 141, x + 70:x + 70 + wl] = np.asarray(GOLD, np.float32) * fade + f[
                base_y - 143:base_y - 141, x + 70:x + 70 + wl] * (1 - fade)
        return f

    # --- carte finale ----------------------------------------------------
    def end_card(self, t):
        u = t - END_START
        f = np.zeros((H, W, 3), np.float32)
        f[...] = (8, 8, 8)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - 900) / (H * 0.42)) ** 2)
        f += np.clip(1 - d, 0, 1)[..., None] ** 2 * 0.11 * np.array(GOLD, np.float32)

        # logo révélé par un volet gauche -> droite avec liseré doré
        lw, lh = self.logo_wh
        lx0, ly0 = int(W / 2 - lw / 2), 600
        reveal = ease_in_out((u - 0.15) / 0.75)
        if reveal > 0:
            cut = int(lw * reveal)
            rgb, a = self.logo
            mask = np.zeros_like(a)
            mask[:, :cut] = 1.0
            edge = max(cut - 26, 0)
            mask[:, edge:cut] = np.linspace(1, 0.0, cut - edge)[None, :] if cut > edge else mask[:, edge:cut]
            aa = (a * mask)[..., None]
            reg = f[ly0:ly0 + lh, lx0:lx0 + lw]
            reg[...] = reg * (1 - aa) + rgb * aa
            if cut < lw:
                f[ly0 - 6:ly0 + lh + 6, min(lx0 + cut, W - 4):min(lx0 + cut + 3, W)] = np.asarray(GOLD_LIGHT, np.float32)

        # filet doré qui s'étire depuis le centre
        wl = int(180 * ease_out((u - 0.9) / 0.6, 3))
        f[ly0 + lh + 60:ly0 + lh + 62, W // 2 - wl:W // 2 + wl] = np.asarray(GOLD, np.float32)

        # slogan lettre par lettre
        tag = "Capturer l'instant, sublimer l'émotion"
        size, by = 58, ly0 + lh + 150
        asc, desc = tx.ascent("cg-i", size), tx.descent("cg-i", size)
        clip = (by - asc * 0.98, by + desc * 0.4)

        def letter(i):
            k = ease_out((u - 1.05 - i * 0.02) / 0.5, 4)
            return (clamp01(k * 4) * 0.94, (1 - k) * size * 0.9, 0.0, 1.0)

        tx.draw_text(f, "cg-i", tag, size, W / 2, by, WHITE, 1.0, tracking=0.005, align="center",
                     letter=letter, clip=clip)

        # @mpict_rv12 tapé à la machine, curseur clignotant
        handle = "@mpict_rv12"
        n = int(clamp01((u - 1.7) / 0.9) * len(handle) + 0.001)
        total_w = tx.text_width("of", handle, 50, 0.3)
        hx = W / 2 - total_w / 2
        hy = by + 130
        if n > 0:
            tx.draw_text(f, "of", handle[:n], 50, hx, hy, GOLD_LIGHT, 1.0, tracking=0.3, align="left")
        if u > 1.6 and (int(t * 3.2) % 2 == 0 or n < len(handle)) and u < 4.2:
            cxp = hx + tx.text_width("of", handle[:n], 50, 0.3) + (tx.text_width("of", "@", 50, 0.3) * 0.0) + 8
            f[hy - 44:hy + 6, int(cxp):int(cxp) + 3] = np.asarray(GOLD_LIGHT, np.float32)

        # catégories
        tx.draw_text(f, "of-l", "GOLF  ·  PORTRAIT  ·  DANSE  ·  AUTO", 27, W / 2, hy + 90, (150, 146, 140),
                     ease_out((u - 2.6) / 0.6) * 0.95, tracking=0.34, align="center")

        # bouton « Suivre » qui pulse
        hud = self.hud
        hud.reset()
        bu = ease_out((u - 2.9) / 0.5)
        if bu > 0:
            pulse = 1 + 0.035 * math.sin((u - 3.0) * 5.5)
            hud.pill(hud.gold, W / 2, hy + 220, 320 * pulse * bu, 92 * pulse * bu, 3)
        hud.composite(f, white_op=0, gold_op=0.95, green_op=0)
        if bu > 0.6:
            tx.draw_text(f, "of-m", "SUIVRE", 31, W / 2, hy + 220 + 11, GOLD_LIGHT, (bu - 0.6) / 0.4,
                         tracking=0.34, align="center")

        # angles de cadrage qui convergent autour du logo
        hud.reset()
        k = ease_in_out((u - 0.05) / 1.0)
        bx0, by0 = lerp(SAFE[0], W / 2 - 375, k), lerp(SAFE[1], 505, k)
        bx1, by1 = lerp(SAFE[2], W / 2 + 375, k), lerp(SAFE[3], 1495, k)
        hud.brackets(hud.white, bx0, by0, bx1, by1, 74, 3)
        hud.composite(f, white_op=0.55, gold_op=0, green_op=0)
        return f

    # --- image finale ------------------------------------------------------
    def frame(self, t):
        if t >= END_START + 0.6:
            return vl.to_u8(self.end_card(t))
        f = self.base(t) * self.vig
        # halos de lumière chaude sur les plans lents
        for (a, b, x_a, x_b) in ((10.0, 12.2, -250, 1250), (14.0, 16.4, 1300, -200)):
            if a <= t <= b:
                k = ease_in_out((t - a) / (b - a))
                env = math.sin(math.pi * k) ** 1.2
                f = mo.light_leak(f, lerp(x_a, x_b, k), 420, 640, (255, 178, 92), 0.55 * env)
        # dégradé bas pour la lisibilité des titres / légendes
        emph = 0.0
        if 1.05 < t < 2.6:
            emph = clamp01((t - 1.05) / 0.4) * (1 - clamp01((t - 2.35) / 0.25))
        for (a, b, _, _) in CAPTIONS:
            if a - 0.05 < t < b + 0.3:
                emph = max(emph, clamp01((t - a) / 0.3) * (1 - clamp01((t - b) / 0.3)))
        if emph > 0:
            f = f * (1 - (1 - self.bottom) * emph) * (1 - (1 - self.band) * emph)
        f = self.draw_title(f, t)
        f = self.draw_captions(f, t)
        f = self.draw_hud(f, t)
        # fondu vers la carte finale
        if t >= END_START:
            card = self.end_card(t)
            k = ease_in_out((t - END_START) / 0.6)
            f = f * (1 - k) + card * k
        return vl.to_u8(f)


def tx_wipe(A, B, p, tr):
    return mo.tr_wipe(A, B, p, axis=tr.kw.get("axis", "x"), reverse=tr.kw.get("reverse", False))


def end_progress(t):
    return clamp01((t - END_START) / 0.6)


def render(preview=False):
    reel = Reel()
    n = int(round(DURATION * FPS))

    if preview:
        pts = [0.03, 0.30, 0.55, 0.80, 1.35, 1.7, 2.2, 2.42, 2.55, 2.62, 3.05, 3.15, 3.55, 3.65, 4.05, 5.05,
               5.15, 5.3, 5.55, 6.05, 6.6, 7.05, 7.55, 8.05, 8.55, 9.05, 9.6, 9.75, 10.3, 12.4, 13.0, 14.1,
               14.6, 15.5, 16.55, 16.9, 17.6, 18.3, 19.0, 19.9]
        frames = [reel.frame(t) for t in pts]
        vl.contact_sheet(frames, os.path.join(vl.ROOT, "tools", "_preview_reel.jpg"), cols=8, scale=0.17)
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

    vl.save_frame(reel.frame(2.15), os.path.join(OUT_IG, "reel-golden-hour-cover.jpg"), 92)

    web = os.path.join(OUT_WEB, "reel.mp4")
    os.system(f'ffmpeg -y -loglevel error -i "{master}" -vf "scale=720:1280:flags=lanczos" -an '
              f'-c:v libx264 -profile:v high -preset slow -crf 26 -pix_fmt yuv420p '
              f'-colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart "{web}"')
    vl.save_frame(cv2.resize(reel.frame(2.15), (720, 1280), interpolation=cv2.INTER_AREA),
                  os.path.join(OUT_WEB, "reel-poster.jpg"), 82)
    print("ok :", master, "|", web)


if __name__ == "__main__":
    render(preview="--preview" in sys.argv)
