-- MR VISUALS — base de la mesure d'audience (Cloudflare D1)
-- Aucune donnée personnelle : pas d'adresse IP, pas d'identifiant persistant.
-- "vid" est un hachage qui change chaque jour (IP + navigateur + secret + jour) : il sert uniquement
-- à compter les visiteurs d'une même journée, impossible à relier d'un jour à l'autre.

CREATE TABLE IF NOT EXISTS hits (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      INTEGER NOT NULL,        -- horodatage (secondes, UTC)
    day     TEXT    NOT NULL,        -- jour AAAA-MM-JJ (heure de Paris)
    hour    INTEGER NOT NULL,        -- heure 0-23 (heure de Paris)
    vid     TEXT    NOT NULL,        -- visiteur anonyme du jour
    type    TEXT    NOT NULL,        -- 'pv' (page vue) | 'ev' (action) | 'leave' (temps passé)
    name    TEXT,                    -- nom de l'action (type 'ev')
    path    TEXT,                    -- page, ex. '/gallery.html'
    ref     TEXT,                    -- source de la visite (Instagram, Google, Direct...) sur la 1re page
    entry   INTEGER NOT NULL DEFAULT 0, -- 1 = première page de la visite
    country TEXT,
    city    TEXT,
    device  TEXT,                    -- mobile | tablette | ordinateur
    browser TEXT,
    os      TEXT,
    prop    TEXT,                    -- détail de l'action (collection, photo, emplacement du clic...)
    ms      INTEGER                  -- temps passé visible (type 'leave')
);

CREATE INDEX IF NOT EXISTS idx_hits_day_type ON hits (day, type);
CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits (ts);
