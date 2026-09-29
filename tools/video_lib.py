"""
MR VISUALS — petite bibliothèque de montage vidéo (OpenCV + Pillow + ffmpeg).

Sert à fabriquer :
  - la boucle "showreel" du hero du site         (tools/make_hero.py)
  - le reel vertical pour Instagram              (tools/make_reel.py)

Principe : chaque image est rendue à la volée avec un mouvement de caméra sub-pixel
(zoom + dérive), puis les images brutes sont envoyées à ffmpeg via un tube.
"""
import math
import os
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "images")
FFMPEG = "ffmpeg"

GOLD = (184, 148, 90)
GOLD_LIGHT = (212, 176, 122)
WHITE = (240, 236, 230)
BLACK = (8, 8, 8)

Image.MAX_IMAGE_PIXELS = None

FONT_DIR = r"C:\Windows\Fonts"
FONTS = {
    "serif": os.path.join(FONT_DIR, "pala.ttf"),
    "serif_italic": os.path.join(FONT_DIR, "palai.ttf"),
    "sans_light": os.path.join(FONT_DIR, "segoeuil.ttf"),
    "sans": os.path.join(FONT_DIR, "segoeui.ttf"),
    "sans_semibold": os.path.join(FONT_DIR, "seguisb.ttf"),
}


# --------------------------------------------------------------------------- easing
def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def ease_in_out(t):
    t = clamp01(t)
    return t * t * (3 - 2 * t)


def ease_out(t, p=3):
    t = clamp01(t)
    return 1 - (1 - t) ** p


def ease_in(t, p=3):
    t = clamp01(t)
    return t ** p


def lerp(a, b, t):
    return a + (b - a) * t


# --------------------------------------------------------------------------- images
def find_photo(name):
    """Retrouve une photo par son nom (sans extension) dans images/**."""
    for dp, _, fns in os.walk(IMG):
        if os.sep + "web" in dp or os.sep + "brand" in dp:
            continue
        for fn in fns:
            if os.path.splitext(fn)[0] == name and fn.lower().endswith((".jpg", ".jpeg", ".png")):
                return os.path.join(dp, fn)
    raise FileNotFoundError(name)


_cache = {}


def load_for(name, out_w, out_h, k=1.25, gray=False):
    """
    Charge une photo, l'oriente et la redimensionne pour qu'un cadrage 'cover'
    dans out_w x out_h corresponde à ~k * out_w pixels source (marge pour le zoom).
    """
    key = (name, out_w, out_h, k, gray)
    if key in _cache:
        return _cache[key]
    im = ImageOps.exif_transpose(Image.open(find_photo(name))).convert("RGB")
    w, h = im.size
    if w / h > out_w / out_h:
        base_cw = h * out_w / out_h
    else:
        base_cw = w
    f = (k * out_w) / base_cw
    nw, nh = max(int(round(w * f)), 1), max(int(round(h * f)), 1)
    im = im.resize((nw, nh), Image.LANCZOS)
    arr = np.asarray(im)
    if gray:
        g = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        arr = np.repeat(g[..., None], 3, axis=2)
    _cache[key] = arr
    return arr


def render_window(img, out_w, out_h, zoom=1.0, cx=0.5, cy=0.5, rot=0.0):
    """
    Rendu d'un cadrage 'cover' de img dans out_w x out_h.
    zoom >= 1 ; cx, cy in [0,1] = position de la fenêtre dans la marge disponible.
    """
    h, w = img.shape[:2]
    if w / h > out_w / out_h:
        ch0 = h
        cw0 = h * out_w / out_h
    else:
        cw0 = w
        ch0 = w * out_h / out_w
    cw, ch = cw0 / zoom, ch0 / zoom
    x0 = (w - cw) * cx
    y0 = (h - ch) * cy
    s = out_w / cw
    M = np.array([[s, 0, -x0 * s], [0, s, -y0 * s]], dtype=np.float32)
    if rot:
        R = cv2.getRotationMatrix2D((out_w / 2, out_h / 2), rot, 1.0)
        M = (np.vstack([R, [0, 0, 1]]) @ np.vstack([M, [0, 0, 1]]))[:2].astype(np.float32)
    return cv2.warpAffine(img, M, (out_w, out_h), flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


class Motion:
    """Mouvement de caméra interpolé : (zoom, cx, cy) de 'a' vers 'b'."""

    def __init__(self, z=(1.0, 1.08), cx=(0.5, 0.5), cy=(0.5, 0.5), ease=ease_in_out):
        self.z, self.cx, self.cy, self.ease = z, cx, cy, ease

    def at(self, u):
        e = self.ease(u)
        return lerp(*self.z, e), lerp(*self.cx, e), lerp(*self.cy, e)


# --------------------------------------------------------------------------- alignement
def align_stack(names, out_w, out_h, k=1.25):
    """
    Aligne des photos quasi identiques (même scène, prises à main levée) sur la première,
    en s'appuyant sur le décor fixe (RANSAC ignore le sujet qui bouge).
    """
    imgs = [load_for(n, out_w, out_h, k) for n in names]
    ref = imgs[0]
    ref_g = cv2.cvtColor(ref, cv2.COLOR_RGB2GRAY)
    orb = cv2.ORB_create(6000)
    kr, dr = orb.detectAndCompute(ref_g, None)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    out = [ref]
    for im in imgs[1:]:
        g = cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)
        ki, di = orb.detectAndCompute(g, None)
        pairs = matcher.knnMatch(di, dr, k=2)
        good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
        if len(good) < 12:
            out.append(im)
            continue
        src = np.float32([ki[m.queryIdx].pt for m in good])
        dst = np.float32([kr[m.trainIdx].pt for m in good])
        M, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3.0)
        if M is None:
            out.append(im)
            continue
        h, w = ref.shape[:2]
        out.append(cv2.warpAffine(im, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE))
    return out


# --------------------------------------------------------------------------- compositing
def vignette_mask(w, h, strength=0.35, power=2.2):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / math.sqrt(2)
    m = 1 - strength * np.clip(d, 0, 1) ** power
    return m[..., None].astype(np.float32)


def apply_gain(frame_f32, gain):
    return frame_f32 * gain


def flash(frame_f32, amount):
    """Éclair blanc type 'obturateur' : amount in [0,1]."""
    if amount <= 0:
        return frame_f32
    return frame_f32 + (255.0 - frame_f32) * amount


def crossfade(a_u8, b_u8, t):
    if t <= 0:
        return a_u8
    if t >= 1:
        return b_u8
    return cv2.addWeighted(a_u8, 1 - t, b_u8, t, 0)


# --------------------------------------------------------------------------- texte
def _font(kind, size):
    return ImageFont.truetype(FONTS[kind], size)


def text_sprite(text, kind="serif", size=64, color=WHITE, tracking=0.0, pad=8):
    """
    Rend un texte (avec espacement des lettres 'tracking' en em) dans un sprite RGBA float32.
    Renvoie (rgb[h,w,3] uint8-couleur unie, alpha[h,w] float 0..1).
    """
    font = _font(kind, size)
    widths = []
    for ch in text:
        widths.append(font.getlength(ch))
    track_px = tracking * size
    total = sum(widths) + track_px * (len(text) - 1)
    asc, desc = font.getmetrics()
    W, H = int(math.ceil(total)) + pad * 2, asc + desc + pad * 2
    layer = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(layer)
    x = pad
    for ch, wd in zip(text, widths):
        d.text((x, pad), ch, font=font, fill=255)
        x += wd + track_px
    alpha = np.asarray(layer, dtype=np.float32) / 255.0
    rgb = np.empty((H, W, 3), dtype=np.float32)
    rgb[...] = color
    return rgb, alpha


def paste_sprite(frame_f32, sprite, cx, cy, opacity=1.0, dy=0.0):
    """Colle un sprite centré en (cx, cy+dy) sur frame_f32 (float32, modifié en place)."""
    if opacity <= 0.003:
        return
    rgb, alpha = sprite
    h, w = alpha.shape
    x0 = int(round(cx - w / 2))
    y0 = int(round(cy + dy - h / 2))
    fh, fw = frame_f32.shape[:2]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    ex0, ey0 = max(0, x0), max(0, y0)
    ex1, ey1 = min(fw, x0 + w), min(fh, y0 + h)
    if ex1 <= ex0 or ey1 <= ey0:
        return
    a = alpha[sy0:sy0 + (ey1 - ey0), sx0:sx0 + (ex1 - ex0), None] * opacity
    c = rgb[sy0:sy0 + (ey1 - ey0), sx0:sx0 + (ex1 - ex0)]
    region = frame_f32[ey0:ey1, ex0:ex1]
    region[...] = region * (1 - a) + c * a


def logo_sprite(kind="white", width=400):
    path = os.path.join(IMG, "brand", f"logo-{kind}.png")
    im = Image.open(path).convert("RGBA")
    h = int(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    arr = np.asarray(im, dtype=np.float32)
    return arr[..., :3].copy(), arr[..., 3] / 255.0


# --------------------------------------------------------------------------- ffmpeg
class Writer:
    def __init__(self, path, w, h, fps, crf=20, preset="slow", audio_silence=False, extra=None,
                 maxrate=None):
        self.w, self.h = w, h
        os.makedirs(os.path.dirname(path), exist_ok=True)
        cmd = [FFMPEG, "-y", "-loglevel", "error",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-"]
        if audio_silence:
            cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
        cmd += ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
                "-c:v", "libx264", "-profile:v", "high", "-preset", preset, "-crf", str(crf),
                "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                "-movflags", "+faststart", "-r", str(fps)]
        if maxrate:
            cmd += ["-maxrate", maxrate, "-bufsize", str(int(maxrate.rstrip("M")) * 2) + "M"]
        if audio_silence:
            cmd += ["-c:a", "aac", "-b:a", "128k", "-shortest"]
        else:
            cmd += ["-an"]
        if extra:
            cmd += extra
        cmd += [path]
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    def write(self, frame_u8):
        self.p.stdin.write(np.ascontiguousarray(frame_u8).tobytes())

    def close(self):
        self.p.stdin.close()
        rc = self.p.wait()
        if rc != 0:
            raise RuntimeError(f"ffmpeg a échoué (code {rc})")


def to_u8(frame_f32):
    return np.clip(frame_f32, 0, 255).astype(np.uint8)


def save_frame(frame_u8, path, quality=88):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(frame_u8).save(path, quality=quality, optimize=True)


def contact_sheet(frames, path, cols=6, scale=0.25):
    if not frames:
        return
    h, w = frames[0].shape[:2]
    tw, th = int(w * scale), int(h * scale)
    rows = (len(frames) + cols - 1) // cols
    sheet = np.full((rows * th, cols * tw, 3), 20, dtype=np.uint8)
    for i, f in enumerate(frames):
        small = cv2.resize(f, (tw, th), interpolation=cv2.INTER_AREA)
        r, c = divmod(i, cols)
        sheet[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = small
    save_frame(sheet, path, 85)
