"""
MR VISUALS — boîte à outils de motion design pour les vidéos.

    - lecture des vrais réglages EXIF des photos (ouverture, vitesse, ISO, focale)
    - HUD « viseur » : cadre d'angles, collimateur d'autofocus, séparation en tiers
    - transitions : volet à liseré doré, zoom-punch, diaphragme (iris), poussée, éclair obturateur
    - effets : flou de mise au point (rack focus), flou radial, halo de lumière
"""
import math
import os

import cv2
import numpy as np
from PIL import ExifTags, Image

import textlib as tx
import video_lib as vl
from video_lib import GOLD, GOLD_LIGHT, WHITE, clamp01, ease_in_out, ease_out, lerp

GREEN = (94, 194, 138)     # « mise au point verrouillée » (même vert que le point de la page contact)
_TAGS = {v: k for k, v in ExifTags.TAGS.items()}

# --------------------------------------------------------------------------- EXIF
_exif_cache = {}


def photo_exif(name):
    """Réglages de prise de vue réels : {'f','t','iso','fl'}."""
    if name in _exif_cache:
        return _exif_cache[name]
    ex = Image.open(vl.find_photo(name)).getexif()
    sub = ex.get_ifd(0x8769)

    def g(tag):
        return sub.get(_TAGS[tag])

    d = dict(f=float(g("FNumber") or 0), t=float(g("ExposureTime") or 0),
             iso=int(g("ISOSpeedRatings") or g("PhotographicSensitivity") or 0), fl=float(g("FocalLength") or 0))
    _exif_cache[name] = d
    return d


def fmt_shutter(t):
    if t <= 0:
        return "—"
    if t >= 0.4:
        return f"{t:.1f}s"
    return f"1/{int(round(1 / t))}"


def fmt_aperture(f):
    return f"f/{f:.0f}" if abs(f - round(f)) < 0.05 else f"f/{f:.1f}"


def exif_fields(name):
    e = photo_exif(name)
    return [fmt_aperture(e["f"]), fmt_shutter(e["t"]), f"ISO {e['iso']}", f"{e['fl']:.0f}mm"]


def scramble(text, progress, rnd):
    """Effet « tableau d'affichage » : les caractères se figent de gauche à droite."""
    out = []
    n = len(text)
    for i, ch in enumerate(text):
        if ch.isdigit() and progress < (i + 1) / (n + 1):
            out.append(str(rnd.randint(0, 9)))
        else:
            out.append(ch)
    return "".join(out)


# --------------------------------------------------------------------------- HUD (viseur)
class Hud:
    """Trois calques de traits (blanc, or, vert) dessinés en 8 bits puis composés sur l'image."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.reset()

    def reset(self):
        self.white = np.zeros((self.h, self.w), np.uint8)
        self.gold = np.zeros((self.h, self.w), np.uint8)
        self.green = np.zeros((self.h, self.w), np.uint8)

    def line(self, layer, p0, p1, th=2):
        cv2.line(layer, (int(round(p0[0])), int(round(p0[1]))), (int(round(p1[0])), int(round(p1[1]))),
                 255, th, cv2.LINE_AA)

    def brackets(self, layer, x0, y0, x1, y1, arm, th=2):
        """Quatre angles de cadrage."""
        arm = max(arm, 0)
        for (cx, cy, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
            self.line(layer, (cx, cy), (cx + sx * arm, cy), th)
            self.line(layer, (cx, cy), (cx, cy + sy * arm), th)

    def af_box(self, layer, cx, cy, size, th=3, gap=0.42):
        """Collimateur d'autofocus : carré dont seules les extrémités des côtés sont tracées."""
        h = size / 2
        seg = size * (1 - gap) / 2
        for sx in (-1, 1):
            for sy in (-1, 1):
                x, y = cx + sx * h, cy + sy * h
                self.line(layer, (x, y), (x - sx * seg, y), th)
                self.line(layer, (x, y), (x, y - sy * seg), th)

    def pill(self, layer, cx, cy, w, h, th=2):
        """Bouton en forme de pilule (contour)."""
        r = h / 2
        x0, x1 = cx - w / 2 + r, cx + w / 2 - r
        cv2.ellipse(layer, (int(x0), int(cy)), (int(r), int(r)), 0, 90, 270, 255, th, cv2.LINE_AA)
        cv2.ellipse(layer, (int(x1), int(cy)), (int(r), int(r)), 0, -90, 90, 255, th, cv2.LINE_AA)
        self.line(layer, (x0, cy - r), (x1, cy - r), th)
        self.line(layer, (x0, cy + r), (x1, cy + r), th)

    def cross(self, layer, cx, cy, r, th=2):
        self.line(layer, (cx - r, cy), (cx + r, cy), th)
        self.line(layer, (cx, cy - r), (cx, cy + r), th)

    def composite(self, frame_f32, white_op=0.7, gold_op=0.95, green_op=1.0):
        for layer, col, op in ((self.white, WHITE, white_op), (self.gold, GOLD_LIGHT, gold_op),
                               (self.green, GREEN, green_op)):
            if op <= 0.003 or not layer.any():
                continue
            m = layer.astype(np.float32)[..., None] * (op / 255.0)
            frame_f32 += (np.asarray(col, np.float32) - frame_f32) * m
        return frame_f32


# --------------------------------------------------------------------------- effets d'image
def focus_pull(img_u8, radius):
    """Flou de mise au point : radius en pixels (0 = net)."""
    if radius < 0.6:
        return img_u8
    k = int(radius * 3) | 1
    return cv2.GaussianBlur(img_u8, (k, k), radius)


def scale_about(img, s, cx=None, cy=None):
    h, w = img.shape[:2]
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    M = np.array([[s, 0, cx - s * cx], [0, s, cy - s * cy]], np.float32)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def zoom_blur(img_u8, strength, cx=None, cy=None, n=7):
    """Flou radial (effet « tunnel ») : moyenne de n agrandissements progressifs."""
    if strength < 0.004:
        return img_u8
    acc = np.zeros(img_u8.shape, np.float32)
    for k in range(n):
        acc += scale_about(img_u8, 1 + strength * k / (n - 1), cx, cy)
    return (acc / n).astype(np.uint8)


_glow_grid = {}


def light_leak(frame_f32, x, y, radius, color, intensity):
    """Halo de lumière chaude (fusion « écran »)."""
    if intensity <= 0.003:
        return frame_f32
    h, w = frame_f32.shape[:2]
    if (w, h) not in _glow_grid:
        _glow_grid[(w, h)] = np.mgrid[0:h, 0:w].astype(np.float32)
    yy, xx = _glow_grid[(w, h)]
    d2 = ((xx - x) ** 2 + (yy - y) ** 2) / (radius ** 2)
    g = np.exp(-d2 * 2.2)[..., None] * intensity
    col = np.asarray(color, np.float32)
    return 255.0 - (255.0 - frame_f32) * (1 - g * col / 255.0)


def shutter_flash(frame_f32, amount):
    return vl.flash(frame_f32, amount)


# --------------------------------------------------------------------------- transitions
def _mix(A, B, m):
    """A*(1-m)+B*m avec m float32 diffusé (HxW ou HxWx1) — renvoie float32."""
    if m.ndim == 2:
        m = m[..., None]
    return A.astype(np.float32) * (1 - m) + B.astype(np.float32) * m


def tr_wipe(A, B, p, axis="x", reverse=False, edge=110, line_color=GOLD_LIGHT, parallax=70):
    """Volet avec liseré doré au bord d'attaque ; l'ancienne image recule légèrement."""
    h, w = A.shape[:2]
    L = w if axis == "x" else h
    e = ease_in_out(p)
    front = lerp(-edge, L + edge, e)
    coord = np.arange(L, dtype=np.float32)
    if reverse:
        coord = L - 1 - coord
    m1 = np.clip((front - coord) / edge, 0, 1)
    m1 = m1 * m1 * (3 - 2 * m1)
    # recul (parallaxe) de l'ancienne image
    shift = parallax * e * (1 if not reverse else -1)
    if axis == "x":
        M = np.array([[1, 0, -shift], [0, 1, 0]], np.float32)
        m = np.broadcast_to(m1[None, :], (h, w))
        glow = np.exp(-((coord - front) / 9.0) ** 2)[None, :, None]
    else:
        M = np.array([[1, 0, 0], [0, 1, -shift]], np.float32)
        m = np.broadcast_to(m1[:, None], (h, w))
        glow = np.exp(-((coord - front) / 9.0) ** 2)[:, None, None]
    A2 = cv2.warpAffine(A, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
    out = _mix(A2, B, m)
    out += glow * (np.asarray(line_color, np.float32) - out) * 0.9 * np.sin(np.pi * clamp01(p)) ** 0.5
    return out


def tr_zoom(A, B, p, cx=None, cy=None):
    """Zoom-punch : on plonge dans l'ancienne image, la nouvelle jaillit en se posant."""
    e = ease_in_out(p)
    s = math.sin(math.pi * clamp01(p))
    a = zoom_blur(scale_about(A, 1 + 0.55 * e, cx, cy), 0.16 * s, cx, cy)
    b = zoom_blur(scale_about(B, 1.45 - 0.45 * e, cx, cy), 0.16 * s, cx, cy)
    w = np.float32(clamp01((p - 0.25) / 0.5))
    w = w * w * (3 - 2 * w)
    return a.astype(np.float32) * (1 - w) + b.astype(np.float32) * w


_iris_cache = {}


def _iris_mask(w, h, r, rot, blades=8):
    key = (w, h, int(r), round(rot, 2), blades)
    m = _iris_cache.get(key)
    if m is not None:
        return m
    pts = []
    for k in range(blades):
        a = rot + 2 * math.pi * k / blades
        pts.append((w / 2 + r * math.cos(a), h / 2 + r * math.sin(a)))
    mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(mask, [np.array(pts, np.int32)], 255, cv2.LINE_AA)
    m = cv2.GaussianBlur(mask, (0, 0), 1.6).astype(np.float32) / 255.0
    if len(_iris_cache) > 64:
        _iris_cache.clear()
    _iris_cache[key] = m
    return m


def tr_iris(A, B, p, blades=8):
    """Diaphragme : l'ancienne image se ferme sur le noir, la nouvelle s'ouvre."""
    h, w = A.shape[:2]
    R = math.hypot(w, h) / 2 * 1.04
    rot = p * math.radians(55)
    if p < 0.5:
        r = R * (1 - ease_in_out(p * 2)) + 2
        src = A
    else:
        r = R * ease_in_out((p - 0.5) * 2) + 2
        src = B
    m = _iris_mask(w, h, r, rot, blades)
    return src.astype(np.float32) * m[..., None]


def tr_push(A, B, p, axis="y", reverse=False):
    """Poussée : la nouvelle image chasse l'ancienne (avec léger flou de mouvement)."""
    h, w = A.shape[:2]
    e = ease_in_out(p)
    d = (h if axis == "y" else w) * e
    sgn = 1 if not reverse else -1
    if axis == "y":
        Ma = np.array([[1, 0, 0], [0, 1, -sgn * d]], np.float32)
        Mb = np.array([[1, 0, 0], [0, 1, sgn * (h - d)]], np.float32)
    else:
        Ma = np.array([[1, 0, -sgn * d], [0, 1, 0]], np.float32)
        Mb = np.array([[1, 0, sgn * (w - d)], [0, 1, 0]], np.float32)
    a = cv2.warpAffine(A, Ma, (w, h), borderMode=cv2.BORDER_CONSTANT)
    b = cv2.warpAffine(B, Mb, (w, h), borderMode=cv2.BORDER_CONSTANT)
    # composition : b recouvre a là où b est valide
    if axis == "y":
        edge = h - d if sgn > 0 else d
        rows = np.arange(h)[:, None, None]
        mask = (rows >= edge) if sgn > 0 else (rows < edge)
    else:
        edge = w - d if sgn > 0 else d
        cols = np.arange(w)[None, :, None]
        mask = (cols >= edge) if sgn > 0 else (cols < edge)
    out = np.where(mask, b, a).astype(np.float32)
    return out
