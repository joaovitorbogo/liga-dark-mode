// Mede o tema aplicado nas paginas reais e aponta o que sobrou claro.
//
// O Chrome desta maquina ignora --load-extension (removido no Chrome 137+),
// entao replicamos o content script: injetamos os dois CSS num <style> e
// ligamos a classe da raiz. Isso valida o CSS, que e o grosso do trabalho; o
// empacotamento se verifica em scripts/check.mjs.
//
// Uso: node scripts/audit-live.mjs [--shot]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pp from 'puppeteer-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, '.cache', 'shots');
const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const shot = process.argv.includes('--shot');

const PAGES = {
  home: 'https://www.ligamagic.com.br/',
  decks: 'https://www.ligamagic.com.br/?view=dks/decks&myown=1',
  deck: 'https://www.ligamagic.com.br/?view=dks/deck&id=10150375',
  card: 'https://www.ligamagic.com.br/?view=cards/card&card=Sol+Ring',
  busca: 'https://www.ligamagic.com.br/?view=cards/search&card=bolt',
  edicoes: 'https://www.ligamagic.com.br/?view=cards/edicoes',
  loja: 'https://www.ligamagic.com.br/?view=prod/home',
  artigos: 'https://www.ligamagic.com.br/?view=artigos/home',
  artigo: 'https://www.ligamagic.com.br/?view=artigos/view&edicao=8600',
  forum: 'https://www.ligamagic.com.br/?view=forum/forum',
  forum_topico: 'https://www.ligamagic.com.br/?view=forum/topico&secao=15',
  forum_mensagem: 'https://www.ligamagic.com.br/?view=forum/mensagem&id=183161',
  bazar: 'https://www.ligamagic.com.br/?view=bzr/bazar',
  leiloes: 'https://www.ligamagic.com.br/?view=leilao/listar',
  colecao: 'https://www.ligamagic.com.br/?view=colecao/colecao',
  lista: 'https://www.ligamagic.com.br/?view=cards/lista',
  variacao: 'https://www.ligamagic.com.br/?view=cards/variacao&card=Sol+Ring',
  login: 'https://www.ligamagic.com.br/?view=logar',
  cadastro: 'https://www.ligamagic.com.br/?view=newuser',
};

const css = [
  fs.readFileSync(path.join(ROOT, 'content', 'theme.generated.css'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'content', 'theme-core.css'), 'utf8'),
].join('\n');

const b = await pp.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});

const p = await b.newPage();
await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36');

// document_start: a classe entra antes da primeira pintura, como faz a extensao.
await p.evaluateOnNewDocument((sheet) => {
  const aplica = (html) => {
    html.classList.add('lmd-dark');
    const inject = () => {
      if (document.getElementById('lmd-style')) return;
      const s = document.createElement('style');
      s.id = 'lmd-style';
      s.textContent = sheet;
      (document.head || document.documentElement).appendChild(s);
    };
    inject();
    document.addEventListener('DOMContentLoaded', inject);
  };
  // documentElement pode ser null tao cedo: espera a raiz existir.
  if (document.documentElement) aplica(document.documentElement);
  else new MutationObserver((_, o) => {
    if (!document.documentElement) return;
    o.disconnect();
    aplica(document.documentElement);
  }).observe(document, { childList: true });
}, css);

if (shot) fs.mkdirSync(SHOTS, { recursive: true });

let totalClaras = 0, totalTexto = 0;

for (const [nome, url] of Object.entries(PAGES)) {
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));

    // O site abre um popup promocional e a barra de cookies por cima de tudo.
    // Sao imagens claras que escondem a pagina e falseiam a medicao.
    await p.evaluate(() => {
      for (const sel of ['#modal-pop', '.modal-pop', '#popup', '.popup-promo',
        '#onetrust-consent-sdk', '#cookie', '.cookie-bar', '.modal-backdrop',
        '[id*="popup" i]', '[class*="popup" i]', '[id*="cookie" i]']) {
        document.querySelectorAll(sel).forEach(e => e.remove());
      }
      document.body.style.overflow = 'auto';
    });
    await new Promise(r => setTimeout(r, 400));

    const rel = await p.evaluate(() => {
      const lum = (c) => {
        const m = /rgba?\(([^)]+)\)/.exec(c);
        if (!m) return null;
        const [r, g, bl, a] = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
        if (a !== undefined && a < 0.9) return null;      // translucido: nao conta
        return (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255;
      };
      const desc = (el) => {
        const cls = (el.className && typeof el.className === 'string')
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        return (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls).slice(0, 70);
      };
      const claras = new Map(), textos = new Map();
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 12) continue;       // icone/spacer: ignora
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.1) continue;

        // Superficie opaca clara: o tema nao alcancou.
        const lb = lum(cs.backgroundColor);
        if (lb !== null && lb > 0.62 && !/^(img|svg|video|canvas)$/.test(el.tagName.toLowerCase())) {
          const k = desc(el) + '  bg=' + cs.backgroundColor;
          claras.set(k, (claras.get(k) || 0) + 1);
        }

        // Texto escuro sobre fundo escuro: ilegivel.
        const temTexto = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (temTexto) {
          const lt = lum(cs.color);
          let fundo = null, n = el;
          while (n && n !== document.documentElement) {
            const l2 = lum(getComputedStyle(n).backgroundColor);
            if (l2 !== null) { fundo = l2; break; }
            n = n.parentElement;
          }
          if (lt !== null && lt < 0.35 && fundo !== null && fundo < 0.4) {
            const k = desc(el) + '  color=' + cs.color;
            textos.set(k, (textos.get(k) || 0) + 1);
          }
        }
      }
      const top = (m) => [...m.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12);
      return {
        claras: top(claras), textos: top(textos),
        nClaras: [...claras.values()].reduce((a, c) => a + c, 0),
        nTextos: [...textos.values()].reduce((a, c) => a + c, 0),
        body: getComputedStyle(document.body).backgroundColor,
      };
    });

    totalClaras += rel.nClaras;
    totalTexto += rel.nTextos;
    console.log(`\n### ${nome}  (body ${rel.body})  claras=${rel.nClaras}  textoEscuro=${rel.nTextos}`);
    rel.claras.forEach(([k, n]) => console.log(`   BG  x${n}  ${k}`));
    rel.textos.forEach(([k, n]) => console.log(`   TX  x${n}  ${k}`));

    if (shot) await p.screenshot({ path: path.join(SHOTS, `${nome}.png`), fullPage: false });
  } catch (e) {
    console.error(`\n### ${nome}: ERRO ${e.message}`);
  }
}

await b.close();
console.log(`\ntotal: ${totalClaras} superficies claras, ${totalTexto} textos escuros`);
