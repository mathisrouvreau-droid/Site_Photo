"""
MR VISUALS — préparation des images pour le web.

Les photos originales (images/<categorie>/...) sont lourdes (jusqu'à 10 Mo).
Ce script génère, pour chacune, deux versions WebP légères dans images/web/ :
    <nom>.webp     grande version   (lightbox / plein écran)
    <nom>_s.webp   petite version   (grille de la galerie)
puis écrit images/web/manifest.json (dimensions, catégorie, série) que
tools/build_gallery.py utilise pour construire gallery.html.

Utilisation (depuis la racine du site) :
    python tools/optimize_images.py

Ajouter une photo = la déposer dans images/<categorie>/ puis relancer ce script
et tools/build_gallery.py. Les fichiers déjà traités sont ignorés.
"""
import io
import json
import os
import sys

from PIL import Image, ImageCms, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "images")
WEB = os.path.join(IMG, "web")

CATEGORIES = ["golf", "portrait", "danse", "voiture", "nature"]

# Photos rangées à la racine de images/ (nom de fichier -> catégorie)
ROOT_FILES = {
    "DSC_8825.jpeg": "portrait",
    "DSC_8826.jpeg": "portrait",
    "IMG_9961.jpeg": "about",
    "materiel.webp": "about",
}

# Recadrage (gauche, haut, droite, bas) appliqué avant redimensionnement : on ne garde que le matériel
CROPS = {
    "materiel": (0, 400, 1940, 1385),
}

LARGE = 2000          # côté long max de la grande version
SMALL_W, SMALL_H = 900, 1350   # boîte max de la version grille
Q_LARGE, Q_SMALL = 82, 78

SRGB = ImageCms.createProfile("sRGB")


def to_srgb(im):
    icc = im.info.get("icc_profile")
    if not icc:
        return im.convert("RGB")
    try:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        return ImageCms.profileToProfile(im, src, SRGB, outputMode="RGB")
    except Exception:
        return im.convert("RGB")


def series_of(cat, stem):
    if cat == "golf" and stem.startswith("DSCF3"):
        return "golden-hour"
    return ""


def process(src, cat):
    stem = os.path.splitext(os.path.basename(src))[0]
    out_dir = os.path.join(WEB, cat)
    os.makedirs(out_dir, exist_ok=True)
    large_p = os.path.join(out_dir, stem + ".webp")
    small_p = os.path.join(out_dir, stem + "_s.webp")

    fresh = all(os.path.exists(p) and os.path.getmtime(p) >= os.path.getmtime(src)
                for p in (large_p, small_p))
    if fresh:
        with Image.open(small_p) as sm:
            sw, sh = sm.size
        with Image.open(large_p) as lg:
            lw, lh = lg.size
        return dict(cat=cat, stem=stem, w=sw, h=sh, lw=lw, lh=lh,
                    series=series_of(cat, stem), fresh=True)

    Image.MAX_IMAGE_PIXELS = None
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        im = to_srgb(im)
        if stem in CROPS:
            im = im.crop(CROPS[stem])

        big = im.copy()
        big.thumbnail((LARGE, LARGE), Image.LANCZOS)
        big.save(large_p, "WEBP", quality=Q_LARGE, method=5)

        small = im.copy()
        small.thumbnail((SMALL_W, SMALL_H), Image.LANCZOS)
        small.save(small_p, "WEBP", quality=Q_SMALL, method=5)

    return dict(cat=cat, stem=stem, w=small.width, h=small.height,
                lw=big.width, lh=big.height, series=series_of(cat, stem), fresh=False)


def main():
    items = []
    for cat in CATEGORIES:
        d = os.path.join(IMG, cat)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.lower().endswith((".jpg", ".jpeg", ".png")):
                items.append((os.path.join(d, name), cat))
    for name, cat in ROOT_FILES.items():
        p = os.path.join(IMG, name)
        if os.path.exists(p):
            items.append((p, cat))

    manifest = []
    for src, cat in items:
        r = process(src, cat)
        manifest.append(r)
        print(("=  " if r.pop("fresh") else "+  ") + cat + "/" + r["stem"], f'{r["w"]}x{r["h"]}')

    with open(os.path.join(WEB, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    total = sum(os.path.getsize(os.path.join(dp, fn))
                for dp, _, fns in os.walk(WEB) for fn in fns if fn.endswith(".webp"))
    print(f"\n{len(manifest)} photos, {total / 1e6:.1f} Mo de WebP dans images/web/")


if __name__ == "__main__":
    sys.exit(main())
