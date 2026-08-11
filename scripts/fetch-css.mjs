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

// Bundles que a varredura acima nunca enxerga, por dois motivos diferentes:
//
// - compra por lista: e injetado por JavaScript depois que o passo do wizard
//   monta, entao nao existe no HTML servido. A pagina inteira ficou fora do
//   tema por causa disso (zebrado branco, botao branco no branco).
// - perfil: a pagina de usuario (?view=user&nick=...) responde "voce precisa
//   estar logado" para quem baixa o HTML aqui, e o <link> so sai junto com o
//   conteudo. Logado, era a folha que pintava os blocos de #fff -- o perfil
//   aparecia branco inteiro.
//
// O numero de versao sobe a cada deploy igual ao dos outros, e aqui nao ha
// <link> para ler, entao a versao conhecida e so o ponto de partida: subimos a
// partir dela ate as versoes acabarem. Fixar o numero devolveria o silencio.
//
// Tem que ser a MAIOR que responde, nao a primeira: o servidor continua
// entregando as versoes antigas (a v11 esta no ar do lado da v12), entao parar
// no primeiro 200 congelaria o tema numa folha velha sem nenhum erro aparecer.
const SEM_LINK = [
  { base: 'https://www.lmcorp.com.br/arquivos/compraporlista/package/', nome: 'compraporlista-v%-min.css', v: 12 },
  { base: 'https://www.lmcorp.com.br/arquivos/css/', nome: 'template-perfil-v%-min.css', v: 5 },
];
const VERSOES_VAZIAS = 4;   // quantos 404 seguidos encerram a busca

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

// A ordem importa no cascade e estes carregam por ultimo (o da compra por
// lista entra depois que a pagina ja montou; o do perfil e a folha da pagina,
// que vem depois das do template), entao vao para o fim da lista.
for (const b of SEM_LINK) {
  let ultima = null, vazias = 0;
  for (let v = b.v; vazias < VERSOES_VAZIAS; v++) {
    const url = b.base + b.nome.replace('%', v);
    let ok = false;
    try {
      const r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA } });
      ok = r.ok;
    } catch { /* rede instavel: conta como vazia e segue */ }
    if (ok) { ultima = { v, url }; vazias = 0; } else vazias++;
    await dorme(150);
  }
  if (ultima) {
    cssUrls.add(ultima.url);
    console.log(`sem link: ${ultima.url.split('/').pop()}` +
      (ultima.v !== b.v ? `  (a versao subiu de v${b.v}: atualize SEM_LINK)` : ''));
  } else {
    console.error(`sem link: ERRO nao achei ${b.nome} a partir de v${b.v} em ${b.base}`);
  }
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
