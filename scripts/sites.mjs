// Fonte da verdade dos sites cobertos pela extensao.
//
// Quatro consumidores leem esta tabela: fetch-css (o que baixar), gen (para
// onde rotear cada bundle), gen-manifest (matches e arquivos de cada entrada)
// e audit-live (o que varrer). Antes cada script tinha a sua lista, e elas
// divergiam em silencio -- um site entrava no manifest sem nunca ter passado
// pelo fetch e ficava sem tema, sem nenhum erro aparecer.
//
// Como a LMCorp monta os sites:
//
//   nucleo compartilhado  template-package-v95, template-legado-v26,
//                         legacy-adjustments-v06, template-marketplace-v140...
//                         Identico nos 15 hosts. E o que o tema ja cobria.
//   home                  tres variantes; ver HOME_GROUPS
//   bundle proprio        um por site, em tcg_N/, carregado em TODAS as
//                         paginas. O ligamagic e o unico sem: ele e a base.

/* ---------- grupos de home ---------- */

// A chave vira nome de arquivo (home-<chave>.generated.css) e o prefixo e o
// nome do bundle sem a versao -- a versao sobe a cada deploy e e descoberta
// pelo <link>, nunca fixada aqui.
export const HOME_GROUPS = {
  package: { prefix: 'template-package-home-' },
  v56:     { prefix: 'template-home-v' },
  tcg02:   { prefix: 'template-home-tcg-' },
};

/* ---------- sites ---------- */

// id      curto: vira nome de arquivo, chave de bucket e valor de data-liga
// host    hostname exato. Sem wildcard de subdominio: ver DOMINIOS_EXCLUIDOS
// home    chave em HOME_GROUPS
// bundle  prefixo do bundle proprio (sem versao), ou null
export const SITES = [
  { id: 'magic', host: 'www.ligamagic.com.br',            home: 'package', bundle: null,                          nome: 'LigaMagic' },
  { id: 'ygo',   host: 'www.ligayugioh.com.br',           home: 'package', bundle: 'template-ygo-',               nome: 'Liga Yu-Gi-Oh!' },
  { id: 'onp',   host: 'www.ligaonepiece.com.br',         home: 'package', bundle: 'template-onepiece-',          nome: 'Liga One Piece' },
  { id: 'lor',   host: 'www.ligalorcana.com.br',          home: 'package', bundle: 'template-lor-',               nome: 'Liga Lorcana' },
  { id: 'fab',   host: 'www.ligafab.com.br',              home: 'package', bundle: 'template-fab-',               nome: 'Liga Flesh and Blood' },
  { id: 'rft',   host: 'www.ligariftbound.com.br',        home: 'package', bundle: 'template-rb-',                nome: 'Liga Riftbound' },

  { id: 'pkm',   host: 'www.ligapokemon.com.br',          home: 'tcg02',   bundle: 'template-newlayout-package-', nome: 'Liga Pokemon' },

  { id: 'vgd',   host: 'www.ligavanguard.com.br',         home: 'v56',     bundle: 'template-vgd-',               nome: 'Liga Vanguard' },
  { id: 'dgm',   host: 'www.ligadigimon.com.br',          home: 'v56',     bundle: 'template-digimon-',           nome: 'Liga Digimon' },
  { id: 'swu',   host: 'www.ligastarwars.com.br',         home: 'v56',     bundle: 'template-swu-',               nome: 'Liga Star Wars Unlimited' },
  { id: 'gnd',   host: 'www.ligagundam.com.br',           home: 'v56',     bundle: 'template-gundam-',            nome: 'Liga Gundam' },
  { id: 'sor',   host: 'www.ligasorcery.com.br',          home: 'v56',     bundle: 'template-sorcery-',           nome: 'Liga Sorcery' },
  { id: 'dbm',   host: 'masters.ligadragonball.com.br',   home: 'v56',     bundle: 'template-db-',                nome: 'Liga Dragon Ball Masters' },
  { id: 'dbf',   host: 'fusion.ligadragonball.com.br',    home: 'v56',     bundle: 'template-dfw-',               nome: 'Liga Dragon Ball Fusion World' },
  { id: 'fnk',   host: 'www.mundofunko.com.br',           home: 'v56',     bundle: 'template-mundofunko-',        nome: 'Mundo Funko' },
];

// Ficam de fora de proposito. Rodam motores separados, sem NENHUM bundle em
// comum com o nucleo -- aplicar o tema neles daria pagina meio clara, meio
// escura. E o motivo de nao existir wildcard de subdominio na lista acima:
// `*://*.ligadragonball.com.br/*` pegaria a raiz junto com masters. e fusion.
export const DOMINIOS_EXCLUIDOS = [
  { host: 'www.ligadragonball.com.br', motor: 'tcg_250/package-v01-min.css' },
  { host: 'www.ligasegura.com.br',     motor: 'tcg_150/template-package-v23-min.css' },
];

/* ---------- roteamento de bundle para bucket ---------- */

/**
 * Decide em qual arquivo de saida um bundle de origem deve cair.
 * Devolve 'theme' | 'home-<grupo>' | 'site-<id>'.
 *
 * A ORDEM das checagens importa. `template-package-home-v08-min.css` casa o
 * prefixo do nucleo (`template-package-`) tambem; se o nucleo fosse testado
 * primeiro, a home do grupo package cairia no arquivo compartilhado e seria
 * injetada nos 15 hosts, incluindo os que usam outro template de home.
 */
export function bucketFor(nomeDoArquivo) {
  const n = nomeDoArquivo.replace(/^.*\//, '');

  for (const [grupo, { prefix }] of Object.entries(HOME_GROUPS)) {
    if (n.startsWith(prefix)) return `home-${grupo}`;
  }
  for (const s of SITES) {
    if (s.bundle && n.startsWith(s.bundle)) return `site-${s.id}`;
  }
  return 'theme';
}

/** Ordem de escrita e de processamento: nucleo, depois homes, depois sites. */
export const BUCKET_ORDER = (bucket) =>
  bucket === 'theme' ? 0 : bucket.startsWith('home-') ? 1 : 2;

/** Caminho de saida, relativo a content/, para um bucket. */
export function arquivoDoBucket(bucket) {
  if (bucket === 'theme') return 'theme.generated.css';
  if (bucket.startsWith('home-')) return `${bucket}.generated.css`;
  return `sites/${bucket.slice('site-'.length)}.generated.css`;
}

/* ---------- match patterns ---------- */

/**
 * Padroes de um host. O `*.` do Chrome casaria subdominios que nao queremos
 * (ver DOMINIOS_EXCLUIDOS), entao usamos o host exato. Para os hosts `www.`
 * incluimos tambem o dominio nu, que o site serve sem redirecionar.
 */
export function matchPatterns(host) {
  const p = [`*://${host}/*`];
  if (host.startsWith('www.')) p.push(`*://${host.slice(4)}/*`);
  return p;
}

export const TODOS_OS_PATTERNS = SITES.flatMap(s => matchPatterns(s.host));

/* ---------- paginas de referencia ---------- */

// O ligamagic e o host com mais superficie do grupo: e o unico com forum,
// leiloes, bazar e colecao. Continua sendo ele quem descobre o nucleo inteiro.
export const PAGINAS_LIGAMAGIC = {
  home: '/',
  decks: '/?view=dks/decks&myown=1',
  deck: '/?view=dks/deck&id=10150375',
  card: '/?view=cards/card&card=Sol+Ring',
  busca: '/?view=cards/card&card=Lightning+Bolt',
  busca_lista: '/?view=cards/search&card=bolt',
  edicoes: '/?view=cards/edicoes',
  loja: '/?view=prod/home',
  carrinho: '/?view=mp/carrinho',
  artigos: '/?view=artigos/home',
  artigo: '/?view=artigos/view&edicao=8600',
  forum: '/?view=forum/forum',
  forum_topico: '/?view=forum/topico&secao=15',
  forum_mensagem: '/?view=forum/mensagem&id=183161',
  bazar: '/?view=bzr/bazar',
  leiloes: '/?view=leilao/listar',
  colecao: '/?view=colecao/colecao',
  lista: '/?view=cards/lista',
  mostwanted: '/?view=prod/mostwanted',
  variacao: '/?view=cards/variacao&card=Sol+Ring',
  login: '/?view=logar',
  cadastro: '/?view=newuser',
};

// Nos demais hosts basta descobrir a home e o bundle proprio. O bundle tcg_N
// carrega em toda pagina, entao a home ja o revela; edicoes e loja entram para
// pegar um eventual segundo bundle proprio que so aparece mais fundo.
export const PAGINAS_POR_SITE = {
  home: '/',
  edicoes: '/?view=cards/edicoes',
  loja: '/?view=prod/home',
};

/** Todas as paginas a varrer, como [{site, nome, url}]. */
export function paginasDeReferencia() {
  const out = [];
  for (const s of SITES) {
    const mapa = s.id === 'magic' ? PAGINAS_LIGAMAGIC : PAGINAS_POR_SITE;
    for (const [nome, caminho] of Object.entries(mapa)) {
      out.push({ site: s.id, nome: `${s.id}:${nome}`, url: `https://${s.host}${caminho}` });
    }
  }
  return out;
}
