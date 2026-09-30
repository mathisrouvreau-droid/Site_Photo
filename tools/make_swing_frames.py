"""
MR VISUALS — images de la section « Le geste » (swing décomposé, piloté par le défilement).

Les 4 photos du swing ont été prises à main levée : on les aligne sur le décor fixe (chariot, arbres)
pour que l'animation soit stable, puis on rogne les bords et on les enregistre en WebP dans
images/web/swing/  (swing-1.webp ... swing-4.webp).

    python tools/make_swing_frames.py
"""
import os

import numpy as np
from PIL import Image

import motion as mo
import video_lib as vl

FRAMES = ["DSCF3371", "DSCF3381", "DSCF3382", "DSCF3386"]
OUT = os.path.join(vl.ROOT, "images", "web", "swing")
CROP = 0.045          # marge rognée sur chaque bord (les bords recalés sont approximatifs)


def main():
    os.makedirs(OUT, exist_ok=True)
    aligned = vl.align_stack(FRAMES, 1080, 1920, k=1.5)
    for i, (name, arr) in enumerate(zip(FRAMES, aligned), start=1):
        h, w = arr.shape[:2]
        dx, dy = int(w * CROP), int(h * CROP)
        crop = Image.fromarray(np.ascontiguousarray(arr[dy:h - dy, dx:w - dx]))
        crop.thumbnail((1500, 2000), Image.LANCZOS)
        crop.save(os.path.join(OUT, f"swing-{i}.webp"), "WEBP", quality=82, method=5)
        crop = np.asarray(crop)
        e = mo.photo_exif(name)
        print(f"swing-{i}.webp  {crop.shape[1]}x{crop.shape[0]}  {name}  {mo.fmt_aperture(e['f'])} "
              f"{mo.fmt_shutter(e['t'])} ISO {e['iso']} {e['fl']:.0f}mm")


if __name__ == "__main__":
    main()
