// Monta a pilha de CSS que a extensao injeta num host.
//
// Existe para o audit e para as pecas da loja usarem exatamente a mesma
// definicao. Sao os dois lugares que "fingem ser a extensao" num Chrome sem
// --load-extension (removido no 137+), e se cada um montasse a sua pilha um
// deles estaria medindo ou fotografando algo que o usuario nao ve.
//
// A pilha e lida do PROPRIO manifest.json, e nao remontada a partir de
// sites.mjs: se os dois divergirem, e o manifest que o Chrome obedece, entao e
// ele que tem que ser auditado e fotografado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Converte um match pattern do Chrome numa regexp de URL. */
export function regexDoPattern(p) {
  return new RegExp(
    '^' + p.replace(/[.]/g, '\\.').replace(/^\*:/, 'https?:').replace(/\*/g, '[^/]*') + '$'
  );
}

/**
 * O CSS que a extensao injeta em `host`, concatenado na ordem em que o manifest
 * declara -- que e a ordem do cascade.
 */
export function pilhaDe(host) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const alvo = `https://${host}/`;
  const arquivos = manifest.content_scripts
    .filter(c => c.matches.some(p => regexDoPattern(p).test(alvo)))
    .flatMap(c => c.css || []);
  if (!arquivos.length) throw new Error(`nenhuma entrada de content_scripts cobre ${host}`);
  return arquivos.map(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');
}
