// Verificacoes estaticas da extensao.
//
// Existe por causa de um bug real (no projeto irmao do hubbuy): um comentario
// malformado em theme-core.css engoliu a regra seguinte. O CSS continuou
// "valido" e nada quebrou de forma visivel -- so o ajuste sumiu. Erros assim
// sao silenciosos, entao vale checar.
//
// Uso: node scripts/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Split por virgula que respeita aspas e parenteses: seletores como
// [style*="rgb(255, 255, 255)" i] tem virgula dentro e nao podem ser cortados.
function splitSelectors(sel) {
  const out = [];
  let depth = 0, quote = null, buf = '';
  for (const ch of sel) {
    if (quote) { buf += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

let failures = 0;
const fail = (msg) => { console.error(`  FALHA  ${msg}`); failures++; };
const pass = (msg) => console.log(`  ok     ${msg}`);

/* 1. Manifesto: todo arquivo referenciado precisa existir. */
console.log('manifest.json');
const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const refs = [
  ...mf.content_scripts.flatMap(c => [...(c.css || []), ...(c.js || [])]),
  mf.action.default_popup,
  ...Object.values(mf.icons),
  ...Object.values(mf.action.default_icon || {}),
];
for (const r of [...new Set(refs)]) {
  fs.existsSync(path.join(ROOT, r)) ? pass(r) : fail(`arquivo ausente: ${r}`);
}

/* 2. CSS: precisa parsear e todo seletor de topo precisa estar escopado. */
for (const rel of mf.content_scripts[0].css) {
  console.log(`\n${rel}`);
  const css = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  let root;
  try {
    root = postcss.parse(css, { from: rel });
    pass('parseia sem erro');
  } catch (e) {
    fail(`erro de sintaxe: ${e.message}`);
    continue;
  }

  // Comentario nao fechado nao gera erro de parse -- vira texto solto que
  // engole a regra seguinte. Contagem simples pega o caso.
  const abre = (css.match(/\/\*/g) || []).length;
  const fecha = (css.match(/\*\//g) || []).length;
  abre === fecha
    ? pass(`comentarios balanceados (${abre})`)
    : fail(`comentarios desbalanceados: ${abre} "/*" para ${fecha} "*/"`);

  let rules = 0, unscoped = 0;
  root.walkRules(r => {
    rules++;
    for (const sel of splitSelectors(r.selector)) {
      if (!/^\s*html\.lmd-/.test(sel)) {
        fail(`seletor fora de escopo: ${sel.trim().slice(0, 70)}`);
        unscoped++;
      }
    }
  });
  if (!unscoped) pass(`${rules} regras, todas escopadas em html.lmd-*`);
}

/* 3. Regras-chave que precisam sobreviver a uma regeneracao. */
console.log('\nregras-chave');
const core = fs.readFileSync(path.join(ROOT, 'content', 'theme-core.css'), 'utf8');
const gen = fs.readFileSync(path.join(ROOT, 'content', 'theme.generated.css'), 'utf8');
const expected = [
  [core, 'color-scheme: dark', 'color-scheme dark na raiz (scrollbar e controles nativos)'],
  [core, '.highcharts-background', 'graficos do deck (SVG, fora do alcance do gerador)'],
  [core, '.ui-widget-content', 'datepicker do jQuery UI (fundo em PNG branco)'],
  [core, "[class^='card-color-']", 'cores de carta preservadas'],
  [core, 'lmd-dim img:not([src*=\'logo\' i])', 'suavizacao de banners sem atropelar o logo'],
  [gen, 'html.lmd-dark body', 'fundo do body na camada gerada'],
  [gen, '--bs-body-color', 'variaveis do Bootstrap remapeadas'],
];
for (const [hay, needle, label] of expected) {
  hay.includes(needle) ? pass(label) : fail(`${label} — nao encontrei "${needle}"`);
}

/* 4. URLs no CSS gerado.
 *
 * O CSS do site e servido de www.lmcorp.com.br e a extensao o injeta numa
 * pagina de www.ligamagic.com.br: url() relativa passaria a resolver contra o
 * dominio errado e daria 404 em todo icone. Sao dominios diferentes, entao nem
 * root-relative resolve -- tem que ser absoluta. */
console.log('\nurls');
const relUrls = [...gen.matchAll(/url\(\s*['"]?(?!data:|https?:|\/\/)[^'")]/gi)].length;
relUrls === 0
  ? pass('nenhuma url relativa no CSS gerado')
  : fail(`${relUrls} url() relativa no CSS gerado — deveriam ser absolutas`);

const lmcorp = [...gen.matchAll(/url\(\s*['"]?https:\/\/www\.lmcorp\.com\.br\//gi)].length;
lmcorp > 0
  ? pass(`${lmcorp} url() apontando para www.lmcorp.com.br`)
  : fail('nenhuma url() absolutizada — a reescrita de assets nao rodou');

/* 5. Simbolos de mana e cores de carta nao podem ter sido tematizados: sao a
 * linguagem visual do jogo, nao decoracao. */
console.log('\nsimbolos de mana');
const vazou = [...gen.matchAll(/(?:^|\n)([^\n{]*(?:card-color-|mana-|\bsymb\b)[^\n{]*)\{/g)]
  .map(m => m[1].trim());
vazou.length === 0
  ? pass('nenhuma regra gerada toca simbolo de mana ou cor de carta')
  : fail(`${vazou.length} regra(s) vazaram: ${vazou.slice(0, 3).join(' | ').slice(0, 160)}`);

/* 6. Imagens da loja: a Chrome Web Store recusa PNG com canal alfa.
 *
 * Exige 24 bits (colorType 2 = RGB) ou JPEG, em 1280x800 ou 640x400, e no
 * maximo 5 capturas. O Chrome ja descarta o alfa quando a pagina e opaca, mas
 * basta uma peca com fundo transparente para virar colorType 6 e a submissao
 * ser rejeitada — sem aviso util. */
const STORE = path.join(ROOT, 'store');
if (fs.existsSync(STORE)) {
  console.log('\nimagens da loja');
  const TAMANHOS = {
    'screenshot': [[1280, 800], [640, 400]],
    'promo-small': [[440, 280]],
    'promo-marquee': [[1400, 560]],
  };
  let screenshots = 0;
  for (const f of fs.readdirSync(STORE).filter(x => x.endsWith('.png')).sort()) {
    const b = fs.readFileSync(path.join(STORE, f));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    const depth = b[24], colorType = b[25];

    // tRNS reintroduz transparencia mesmo em colorType 2.
    let off = 8, temTrns = false;
    while (off < b.length - 8) {
      const len = b.readUInt32BE(off);
      const tipo = b.toString('ascii', off + 4, off + 8);
      if (tipo === 'tRNS') temTrns = true;
      if (tipo === 'IEND') break;
      off += 12 + len;
    }

    const chave = Object.keys(TAMANHOS).find(k => f.startsWith(k));
    const okTamanho = chave ? TAMANHOS[chave].some(([tw, th]) => tw === w && th === h) : true;
    if (f.startsWith('screenshot')) screenshots++;

    const problemas = [];
    if (colorType !== 2) problemas.push(`colorType ${colorType} (precisa ser 2, RGB sem alfa)`);
    if (depth !== 8) problemas.push(`profundidade ${depth} (precisa ser 8)`);
    if (temTrns) problemas.push('tem chunk tRNS (transparencia)');
    if (!okTamanho) problemas.push(`${w}x${h} nao e um tamanho aceito`);

    problemas.length
      ? fail(`${f}: ${problemas.join('; ')}`)
      : pass(`${f} — ${w}x${h}, 24 bits, sem alfa`);
  }
  screenshots >= 1 && screenshots <= 5
    ? pass(`${screenshots} capturas (a loja aceita de 1 a 5)`)
    : fail(`${screenshots} capturas — a loja aceita de 1 a 5`);
}

console.log(failures ? `\n${failures} falha(s)` : '\ntudo certo');
process.exit(failures ? 1 : 0);
