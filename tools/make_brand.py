"""
MR VISUALS — assets de marque dérivés du logo d'origine (images/logo.png).

Le logo d'origine est noir sur un fond gris dégradé. Ce script en tire :
    images/brand/logo-white.png   logo complet (MR + VISUALS), blanc, fond transparent
    images/brand/logo-gold.png    idem en doré
    images/brand/mark-white.png   monogramme MR seul, blanc, fond transparent
    images/brand/favicon.png      icône d'onglet 256x256 (MR doré sur fond noir)
    images/og.jpg                 image de partage 1200x630 (WhatsApp, LinkedIn, Instagram...)

    python tools/make_brand.py
"""
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "images", "logo.png")
OUT = os.path.join(ROOT, "images", "brand")
GOLD = (184, 148, 90)


def extract_alpha(path):
    gray = np.array(Image.open(path).convert("L"), dtype=np.float32)
    # Estimation du fond (dégradé) : fermeture morphologique qui "efface" les traits sombres fins
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))
    bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, k)
    bg = cv2.GaussianBlur(bg, (0, 0), 15)
    diff = np.clip((bg - gray) / np.maximum(bg, 1.0), 0, 1)
    # Les traits du logo sont quasi noirs (diff ~ 1) ; le halo d'ombre autour reste sous 0.45.
    alpha = np.clip((diff - 0.55) / (0.92 - 0.55), 0, 1)
    return alpha


def bbox(alpha, thr=0.15, pad=14):
    ys, xs = np.where(alpha > thr)
    h, w = alpha.shape
    return (max(xs.min() - pad, 0), max(ys.min() - pad, 0),
            min(xs.max() + pad, w), min(ys.max() + pad, h))


def colorize(alpha, rgb):
    h, w = alpha.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = rgb
    out[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main():
    os.makedirs(OUT, exist_ok=True)
    alpha = extract_alpha(SRC)
    x0, y0, x1, y1 = bbox(alpha)
    full = alpha[y0:y1, x0:x1]
    colorize(full, (255, 255, 255)).save(os.path.join(OUT, "logo-white.png"), optimize=True)
    colorize(full, GOLD).save(os.path.join(OUT, "logo-gold.png"), optimize=True)

    # Monogramme : la partie haute du logo (avant le mot VISUALS)
    rows = np.where(full.max(axis=1) > 0.15)[0]
    gaps = np.where(np.diff(rows) > 8)[0]
    split = rows[gaps[0]] + 1 if len(gaps) else int(full.shape[0] * 0.65)
    mark = full[:split]
    mx0, my0, mx1, my1 = bbox(mark, pad=6)
    mark = mark[my0:my1, mx0:mx1]
    colorize(mark, (255, 255, 255)).save(os.path.join(OUT, "mark-white.png"), optimize=True)

    # Favicon : MR doré centré sur fond noir
    size = 256
    canvas = Image.new("RGB", (size, size), (11, 11, 11))
    m = colorize(mark, GOLD)
    scale = (size * 0.56) / m.width
    m = m.resize((int(m.width * scale), int(m.height * scale)), Image.LANCZOS)
    canvas.paste(m, ((size - m.width) // 2, (size - m.height) // 2), m)
    canvas.save(os.path.join(OUT, "favicon.png"), optimize=True)

    make_og()
    print("logo-white", full.shape[::-1], "| mark", mark.shape[::-1], "| og.jpg")


def make_og():
    """Triptyque assombri + logo au centre. Nécessite images/web (tools/optimize_images.py)."""
    from PIL import ImageOps, ImageEnhance
    W, H, gap = 1200, 630, 4
    names = [("portrait", "DSC_8825"), ("golf", "DSCF3270"), ("golf", "DSCF3314")]
    pw = (W - 2 * gap) // 3
    canvas = Image.new("RGB", (W, H), (8, 8, 8))
    for i, (cat, stem) in enumerate(names):
        path = os.path.join(ROOT, "images", "web", cat, stem + ".webp")
        im = Image.open(path).convert("RGB")
        panel = ImageOps.fit(im, (pw if i < 2 else W - 2 * (pw + gap), H), Image.LANCZOS, centering=(0.5, 0.35))
        panel = ImageEnhance.Brightness(panel).enhance(0.55)
        canvas.paste(panel, (i * (pw + gap), 0))
    logo = Image.open(os.path.join(OUT, "logo-white.png")).convert("RGBA")
    lw = 300
    logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    canvas.paste(logo, ((W - lw) // 2, (H - logo.height) // 2 - 6), logo)
    canvas.save(os.path.join(ROOT, "images", "og.jpg"), quality=86, optimize=True)


if __name__ == "__main__":
    main()
