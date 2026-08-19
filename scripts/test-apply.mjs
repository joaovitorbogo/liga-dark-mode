// Exercita content/apply.js num navegador real: e a unica peca que o check
// (estatico) e o audit (que replica o content script) nao tocam.
import fs from 'node:fs';
import pp from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const apply = fs.readFileSync('content/apply.js', 'utf8');

const stub = () => {
  window.chrome = {
    storage: {
      sync: { get: (d, cb) => setTimeout(() => cb(d), 5) },
      onChanged: { addListener: () => {} },
    },
    runtime: {},
  };
};

const casos = [
  ['https://www.ligayugioh.com.br/', 'ygo'],
  ['https://masters.ligadragonball.com.br/', 'dbm'],
  ['https://www.mundofunko.com.br/', 'fnk'],
  ['https://www.ligamagic.com.br/', 'magic'],
];

const b = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
let falhas = 0;

for (const [url, esperado] of casos) {
  const p = await b.newPage();
  await p.evaluateOnNewDocument(stub);
  await p.evaluateOnNewDocument(apply);
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 800));
  const r = await p.evaluate(() => ({
    liga: document.documentElement.getAttribute('data-liga'),
    dark: document.documentElement.classList.contains('lmd-dark'),
  }));
  const ok = r.liga === esperado && r.dark;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${url.padEnd(42)} data-liga=${r.liga} lmd-dark=${r.dark} (esperado ${esperado})`);
  await p.close();
}

// Numa aba que a extensao nao cobre o script nao deve carimbar nada.
{
  const p = await b.newPage();
  await p.evaluateOnNewDocument(stub);
  await p.evaluateOnNewDocument(apply);
  await p.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 500));
  const liga = await p.evaluate(() => document.documentElement.getAttribute('data-liga'));
  const ok = liga === null;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok   ' : 'FALHA'} host desconhecido nao recebe data-liga (veio ${liga})`);
  await p.close();
}

// O observer tem que devolver classe e atributo se um script do site apagar.
{
  const p = await b.newPage();
  await p.evaluateOnNewDocument(stub);
  await p.evaluateOnNewDocument(apply);
  await p.goto('https://www.ligasorcery.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 800));
  const ok = await p.evaluate(async () => {
    document.documentElement.classList.remove('lmd-dark');
    document.documentElement.removeAttribute('data-liga');
    await new Promise(r => setTimeout(r, 400));
    return document.documentElement.classList.contains('lmd-dark') &&
           document.documentElement.getAttribute('data-liga') === 'sor';
  });
  if (!ok) falhas++;
  console.log(`${ok ? 'ok   ' : 'FALHA'} observer devolve classe e data-liga depois de o site apagar`);
  await p.close();
}

await b.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
