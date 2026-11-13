"""
MR VISUALS — pages de collection (golf.html, portrait.html, danse.html, automobile.html, nature.html)
et plan du site (sitemap.xml, avec les images).

Chaque collection a sa propre page : titre, description, texte et photos à elle, pour que Google puisse
la référencer séparément (« photographe golf Vendée »...) et que les liens partagés aient leur propre aperçu.

Le gabarit (en-tête, menu, pied de page) est repris de about.html ; la visionneuse de gallery.html.
Les textes sont dans tools/photo_meta.py (COLLECTIONS) ; les adresses dans tools/site_config.py.

    python tools/optimize_images.py        # si de nouvelles photos
    python tools/build_gallery.py
    python tools/make_og_collections.py    # images de partage (si les photos mises en avant changent)
    python tools/build_collections.py
"""
import html
import json
import os
import re

import build_gallery as bg
import photo_meta as pm
import site_config as sc

PICKS = pm.PICKS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = sc.BASE_URL

TAGLINES = {"golf": "L'élégance du green", "portrait": "L'âme du regard", "danse": "La grâce du mouvement",
            "automobile": "Les lignes et la lumière", "nature": "La beauté du monde"}


def rd(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read().replace("\r\n", "\n")


def wr(name, text):
    with open(os.path.join(ROOT, name), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def esc(s):
    return html.escape(s, quote=True)


def load_manifest():
    with open(os.path.join(ROOT, "images", "web", "manifest.json"), encoding="utf-8") as f:
        return json.load(f)


def pick_for(col, manifest, by):
    """Photo mise en avant de la collection ; si elle a été retirée, la première photo de la collection."""
    for stem in PICKS.get(col["cat"], []):
        m = by.get((col["cat"], stem)) or by.get(("portrait", stem))
        if m:
            return m
    mine = bg.sort_cat(col["cat"], [x for x in manifest if x["cat"] == col["cat"]])
    return mine[0] if mine else None


def other_cards(current, manifest):
    by = {(m["cat"], m["stem"]): m for m in manifest}
    out = []
    n = 0
    for col in pm.COLLECTIONS:
        if col["slug"] == current["slug"]:
            continue
        m = pick_for(col, manifest, by)
        if m is None:                      # collection vide : pas de carte
            continue
        n += 1
        stem = m["stem"]
        src = f"images/web/{m['cat']}/{stem}_s.webp"
        count = sum(1 for x in manifest if x["cat"] == col["cat"])
        out.append(f'''                <a href="{col["slug"]}.html" class="card" data-cursor="Explorer">
                    <div class="card__img"><img src="{src}" width="{m["w"]}" height="{m["h"]}" alt="{esc(bg.alt_of(col["cat"], col["name"], m))}" loading="lazy" decoding="async"></div>
                    <span class="card__count">{count} photos</span>
                    <div class="card__body"><span class="card__num">0{n}</span><h3>{esc(col["name"])}</h3><p>{esc(TAGLINES[col["slug"]])}</p></div>
                </a>
''')
    return "".join(out)


def jsonld(col, photos, url, og):
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "CollectionPage", "@id": url + "#page", "url": url, "name": col["title"], "description": col["description"],
             "inLanguage": "fr-FR", "isPartOf": {"@id": f"{B}/#site"}, "about": {"@type": "Thing", "name": col["name"]},
             "primaryImageOfPage": {"@type": "ImageObject", "url": og}},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Accueil", "item": f"{B}/"},
                {"@type": "ListItem", "position": 2, "name": "Galerie", "item": f"{B}/gallery.html"},
                {"@type": "ListItem", "position": 3, "name": col["name"], "item": url}]},
            {"@type": "ImageGallery", "name": f"{col['name']} — MR VISUALS", "url": url, "image": [
                {"@type": "ImageObject", "contentUrl": f"{B}/images/web/{p['cat']}/{p['stem']}.webp",
                 "caption": bg.alt_of(col["cat"], col["name"], p), "creator": {"@type": "Person", "name": "Mathis Rouvreau"},
                 "creditText": "MR VISUALS", "copyrightNotice": "© MR VISUALS"} for p in photos[:12]]},
        ],
    }
    return '    <script type="application/ld+json">\n' + json.dumps(graph, ensure_ascii=False, indent=4).replace("\n", "\n    ") + "\n    </script>\n"


def build_page(col, template_head, template_foot, lightbox, manifest):
    photos = bg.sort_cat(col["cat"], [m for m in manifest if m["cat"] == col["cat"]])
    url = f"{B}/{col['slug']}.html"
    og = f"{B}/images/og/{col['slug']}.jpg"

    head = template_head
    head = re.sub(r"<title>.*?</title>", lambda m: f"<title>{esc(col['title'])}</title>", head, count=1, flags=re.S)
    head = re.sub(r'<meta name="description" content="[^"]*">', lambda m: f'<meta name="description" content="{esc(col["description"])}">', head, count=1)
    head = re.sub(r'<link rel="canonical" href="[^"]*">', lambda m: f'<link rel="canonical" href="{url}">', head, count=1)
    head = re.sub(r'<meta property="og:title" content="[^"]*">', lambda m: f'<meta property="og:title" content="{esc(col["name"])} — MR VISUALS">', head, count=1)
    head = re.sub(r'<meta property="og:description" content="[^"]*">', lambda m: f'<meta property="og:description" content="{esc(col["description"])}">', head, count=1)
    head = re.sub(r'<meta property="og:url" content="[^"]*">', lambda m: f'<meta property="og:url" content="{url}">', head, count=1)
    head = re.sub(r'<meta property="og:image" content="[^"]*">', lambda m: f'<meta property="og:image" content="{og}">', head, count=1)
    head = head.replace('<body class="page-about">', '<body class="page-collection">')
    head = head.replace('<li><a href="about.html" class="active" aria-current="page">À propos</a></li>', '<li><a href="about.html">À propos</a></li>')
    head = head.replace('<li><a href="gallery.html">Galerie</a></li>', '<li><a href="gallery.html" class="active" aria-current="page">Galerie</a></li>')
    assert 'page-collection' in head and 'aria-current="page">Galerie' in head, "gabarit about.html modifié : vérifier build_collections.py"
    head = head.replace("</head>", jsonld(col, photos, url, og) + "</head>")

    grid = "".join(bg.item_html(col["cat"], col["name"], p, priority=(i < 3)) for i, p in enumerate(photos))
    n = len(photos)
    intro = "\n".join(f"                        <p>{esc(t)}</p>" for t in col["intro"])
    body = f'''    <main id="main">

    <header class="page-header">
        <div class="container">
            <nav class="breadcrumb reveal-up" aria-label="Fil d'Ariane"><a href="index.html">Accueil</a><span aria-hidden="true">/</span><a href="gallery.html">Galerie</a><span aria-hidden="true">/</span><span aria-current="page">{esc(col["name"])}</span></nav>
            <span class="section-label reveal-up" style="--delay: 0.05s">Collection</span>
            <h1 class="page-header__title" data-split="chars" data-split-hero>{esc(col["name"])}</h1>
            <p class="page-header__lede reveal-up" style="--delay: 0.2s">{esc(col["lede"])}</p>
        </div>
    </header>

    <section class="collection-intro">
        <div class="container">
            <div class="collection-intro__grid">
                <div class="collection-intro__text">
{intro}
                    <div class="btn-row">
                        <a href="contact.html" class="btn btn--solid"><span>Me contacter</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
                        <a href="gallery.html" class="btn btn--ghost"><span>Toute la galerie</span></a>
                    </div>
                </div>
                <ul class="collection-intro__facts">
                    <li><b>{n}</b><span>photographie{"s" if n > 1 else ""}</span></li>
                    <li><b>{esc(sc.REGION)}</b><span>et Grand Ouest</span></li>
                </ul>
            </div>
        </div>
    </section>

    <section class="gallery">
        <div class="container">
            <div class="gallery__grid" id="galleryGrid">
{grid}            </div>
        </div>
    </section>

    <section class="more-collections">
        <div class="container">
            <span class="section-label">Autres collections</span>
            <div class="more-collections__grid">
{other_cards(col, manifest)}            </div>
        </div>
    </section>

    <section class="cta-band">
        <div class="container">
            <h2 class="cta-band__title" data-split="words">Un projet de {esc(col["name"].lower())}&nbsp;?<br><em>Parlons-en.</em></h2>
            <div class="btn-row">
                <a href="contact.html" class="btn btn--solid"><span>Me contacter</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
                <a href="{sc.INSTAGRAM}" target="_blank" rel="noopener" class="btn btn--ghost"><span>@mpict_rv12</span></a>
            </div>
        </div>
    </section>

'''
    foot = template_foot
    foot = foot.replace("    <!-- Footer -->", lightbox + "\n    <!-- Footer -->", 1)
    return head + body + foot


def build_sitemap(manifest):
    def entry(path, freq, prio, images=(), lastmod=None):
        out = f"    <url><loc>{B}/{path}</loc><lastmod>{lastmod or sc.LASTMOD}</lastmod><changefreq>{freq}</changefreq><priority>{prio}</priority>"
        for p in images:
            out += (f"\n        <image:image><image:loc>{B}/images/web/{p['cat']}/{p['stem']}.webp</image:loc>"
                    f"<image:caption>{esc(bg.alt_of(p['cat'], p['cat'], p))}</image:caption></image:image>")
        return out + ("\n    " if images else "") + "</url>"

    rows = [entry("", "monthly", "1.0"), entry("gallery.html", "weekly", "0.9", lastmod=sc.LASTMOD_GALLERY)]
    for col in pm.COLLECTIONS:
        photos = bg.sort_cat(col["cat"], [m for m in manifest if m["cat"] == col["cat"]])
        rows.append(entry(col["slug"] + ".html", "monthly", "0.8", photos[:8], lastmod=sc.LASTMOD_GALLERY))
    rows += [entry("about.html", "yearly", "0.6"), entry("contact.html", "yearly", "0.7"), entry("confidentialite.html", "yearly", "0.3"),
             entry("mentions-legales.html", "yearly", "0.2")]
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
           + "\n".join(rows) + "\n</urlset>\n")
    wr("sitemap.xml", xml)
    robots = f"User-agent: *\nAllow: /\n\nSitemap: {B}/sitemap.xml\n"
    wr("robots.txt", robots)


def main():
    manifest = load_manifest()
    about = rd("about.html")
    gallery = rd("gallery.html")
    head_end = about.index('    <main id="main">')
    foot_start = about.index("    </main>")
    template_head, template_foot = about[:head_end], about[foot_start:]
    lb_a = gallery.index("    <!-- Lightbox -->")
    lb_b = gallery.index("    <!-- Footer -->")
    lightbox = gallery[lb_a:lb_b].rstrip("\n") + "\n"

    for col in pm.COLLECTIONS:
        wr(col["slug"] + ".html", build_page(col, template_head, template_foot, lightbox, manifest))
        print(f"{col['slug']}.html")
    build_sitemap(manifest)
    print("sitemap.xml, robots.txt")


if __name__ == "__main__":
    main()
