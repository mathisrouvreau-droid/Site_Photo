/**
 * MR VISUALS — mesure d'audience anonyme (Cloudflare Worker + base D1).
 *
 *   POST /collect     reçoit les visites et actions envoyées par js/analytics.js
 *   GET  /api/ping    vérifie le mot de passe (page admin)
 *   GET  /api/stats   statistiques agrégées pour admin.html (mot de passe requis)
 *
 * Respect de la vie privée : pas de cookie, pas d'adresse IP stockée, pas d'identifiant persistant.
 * Le « visiteur » est un hachage (IP + navigateur + jour + secret) qui change tous les jours.
 */

const ALLOWED_EVENTS = new Set([
    'click_instagram', 'click_linkedin', 'click_email', 'contact_start', 'contact_submit',
    'reel_view', 'gallery_filter', 'gallery_open', 'swing_done',
]);

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|discord|slack|curl|wget|python-requests|node-fetch|axios|go-http|java\//i;

const REFERRERS = [
    [/(^|\.)instagram\.com$/, 'Instagram'],
    [/(^|\.)google\./, 'Google'],
    [/(^|\.)bing\.com$/, 'Bing'],
    [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
    [/(^|\.)ecosia\.org$/, 'Ecosia'],
    [/(^|\.)qwant\.com$/, 'Qwant'],
    [/(^|\.)yahoo\./, 'Yahoo'],
    [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'LinkedIn'],
    [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, 'Facebook'],
    [/(^|\.)t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'X / Twitter'],
    [/(^|\.)tiktok\.com$/, 'TikTok'],
    [/(^|\.)pinterest\./, 'Pinterest'],
    [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'],
    [/(^|\.)snapchat\.com$/, 'Snapchat'],
    [/(^|\.)github\.com$|(^|\.)github\.io$/, 'GitHub'],
];

const UTM_NAMES = {
    ig: 'Instagram', instagram: 'Instagram', fb: 'Facebook', facebook: 'Facebook', linkedin: 'LinkedIn',
    tiktok: 'TikTok', google: 'Google', newsletter: 'Email', mail: 'Email', email: 'Email', qr: 'QR code',
};

const enc = new TextEncoder();
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });

// petits compteurs en mémoire (par instance du Worker) : limite les abus, sans état persistant
const hitBuckets = new Map();
const authFails = new Map();

export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);
        const cors = corsFor(req, env);

        if (req.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors.headers });
        }
        try {
            if (url.pathname === '/collect' && req.method === 'POST') return await collect(req, env, ctx, cors);
            if (url.pathname === '/api/ping' && req.method === 'GET') {
                const denied = await requireAdmin(req, env, cors);
                return denied || json({ ok: true }, 200, cors);
            }
            if (url.pathname === '/api/stats' && req.method === 'GET') {
                const denied = await requireAdmin(req, env, cors);
                return denied || await stats(env, url, cors);
            }
            return new Response('MR VISUALS — mesure d\'audience', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        } catch (err) {
            console.error('worker error', err && err.stack || err);
            return json({ error: 'server' }, 500, cors);
        }
    },

    // nettoyage quotidien : on ne garde que ~26 mois d'historique
    async scheduled(_event, env, ctx) {
        const limit = Math.floor(Date.now() / 1000) - 800 * 86400;
        ctx.waitUntil(env.DB.prepare('DELETE FROM hits WHERE ts < ?1').bind(limit).run());
    },
};

/* ------------------------------------------------------------------ utilitaires */
function corsFor(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const ok = !!origin && allowed.includes(origin);
    const headers = { 'Vary': 'Origin' };
    if (ok) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
        headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        headers['Access-Control-Max-Age'] = '86400';
    }
    return { ok, headers };
}

function json(data, status, cors) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors.headers },
    });
}

async function sha256(text) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmacHex(secret, data) {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
    return Array.from(sig, b => b.toString(16).padStart(2, '0')).join('');
}

async function safeEqual(a, b) {
    const [ha, hb] = await Promise.all([sha256(String(a)), sha256(String(b))]);
    let diff = 0;
    for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
    return diff === 0;
}

function parisParts(ms) {
    const d = new Date(ms);
    return { day: dayFmt.format(d), hour: parseInt(hourFmt.format(d), 10) % 24 };
}

function addDays(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ collecte */
function cleanPath(p) {
    let path = String(p || '/').split('?')[0].split('#')[0].slice(0, 120);
    if (!path.startsWith('/')) path = '/' + path;
    path = path.replace(/^\/Site_Photo(?=\/|$)/, '') || '/';
    path = path.replace(/\/index\.html$/, '/');
    return path || '/';
}

function cleanProp(p) {
    if (p == null) return null;
    const s = String(p).replace(/[^\w\s./\-+éèêëàâäîïôöùûüç']/gi, '').trim().slice(0, 80);
    return s || null;
}

function parseUA(ua) {
    const mobile = /Mobi|iPhone|iPod|Android.*Mobile/i.test(ua);
    const tablet = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua);
    const device = tablet ? 'tablette' : mobile ? 'mobile' : 'ordinateur';
    let browser = 'Autre';
    if (/Instagram/i.test(ua)) browser = 'Instagram (appli)';
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) browser = 'Facebook (appli)';
    else if (/LinkedInApp/i.test(ua)) browser = 'LinkedIn (appli)';
    else if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) browser = 'TikTok (appli)';
    else if (/Snapchat/i.test(ua)) browser = 'Snapchat (appli)';
    else if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
    else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
    else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
    else if (/CriOS|Chrome/.test(ua)) browser = 'Chrome';
    else if (/Safari/.test(ua)) browser = 'Safari';
    let os = 'Autre';
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/Linux|X11/.test(ua)) os = 'Linux';
    return { device, browser, os };
}

function sourceOf(refUrl, utm, ua) {
    if (utm) {
        const u = String(utm).toLowerCase().slice(0, 40);
        return UTM_NAMES[u] || (u.charAt(0).toUpperCase() + u.slice(1));
    }
    if (refUrl) {
        try {
            const host = new URL(refUrl).hostname.replace(/^www\./, '');
            for (const [re, name] of REFERRERS) if (re.test(host)) return name;
            return host.slice(0, 60);
        } catch { /* référent invalide : on regarde le navigateur */ }
    }
    // dans les applis (Instagram, TikTok...) le référent est supprimé : on le déduit du navigateur intégré
    if (/Instagram/i.test(ua)) return 'Instagram';
    if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
    if (/LinkedInApp/i.test(ua)) return 'LinkedIn';
    if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return 'TikTok';
    if (/Snapchat/i.test(ua)) return 'Snapchat';
    return 'Direct';
}

async function collect(req, env, ctx, cors) {
    const silent = () => new Response(null, { status: 204, headers: cors.headers });
    if (!cors.ok) return silent();                       // ne compte que les visites venant de ton site

    const ua = req.headers.get('User-Agent') || '';
    if (!ua || BOT_RE.test(ua)) return silent();

    const raw = await req.text();
    if (!raw || raw.length > 2000) return silent();
    let d;
    try { d = JSON.parse(raw); } catch { return silent(); }

    const type = d.t;
    if (type !== 'pv' && type !== 'ev' && type !== 'leave') return silent();
    if (type === 'ev' && !ALLOWED_EVENTS.has(d.n)) return silent();

    const now = Date.now();
    const { day, hour } = parisParts(now);
    const ip = req.headers.get('CF-Connecting-IP') || '';
    const vid = (await hmacHex(env.HASH_SECRET || 'dev-secret', `${day}|${ip}|${ua}`)).slice(0, 16);

    // limite : 120 enregistrements / minute / visiteur
    const minute = Math.floor(now / 60000);
    const b = hitBuckets.get(vid);
    if (b && b.m === minute) { if (++b.n > 120) return silent(); } else hitBuckets.set(vid, { m: minute, n: 1 });
    if (hitBuckets.size > 5000) hitBuckets.clear();

    const path = cleanPath(d.p);
    const cf = req.cf || {};
    const { device, browser, os } = parseUA(ua);
    const entry = type === 'pv' && d.e === 1 ? 1 : 0;
    const ref = entry ? sourceOf(d.r, d.u, ua) : null;
    const name = type === 'ev' ? d.n : null;
    const prop = type === 'ev' ? cleanProp(d.x) : null;
    let ms = null;
    if (type === 'leave') {
        ms = Math.max(0, Math.min(Math.round(Number(d.ms) || 0), 1800000));
        if (ms < 500) return silent();
    }

    ctx.waitUntil(
        env.DB.prepare(
            'INSERT INTO hits (ts, day, hour, vid, type, name, path, ref, entry, country, city, device, browser, os, prop, ms) ' +
            'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)'
        ).bind(
            Math.floor(now / 1000), day, hour, vid, type, name, path, ref, entry,
            cf.country || null, cf.city ? String(cf.city).slice(0, 60) : null, device, browser, os, prop, ms
        ).run().catch(err => console.error('insert', err))
    );
    return silent();
}

/* ------------------------------------------------------------------ authentification */
async function requireAdmin(req, env, cors) {
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const f = authFails.get(ip);
    if (f && f.n >= 8 && Date.now() - f.t < 10 * 60 * 1000) {
        return json({ error: 'trop_de_tentatives' }, 429, cors);
    }
    const header = req.headers.get('Authorization') || '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    const expected = env.ADMIN_PASSWORD || '';
    if (!expected || !given || !(await safeEqual(given, expected))) {
        authFails.set(ip, { n: (f && Date.now() - f.t < 10 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() });
        await new Promise(r => setTimeout(r, 500));
        return json({ error: 'mot_de_passe' }, 401, cors);
    }
    authFails.delete(ip);
    return null;
}

/* ------------------------------------------------------------------ statistiques */
async function stats(env, url, cors) {
    const range = ['1', '7', '30', '90', '365'].includes(url.searchParams.get('range')) ? Number(url.searchParams.get('range')) : 30;
    const nowMs = Date.now();
    const today = parisParts(nowMs).day;
    const from = addDays(today, -(range - 1));
    const pto = addDays(from, -1);
    const pfrom = addDays(pto, -(range - 1));
    const cur = [from, today];
    const prev = [pfrom, pto];
    const DB = env.DB;
    const q = (sql, params) => DB.prepare(sql).bind(...params);

    const totalsSql = `SELECT
            COALESCE(SUM(CASE WHEN type='pv' THEN 1 ELSE 0 END), 0) AS pageviews,
            COUNT(DISTINCT CASE WHEN type='pv' THEN day || vid END) AS visitors,
            COALESCE(SUM(CASE WHEN type='ev' AND name IN ('click_instagram','click_linkedin','click_email','contact_submit') THEN 1 ELSE 0 END), 0) AS actions
        FROM hits WHERE day BETWEEN ?1 AND ?2`;
    const visitsSql = `SELECT COUNT(*) AS visits,
            COALESCE(SUM(CASE WHEN pv <= 1 AND ev = 0 THEN 1 ELSE 0 END), 0) AS bounces,
            AVG(CASE WHEN ms > 0 THEN ms END) AS avg_ms
        FROM (SELECT day, vid, SUM(type='pv') AS pv, SUM(type='ev') AS ev,
                     SUM(CASE WHEN type='leave' THEN ms ELSE 0 END) AS ms
              FROM hits WHERE day BETWEEN ?1 AND ?2 GROUP BY day, vid)
        WHERE pv >= 1`;
    const distinct = (col, extra = '') => `SELECT ${col} AS label, COUNT(DISTINCT day || vid) AS visitors
        FROM hits WHERE type='pv' ${extra} AND ${col} IS NOT NULL AND day BETWEEN ?1 AND ?2
        GROUP BY ${col} ORDER BY visitors DESC, label LIMIT 12`;

    const stmts = [
        q(totalsSql, cur),                                                                   // 0
        q(totalsSql, prev),                                                                  // 1
        q(visitsSql, cur),                                                                   // 2
        q(visitsSql, prev),                                                                  // 3
        q(`SELECT day, SUM(CASE WHEN type='pv' THEN 1 ELSE 0 END) AS pageviews,
                  COUNT(DISTINCT CASE WHEN type='pv' THEN vid END) AS visitors
           FROM hits WHERE day BETWEEN ?1 AND ?2 GROUP BY day ORDER BY day`, cur),           // 4
        q(`SELECT hour, COUNT(*) AS pageviews FROM hits WHERE type='pv' AND day BETWEEN ?1 AND ?2
           GROUP BY hour ORDER BY hour`, cur),                                               // 5
        q(`SELECT path, COUNT(*) AS views, COUNT(DISTINCT day || vid) AS visitors
           FROM hits WHERE type='pv' AND day BETWEEN ?1 AND ?2
           GROUP BY path ORDER BY views DESC LIMIT 12`, cur),                                // 6
        q(`SELECT path, AVG(ms) AS avg_ms FROM hits WHERE type='leave' AND day BETWEEN ?1 AND ?2
           GROUP BY path`, cur),                                                             // 7
        q(distinct('ref', "AND entry=1"), cur),                                              // 8
        q(distinct('country'), cur),                                                         // 9
        q(`SELECT city AS label, country, COUNT(DISTINCT day || vid) AS visitors
           FROM hits WHERE type='pv' AND city IS NOT NULL AND day BETWEEN ?1 AND ?2
           GROUP BY city, country ORDER BY visitors DESC, label LIMIT 12`, cur),             // 10
        q(distinct('device'), cur),                                                          // 11
        q(distinct('browser'), cur),                                                         // 12
        q(distinct('os'), cur),                                                              // 13
        q(`SELECT name, COUNT(*) AS total, COUNT(DISTINCT day || vid) AS people
           FROM hits WHERE type='ev' AND day BETWEEN ?1 AND ?2 GROUP BY name`, cur),         // 14
        q(`SELECT name, prop, COUNT(*) AS total FROM hits
           WHERE type='ev' AND prop IS NOT NULL AND day BETWEEN ?1 AND ?2
             AND name IN ('gallery_filter','gallery_open','click_instagram','click_email','click_linkedin','contact_submit')
           GROUP BY name, prop ORDER BY total DESC LIMIT 120`, cur),                         // 15
        q(`SELECT COUNT(DISTINCT vid) AS n FROM hits WHERE ts > ?1`, [Math.floor(nowMs / 1000) - 300]), // 16
        q(`SELECT ts, type, name, path, prop, ref, entry, country, city, device FROM hits
           WHERE type IN ('pv','ev') ORDER BY ts DESC LIMIT 25`, []),                       // 17
        q(`SELECT MIN(ts) AS first_ts, COUNT(*) AS rows FROM hits`, []),                     // 18
    ];
    const res = await DB.batch(stmts);
    const r = (i) => res[i].results || [];
    const first = (i) => r(i)[0] || {};

    const avgMap = Object.fromEntries(r(7).map(x => [x.path, Math.round(x.avg_ms || 0)]));

    return json({
        range, from, to: today, prevFrom: pfrom, prevTo: pto, now: Math.floor(nowMs / 1000),
        live: first(16).n || 0,
        since: first(18).first_ts || null,
        totals: { current: { ...first(0), ...first(2) }, previous: { ...first(1), ...first(3) } },
        series: r(4),
        hours: r(5),
        pages: r(6).map(p => ({ ...p, avg_ms: avgMap[p.path] || 0 })),
        sources: r(8),
        countries: r(9),
        cities: r(10),
        devices: r(11),
        browsers: r(12),
        systems: r(13),
        events: r(14),
        props: r(15),
        recent: r(17),
    }, 200, cors);
}
