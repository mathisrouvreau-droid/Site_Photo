"""
MR VISUALS — héberge les polices du site (Cormorant Garamond et Outfit) sur le site lui-même.

Pourquoi : quand les polices sont chargées chez Google, chaque visiteur envoie son adresse IP à Google.
Hébergées ici, elles ne contactent personne d'autre et le site s'affiche aussi vite ou plus vite.
Les deux polices sont sous licence libre (SIL Open Font License) : on a le droit de les héberger.

Produit :
    fonts/*.woff2     les fichiers de polices (alphabet latin : tous les accents du français)
    css/fonts.css     les déclarations @font-face, chargées par chaque page

À lancer une seule fois (ou pour changer de graisses / de polices) :
    python tools/fetch_fonts.py
"""
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "fonts")
CSS_OUT = os.path.join(ROOT, "css", "fonts.css")

# Les mêmes polices et graisses que celles utilisées par les pages
CSS_URL = ("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400"
           "&family=Outfit:wght@200;300;400;500;600&display=swap")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
SUBSETS = ("latin",)   # le français tient entièrement dans « latin » (é, è, à, ç, œ…)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    css = get(CSS_URL).decode("utf-8")
    blocks = re.findall(r"/\* ([a-z-]+) \*/\s*(@font-face \{.*?\})", css, re.S)
    faces = []
    for subset, block in blocks:
        if subset not in SUBSETS:
            continue
        faces.append(dict(
            subset=subset,
            family=re.search(r"font-family: '([^']+)'", block).group(1),
            style=re.search(r"font-style: (\w+)", block).group(1),
            weight=re.search(r"font-weight: ([\d ]+);", block).group(1).strip(),
            url=re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1),
            unicode=re.search(r"unicode-range: ([^;]+);", block).group(1),
        ))
    if not faces:
        raise SystemExit("Aucune police trouvée : la réponse de Google a changé de forme.")

    # un même fichier peut servir plusieurs graisses (police variable) : on ne le télécharge qu'une fois
    by_url = {}
    for f in faces:
        by_url.setdefault(f["url"], []).append(f)
    os.makedirs(FONTS, exist_ok=True)
    names = {}
    for url, group in by_url.items():
        f = group[0]
        if len(group) > 1:
            name = f"{slug(f['family'])}-{f['style']}-variable-{f['subset']}.woff2"
        else:
            name = f"{slug(f['family'])}-{f['style']}-{f['weight'].replace(' ', '-')}-{f['subset']}.woff2"
        with open(os.path.join(FONTS, name), "wb") as out:
            out.write(get(url))
        names[url] = name

    lines = ["/* Polices hébergées sur le site (voir tools/fetch_fonts.py). Aucune requête vers Google. */"]
    for f in faces:
        lines.append(
            "@font-face {\n"
            f"    font-family: '{f['family']}';\n"
            f"    font-style: {f['style']};\n"
            f"    font-weight: {f['weight']};\n"
            "    font-display: swap;\n"
            f"    src: url(../fonts/{names[f['url']]}) format('woff2');\n"
            f"    unicode-range: {f['unicode']};\n"
            "}"
        )
    with open(CSS_OUT, "w", encoding="utf-8", newline="\n") as out:
        out.write("\n".join(lines) + "\n")

    total = 0
    for name in sorted(set(names.values())):
        size = os.path.getsize(os.path.join(FONTS, name))
        total += size
        print(f"{name:55s} {size / 1024:5.1f} Ko")
    print(f"\n{len(set(names.values()))} fichiers, {total / 1024:.0f} Ko au total ; {len(faces)} déclarations dans css/fonts.css")


if __name__ == "__main__":
    main()
