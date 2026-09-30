"""
MR VISUALS — texte animé pour les vidéos, dans la typo du site.

S'appuie sur l'atlas généré par `node tools/make_text_atlas.mjs`
(Cormorant Garamond + Outfit dessinées par Chrome). Chaque lettre peut être animée
séparément : apparition en glissement sous un masque, espacement qui se resserre, etc.

Styles disponibles :
    cg      Cormorant Garamond light           (titres)
    cg-i    Cormorant Garamond light italique
    cg-ir   Cormorant Garamond italique regular
    of-l    Outfit light     of   Outfit regular     of-m   Outfit medium   (interface / HUD)
"""
import json
import os

import cv2
import numpy as np

ATLAS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "atlas")

_meta = None
_sheets = {}
_glyph_cache = {}


def _load():
    global _meta
    if _meta is None:
        with open(os.path.join(ATLAS_DIR, "atlas.json"), encoding="utf-8") as f:
            _meta = json.load(f)
    return _meta


def _sheet(style):
    if style not in _sheets:
        png = cv2.imread(os.path.join(ATLAS_DIR, style + ".png"), cv2.IMREAD_UNCHANGED)
        _sheets[style] = png[..., 3].astype(np.float32) / 255.0  # canal alpha
    return _sheets[style]


def _glyph(style, ch, size):
    """Bitmap alpha du glyphe à la taille demandée + décalage du glyphe (x, y de la ligne de base)."""
    key = (style, ch, round(size * 2) / 2)
    hit = _glyph_cache.get(key)
    if hit is not None:
        return hit
    m = _load()[style]
    g = m["glyphs"].get(ch)
    if g is None:
        g = m["glyphs"].get("?")
    scale = size / m["size"]
    sheet = _sheet(style)
    cell = sheet[g["y"]:g["y"] + m["cellH"], g["x"]:g["x"] + g["w"]]
    w = max(int(round(cell.shape[1] * scale)), 1)
    h = max(int(round(cell.shape[0] * scale)), 1)
    bmp = cv2.resize(cell, (w, h), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    out = (bmp, m["pad"] * scale, (m["pad"] + m["asc"]) * scale)
    _glyph_cache[key] = out
    return out


def layout(style, text, size, tracking=0.0):
    """Positions x de chaque lettre (bord gauche de la case) et largeur totale, en pixels."""
    m = _load()[style]
    xs, x = [], 0.0
    prev = None
    for ch in text:
        if prev is not None:
            x += m["kern"].get(prev + ch, 0.0) * size
        xs.append(x)
        adv = m["glyphs"].get(ch, m["glyphs"]["?"])["adv"] * size
        x += adv + tracking * size
        prev = ch
    total = x - (tracking * size if text else 0)
    return xs, total


def text_width(style, text, size, tracking=0.0):
    return layout(style, text, size, tracking)[1]


def ascent(style, size):
    m = _load()[style]
    return m["asc"] / m["size"] * size


def descent(style, size):
    m = _load()[style]
    return m["desc"] / m["size"] * size


def line_height(style, size):
    m = _load()[style]
    return (m["asc"] + m["desc"]) / m["size"] * size


def draw_text(frame, style, text, size, x, y, color, opacity=1.0, tracking=0.0, align="center",
              letter=None, clip=None):
    """
    Dessine `text` sur frame (float32 HxWx3, modifié en place).
      x, y     : point d'ancrage ; y = ligne de base
      align    : 'left' | 'center' | 'right'
      letter   : fonction i -> (opacité, dy, dx, echelle) pour animer chaque lettre (None = statique)
      clip     : (y_haut, y_bas) : rien n'est dessiné en dehors (effet « masque » d'un titre qui monte)
    """
    if opacity <= 0.002 or not text:
        return
    xs, total = layout(style, text, size, tracking)
    if align == "center":
        x0 = x - total / 2
    elif align == "right":
        x0 = x - total
    else:
        x0 = x
    fh, fw = frame.shape[:2]
    col = np.asarray(color, dtype=np.float32)
    for i, ch in enumerate(text):
        if ch == " ":
            continue
        op, dy, dx, sc = (1.0, 0.0, 0.0, 1.0) if letter is None else letter(i)
        op *= opacity
        if op <= 0.002:
            continue
        bmp, ox, oy = _glyph(style, ch, size * sc)
        gx = int(round(x0 + xs[i] + dx - ox))
        gy = int(round(y + dy - oy))
        h, w = bmp.shape
        sy0, sx0 = 0, 0
        ey0, ex0, ey1, ex1 = gy, gx, gy + h, gx + w
        if clip is not None:
            top, bot = clip
            if ey0 < top:
                sy0 = int(top - ey0)
                ey0 = int(top)
            if ey1 > bot:
                ey1 = int(bot)
        if ex0 < 0:
            sx0 = -ex0
            ex0 = 0
        if ey0 < 0:
            sy0 += -ey0
            ey0 = 0
        ex1 = min(ex1, fw)
        ey1 = min(ey1, fh)
        if ex1 <= ex0 or ey1 <= ey0:
            continue
        a = bmp[sy0:sy0 + (ey1 - ey0), sx0:sx0 + (ex1 - ex0), None] * op
        region = frame[ey0:ey1, ex0:ex1]
        region[...] = region * (1 - a) + col * a
