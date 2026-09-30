// MR VISUALS — atlas de lettres pour les vidéos (typo du site : Cormorant Garamond + Outfit).
//
// Chrome charge les polices Google Fonts exactement comme le site, dessine chaque lettre
// dans un canvas, et on enregistre une planche PNG + les métriques (largeur, crénage).
// tools/textlib.py s'en sert ensuite pour composer et animer du texte dans les vidéos.
//
//     node tools/make_text_atlas.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'atlas');
mkdirSync(outDir, { recursive: true });

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const STYLES = {
  'cg':       { font: '300 260px "Cormorant Garamond"' },
  'cg-i':     { font: 'italic 300 260px "Cormorant Garamond"' },
  'cg-ir':    { font: 'italic 400 260px "Cormorant Garamond"' },
  'of-l':     { font: '300 100px Outfit' },
  'of':       { font: '400 100px Outfit' },
  'of-m':     { font: '500 100px Outfit' },
};
const CHARS = Array.from(' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'
  + 'ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒàâäçéèêëîïôöùûüœ’‘“”«»–—…·•×°ƒ→↗✦●');

const port = 9300 + Math.floor(Math.random() * 500);
const udir = mkdtempSync(join(tmpdir(), 'atlas-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${udir}`,
  '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let targets;
for (let i = 0; i < 80; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.find(t => t.type === 'page')) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'https://fonts.googleapis.com/robots.txt' }); // origine https pour charger les polices
await sleep(1500);

await ev(`new Promise((res, rej) => {
  const l = document.createElement('link'); l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Outfit:wght@300;400;500&display=swap';
  l.onload = res; l.onerror = () => rej('css'); document.head.appendChild(l);
})`);

const pageFn = `
async function build(styles, chars) {
  const result = {};
  for (const [name, s] of Object.entries(styles)) {
    await document.fonts.load(s.font, 'Aa');
    if (!document.fonts.check(s.font)) throw new Error('police indisponible : ' + s.font);
    const size = parseFloat(s.font.match(/(\\d+)px/)[1]);
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = s.font; meas.fontKerning = 'none';
    const adv = {};
    chars.forEach(ch => { adv[ch] = meas.measureText(ch).width; });
    const m0 = meas.measureText('Hg');
    const asc = Math.ceil(m0.fontBoundingBoxAscent), desc = Math.ceil(m0.fontBoundingBoxDescent);
    const pad = Math.ceil(size * 0.12), cellH = asc + desc + pad * 2;
    // crénage : écart entre la largeur de la paire (avec crénage) et la somme des largeurs seules
    const km = document.createElement('canvas').getContext('2d');
    km.font = s.font; km.fontKerning = 'normal';
    const kern = {};
    for (const a of chars) for (const b of chars) {
      if (a === ' ' || b === ' ') continue;
      const k = km.measureText(a + b).width - adv[a] - adv[b];
      if (Math.abs(k) > size * 0.004) kern[a + b] = +(k / size).toFixed(4);
    }
    // planche : glyphes alignés en lignes de 4096 px max
    const cells = []; let x = 0, y = 0;
    for (const ch of chars) {
      const w = Math.ceil(adv[ch]) + pad * 2;
      if (x + w > 4096) { x = 0; y += cellH; }
      cells.push({ ch, x, y, w }); x += w;
    }
    const sheet = document.createElement('canvas'); sheet.width = 4096; sheet.height = y + cellH;
    const g = sheet.getContext('2d'); g.font = s.font; g.fontKerning = 'none'; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    cells.forEach(c => g.fillText(c.ch, c.x + pad, c.y + pad + asc));
    result[name] = {
      png: sheet.toDataURL('image/png').split(',')[1], size, pad, asc, desc, cellH,
      glyphs: Object.fromEntries(cells.map(c => [c.ch, { x: c.x, y: c.y, w: c.w, adv: adv[c.ch] / size }])),
      kern,
    };
  }
  return result;
}
`;
await ev(pageFn + '; 0');
const data = await ev(`build(${JSON.stringify(STYLES)}, ${JSON.stringify(CHARS)}).then(r => JSON.stringify(r))`);
const styles = JSON.parse(data);

const meta = {};
for (const [name, s] of Object.entries(styles)) {
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(s.png, 'base64'));
  const { png, ...rest } = s;
  meta[name] = rest;
  console.log(name.padEnd(7), `${Object.keys(rest.glyphs).length} glyphes, ${Object.keys(rest.kern).length} paires de crénage`);
}
writeFileSync(join(outDir, 'atlas.json'), JSON.stringify(meta));
ws.close(); proc.kill();
process.exit(0);
