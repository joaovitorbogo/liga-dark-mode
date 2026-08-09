// Mede a luminancia media das imagens usadas como background no CSS do
// ligamagic.
//
// Superficie clara desenhada em PNG nao e cor: nenhum remapeamento alcanca, e o
// texto -- que clareamos -- some em cima. As texturas do calendario jQuery UI
// (ui-bg_glass_65_ffffff) sao o caso classico. Para saber quais precisam de
// tratamento sem chutar, decodificamos cada imagem num canvas e medimos.
//
// Uso: node scripts/measure-bg-images.mjs   (depois de fetch-css)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pp from 'puppeteer-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '.cache', 'css');
const MANIFEST = path.join(ROOT, '.cache', 'css-manifest.json');
const OUT = path.join(ROOT, '.cache', 'bg-luminance.json');

const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// url() e relativa a pasta do bundle, nao a da pagina: resolvemos com a base
// que o fetch guardou para cada arquivo.
const urls = new Set();
for (const { nome, base } of manifest) {
  const p = path.join(SRC, nome);
  if (!fs.existsSync(p)) continue;
  const css = fs.readFileSync(p, 'utf8');
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+?\.(?:png|jpe?g|gif|webp|svg))['"]?\s*\)/gi)) {
    const alvo = m[1].trim();
    if (/^data:/i.test(alvo)) continue;
    try { urls.add(new URL(alvo, base).href); } catch { /* url malformada no minificado */ }
  }
}
const list = [...urls].sort();
console.log(`${list.length} imagens a medir`);

const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
// Medir do proprio dominio das imagens evita o canvas "tainted" pelo CORS --
// getImageData lancaria SecurityError em toda imagem se a origem fosse outra.
await p.goto('https://www.lmcorp.com.br/arquivos/', { waitUntil: 'domcontentloaded' }).catch(() => {});

const result = await p.evaluate(async (files) => {
  const out = {};
  for (const f of files) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = f;
      await img.decode();
      const w = Math.min(img.naturalWidth, 96) || 1;
      const h = Math.min(img.naturalHeight, 96) || 1;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        if (a < 0.35) continue;                      // pixel transparente nao conta
        sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        n++;
      }
      out[f] = n ? +(sum / n).toFixed(4) : null;
    } catch (e) {
      out[f] = null;
    }
  }
  return out;
}, list);

await b.close();
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));

const vals = Object.entries(result).filter(([, v]) => v !== null).sort((a, b2) => b2[1] - a[1]);
console.log(`medidas: ${vals.length} | falhas: ${list.length - vals.length}`);
console.log('mais claras:');
vals.slice(0, 15).forEach(([k, v]) => console.log(`  ${v.toFixed(3)}  ${k.replace('https://www.lmcorp.com.br/arquivos/', '')}`));
console.log(`saida: ${path.relative(ROOT, OUT)}`);
