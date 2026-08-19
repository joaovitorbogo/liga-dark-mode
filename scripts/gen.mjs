// Gera os stylesheets de dark mode a partir do CSS real dos sites da Liga.
// Estrategia: reaproveita os seletores originais e remapeia apenas os valores
// de cor, por propriedade (fundo / texto / borda / sombra).
//
// A saida e dividida em buckets (ver scripts/sites.mjs): o nucleo, que vale nos
// 15 hosts; um arquivo por grupo de home; e um por site com bundle proprio.
// Cada arquivo e servido por uma entrada de content_scripts com o `matches`
// certo, entao o CSS de um site nao chega a ser injetado no outro -- o
// isolamento e do navegador, nao de convencao de seletor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { bucketFor, arquivoDoBucket, BUCKET_ORDER, SITES } from './sites.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '.cache', 'css');
const MANIFEST = path.join(ROOT, '.cache', 'css-manifest.json');
const OUT_DIR = path.join(ROOT, 'content');

if (!fs.existsSync(SRC)) {
  console.error('CSS de origem nao encontrado. Rode antes: node scripts/fetch-css.mjs');
  process.exit(1);
}

/* ---------- conversao de cor ---------- */

const NAMED = {
  white: [255, 255, 255, 1], black: [0, 0, 0, 1], red: [255, 0, 0, 1],
  gray: [128, 128, 128, 1], grey: [128, 128, 128, 1], silver: [192, 192, 192, 1],
  whitesmoke: [245, 245, 245, 1], gainsboro: [220, 220, 220, 1],
  lightgray: [211, 211, 211, 1], lightgrey: [211, 211, 211, 1],
  dimgray: [105, 105, 105, 1], darkgray: [169, 169, 169, 1],
  ivory: [255, 255, 240, 1], snow: [255, 250, 250, 1], linen: [250, 240, 230, 1],
  beige: [245, 245, 220, 1], azure: [240, 255, 255, 1],
};

function parseColor(s) {
  s = s.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s].slice();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    const ex = (c) => parseInt(c + c, 16);
    if (h.length === 3) return [ex(h[0]), ex(h[1]), ex(h[2]), 1];
    if (h.length === 4) return [ex(h[0]), ex(h[1]), ex(h[2]), ex(h[3]) / 255];
    if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    if (h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16) / 255];
    return null;
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const num = (v, max) => v.endsWith('%') ? (parseFloat(v) / 100) * max : parseFloat(v);
    const r = num(p[0], 255), g = num(p[1], 255), b = num(p[2], 255);
    const a = p[3] === undefined ? 1 : num(p[3], 1);
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return [r, g, b, a];
  }
  m = /^hsla?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const h = parseFloat(p[0]), sa = parseFloat(p[1]) / 100, l = parseFloat(p[2]) / 100;
    const a = p[3] === undefined ? 1 : (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]));
    const [r, g, b] = hsl2rgb(h, sa, l);
    return [r, g, b, a];
  }
  return null;
}

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const fmt = ([r, g, b, a]) => {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  if (a >= 0.999) return '#' + [r, g, b].map(v => c(v).toString(16).padStart(2, '0')).join('');
  return `rgba(${c(r)},${c(g)},${c(b)},${Math.round(a * 1000) / 1000})`;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Luminancia relativa (WCAG), que e o que o olho enxerga como "claro". */
const relLum = ([r, g, b]) => {
  const f = (v) => {
    v = Math.max(0, Math.min(255, v)) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// Cores de marca / semanticas que devem sobreviver ao tema escuro. No ligamagic
// isso vale para o laranja da marca (#ff5a00) e para a paleta de significado
// que o jogador le sem pensar: verde de "menor preco", vermelho de "esgotado",
// dourado de "medio", e as cores de raridade e de qualidade da carta.
const isAccent = (s, l) => s > 0.45 && l > 0.22 && l < 0.78;

/**
 * Remapeia uma cor conforme o papel dela na pagina.
 * role: 'bg' | 'text' | 'border' | 'shadow'
 */
function mapColor(str, role) {
  const c = parseColor(str);
  if (!c) return null;
  const [r, g, b, a] = c;
  if (a === 0) return null;                       // totalmente transparente: nao mexe
  const [h, s, l] = rgb2hsl(r, g, b);

  if (role === 'shadow') {
    // Sombras claras nao existem no escuro: viram pretas, um pouco mais densas.
    return fmt([0, 0, 0, clamp(a * 1.35, 0.08, 0.75)]);
  }

  if (role === 'bg') {
    if (isAccent(s, l)) {
      // Botao/badge de marca: mantem o tom. Acentos claros (amarelo, ciano)
      // escurecem mais, senao o texto -- que vira claro -- perde contraste.
      const nl = l > 0.6 ? clamp(l * 0.60, 0.22, 0.42) : l * 0.9;
      return fmt([...hsl2rgb(h, s * 0.94, nl), a]);
    }
    // A ordem de elevacao precisa ser PRESERVADA, nao invertida: no tema claro
    // o card branco fica sobre a pagina cinza; no escuro o card continua sendo
    // a camada mais clara. Inverter a luminosidade deixaria o card mais escuro
    // que a pagina e mataria a hierarquia visual.
    let nl;
    if (l >= 0.86) {
      nl = 0.075 + ((l - 0.86) / 0.14) * 0.065;   // faixa das superficies: 0.075 -> 0.14
    } else if (l >= 0.35) {
      nl = 0.15 + ((0.86 - l) / 0.51) * 0.10;     // cinzas medios -> camada elevada
    } else {
      nl = l;                                      // ja era escuro (rodape, tooltip): mantem
    }
    // Matizes pastel (ex.: o #fff3ea das faixas de aviso) preservam a
    // identidade com saturacao baixa.
    const ns = l > 0.85 ? clamp(s * 0.30, 0, 0.22) : clamp(s * 0.45, 0, 0.30);
    return fmt([...hsl2rgb(h, ns, clamp(nl, 0.05, 0.34)), a]);
  }

  if (role === 'border') {
    if (isAccent(s, l)) return fmt([...hsl2rgb(h, s * 0.9, clamp(l, 0.32, 0.62)), a]);
    const nl = clamp(0.19 + (1 - l) * 0.14, 0.19, 0.36);
    return fmt([...hsl2rgb(h, clamp(s * 0.35, 0, 0.2), nl), a]);
  }

  // role === 'text'
  if (isAccent(s, l)) {
    // Laranja da marca em fundo escuro precisa de mais luz para manter
    // contraste; o mesmo vale para o verde de "menor preco".
    //
    // Subir a luminosidade HSL nao basta: ela trata todas as matizes por igual,
    // e o olho nao. O vermelho de "maior preco" em L=0,55 rende luminancia
    // relativa 0,22 -- contraste 4,3:1 contra o fundo, abaixo do minimo -- ja o
    // amarelo na mesma L passa de 0,7. Entao clareamos ate a luminancia
    // PERCEBIDA chegar no alvo, cada matiz subindo o quanto precisar.
    const ss = clamp(s * 0.95, 0, 1);
    let nl = clamp(l, 0.55, 0.78);
    while (nl < 0.80 && relLum(hsl2rgb(h, ss, nl)) < 0.28) nl += 0.02;
    return fmt([...hsl2rgb(h, ss, Math.min(nl, 0.82)), a]);
  }
  if (l > 0.62) return fmt([r, g, b, a]);          // ja era texto claro: mantem
  const nl = clamp(1 - l * 0.78, 0.62, 0.93);      // texto escuro -> claro
  return fmt([...hsl2rgb(h, clamp(s * 0.55, 0, 0.25), nl), a]);
}

/* ---------- custom properties: duas familias, dois tratamentos ----------
 *
 * O ligamagic mistura duas convencoes de variavel, e o que funciona para uma
 * quebra a outra.
 *
 * 1) As proprias (`--color-white`, `--color-gray`, `--color-primary`) nomeiam a
 *    COR, nao o papel: --color-white aparece 28x como background-color e 20x
 *    como color; --color-gray, 73x como color e 17x como fundo. Remapear a
 *    definicao necessariamente erra metade dos usos. Para essas resolvemos
 *    var(--x) no ponto de USO, onde a propriedade revela o papel: assim
 *    `background-color:var(--color-white)` vira fundo escuro e
 *    `color:var(--color-white)` continua texto claro, a partir da mesma
 *    variavel.
 *
 * 2) As do Bootstrap 5 (`--bs-dropdown-bg`, `--bs-card-color`) nomeiam o PAPEL
 *    e sao definidas no proprio componente, nao na raiz -- resolver pelo valor
 *    da raiz seria errado, e nem existe valor na raiz. Essas remapeamos na
 *    DEFINICAO, com o papel lido do sufixo do nome.
 *
 * Uma variavel nunca cai nos dois caminhos: o que e redefinido nao e expandido.
 */
const VARS = new Map();
const VAR_AMBIGUAS = new Set();

// So variaveis definidas na raiz sao seguras de expandir. Uma redefinida dentro
// de um componente (`.destaque{--x:...}`) vale outra coisa naquele escopo, e
// substituir pelo valor da raiz pintaria a cor errada.
const ROOT_SEL = /^(:root|html|body|\*)$/;

/**
 * Papel de uma custom property deduzido do nome. So aceita quando o SUFIXO diz
 * o papel (`--bs-card-bg`), nunca quando o nome apenas contem a palavra
 * "color" no comeco (`--color-white`, que e o nome de uma cor e nao de um uso).
 * Devolve null quando o nome nao decide -- ai vale a expansao no ponto de uso.
 */
function papelPeloNome(nome) {
  const n = nome.toLowerCase().replace(/-rgb$/, '');
  if (/-(box-)?shadow$/.test(n)) return 'shadow';
  if (/-(border|divider|rule)(-color)?$/.test(n) || /-border-[a-z]*-?color$/.test(n)) return 'border';
  if (/-(bg|background)$/.test(n) || /-bg-[a-z]+$/.test(n)) return 'bg';
  if (/-color$/.test(n) && /^--bs-/.test(n)) return 'text';
  if (/-(fill|stroke)$/.test(n)) return 'text';
  return null;
}

// Valores que nunca sao cor e so gerariam ruido, alem de artefatos do
// minificador (`--none:hover+...`, `--multiple:focus{...}`) que o postcss
// aceita como declaracao valida.
const naoEhCor = (v) => !parseColor(v.trim()) && !/^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/.test(v);

function coletarVars(root) {
  root.walkRules(rule => {
    const raiz = rule.selector.split(',').every(s => ROOT_SEL.test(s.trim()));
    rule.each(d => {
      if (d.type !== 'decl' || !d.prop.startsWith('--')) return;
      if (!raiz) { VAR_AMBIGUAS.add(d.prop); return; }
      // Ordem de carga = ordem do cascade: a ultima definicao vence.
      VARS.set(d.prop, d.value.trim());
    });
  });
}

/** Resolve var(--x) / var(--x, fallback) ate chegar num literal de cor. */
function resolveVar(nome, profundidade = 0) {
  if (profundidade > 6) return null;
  if (VAR_AMBIGUAS.has(nome)) return null;
  if (papelPeloNome(nome)) return null;   // essa e remapeada na definicao
  let v = VARS.get(nome);
  if (v === undefined) return null;
  v = v.replace(/\s*!important\s*$/i, '').trim();
  const m = /^var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)$/.exec(v);
  if (m) return resolveVar(m[1], profundidade + 1) || (m[2] ? m[2].trim() : null);
  return parseColor(v) ? v : null;
}

/**
 * Remapeia a definicao de uma variavel de papel conhecido. Trata tambem as
 * `--*-rgb` do Bootstrap, que guardam so o trio ("33,37,41") e sao consumidas
 * dentro de rgba(var(--x-rgb),.5) -- sem isso o texto continuaria escuro em
 * todo lugar que usa transparencia.
 */
function mapVarDecl(nome, valor) {
  const role = papelPeloNome(nome);
  if (!role) return null;
  const v = valor.replace(/\s*!important\s*$/i, '').trim();
  const trio = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/.exec(v);
  if (trio) {
    const mapped = mapColor(`rgb(${trio[1]},${trio[2]},${trio[3]})`, role);
    if (!mapped) return null;
    const c = parseColor(mapped);
    if (!c) return null;
    const saida = c.slice(0, 3).map(x => Math.round(x)).join(',');
    return saida === `${trio[1]},${trio[2]},${trio[3]}` ? null : saida;
  }
  if (naoEhCor(v)) return null;
  return rewriteValue(v, role, 'https://www.lmcorp.com.br/arquivos/css/');
}

/* ---------- reescrita de valores ---------- */

const COLOR_RE = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|hsla?\([^()]*\)|\b(?:white|black|whitesmoke|gainsboro|lightgray|lightgrey|silver|dimgray|darkgray|gray|grey|ivory|snow|linen|beige|azure)\b)/g;
const VAR_RE = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g;

// url() no CSS original resolve contra a pasta do BUNDLE, em
// www.lmcorp.com.br/arquivos/css/. Injetado pela extensao, o mesmo CSS
// resolveria contra a URL da PAGINA (www.ligamagic.com.br) e daria 404 em todo
// icone. Como sao dominios diferentes, root-relative nao basta: precisa virar
// absoluto.
function absolutizeUrl(u, base) {
  return u.replace(/^(url\(\s*)(['"]?)(.*?)(\2\s*\))$/i, (m, open, q, alvo, close) => {
    const t = alvo.trim();
    if (!t || /^(data:|https?:|\/\/|#)/i.test(t)) return m;
    try {
      return `${open}${q}${new URL(t, base).href}${close}`;
    } catch {
      return m;
    }
  });
}

function rewriteValue(value, role, base) {
  let touched = false;
  // Protege url(...) para nao destruir data-URIs com "#" ou "rgb".
  //
  // Absolutizar a url NAO conta como alteracao. A url so precisa ser absoluta
  // nas declaracoes que a gente de fato emite; se nada mais mudou, o certo e
  // nao emitir nada e deixar a regra original do site valer -- ela ja resolve a
  // url contra o proprio bundle.
  //
  // Emitir por causa da url sozinha quebra o cascade do site: a declaracao sai
  // com !important e sem as irmas que vinham junto na regra de origem. Foi o que
  // aconteceu com a lupa do autocomplete -- `#mainsugg .autocomplete div` traz
  // background-image + background-repeat:no-repeat + background-position, mas so
  // a imagem era copiada. O `background:#1c1c1c !important` gerado para
  // `.selected` (atalho, portanto reseta as longhands) devolvia repeat/position
  // ao valor inicial, e a lupa virava ladrilho na linha sob o mouse.
  const urls = [];
  let guarded = value.replace(/url\([^)]*\)/gi, (m) => {
    urls.push(absolutizeUrl(m, base));
    return `__U${urls.length - 1}__`;
  });

  // Resolve as variaveis ANTES de mapear: o papel vem da propriedade, entao a
  // mesma variavel pode virar fundo escuro num lugar e texto claro noutro.
  guarded = guarded.replace(VAR_RE, (m, nome, fallback) => {
    const lit = resolveVar(nome);
    if (lit) return lit;
    // Sem literal conhecido, o fallback pode ser uma cor utilizavel.
    if (fallback && parseColor(fallback.trim())) return fallback.trim();
    return m;
  });

  const out = guarded.replace(COLOR_RE, (m) => {
    const mapped = mapColor(m, role);
    if (!mapped) return m;
    // Compara canonicamente: "#fff" e "#ffffff" sao a mesma cor e nao devem
    // contar como alteracao, senao geramos milhares de regras no-op.
    const a = parseColor(m), b = parseColor(mapped);
    if (a && b && a.every((v, i) => Math.abs(v - b[i]) < (i === 3 ? 0.004 : 1))) return m;
    touched = true;
    return mapped;
  });
  if (!touched) return null;
  return out.replace(/__U(\d+)__/g, (_, i) => urls[+i]);
}

/* ---------- classificacao de propriedade ---------- */

function roleFor(prop) {
  const p = prop.toLowerCase();
  if (p === 'box-shadow' || p === 'text-shadow' || p === '-webkit-box-shadow') return 'shadow';
  if (p === 'color' || p === '-webkit-text-fill-color' || p === 'caret-color' || p === 'text-decoration-color') return 'text';
  if (p === 'border' || p.startsWith('border-') || p === 'outline' || p.startsWith('outline-') ||
      p === 'column-rule' || p.startsWith('column-rule-')) {
    if (/(radius|width|style|image-slice|image-width|image-outset|image-repeat|spacing|collapse|offset)$/.test(p)) return null;
    return 'border';
  }
  if (p === 'background' || p === 'background-color' || p === 'background-image') return 'bg';
  if (p === 'fill' || p === 'stroke') return 'text';
  if (p.startsWith('--')) return 'var';
  return null;
}

/* ---------- geracao ---------- */

// A ordem de carga define quem vence no cascade. O manifesto guarda a ordem em
// que os bundles aparecem nas paginas; sem ele, ordem alfabetica inverteria
// pares como template-package -> template-marketplace.
const manifest = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  : fs.readdirSync(SRC).filter(f => f.endsWith('.css')).sort()
      .map(nome => ({ nome, base: 'https://www.lmcorp.com.br/arquivos/css/' }));

// Bundles baixados antes desta mudanca nao tem bucket gravado; deriva do nome.
const files = manifest
  .filter(m => fs.existsSync(path.join(SRC, m.nome)))
  .map(m => ({ ...m, bucket: m.bucket || bucketFor(m.nome.replace(/__/g, '/')) }));

const buckets = new Map();

/* ---------- dedupe hierarquico ----------
 *
 * Descartar uma regra repetida so e seguro contra um bucket que seja injetado
 * num conjunto de hosts que CONTENHA o do bucket atual.
 *
 *   theme        15 hosts   contem todo mundo
 *   home-<grupo>  6, 8 ou 1 contem os sites daquele grupo
 *   site-<id>     1         nao contem ninguem alem de si
 *
 * Com um `seen` unico e global isto quebra de um jeito silencioso: os bundles
 * tcg_N sao quase identicos entre si (mesmo template, jogo diferente), entao o
 * primeiro site processado ficava com as regras e os outros 13 saiam com o
 * arquivo vazio -- perdendo o tema sem nenhum erro aparecer.
 */
const GRUPO_DO_SITE = Object.fromEntries(SITES.map(s => [s.id, s.home]));
const seenTheme = new Set();
const seenHome = new Map();   // grupo -> Set
const seenSite = new Map();   // id -> Set

const setDe = (mapa, chave) => {
  if (!mapa.has(chave)) mapa.set(chave, new Set());
  return mapa.get(chave);
};

function jaEmitido(bucket, key) {
  if (seenTheme.has(key)) return true;
  if (bucket === 'theme') return false;
  if (bucket.startsWith('home-')) return setDe(seenHome, bucket.slice(5)).has(key);
  const id = bucket.slice('site-'.length);
  const grupo = GRUPO_DO_SITE[id];
  if (grupo && seenHome.get(grupo)?.has(key)) return true;
  return setDe(seenSite, id).has(key);
}

function registrar(bucket, key) {
  if (bucket === 'theme') seenTheme.add(key);
  else if (bucket.startsWith('home-')) setDe(seenHome, bucket.slice(5)).add(key);
  else setDe(seenSite, bucket.slice('site-'.length)).add(key);
}

let ruleCount = 0, declCount = 0, skippedFiles = 0;

// Seletores que nunca devem ser tematizados. Alem das midias, entram os
// simbolos de custo e as cores de carta: sao a linguagem visual do jogo (o "W"
// branco, o "B" preto), nao decoracao de interface. Escurece-los deixaria o
// custo de mana ilegivel.
//
// `symbol` esta separado de `\bsymb\b` de proposito. A alternativa com word
// boundary NAO casa "mtg-symbol" -- depois de "symb" vem "o", que nao e
// fronteira de palavra -- entao `.mtg-symbol` e `.dk-symbols` passavam batido e
// o gerador pintava `abbr.mtg-symbol{background-color:#171717}` por cima dos
// SVG de mana. O check.mjs cobre isso agora.
//
// Vocabulario coberto: mtg-symbol (Magic), edc-symb e container-editon-symbol
// (simbolo de edicao), dk-symbols (deck). Os bundles tcg_N dos outros jogos nao
// tem simbolo em CSS: eles usam <img>, ja negado acima.
const SELECTOR_DENY = /(^|[\s,>+~])(img|video|canvas|iframe|svg)\b|\.logo\b|\bmana\b|\bmana-|\bsymb\b|symbol|\bcard-color-|\bcard-img|\bfoil\b/i;

// Classe que liga o tema. Todo seletor gerado e prefixado com ela, entao o
// stylesheet pode ficar sempre injetado e o toggle vira um classList.toggle
// no <html> -- sem reload e sem piscar.
const SCOPE = 'html.lmd-dark';

// Split por virgula respeitando parenteses e colchetes de :is(a,b), [x=","] etc.
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

function scopeSelector(sel) {
  return splitSelectors(sel).map(part => {
    // :root vira html.lmd-dark:root; html/body ganham a classe no lugar certo.
    if (/^:root\b/.test(part)) return SCOPE + part.slice(5);
    if (/^html\b/.test(part)) return SCOPE + part.slice(4);
    return `${SCOPE} ${part}`;
  }).join(',');
}

/* ---------- superficies com imagem de fundo clara ----------
 *
 * Fundo desenhado em PNG/SVG nao e cor: o remapeamento nao alcanca. As texturas
 * do calendario jQuery UI (ui-bg_glass_65_ffffff) sao brancas chapadas --
 * continuam blocos brancos no tema escuro, e o texto (que clareamos) desaparece
 * em cima.
 *
 * Em vez de trocar a arte por uma cor chapada, sobrepomos um veu escuro como
 * primeira camada de background-image. So entram imagens medidas como claras E
 * seletores com regras descendentes no mesmo arquivo -- ou seja, containers que
 * abrigam conteudo, nao elementos que SAO a ilustracao (icone, selo, estrela).
 */
const LUMA_FILE = path.join(ROOT, '.cache', 'bg-luminance.json');
const LUMA = fs.existsSync(LUMA_FILE)
  ? JSON.parse(fs.readFileSync(LUMA_FILE, 'utf8'))
  : {};
if (!Object.keys(LUMA).length) {
  console.warn('aviso: .cache/bg-luminance.json ausente — imagens de fundo claras');
  console.warn('       nao serao tratadas. Rode: node scripts/measure-bg-images.mjs');
}
const LIGHT_IMG_MIN = 0.62;
const scrimmed = [];

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Veu proporcional: quanto mais clara a arte, mais denso. */
function scrimFor(luma) {
  const a = Math.min(0.9, Math.max(0.6, 0.6 + (luma - LIGHT_IMG_MIN) * 0.78));
  return `rgba(16,17,20,${a.toFixed(3)})`;
}

function processRoot(root, file, base, bucket) {
  // Todos os seletores do arquivo, para saber quais sao containers (tem
  // descendentes estilizados).
  const allSelectors = [];
  root.walkRules(r => splitSelectors(r.selector).forEach(s => allSelectors.push(norm(s))));
  const isContainer = (sel) => {
    const b = norm(sel);
    return allSelectors.some(s => s !== b && s.startsWith(b + ' '));
  };

  const walk = (container, prefix) => {
    container.each(node => {
      if (node.type === 'atrule') {
        const n = node.name.toLowerCase();
        if (n === 'keyframes' || n === '-webkit-keyframes' || n === 'font-face' ||
            n === 'import' || n === 'charset' || n === 'property') return;
        if (n === 'media' || n === 'supports' || n === 'layer' || n === 'container') {
          const inner = [];
          walk(node, (sel, body) => inner.push({ sel, body }));
          if (inner.length) prefix.atrule(`@${node.name} ${node.params}`, inner);
        }
        return;
      }
      if (node.type !== 'rule') return;
      const sel = norm(node.selector);
      if (!sel || SELECTOR_DENY.test(sel)) return;
      const decls = [];
      let scrim = null;
      node.each(d => {
        if (d.type !== 'decl') return;

        // Superficie com arte clara de fundo: guarda o veu para emitir depois.
        if ((d.prop === 'background' || d.prop === 'background-image') && /url\(/i.test(d.value)) {
          const urls = [...d.value.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)].map(m => m[1]);
          const hasGradient = /gradient\(/i.test(d.value);
          if (urls.length === 1 && !hasGradient && !/^data:/i.test(urls[0])) {
            let abs;
            try { abs = new URL(urls[0].trim(), base).href; } catch { abs = null; }
            const luma = abs ? LUMA[abs] : undefined;
            if (typeof luma === 'number' && luma > LIGHT_IMG_MIN && isContainer(sel)) {
              scrim = `background-image:linear-gradient(${scrimFor(luma)},${scrimFor(luma)}),url(${abs}) !important`;
              scrimmed.push(`${sel}  (${luma.toFixed(2)})  ${urls[0]}`);
            }
          }
        }

        const role = roleFor(d.prop);
        if (role === 'var') {
          // So as variaveis cujo NOME diz o papel (as do Bootstrap) sao
          // remapeadas aqui. As que nomeiam a cor e nao o uso ficam intactas de
          // proposito -- quem as resolve e o ponto de uso, onde a propriedade
          // revela o papel. Ver o bloco "duas familias, dois tratamentos".
          const nv = mapVarDecl(d.prop, d.value);
          if (nv === null) return;
          decls.push(`${d.prop}:${nv} !important`);
          declCount++;
          return;
        }
        if (!role) return;
        const nv = rewriteValue(d.value, role, base);
        if (nv === null) return;
        decls.push(`${d.prop}:${nv} !important`);
        declCount++;
      });
      // O veu vai por ultimo: background-image depois do shorthand background
      // sobrescreve so a camada de imagem, preservando cor, posicao e size.
      if (scrim) { decls.push(scrim); declCount++; }
      if (!decls.length) return;
      const body = decls.join(';');
      const scoped = scopeSelector(sel);
      const key = scoped + '{' + body;
      if (jaEmitido(bucket, key)) return;
      registrar(bucket, key);
      ruleCount++;
      prefix(scoped, body);
    });
  };

  const lines = [];
  const emit = (sel, body) => lines.push(`${sel}{${body}}`);
  emit.atrule = (head, inner) => {
    lines.push(`${head}{`);
    inner.forEach(({ sel, body }) => lines.push(`${sel}{${body}}`));
    lines.push('}');
  };
  walk(root, emit);
  if (lines.length) {
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(`/* ${file} */\n` + lines.join('\n'));
  }
}

// Passo 1: tabela de variaveis. Precisa varrer TODOS os bundles antes de gerar,
// porque uma variavel definida no template-package e usada no marketplace.
// Este passo tem que continuar GLOBAL, sobre todos os bundles de todos os
// buckets. Uma variavel definida no nucleo (--color-white) e usada dentro dos
// bundles tcg_N; coletar por bucket deixaria essas var() sem literal conhecido
// e o bundle do site geraria cor errada -- ou nenhuma.
const parsed = [];
for (const { nome, base, bucket } of files) {
  const css = fs.readFileSync(path.join(SRC, nome), 'utf8');
  try {
    const root = postcss.parse(css, { from: nome });
    parsed.push({ nome, base, bucket, root });
    coletarVars(root);
  } catch (e) {
    skippedFiles++;
    console.error(`skip ${nome}: ${e.message}`);
  }
}

// Passo 2: geracao, na ordem nucleo -> homes -> sites (ver o comentario do
// `seen`). Dentro do mesmo bucket, a ordem de descoberta e preservada, que e a
// ordem de carga das folhas na pagina e portanto a ordem do cascade.
const ordenados = parsed
  .map((p, i) => ({ p, i }))
  .sort((a, b) => BUCKET_ORDER(a.p.bucket) - BUCKET_ORDER(b.p.bucket) || a.i - b.i)
  .map(x => x.p);
for (const { nome, base, root, bucket } of ordenados) processRoot(root, nome, base, bucket);

/* ---------- escrita ---------- */

const cabecalho = (bucket, n) => `/* Liga Dark Mode - camada gerada (${bucket})
 * Derivada automaticamente de ${n} bundle(s) de CSS de www.lmcorp.com.br.
 * Nao editar a mao: regenerar com scripts/gen.mjs.
 * Ajustes finos ficam em theme-core.css (todos os sites) e em sites.css
 * (excecoes por site), que carregam depois desta camada.
 */
`;

fs.mkdirSync(path.join(OUT_DIR, 'sites'), { recursive: true });

// Um site cujo bundle nao gerou nenhuma regra ainda precisa do arquivo: o
// manifest o referencia, e content_scripts com css ausente impede a extensao
// inteira de carregar.
const esperados = new Set(files.map(f => f.bucket));
const escritos = [];
for (const bucket of [...esperados].sort((a, b) => BUCKET_ORDER(a) - BUCKET_ORDER(b) || a.localeCompare(b))) {
  const chunks = buckets.get(bucket) || [];
  const destino = path.join(OUT_DIR, arquivoDoBucket(bucket));
  fs.writeFileSync(destino, cabecalho(bucket, files.filter(f => f.bucket === bucket).length) + chunks.join('\n'));
  escritos.push({ bucket, destino, chunks: chunks.length });
}

// Arquivos de bucket que sobraram de uma geracao anterior (um site removido da
// tabela) mentiriam sobre a cobertura atual.
const validos = new Set(escritos.map(e => path.basename(e.destino)));
for (const f of fs.readdirSync(path.join(OUT_DIR, 'sites'))) {
  if (!validos.has(f)) {
    fs.unlinkSync(path.join(OUT_DIR, 'sites', f));
    console.log(`removido (bucket nao existe mais): sites/${f}`);
  }
}

const resolviveis = [...VARS.keys()].filter(n => resolveVar(n));
if (scrimmed.length) {
  console.log(`\nsuperficies com arte clara que receberam veu (${scrimmed.length}):`);
  [...new Set(scrimmed)].sort().forEach(s => console.log('  ' + s));
  console.log('');
}
console.log(`arquivos de origem: ${files.length} (falhas: ${skippedFiles})`);
console.log(`variaveis: ${VARS.size} na raiz, ${resolviveis.length} resolvem para cor, ${VAR_AMBIGUAS.size} ambiguas (ignoradas)`);
console.log(`regras: ${ruleCount} | declaracoes: ${declCount}`);
console.log(`\nsaida (${escritos.length} arquivos):`);
for (const e of escritos) {
  const kb = (fs.statSync(e.destino).size / 1024).toFixed(0);
  console.log(`  ${e.bucket.padEnd(12)} ${path.relative(OUT_DIR, e.destino).padEnd(32)} ${kb.padStart(5)} KB`);
}
