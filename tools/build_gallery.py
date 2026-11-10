"""
MR VISUALS — remplit gallery.html à partir de images/web/manifest.json.

Le fichier gallery.html reste modifiable à la main : seules les zones balisées
    <!-- GALLERY:START --> ... <!-- GALLERY:END -->
    <!-- FILTERS:START --> ... <!-- FILTERS:END -->
sont réécrites par ce script.

Ordre d'affichage :
  - golf : la série "Golden Hour" d'abord (ordre choisi ci-dessous), puis le reste ;
  - onglet "Tout" : les catégories sont mélangées proportionnellement pour que
    la grille ne soit jamais une longue suite de la même catégorie.

    python tools/optimize_images.py   # si de nouvelles photos ont été ajoutées
    python tools/build_gallery.py
"""
import html
import json
import os
import re

import photo_meta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = "images/web"

CATS = [  # (clé, libellé)
    ("golf", "Golf"),
    ("portrait", "Portrait"),
    ("basket", "Basket"),
    ("voiture", "Voiture"),
    ("danse", "Danse"),
    ("nature", "Nature"),
]

# Ordre voulu pour la série Golden Hour (les photos non listées suivent, par nom de fichier)
GOLDEN_ORDER = [
    "DSCF3270", "DSCF3314", "DSCF3226", "DSCF3084", "DSCF3371", "DSCF3381", "DSCF3382", "DSCF3386",
    "DSCF3062", "DSCF3058", "DSCF3307", "DSCF3491", "DSCF3165", "DSCF3237", "DSCF3080", "DSCF3065",
    "DSCF3069", "DSCF3516", "DSCF3472", "DSCF3604", "DSCF3601", "DSCF3603", "DSCF3053",
]



def sort_cat(cat, items):
    if cat == "golf":
        rank = {n: i for i, n in enumerate(GOLDEN_ORDER)}
        golden = sorted([p for p in items if p["series"] == "golden-hour"],
                        key=lambda p: (rank.get(p["stem"], 999), p["stem"]))
        rest = sorted([p for p in items if p["series"] != "golden-hour"], key=lambda p: p["stem"])
        return golden + rest
    if cat == "portrait":
        # les autoportraits (hero) en tête
        first = ["DSC_8825", "DSC_8826"]
        return sorted(items, key=lambda p: (first.index(p["stem"]) if p["stem"] in first else 99, p["stem"]))
    return sorted(items, key=lambda p: p["stem"])


def interleave(by_cat):
    """Mélange proportionnel : chaque photo reçoit une position relative dans sa catégorie."""
    keyed = []
    for cat, items in by_cat.items():
        n = len(items)
        for i, p in enumerate(items):
            keyed.append(((i + 0.5) / n, cat, p))
    keyed.sort(key=lambda k: (k[0], k[1]))
    return [(cat, p) for _, cat, p in keyed]


def alt_of(cat, label, p):
    """Description réelle de la photo (tools/photo_meta.py), sinon un texte de secours."""
    return photo_meta.ALT.get(p["stem"]) or f"Photographie — {label}"


def item_html(cat, label, p, priority=False):
    base = f"{WEB}/{p['cat']}/{p['stem']}"
    small, large = base + "_s.webp", base + ".webp"
    alt = alt_of(cat, label, p)
    load = 'fetchpriority="high" decoding="async"' if priority else 'loading="lazy" decoding="async"'
    return (
        f'                <a class="gallery__item" href="{large}" data-category="{cat}"'
        f'{" data-series=" + chr(34) + p["series"] + chr(34) if p["series"] else ""}'
        f' data-full="{large}" aria-label="Agrandir — {html.escape(label)}">\n'
        f'                    <img src="{small}" srcset="{small} {p["w"]}w, {large} {p["lw"]}w" '
        f'sizes="(max-width: 520px) 100vw, (max-width: 1024px) 50vw, 33vw" '
        f'width="{p["w"]}" height="{p["h"]}" alt="{html.escape(alt)}" {load}>\n'
        f'                    <span class="gallery__item-overlay"><span class="gallery__item-cat">{html.escape(label)}</span>'
        f'<span class="gallery__item-plus" aria-hidden="true">+</span></span>\n'
        f'                </a>\n'
    )


def replace_block(text, name, content):
    pat = re.compile(rf"(<!-- {name}:START -->\n).*?(?=[ \t]*<!-- {name}:END -->)", re.S)
    if not pat.search(text):
        raise SystemExit(f"Balises {name}:START/END introuvables dans gallery.html")
    return pat.sub(lambda m: m.group(1) + content + "\n", text)


def main():
    with open(os.path.join(ROOT, WEB, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)

    labels = dict(CATS)
    by_cat = {}
    for p in manifest:
        if p["cat"] in labels:
            by_cat.setdefault(p["cat"], []).append(p)
    for cat in by_cat:
        by_cat[cat] = sort_cat(cat, by_cat[cat])

    ordered = interleave(by_cat)

    grid = "".join(item_html(cat, labels[cat], p, priority=(i < 3)) for i, (cat, p) in enumerate(ordered))
    grid += ('                <div class="gallery__coming-soon hidden" data-category="basket">\n'
             '                    <span class="gallery__coming-soon-text">Basket — à venir</span>\n'
             '                </div>\n')

    total = len(ordered)
    buttons = f'                <button class="filter-btn active" data-filter="all">Tout <sup>{total}</sup></button>\n'
    for key, label in CATS:
        n = len(by_cat.get(key, []))
        count = f" <sup>{n}</sup>" if n else ' <sup class="soon">bientôt</sup>'
        buttons += f'                <button class="filter-btn" data-filter="{key}">{label}{count}</button>\n'

    path = os.path.join(ROOT, "gallery.html")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    text = replace_block(text, "GALLERY", grid.rstrip("\n"))
    text = replace_block(text, "FILTERS", buttons.rstrip("\n"))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"gallery.html : {total} photos, " + ", ".join(f"{labels[c]} {len(v)}" for c, v in by_cat.items()))


if __name__ == "__main__":
    main()
