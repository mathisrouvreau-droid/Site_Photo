"""
MR VISUALS — images de partage (Open Graph, 1200x630) de chaque collection.

Quand on partage golf.html sur WhatsApp, LinkedIn, Facebook ou Google, c'est cette image qui s'affiche :
un triptyque de trois photos de la collection, le nom de la collection dans la typo du site et le logo.
Sorties : images/og/<collection>.jpg

    python tools/make_og_collections.py
"""
import json
import os

import numpy as np
from PIL import Image, ImageOps

import photo_meta as pm
import textlib as tx
import video_lib as vl
from video_lib import GOLD, GOLD_LIGHT, WHITE

W, H, GAP = 1200, 630, 4
ROOT = vl.ROOT
OUT = os.path.join(ROOT, "images", "og")

# photos mises en avant par collection : voir PICKS dans tools/photo_meta.py
PICKS = pm.PICKS


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {(m["cat"], m["stem"]): m for m in json.load(open(os.path.join(ROOT, "images", "web", "manifest.json"), encoding="utf-8"))}
    logo = vl.logo_sprite("white", 170)
    for col in pm.COLLECTIONS:
        names = [s for s in PICKS[col["cat"]] if (col["cat"], s) in manifest or ("portrait", s) in manifest]
        for (c, s) in sorted(manifest):                      # photo retirée : on complète avec les premières de la collection
            if len(names) >= 3:
                break
            if c == col["cat"] and s not in names:
                names.append(s)
        base = list(names)
        while base and len(names) < 3:                       # peu de photos : on répète pour garder le triptyque
            names.append(base[len(names) % len(base)])
        pw = (W - 2 * GAP) // 3
        canvas = Image.new("RGB", (W, H), (8, 8, 8))
        for i, stem in enumerate(names):
            m = manifest[(col["cat"], stem)] if (col["cat"], stem) in manifest else None
            if m is None:
                # photo rangée à la racine (autoportraits)
                m = manifest[("portrait", stem)]
            path = os.path.join(ROOT, "images", "web", m["cat"], stem + ".webp")
            im = Image.open(path).convert("RGB")
            w = pw if i < 2 else W - 2 * (pw + GAP)
            panel = ImageOps.fit(im, (w, H), Image.LANCZOS, centering=(0.5, 0.35))
            canvas.paste(panel, (i * (pw + GAP), 0))
        f = np.asarray(canvas, dtype=np.float32)
        f *= 0.42                                      # assombrit pour la lisibilité du texte
        f *= vl.vignette_mask(W, H, strength=0.45, power=1.8)
        # titre
        size = 190
        base_y = H // 2 + int(size * 0.28)
        tx.draw_text(f, "cg", col["name"], size, W / 2, base_y, WHITE, 1.0, tracking=0.06, align="center")
        f[base_y + 46:base_y + 48, W // 2 - 70:W // 2 + 70] = np.asarray(GOLD, np.float32)
        tx.draw_text(f, "of-m", "PHOTOGRAPHE EN VENDÉE", 24, W / 2, base_y + 96, GOLD_LIGHT, 0.95, tracking=0.36, align="center")
        # logo en haut à gauche
        rgb, a = logo
        h_, w_ = a.shape
        x0, y0 = 48, 40
        reg = f[y0:y0 + h_, x0:x0 + w_]
        reg[...] = reg * (1 - a[..., None]) + rgb * a[..., None]
        out = os.path.join(OUT, col["slug"] + ".jpg")
        Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)).save(out, quality=86, optimize=True)
        print(os.path.relpath(out, ROOT), f"{os.path.getsize(out) / 1024:.0f} Ko")


if __name__ == "__main__":
    main()
