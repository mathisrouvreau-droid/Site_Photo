# Mesure d'audience de MR VISUALS

Un petit compteur **anonyme** (sans cookie, sans adresse IP conservée) et une page **`admin.html`** pour lire les chiffres.
Il tourne gratuitement sur Cloudflare (un « Worker » + une petite base D1), pas sur GitHub Pages.

```
visiteur ──► js/analytics.js ──► Worker Cloudflare ──► base D1
                                       ▲
              admin.html (mot de passe) ┘
```

## Ce que tu vois dans admin.html
Visiteurs, pages vues, durée, rebond (avec l'évolution par rapport à la période d'avant), graphique, provenance
(Instagram, Google…), pays et villes, pages et collections les plus vues, photos les plus ouvertes, appareils,
heures de visite, clics Instagram / LinkedIn / e-mail, messages envoyés, lectures du reel et activité récente en direct.

Les visiteurs sont comptés **par jour** (une même personne revenant demain compte de nouveau) : c'est le prix de l'anonymat.

## Mise en place (une seule fois)
Il faut Node.js et un compte Cloudflare gratuit (https://dash.cloudflare.com/sign-up).

```bash
cd analytics
npm install
npx wrangler login                     # ouvre le navigateur : « Allow »
npx wrangler d1 create mrvisuals-stats # note le database_id affiché -> wrangler.toml
npx wrangler d1 execute DB --remote --file=schema.sql
npx wrangler secret put ADMIN_PASSWORD # ton mot de passe de la page admin
npx wrangler secret put HASH_SECRET    # une longue phrase au hasard (jamais à retenir)
npx wrangler deploy                    # affiche l'adresse https://mrvisuals-stats.XXX.workers.dev
```

Puis colle cette adresse dans `js/config.js` (à la place de `https://REMPLACER.workers.dev`), commit, push.
Ouvre ensuite `https://mathisrouvreau-droid.github.io/Site_Photo/admin.html`.

## Au quotidien
- **Changer le mot de passe** : `cd analytics` puis `npx wrangler secret put ADMIN_PASSWORD`.
- **Ne pas compter tes propres visites** : c'est automatique après ta première connexion à admin.html
  (interrupteur en bas de la page, appareil par appareil).
- **Nom de domaine** : si le site change d'adresse, ajoute-la dans `wrangler.toml` (`ALLOWED_ORIGINS`) puis `npx wrangler deploy`.
- **Tout effacer** : `npx wrangler d1 execute DB --remote --command "DELETE FROM hits"`.
- **Arrêter le comptage** : remets `REMPLACER` dans l'adresse de `js/config.js` (plus aucune mesure n'est envoyée).

## Tester en local (sans compte)
```bash
cd analytics
printf 'ADMIN_PASSWORD=essai\nHASH_SECRET=test\nALLOWED_ORIGINS=http://127.0.0.1:3000\n' > .dev.vars
npm run db:local
npm run dev                    # Worker sur http://localhost:8787
# dans un autre terminal, à la racine du site :
python tools/serve_local.py    # puis http://127.0.0.1:3000/admin.html (mot de passe : essai)
```
En local, `js/config.js` envoie déjà les visites au Worker local.

**Ne lance jamais `python -m http.server` à la racine du site** : il mettrait en ligne, pour tout le réseau local, le fichier `analytics/MOT-DE-PASSE.txt`. `tools/serve_local.py` ne répond que sur ton ordinateur et refuse ces fichiers.

## Vie privée
- Pas de cookie, rien d'enregistré dans le navigateur du visiteur.
- Le serveur lit l'adresse IP un instant (pour deviner pays / ville et fabriquer une empreinte), **sans jamais la stocker**.
  L'empreinte change chaque jour : impossible de suivre quelqu'un d'un jour à l'autre.
- Le signal « Ne pas me suivre » (DNT) et Global Privacy Control sont respectés.
- Les données sont supprimées automatiquement après 25 mois (le maximum admis par la CNIL sans consentement).
- La page `confidentialite.html` explique tout cela aux visiteurs.

## Fichiers
| Fichier | Rôle |
|---|---|
| `worker.js` | reçoit les visites (`/collect`), sert les chiffres (`/api/stats`, mot de passe requis) |
| `schema.sql` | table de la base |
| `wrangler.toml` | configuration Cloudflare |
| `../js/analytics.js` | le compteur côté site |
| `../js/config.js` | adresse du Worker |
| `../admin.html`, `../js/admin.js`, `../css/admin.css` | la page admin |
