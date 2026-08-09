// Descobre e baixa os bundles de CSS do ligamagic.com.br.
//
// O site e renderizado no servidor e serve o CSS de outro dominio
// (www.lmcorp.com.br), com um numero de versao no nome do arquivo
// (template-package-v95-min.css). Esse numero sobe a cada deploy, entao a lista
// nao pode ser fixa: descobrimos pelos <link> das paginas de referencia.
//
// Uso: node scripts/fetch-css.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.cache', 'css');
const PAGES_OUT = path.join(ROOT, '.cache', 'pages');

// Uma pagina por familia de template. Cada uma puxa um subconjunto diferente
// dos bundles; juntas cobrem os seis.
const PAGES = {
  home: 'https://www.ligamagic.com.br/',
  decks: 'https://www.ligamagic.com.br/?view=dks/decks&myown=1',
  deck: 'https://www.ligamagic.com.br/?view=dks/deck&id=10150375',
  card: 'https://www.ligamagic.com.br/?view=cards/card&card=Sol+Ring',
  busca: 'https://www.ligamagic.com.br/?view=cards/card&card=Lightning+Bolt',
  busca_lista: 'https://www.ligamagic.com.br/?view=cards/search&card=bolt',
  edicoes: 'https://www.ligamagic.com.br/?view=cards/edicoes',
  loja: 'https://www.ligamagic.com.br/?view=prod/home',
  carrinho: 'https://www.ligamagic.com.br/?view=mp/carrinho',
  artigos: 'https://www.ligamagic.com.br/?view=artigos/home',
  artigo: 'https://www.ligamagic.com.br/?view=artigos/view&edicao=8600',
  forum: 'https://www.ligamagic.com.br/?view=forum/forum',
  forum_topico: 'https://www.ligamagic.com.br/?view=forum/topico&secao=15',
  forum_mensagem: 'https://www.ligamagic.com.br/?view=forum/mensagem&id=183161',
  bazar: 'https://www.ligamagic.com.br/?view=bzr/bazar',
  leiloes: 'https://www.ligamagic.com.br/?view=leilao/listar',
  colecao: 'https://www.ligamagic.com.br/?view=colecao/colecao',
  lista: 'https://www.ligamagic.com.br/?view=cards/lista',
  mostwanted: 'https://www.ligamagic.com.br/?view=prod/mostwanted',
  variacao: 'https://www.ligamagic.com.br/?view=cards/variacao&card=Sol+Ring',
  login: 'https://www.ligamagic.com.br/?view=logar',
  cadastro: 'https://www.ligamagic.com.br/?view=newuser',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const dorme = (ms) => new Promise(r => setTimeout(r, ms));

// O site limita a taxa: uma rajada de 20 paginas seguidas comeca a devolver
// 429 no meio da lista, e as pastas que faltam saem do tema sem aviso nenhum.
// Espacamos as requisicoes e insistimos com espera crescente.
async function get(url, tentativas = 3) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9' } });
    if (r.ok) return r.text();
    if (r.status !== 429 || i >= tentativas) throw new Error(`${r.status} ${r.statusText}`);
    await dorme(4000 * (i + 1));
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PAGES_OUT, { recursive: true });

const cssUrls = new Set();

for (const [nome, url] of Object.entries(PAGES)) {
  try {
    const html = await get(url);
    fs.writeFileSync(path.join(PAGES_OUT, `${nome}.html`), html);
    let n = 0;
    for (const m of html.matchAll(/<link[^>]+href=["']?([^"'> ]+\.css[^"'> ]*)/gi)) {
      let href = m[1];
      if (href.startsWith('//')) href = 'https:' + href;
      else if (href.startsWith('/')) href = 'https://www.ligamagic.com.br' + href;
      // Fontes do Google nao interessam: nao definem cor.
      if (/fonts\.googleapis\.com/.test(href)) continue;
      if (cssUrls.has(href)) continue;
      cssUrls.add(href);
      n++;
    }
    console.log(`${nome}: ${html.length} bytes, ${n} css novo(s)`);
  } catch (e) {
    console.error(`${nome}: ERRO ${e.message}`);
  }
  await dorme(1200);
}

// Limpa o cache antigo: os nomes tem versao e sobrariam bundles obsoletos, que
// o gerador leria como se ainda estivessem no ar.
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

// A ordem de carga importa: quem vem depois vence no cascade. Guardamos a
// ordem descoberta para o gerador respeitar (o nome do arquivo por si so nao
// diz nada). O caminho de origem tambem vai junto: as url() do CSS sao
// relativas a pasta do bundle, e o gerador precisa disso para absolutiza-las.
const manifest = [];
for (const url of cssUrls) {
  const nome = url.split('/').pop();
  try {
    const css = await get(url);
    fs.writeFileSync(path.join(OUT, nome), css);
    manifest.push({ nome, url, base: url.slice(0, url.lastIndexOf('/') + 1) });
    console.log(`  ${nome}  ${(css.length / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.error(`  ${nome}: ERRO ${e.message}`);
  }
}

fs.writeFileSync(path.join(ROOT, '.cache', 'css-manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\n${manifest.length} bundles em ${path.relative(ROOT, OUT)}`);
