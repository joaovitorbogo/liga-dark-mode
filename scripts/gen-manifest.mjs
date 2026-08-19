// Gera manifest.json a partir de scripts/sites.mjs.
//
// Com 15 hosts o manifest tem 19 entradas de content_scripts. Escrever isso a
// mao garante que uma hora a lista de matches de uma entrada saia de sincronia
// com a tabela de sites -- e o sintoma seria um site sem tema, sem erro.
//
// Uso: node scripts/gen-manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SITES, HOME_GROUPS, matchPatterns, TODOS_OS_PATTERNS, arquivoDoBucket,
} from './sites.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'manifest.json');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const ICONS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

const base = {
  run_at: 'document_start',
  all_frames: false,
};

// A ordem do array e a ordem de injecao, e quem vem depois vence no cascade.
// Nucleo primeiro, home no meio, bundle do site por ultimo -- mesma ordem em
// que o proprio site carrega as folhas.
const content_scripts = [];

// 1. Nucleo compartilhado: vale nos 15 hosts.
content_scripts.push({
  ...base,
  matches: TODOS_OS_PATTERNS,
  css: ['content/theme.generated.css', 'content/theme-core.css', 'content/sites.css'],
  js: ['content/apply.js'],
});

// 2. Uma entrada por grupo de home.
for (const grupo of Object.keys(HOME_GROUPS)) {
  const doGrupo = SITES.filter(s => s.home === grupo);
  if (!doGrupo.length) continue;
  content_scripts.push({
    ...base,
    matches: doGrupo.flatMap(s => matchPatterns(s.host)),
    css: [`content/${arquivoDoBucket(`home-${grupo}`)}`],
  });
}

// 3. Uma entrada por site com bundle proprio. O ligamagic nao tem: ele e a
//    base, e o nucleo ja cobre tudo o que ele carrega.
for (const s of SITES) {
  if (!s.bundles.length) continue;
  content_scripts.push({
    ...base,
    matches: matchPatterns(s.host),
    css: [`content/${arquivoDoBucket(`site-${s.id}`)}`],
  });
}

const manifest = {
  manifest_version: 3,
  name: 'Liga Dark Mode',
  version: pkg.version,
  description: 'Modo escuro para os sites da Liga: Magic, Yu-Gi-Oh!, Pokemon, One Piece, Lorcana, Digimon e mais.',
  icons: ICONS,
  action: {
    default_title: 'Liga Dark Mode',
    default_popup: 'popup/popup.html',
    default_icon: ICONS,
  },
  permissions: ['storage', 'activeTab'],
  content_scripts,
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');

const arquivos = content_scripts.flatMap(c => [...(c.css || []), ...(c.js || [])]);
const faltando = [...new Set(arquivos)].filter(f => !fs.existsSync(path.join(ROOT, f)));

console.log(`${content_scripts.length} entradas de content_scripts`);
console.log(`  1 nucleo (${TODOS_OS_PATTERNS.length} patterns)`);
console.log(`  ${Object.keys(HOME_GROUPS).length} de home`);
console.log(`  ${SITES.filter(s => s.bundles.length).length} por site`);
console.log(`versao: ${pkg.version}`);
if (faltando.length) {
  console.error(`\nAVISO: ${faltando.length} arquivo(s) referenciado(s) e ausente(s):`);
  faltando.forEach(f => console.error('  ' + f));
  console.error('Rode: npm run build');
}
