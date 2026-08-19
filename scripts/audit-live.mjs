// Mede o tema aplicado nas paginas reais dos 15 sites e aponta o que sobrou
// claro. E o portao de release: com um nucleo de CSS compartilhado, um erro de
// tema nao quebra um site, quebra quinze.
//
// O Chrome desta maquina ignora --load-extension (removido no Chrome 137+),
// entao replicamos o content script: injetamos num <style> exatamente os CSS
// que o manifest declara PARA AQUELE HOST e ligamos a classe da raiz.
//
// Injetar a pilha certa por host e o ponto todo. Jogar todos os arquivos em
// toda pagina daria um audit verde que nao corresponde ao que o usuario ve: o
// arquivo do Pokemon estaria consertando uma superficie do Yu-Gi-Oh que na
// extensao real fica clara, porque la ele nem chega a ser injetado. Quem monta
// a pilha e scripts/pilha.mjs, compartilhado com as pecas da loja.
//
// Uso: node scripts/audit-live.mjs [--shot] [--site=ygo,pkm]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pp from 'puppeteer-core';
import { SITES, PAGINAS_LIGAMAGIC, PAGINAS_POR_SITE } from './sites.mjs';
import { pilhaDe } from './pilha.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, '.cache', 'shots');
const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const shot = process.argv.includes('--shot');
const filtro = (process.argv.find(a => a.startsWith('--site=')) || '').slice(7)
  .split(',').filter(Boolean);


const alvos = SITES.filter(s => !filtro.length || filtro.includes(s.id));
const paginas = alvos.flatMap(s => {
  const mapa = s.id === 'magic' ? PAGINAS_LIGAMAGIC : PAGINAS_POR_SITE;
  return Object.entries(mapa).map(([nome, caminho]) => ({
    site: s.id, host: s.host, nome, url: `https://${s.host}${caminho}` }));
});

console.log(`auditando ${paginas.length} paginas em ${alvos.length} hosts\n`);

const b = await pp.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});

if (shot) fs.mkdirSync(SHOTS, { recursive: true });

const porSite = new Map();
let totalClaras = 0, totalTexto = 0, erros = 0;

for (const site of alvos) {
  const css = pilhaDe(site.host);
  // Uma aba por site: evaluateOnNewDocument acumula na mesma pagina, e a pilha
  // do site anterior continuaria injetada junto com a deste.
  const p = await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36');

  // document_start: a classe entra antes da primeira pintura, como faz a extensao.
  await p.evaluateOnNewDocument((sheet, id) => {
    const aplica = (html) => {
      html.classList.add('lmd-dark');
      html.setAttribute('data-liga', id);
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
  }, css, site.id);

  let sClaras = 0, sTexto = 0;
  const achados = [];

  for (const pg of paginas.filter(x => x.site === site.id)) {
    try {
      await p.goto(pg.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
        // Area que sobra depois de cortar pelos ancestrais com overflow. Sem
        // isso o audit acusa superficies que o usuario nunca ve: o indicador de
        // hover do menu do Pokemon e um bloco amarelo de 80px empurrado por
        // transform:translateY(75px) para fora de um container recortado --
        // acento de marca preservado de proposito, invisivel no estado normal.
        //
        // O corte e por clipping, nao por sobreposicao: um container claro
        // parcialmente coberto por um filho ainda mostra o proprio fundo nas
        // bordas, e esse caso continua sendo contado.
        const areaVisivel = (el) => {
          let r = el.getBoundingClientRect();
          let box = { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
          for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (!/hidden|clip|scroll|auto/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
            const p = n.getBoundingClientRect();
            box = {
              top: Math.max(box.top, p.top), left: Math.max(box.left, p.left),
              bottom: Math.min(box.bottom, p.bottom), right: Math.min(box.right, p.right),
            };
          }
          return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
        };

        const claras = new Map(), textos = new Map();
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width < 24 || r.height < 12) continue;       // icone/spacer: ignora
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.1) continue;
          if (areaVisivel(el) < 24 * 12) continue;           // recortado: o usuario nao ve

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
        const top = (m) => [...m.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 8);
        return {
          claras: top(claras), textos: top(textos),
          nClaras: [...claras.values()].reduce((a, c) => a + c, 0),
          nTextos: [...textos.values()].reduce((a, c) => a + c, 0),
          body: getComputedStyle(document.body).backgroundColor,
        };
      });

      sClaras += rel.nClaras;
      sTexto += rel.nTextos;
      if (rel.nClaras || rel.nTextos) {
        achados.push(`  ${pg.nome}  (body ${rel.body})  claras=${rel.nClaras} textoEscuro=${rel.nTextos}`);
        rel.claras.forEach(([k, n]) => achados.push(`     BG  x${n}  ${k}`));
        rel.textos.forEach(([k, n]) => achados.push(`     TX  x${n}  ${k}`));
      }

      if (shot) await p.screenshot({ path: path.join(SHOTS, `${site.id}-${pg.nome}.png`), fullPage: false });
    } catch (e) {
      achados.push(`  ${pg.nome}: ERRO ${e.message}`);
      erros++;
    }
  }

  await p.close();
  porSite.set(site.id, { sClaras, sTexto });
  totalClaras += sClaras;
  totalTexto += sTexto;

  const marca = sClaras || sTexto ? 'X' : 'ok';
  console.log(`[${marca}] ${site.id.padEnd(6)} ${site.host.padEnd(34)} claras=${String(sClaras).padStart(4)} textoEscuro=${String(sTexto).padStart(4)}`);
  achados.forEach(l => console.log(l));
}

await b.close();

console.log(`\n${'-'.repeat(64)}`);
const sujos = [...porSite.entries()].filter(([, v]) => v.sClaras || v.sTexto);
console.log(`total: ${totalClaras} superficies claras, ${totalTexto} textos escuros, ${erros} erro(s)`);
if (sujos.length) {
  console.log(`\n${sujos.length} site(s) com pendencia: ${sujos.map(([id]) => id).join(', ')}`);
  console.log('Cada pendencia vira uma regra em content/sites.css (se for de um site so)');
  console.log('ou em content/theme-core.css (se aparecer em varios).');
}
process.exitCode = (totalClaras || totalTexto || erros) ? 1 : 0;
