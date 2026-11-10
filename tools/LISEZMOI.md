# Outils MR VISUALS

Petits scripts pour préparer les images et fabriquer les vidéos du site.
À lancer **depuis la racine du site**. Il faut Python avec `pillow`, `numpy` et `opencv-python`, `ffmpeg`, et Node.js + Google Chrome (pour dessiner les textes des vidéos dans la typo du site).

## Ajouter de nouvelles photos à la galerie

1. Déposer les originaux dans `images/<collection>/` (`golf`, `portrait`, `danse`, `voiture`, `nature`).
2. Générer les versions web légères (WebP) :
   ```
   python tools/optimize_images.py
   ```
3. Reconstruire la grille de `gallery.html` (les compteurs des filtres se mettent à jour) :
   ```
   python tools/build_gallery.py
   ```

Pour choisir l'ordre d'une série, modifier `GOLDEN_ORDER` en haut de `tools/build_gallery.py`.

**Texte alternatif** : pour une nouvelle photo, ajouter une ligne dans `ALT` de `tools/photo_meta.py` (un texte court qui décrit ce qu'on voit : utile à Google Images et aux lecteurs d'écran).

## Pages de collection et plan du site

Chaque collection (golf, portrait, danse, automobile, nature) a sa propre page pour être référencée séparément.
Les textes et titres se modifient dans `COLLECTIONS` de `tools/photo_meta.py`, puis :
```
python tools/make_og_collections.py   # images de partage (WhatsApp, LinkedIn...), si les photos mises en avant changent
python tools/build_collections.py     # pages + plan du site (sitemap.xml) + robots.txt
```

## Nom de domaine

Pour passer du lien github.io à un nom de domaine, une seule commande met à jour toutes les adresses (pages, plan du site, données structurées) :
```
python tools/set_domain.py https://mathisrouvreau-droid.github.io/Site_Photo https://mrvisuals.fr
```
Pense ensuite à ajouter le nouveau domaine dans `analytics/wrangler.toml` (`ALLOWED_ORIGINS`) puis `npx wrangler deploy` (sinon le compteur de visites ne reçoit plus rien).
Les nombres de photos affichés à la main sur l'accueil et la page À propos (39, 6, 3, 2, 9) sont à mettre à jour si besoin.

## Vidéos

| Script | Produit | Utilisé pour |
|---|---|---|
| `python tools/make_hero.py` | `videos/hero.mp4` (16:9, boucle) | fond du hero, ordinateurs |
| `python tools/make_hero.py --mobile` | `videos/hero-mobile.mp4` (9:16) | fond du hero, téléphones |
| `python tools/make_reel.py` | `instagram/reel-golden-hour.mp4` + `…-cover.jpg`, `videos/reel.mp4` | reel Instagram + version légère du site |

Ajouter `--preview` à n'importe lequel pour obtenir seulement une planche-contact (rapide) dans `tools/_preview_*.jpg`.

Les scènes se règlent directement dans les scripts :
- `make_hero.py` → `build_scenes()` (3 photos par scène, dérive, ordre) et `_reveal()` (le changement de scène en volet doré)
- `make_reel.py` → `build_shots()` (photos, durée, zoom, transition de chaque plan), `SUBJECT` (où le collimateur d'autofocus se verrouille), `CAPTIONS`. Montage calé sur 120 BPM (une coupe toutes les 0,5 s). Les réglages affichés (ouverture, vitesse, ISO, focale) sont lus dans l'EXIF de chaque photo.

Si le nombre ou l'ordre des scènes du hero change, mettre à jour `SCENES`, `LOOP`, `STEP` dans `js/motion.js` (l'étiquette « 01 — Portrait » suit la vidéo).

## Motion design (briques)

- `python tools/make_text_atlas.mjs` : Chrome dessine les lettres (Cormorant Garamond + Outfit) dans `tools/atlas/`. À refaire seulement si on change de police.
- `textlib.py` : texte animé lettre par lettre dans les vidéos (crénage, masque de montée, espacement animé).
- `motion.py` : viseur / collimateur, transitions (volet, zoom-punch, diaphragme, poussée), flou de mise au point, halo de lumière, lecture EXIF.
- `python tools/make_swing_frames.py` : aligne les 4 photos du swing et les enregistre pour la section « Le geste » du site.
- `video_lib.py` : outils de montage partagés (caméra, alignement, export ffmpeg).

## Marque

- `python tools/make_brand.py` : refait le logo blanc/doré détouré, le favicon et l'image de partage `images/og.jpg` à partir de `images/logo.png`.
