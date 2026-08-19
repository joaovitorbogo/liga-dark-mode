// Confere que a cor de marca de cada site sobreviveu ao tema.
//
// Existe por causa de um bug real: os sites definem as MESMAS custom properties
// (--color-bg-menu, --color-primary...) com valores diferentes, cada um no seu
// bundle tcg_N. O gerador montava uma tabela de variaveis unica e global, entao
// a ultima definicao lida vencia e era gravada no arquivo do NUCLEO -- que e
// injetado nos 15 hosts. A barra de menu do LigaMagic saiu azul do mundofunko.
//
// O teste le a cor de marca que cada site declara no proprio CSS de origem e
// compara a MATIZ com a que a extensao efetivamente aplica na barra de menu,
// resolvendo a pilha de arquivos daquele host na ordem do cascade.
//
// Uso: node scripts/test-marca.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from './sites.mjs';
import { pilhaDe } from './pilha.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const MANIFEST = path.join(CACHE, 'css-manifest.json');

if (!fs.existsSync(MANIFEST)) {
  console.log('sem .cache/css-manifest.json — rode `npm run fetch` antes. Pulando.');
  process.exit(0);
}

// A superficie de marca mais visivel e a barra de menu. O seletor vem do bundle
// do nucleo e o valor de var(--color-bg-menu) muda por site.
const SELETOR = '.container-main-menu';
const VAR_MARCA = '--color-bg-menu';

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const hex2hsl = (hex) => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? [...h].map(c => parseInt(c + c, 16))
                           : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = n.map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hu = 0;
  if (d) {
    if (mx === r) hu = ((g - b) / d) % 6;
    else if (mx === g) hu = (b - r) / d + 2;
    else hu = (r - g) / d + 4;
    hu *= 60; if (hu < 0) hu += 360;
  }
  const l = (mx + mn) / 2;
  return [hu, d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l];
};

/** A cor que o SITE declara para a marca, lida do CSS de origem dele. */
function marcaDeclarada(site) {
  // Ordem do manifesto = ordem de carga: a ultima definicao visivel ao host
  // vence, igual ao cascade do navegador.
  const visiveis = new Set(['theme', `home-${site.home}`, `site-${site.id}`]);
  let valor = null;
  for (const m of manifest) {
    if (!visiveis.has(m.bucket)) continue;
    const css = fs.readFileSync(path.join(CACHE, 'css', m.nome), 'utf8');
    for (const blk of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
      for (const d of blk[1].matchAll(new RegExp(`${VAR_MARCA}\\s*:\\s*([^;]+)`, 'gi'))) {
        valor = d[1].trim();
      }
    }
  }
  return valor;
}

/** A cor que a EXTENSAO aplica: ultima declaracao vencedora na pilha do host. */
function marcaAplicada(host) {
  const css = pilhaDe(host);
  const re = new RegExp(
    `html\\.lmd-dark ${SELETOR.replace('.', '\\.')}\\{([^}]*)\\}`, 'g');
  let ultima = null;
  for (const m of css.matchAll(re)) {
    const c = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/.exec(m[1]);
    if (c) ultima = c[1];
  }
  return ultima;
}

let falhas = 0;
const TOLERANCIA = 25;   // graus de matiz; o remapeamento mexe pouco na matiz

console.log(`cor de marca em ${SELETOR} (var ${VAR_MARCA})\n`);
for (const site of SITES) {
  const declarada = marcaDeclarada(site);
  const aplicada = marcaAplicada(site.host);

  if (!declarada) { console.log(`  --   ${site.id.padEnd(6)} nao declara ${VAR_MARCA}`); continue; }
  if (!aplicada) {
    console.error(`  FALHA ${site.id.padEnd(6)} a pilha nao pinta ${SELETOR}`);
    falhas++; continue;
  }

  const [hd, sd] = hex2hsl(declarada);
  const [ha] = hex2hsl(aplicada);
  // Cinza declarado nao tem matiz util para comparar.
  const cinza = sd < 0.15;
  const delta = Math.min(Math.abs(hd - ha), 360 - Math.abs(hd - ha));
  const ok = cinza || delta <= TOLERANCIA;
  if (!ok) falhas++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${site.id.padEnd(6)} declarada ${declarada.padEnd(9)} ` +
    `(matiz ${hd.toFixed(0).padStart(3)}) → aplicada ${aplicada.padEnd(9)} (matiz ${ha.toFixed(0).padStart(3)})` +
    (cinza ? '  [cinza: matiz ignorada]' : `  delta ${delta.toFixed(0)}`));
}

console.log(falhas ? `\n${falhas} site(s) com a cor de marca errada` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
