# Outils MR VISUALS

Petits scripts Python pour préparer les images et fabriquer les vidéos du site.
À lancer **depuis la racine du site**. Il faut Python avec `pillow`, `numpy` et `opencv-python`, et `ffmpeg` installé.

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
Les nombres de photos affichés à la main sur l'accueil et la page À propos (39, 6, 3, 2, 9) sont à mettre à jour si besoin.

## Vidéos

| Script | Produit | Utilisé pour |
|---|---|---|
| `python tools/make_hero.py` | `videos/hero.mp4` (16:9, boucle) | fond du hero, ordinateurs |
| `python tools/make_hero.py --mobile` | `videos/hero-mobile.mp4` (9:16) | fond du hero, téléphones |
| `python tools/make_reel.py` | `instagram/reel-golden-hour.mp4` + `…-cover.jpg`, `videos/reel.mp4` | reel Instagram + version légère du site |

Ajouter `--preview` à n'importe lequel pour obtenir seulement une planche-contact (rapide) dans `tools/_preview_*.jpg`.

Les scènes se règlent directement dans les scripts :
- `make_hero.py` → fonction `build_scenes()` (3 photos par scène, dérive, ordre)
- `make_reel.py` → `build_shots()` (liste des photos, durée, zoom) — montage calé sur 120 BPM (une coupe toutes les 0,5 s)

## Autres

- `python tools/make_brand.py` : refait le logo blanc/doré détouré, le favicon et l'image de partage `images/og.jpg` à partir de `images/logo.png`.
- `video_lib.py` : outils de montage partagés (mouvement de caméra, alignement des photos, texte, export ffmpeg).
