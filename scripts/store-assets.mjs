// Gera as imagens da Chrome Web Store em ./store.
//
// Tres etapas: captura o ligamagic real nos dois estados (com a pilha de CSS
// que o manifest declara para aquele host), fotografa o popup, e
// compoe as pecas em HTML fotografado no tamanho exato que a loja exige.
//
// A peca central e um "split": a mesma pagina cortada ao meio, clara de um lado
// e escura do outro, com uma costura laranja no corte. As duas metades usam o
// MESMO deslocamento de imagem -- so o recorte muda. E o que faz parecer uma
// pagina unica partida, e nao duas capturas lado a lado.
//
// O split e feito na pagina de card, nao na home: a home tem carrossel e blocos
// de "cards em alta" que mudam entre uma captura e outra, e as duas metades
// sairiam mostrando conteudo diferente -- o truque desmonta na hora. A pagina de
// card e estatica e ainda por cima e onde o tema mais se ve (preco em verde,
// laranja e vermelho, linhas de loja, arte da carta).
//
// Uso: node scripts/store-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pp from 'puppeteer-core';
import { pilhaDe } from './pilha.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, '.cache', 'store-src');
const TMP = path.join(ROOT, '.cache', 'tiles-html');
const OUT = path.join(ROOT, 'store');
const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

for (const d of [SHOTS, TMP, OUT]) fs.mkdirSync(d, { recursive: true });

// A pilha completa que o manifest declara para este host, nao so o nucleo. A
// captura da home usa o template `template-package-home`, que mora num arquivo
// de bucket separado: lendo so theme.generated.css + theme-core.css, a home
// sairia com o topo sem tema justamente na imagem que a loja mostra maior.
const THEME = pilhaDe('www.ligamagic.com.br');

const browser = await pp.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--allow-file-access-from-files'],
});

/* ---------- 1. capturas do site ---------- */

/**
 * Abre a pagina uma vez e fotografa os estados pedidos alternando a classe da
 * raiz -- exatamente o que a extensao faz.
 *
 * Capturar claro e escuro em dois carregamentos separados NAO funciona aqui: a
 * Liga gira os banners dos anunciantes a cada request, e as duas metades do
 * split saem com anuncios diferentes no topo. Um carregamento so garante que o
 * conteudo e literalmente o mesmo, e a unica diferenca e o tema.
 */
async function shootStates(url, saidas, { scroll = 0 } = {}) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await p.setUserAgent(UA);
  await p.evaluateOnNewDocument((css) => {
    const boot = (h) => {
      const s = document.createElement('style');
      s.textContent = css;
      (document.head || h).appendChild(s);
    };
    if (document.documentElement) boot(document.documentElement);
    else {
      const w = new MutationObserver(() => {
        if (!document.documentElement) return;
        w.disconnect();
        boot(document.documentElement);
      });
      w.observe(document, { childList: true });
    }
  }, THEME);

  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // O popup promocional e a barra de cookies cobrem a pagina inteira.
  await p.evaluate(() => {
    for (const sel of ['[id*="popup" i]', '[class*="popup" i]', '[id*="cookie" i]',
                       '[class*="cookie" i]', '.modal-backdrop', '#onetrust-consent-sdk']) {
      document.querySelectorAll(sel).forEach(e => e.remove());
    }
    document.body.style.overflow = 'auto';
  });

  // As imagens de carta sao lazy: sem passar por elas, metade da tela fica vazia.
  await p.evaluate(async () => {
    for (let y = 0; y < 3000; y += 400) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
  });
  await p.evaluate((y) => window.scrollTo(0, y), scroll);
  await new Promise(r => setTimeout(r, 2500));

  for (const [name, classes] of Object.entries(saidas)) {
    await p.evaluate((cls) => {
      const h = document.documentElement;
      h.classList.remove('lmd-dark', 'lmd-dim');
      cls.forEach(c => h.classList.add(c));
    }, classes);
    await new Promise(r => setTimeout(r, 700));
    await p.screenshot({ path: path.join(SHOTS, name) });
    console.log('  ' + name);
  }
  await p.close();
}

const CARD = 'https://www.ligamagic.com.br/?view=cards/card&card=Sol+Ring';
const HOME = 'https://www.ligamagic.com.br/';
const DECK = 'https://www.ligamagic.com.br/?view=dks/deck&id=10150375';

console.log('capturas do site:');
await shootStates(CARD, { 'card-light.png': [], 'card-dark.png': ['lmd-dark'] });
await shootStates(HOME, { 'home-dark.png': ['lmd-dark'] });
await shootStates(DECK, { 'deck-dark.png': ['lmd-dark'] }, { scroll: 120 });

/* ---------- 2. popup ---------- */

{
  const p = await browser.newPage();
  await p.setViewport({ width: 324, height: 600, deviceScaleFactor: 3 });
  await p.goto('file:///' + path.join(ROOT, 'popup', 'popup.html').replace(/\\/g, '/'),
    { waitUntil: 'networkidle0' });
  // O popup real le chrome.storage, que nao existe em file://; fixamos o estado.
  await p.evaluate(() => {
    document.getElementById('enabled').checked = true;
    document.getElementById('followSystem').checked = false;
    document.getElementById('dimMedia').checked = true;
    document.getElementById('status').textContent = 'Ligado';
    document.getElementById('status').dataset.on = 'true';
    document.querySelector('.group').dataset.disabled = 'false';
  });
  // Os switches tem transicao de 0.16s: sem esperar, o screenshot pega a cor
  // intermediaria e o laranja da marca sai marrom.
  await new Promise(r => setTimeout(r, 900));
  const h = await p.evaluate(() => document.body.scrollHeight);
  await p.setViewport({ width: 324, height: h, deviceScaleFactor: 3 });
  await new Promise(r => setTimeout(r, 500));
  const c = await p.evaluate(() =>
    getComputedStyle(document.querySelector('#enabled + .switch-ui')).backgroundColor);
  if (c !== 'rgb(255, 90, 0)') console.warn(`  aviso: switch em ${c}, esperado o laranja da marca`);
  await p.screenshot({ path: path.join(SHOTS, 'popup.png') });
  console.log('  popup.png');
  await p.close();
}

/* ---------- 3. composicao das pecas ---------- */

const rel = (f) => path.relative(TMP, path.join(SHOTS, f)).replace(/\\/g, '/');
const ICON = path.relative(TMP, path.join(ROOT, 'icons', 'icon128.png')).replace(/\\/g, '/');

const BASE = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{--ink:#0c0c0f;--line:#33333b;--brand:#ff5a00;--brand-lt:#ff8038;
       --text:#e8e9ec;--dim:#8b8d95;
       background:var(--ink);color:var(--text);
       font-family:"Segoe UI",system-ui,sans-serif;overflow:hidden}
  /* Serifada para os titulos: a linha de tipo das cartas de Magic e serifada,
     entao a peca "soa" como o assunto em vez de parecer template de SaaS.
     Georgia vem em todo Windows, entao o render e o mesmo em qualquer maquina. */
  .display{font-family:Georgia,"Times New Roman",serif;font-weight:700;
           letter-spacing:-.005em;line-height:1.02}
  .mono{font-family:Consolas,"Cascadia Mono",monospace;letter-spacing:.14em;
        text-transform:uppercase}
  .split{position:relative;overflow:hidden;background:var(--ink)}
  .half{position:absolute;top:0;height:100%;overflow:hidden}
  .half img{position:absolute;display:block;max-width:none}
  .seam{position:absolute;top:0;height:100%;width:3px;background:var(--brand);
        box-shadow:0 0 26px 5px rgba(255,90,0,.5);z-index:3}
  .tag{position:absolute;z-index:4;font-size:10.5px;padding:5px 9px;border-radius:3px}
  /* O corte de baixo cai no meio de uma linha da tabela ou de um banner, o que
     parece captura mal feita. Um esmaecimento resolve: o fim vira decisao. */
  .fade{position:absolute;left:0;right:0;bottom:0;z-index:4;pointer-events:none;
        background:linear-gradient(transparent,rgba(12,12,15,.55) 55%,var(--ink))}
`;

/**
 * Duas metades da MESMA captura, com o mesmo deslocamento: so o recorte muda.
 * seam = onde cai o corte; imgW/left/top = enquadramento comum as duas.
 */
function split({ seam, w, imgW, left, top }) {
  const st = `width:${imgW}px;height:auto;left:${left}px;top:${top}px`;
  return `
  <div class="half" style="left:0;width:${seam}px"><img src="${rel('card-light.png')}" style="${st}"></div>
  <div class="half" style="left:${seam}px;width:${w - seam}px"><img src="${rel('card-dark.png')}" style="${st};left:${left - seam}px"></div>
  <div class="seam" style="left:${seam}px"></div>`;
}

const CAP = `
  /* O degrade precisa chegar quase opaco antes do texto comecar: com 0,95 no
     meio, o "Lojas Vendendo" da pagina ainda aparecia por tras da legenda. */
  .cap{position:absolute;z-index:4;left:0;right:0;bottom:0;padding:74px 34px 26px;
       background:linear-gradient(transparent,rgba(9,9,11,.88) 32%,rgba(9,9,11,.99) 62%)}
  .cap b{font-family:Georgia,serif;font-size:23px;display:block;margin-bottom:5px}
  .cap span{color:var(--dim);font-size:13.5px}
  img.full{width:1280px;display:block}
`;

const pages = {
  'promo-small-440x280': { w: 440, h: 280, html: `
<style>${BASE}
  body{width:440px;height:280px;position:relative}
  .split{position:absolute;inset:0}
  .scrim{position:absolute;inset:auto 0 0 0;height:104px;z-index:5;
         background:linear-gradient(transparent,rgba(9,9,11,.9) 32%,#09090b)}
  .bar{position:absolute;z-index:6;left:18px;right:18px;bottom:15px;
       display:flex;align-items:center;gap:11px}
  .bar img{width:30px;height:30px}
  h1{font-size:23px} h1 em{font-style:normal;color:var(--brand-lt)}
  .sub{font-size:10.5px;color:var(--dim);margin-top:3px}
</style>
<div class="split">${split({ seam: 200, w: 440, imgW: 760, left: -6, top: -4 })}</div>
<div class="scrim"></div>
<div class="bar"><img src="${ICON}" alt="">
  <div><h1 class="display">Liga <em>Dark Mode</em></h1>
  <div class="sub">15 sites da Liga: Magic, Yu-Gi-Oh!, Pokémon e mais</div></div>
</div>` },

  'promo-marquee-1400x560': { w: 1400, h: 560, html: `
<style>${BASE}
  body{width:1400px;height:560px;position:relative}
  .split{position:absolute;inset:0}
  .scrim{position:absolute;inset:0 0 0 800px;z-index:5;
         background:linear-gradient(90deg,rgba(12,12,15,0) 0,rgba(12,12,15,.93) 130px,#0c0c0f 260px)}
  .copy{position:absolute;z-index:6;right:72px;top:50%;transform:translateY(-50%);
        width:500px;text-align:right}
  .copy img{width:56px;height:56px;margin-bottom:20px}
  h1{font-size:58px} h1 em{font-style:normal;color:var(--brand-lt);display:block}
  .rule{height:1px;background:#3a3a44;margin:20px 0 0 auto;width:110px}
  .sub{font-size:16.5px;color:#aeb0b8;margin-top:17px;line-height:1.55}
  .meta{margin-top:26px;font-size:10px;color:#61636b}
</style>
<div class="split">${split({ seam: 470, w: 1400, imgW: 1400, left: 0, top: 0 })}
  <div class="fade" style="height:150px"></div>
</div>
<div class="scrim"></div>
<div class="copy"><img src="${ICON}" alt="">
  <h1 class="display">Liga<em>Dark Mode</em></h1>
  <div class="rule"></div>
  <div class="sub">Tema escuro nos 15 sites da Liga — sem mexer<br>
    no verde do menor preço nem nos símbolos<br>de custo de cada jogo.</div>
  <div class="meta mono">1 clique · sem recarregar a página</div>
</div>` },

  'screenshot-1-antes-depois': { w: 1280, h: 800, html: `
<style>${BASE}
  body{width:1280px;height:800px;position:relative}
  .split{position:absolute;left:0;right:0;top:0;height:716px}
  /* Etiquetas logo abaixo do menu laranja: no topo cairiam sobre o logo, e no
     rodape cairiam sobre os botoes "Comprar" das linhas de loja. */
  .tag{top:186px}
  .tag.l{left:20px;background:rgba(255,255,255,.95);color:#2a2f38}
  .tag.d{right:20px;background:rgba(22,22,26,.95);color:var(--text);border:1px solid #3d3d46}
  .foot{position:absolute;z-index:6;left:0;right:0;bottom:0;height:84px;background:#0c0c0f;
        border-top:1px solid var(--line);display:flex;align-items:center;
        justify-content:center;gap:13px}
  .foot img{width:28px;height:28px} .foot b{font-size:21px}
  .foot span{font-size:13.5px;color:var(--dim)}
</style>
<div class="split">${split({ seam: 640, w: 1280, imgW: 1280, left: 0, top: 0 })}
  <div class="tag l mono">Original</div>
  <div class="tag d mono">Com a extensão</div>
  <div class="fade" style="height:120px"></div>
</div>
<div class="foot"><img src="${ICON}" alt="">
  <b class="display">Os mesmos sites da Liga, no escuro</b>
  <span>— preços, tabelas, filtros e formulários</span>
</div>` },

  'screenshot-2-marketplace': { w: 1280, h: 800, html: `
<style>${BASE}${CAP}body{width:1280px;height:800px;position:relative}</style>
<img class="full" src="${rel('card-dark.png')}">
<div class="cap"><b>Marketplace e página de card</b>
  <span>Verde de menor preço, laranja de médio e vermelho de maior continuam dizendo
  a mesma coisa — só que legíveis no escuro.</span>
</div>` },

  'screenshot-3-decks': { w: 1280, h: 800, html: `
<style>${BASE}${CAP}body{width:1280px;height:800px;position:relative}</style>
<img class="full" src="${rel('deck-dark.png')}">
<div class="cap"><b>Decks, curva de mana e análise de cores</b>
  <span>Os gráficos são SVG e recebem tratamento próprio. Os símbolos de mana ficam
  intactos: o branco continua branco e o preto continua preto.</span>
</div>` },

  'screenshot-4-controles': { w: 1280, h: 800, html: `
<style>${BASE}
  body{width:1280px;height:800px;position:relative}
  .bgwrap{position:absolute;inset:0;overflow:hidden}
  .bgwrap img{width:1280px;display:block;filter:blur(7px) brightness(.62) saturate(.95)}
  /* Camada solida sobre o desfoque: so brightness nao segura o laranja do
     cabecalho, e o menu fica fantasmando atras do texto. */
  .veil{position:absolute;inset:0;z-index:2;background:rgba(10,10,13,.7)}
  .stage{position:absolute;inset:0;z-index:3;display:flex;align-items:center;
         justify-content:center;gap:70px;padding:0 78px}
  .pop{border:1px solid var(--line);border-radius:13px;overflow:hidden;
       box-shadow:0 34px 74px rgba(0,0,0,.7);flex:none}
  .pop img{width:330px;display:block}
  .txt{max-width:470px}
  .txt h2{font-family:Georgia,serif;font-size:44px;line-height:1.05;font-weight:700}
  .txt h2 em{font-style:normal;color:var(--brand-lt)}
  .txt ul{list-style:none;margin-top:28px}
  .txt li{font-size:15px;color:#c9cbd1;padding:12px 0 12px 20px;position:relative;
          border-top:1px solid var(--line)}
  .txt li:first-child{border-top:0}
  .txt li::before{content:"";position:absolute;left:0;top:19px;width:7px;height:7px;
                  background:var(--brand);border-radius:1px}
  .txt li i{font-style:normal;color:var(--dim);display:block;font-size:12.5px;margin-top:2px}
</style>
<div class="bgwrap"><img src="${rel('home-dark.png')}"></div>
<div class="veil"></div>
<div class="stage">
  <div class="txt"><h2>Você no <em>controle</em></h2>
    <ul>
      <li>Liga e desliga na hora<i>Sem recarregar a página</i></li>
      <li>Pode seguir o tema do Windows<i>Claro de dia, escuro de noite</i></li>
      <li>Suaviza banners muito claros<i>As artes de carta ficam intactas</i></li>
    </ul>
  </div>
  <div class="pop"><img src="${rel('popup.png')}"></div>
</div>` },
};

console.log('pecas da loja:');
for (const [name, { w, h, html }] of Object.entries(pages)) {
  const file = path.join(TMP, name + '.html');
  fs.writeFileSync(file, '<!doctype html><meta charset="utf-8">' + html);
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'load' });
  const broken = await p.evaluate(async () => {
    await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
    return [...document.images].filter(i => !i.naturalWidth).map(i => i.src.split('/').pop());
  });
  if (broken.length) console.warn(`  aviso: imagens nao carregaram: ${broken.join(', ')}`);
  await new Promise(r => setTimeout(r, 700));
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ${name}.png  ${w}x${h}`);
  await p.close();
}

await browser.close();
console.log(`\npronto: ${path.relative(ROOT, OUT)}`);
