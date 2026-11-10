"""
MR VISUALS — réglages communs aux scripts qui fabriquent des pages.

BASE_URL : adresse publique du site (sans « / » final). Elle sert aux balises canonical, Open Graph,
plan du site et données structurées. Au passage sur le nom de domaine :
    1. changer BASE_URL ci-dessous
    2. python tools/set_domain.py <ancienne adresse> <nouvelle adresse>   (pages écrites à la main)
    3. python tools/build_collections.py ; python tools/build_gallery.py
"""
BASE_URL = "https://mrvisuals.fr"
SITE_NAME = "MR VISUALS"
LOCALITY = "Mortagne-sur-Sèvre"
REGION = "Vendée"
INSTAGRAM = "https://www.instagram.com/mpict_rv12/"
LINKEDIN = "https://www.linkedin.com/in/mathis-rouvreau-aa6096305/"
EMAIL = "mathis.rouvreau@gmail.com"
LASTMOD = "2026-11-10"
