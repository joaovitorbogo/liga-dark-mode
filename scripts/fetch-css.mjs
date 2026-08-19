// Descobre e baixa os bundles de CSS dos sites da Liga.
//
// Os sites sao renderizados no servidor e servem o CSS de outro dominio
// (www.lmcorp.com.br), com um numero de versao no nome do arquivo
// (template-package-v95-min.css). Esse numero sobe a cada deploy, entao a lista
// nao pode ser fixa: descobrimos pelos <link> das paginas de referencia.
//
// Cada bundle e roteado para um bucket (nucleo compartilhado, grupo de home, ou
// site), que decide em qual arquivo de saida o gerador vai escreve-lo. Ver
// scripts/sites.mjs.
//
// Uso: node scripts/fetch-css.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paginasDeReferencia, bucketFor, SITES } from './sites.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.cache', 'css');
const PAGES_OUT = path.join(ROOT, '.cache', 'pages');

// Bundles que a varredura nunca enxerga, por dois motivos diferentes:
//
// - compra por lista: e injetado por JavaScript depois que o passo do wizard
//   monta, entao nao existe no HTML servido. A pagina inteira ficou fora do
//   tema por causa disso (zebrado branco, botao branco no branco).
// - perfil: a pagina de usuario (?view=user&nick=...) responde "voce precisa
//   estar logado" para quem baixa o HTML aqui, e o <link> so sai junto com o
//   conteudo. Logado, era a folha que pintava os blocos de #fff -- o perfil
//   aparecia branco inteiro.
//
// Os dois sao do nucleo: valem para os 15 hosts.
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

const cssUrls = new Map();   // url -> Set de ids de site que a carregam
const paginas = paginasDeReferencia();
const falhas = [];

console.log(`varrendo ${paginas.length} paginas em ${SITES.length} hosts\n`);

for (const { site, nome, url } of paginas) {
  try {
    const html = await get(url);
    // O nome tem "site:pagina" e ":" nao e valido em nome de arquivo no
    // Windows. O cache e so para inspecao manual, entao trocar por "-" basta.
    fs.writeFileSync(path.join(PAGES_OUT, `${nome.replace(/:/g, '-')}.html`), html);
    const origem = new URL(url).origin;
    let n = 0;
    for (const m of html.matchAll(/<link[^>]+href=["']?([^"'> ]+\.css[^"'> ]*)/gi)) {
      let href = m[1];
      if (href.startsWith('//')) href = 'https:' + href;
      // Resolver contra a ORIGEM DA PAGINA, nao contra um host fixo. Com 15
      // hosts, concatenar 'https://www.ligamagic.com.br' num href
      // root-relative do ligayugioh baixaria o arquivo do site errado.
      else if (href.startsWith('/')) href = origem + href;
      // Fontes do Google nao interessam: nao definem cor.
      if (/fonts\.googleapis\.com/.test(href)) continue;
      if (!cssUrls.has(href)) { cssUrls.set(href, new Set()); n++; }
      cssUrls.get(href).add(site);
    }
    console.log(`${nome.padEnd(22)} ${String(html.length).padStart(7)} bytes, ${n} css novo(s)`);
  } catch (e) {
    console.error(`${nome.padEnd(22)} ERRO ${e.message}`);
    falhas.push(nome);
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
    if (!cssUrls.has(ultima.url)) cssUrls.set(ultima.url, new Set(['magic']));
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
const usados = new Set();
console.log('');
for (const [url, sites] of cssUrls) {
  // O nome do bundle vem do caminho completo depois de /css/, com "/" virando
  // "__": tcg_3/template-ygo-v32-min.css e tcg_9/template-lor-v02-min.css tem
  // basename distinto hoje, mas nada garante isso -- a LMCorp poderia servir
  // dois tcg_N/template-home-min.css e um sobrescreveria o outro em silencio.
  const caminho = url.replace(/^https?:\/\/[^/]+\/arquivos\//, '');
  const nome = caminho.replace(/\//g, '__');
  if (usados.has(nome)) { console.error(`  colisao de nome: ${nome}`); continue; }
  usados.add(nome);
  const bucket = bucketFor(caminho);
  try {
    const css = await get(url);
    fs.writeFileSync(path.join(OUT, nome), css);
    manifest.push({ nome, url, base: url.slice(0, url.lastIndexOf('/') + 1), bucket, sites: [...sites] });
    console.log(`  ${bucket.padEnd(11)} ${nome.padEnd(46)} ${(css.length / 1024).toFixed(0).padStart(4)} KB`);
  } catch (e) {
    console.error(`  ${nome}: ERRO ${e.message}`);
    falhas.push(nome);
  }
}

fs.writeFileSync(path.join(ROOT, '.cache', 'css-manifest.json'), JSON.stringify(manifest, null, 1));

// Um site sem bundle proprio no manifesto significa que a varredura dele
// falhou -- e o sintoma seria um site sem tema, sem erro nenhum.
const semBundle = SITES.filter(s => s.bundles.length && !manifest.some(m => m.bucket === `site-${s.id}`));

// Candidatos a bundle proprio que cairam no nucleo. A tabela em sites.mjs e
// que decide o roteamento, mas ela so sabe dos bundles que ja existiam: quando
// a LMCorp der a um site um template proprio novo, ele entra no nucleo em
// silencio e passa a ser injetado nos 15 hosts.
//
// A deteccao nao pode ser automatica. A varredura e assimetrica de proposito
// (22 paginas no ligamagic, 3 nos demais), entao template-forum-v2 tambem
// aparece carregado "so pelo magic" -- e ele e do motor compartilhado, os
// outros sites tambem tem forum. Por isso isto avisa em vez de rotear: so o
// caso de um site NAO-magic sozinho e suspeito de verdade.
const suspeitos = manifest.filter(m =>
  m.bucket === 'theme' && m.sites.length === 1 && m.sites[0] !== 'magic');

console.log(`\n${manifest.length} bundles em ${path.relative(ROOT, OUT)}`);
const porBucket = {};
for (const m of manifest) porBucket[m.bucket] = (porBucket[m.bucket] || 0) + 1;
console.log(`buckets: ${Object.keys(porBucket).sort().join(' ')}`);
if (semBundle.length) {
  console.error(`\nERRO: ${semBundle.length} site(s) sem bundle proprio: ${semBundle.map(s => s.id).join(', ')}`);
  console.error('O tema desses sites ficaria incompleto. Rode de novo.');
}
if (suspeitos.length) {
  console.warn(`\nAVISO: ${suspeitos.length} bundle(s) no nucleo carregado(s) por um site nao-magic so.`);
  console.warn('Provavelmente sao bundles proprios. Se forem, acrescente o prefixo em SITES[].bundles,');
  console.warn('senao eles sao injetados nos 15 hosts e podem colidir com classes homonimas:');
  for (const s of suspeitos) console.warn(`  ${s.sites[0].padEnd(6)} ${s.nome}`);
}
if (falhas.length) console.error(`\n${falhas.length} falha(s): ${falhas.join(', ')}`);
if (semBundle.length || falhas.length) process.exitCode = 1;
