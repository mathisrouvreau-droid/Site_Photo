# Outils MR VISUALS

Petits scripts pour préparer les images et fabriquer les vidéos du site.
À lancer **depuis la racine du site**. Il faut Python avec `pillow`, `numpy` et `opencv-python`, `ffmpeg`, et Node.js + Google Chrome (pour dessiner les textes des vidéos dans la typo du site).

## Ajouter ou retirer des photos depuis l'admin (sans ordinateur)

Page privée `admin.html`, onglet **Photos** (raccourci caché : triple-clic sur « © 2026 MR VISUALS » en bas de n'importe quelle page).

- **Ajouter** : choisir les photos, indiquer la collection et décrire ce qu'on voit (c'est le texte lu par Google Images). Elles sont réduites dans le navigateur (WebP, comme `optimize_images.py`) et passent en tête de leur collection.
- **Retirer** : cocher les photos puis « Retirer du site ». Une photo utilisée sur une page écrite à la main (accueil, À propos, Contact) est refusée : demander son remplacement par le code.
- **Décrire** : « Modifier la description » sous chaque photo.

Comment ça marche : l'admin enregistre les fichiers et la liste `images/web/manifest.json` dans GitHub (avec une clé personnelle à créer une seule fois, gardée uniquement dans le navigateur). Le robot `.github/workflows/reconstruire-galerie.yml` relance `build_gallery.py` et `build_collections.py`, met à jour les compteurs de l'accueil et de À propos, puis GitHub Pages publie : 1 à 3 minutes. Le robot enregistre aussi la date de dernière mise à jour dans `images/web/build-info.json`.

À savoir en travaillant sur l'ordinateur :
- **toujours faire `git pull` avant de modifier quoi que ce soit** : le robot et l'admin ajoutent des « sauvegardes » dans GitHub ;
- les photos ajoutées depuis l'admin n'ont pas d'original dans `images/<collection>/` : `optimize_images.py` les conserve (champ `"src": "admin"` du manifeste) ;
- une photo retirée depuis l'admin et qui avait un original est notée dans `images/web/removed.json` (le script ne la recrée pas). Pour la remettre : supprimer sa ligne dans ce fichier ;
- les descriptions se modifient dans l'admin (champ `alt` du manifeste, prioritaire sur `ALT` de `photo_meta.py`).

## Ajouter de nouvelles photos à la galerie (depuis l'ordinateur, pour les grosses modifications)

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

**Texte alternatif** : pour une nouvelle photo, ajouter une ligne dans `ALT` de `tools/photo_meta.py` (un texte court qui décrit ce qu'on voit : utile à Google Images et aux lecteurs d'écran). Une description saisie dans l'admin est prioritaire.

## Pages de collection et plan du site

Chaque collection (golf, portrait, danse, automobile, nature) a sa propre page pour être référencée séparément.
Les textes et titres se modifient dans `COLLECTIONS` de `tools/photo_meta.py`, puis :
```
python tools/make_og_collections.py   # images de partage (WhatsApp, LinkedIn...), si les photos mises en avant changent
python tools/build_collections.py     # pages + plan du site (sitemap.xml) + robots.txt
```

## Nom de domaine

Le site est en ligne sur **https://mrvisuals.fr** (nom de domaine OVH, DNS vers GitHub Pages, fichier `CNAME` à la racine du dépôt : ne pas le supprimer).
Pour changer un jour d'adresse, une seule commande met à jour toutes les adresses (pages, plan du site, données structurées) :
```
python tools/set_domain.py https://mrvisuals.fr https://nouvelle-adresse.fr
```
Pense ensuite à ajouter la nouvelle adresse dans `analytics/wrangler.toml` (`ALLOWED_ORIGINS`) puis `npx wrangler deploy` (sinon le compteur de visites ne reçoit plus rien), et à mettre à jour le fichier `CNAME`.
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
