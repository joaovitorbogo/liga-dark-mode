# Liga Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a extensão de um domínio (`ligamagic.com.br`) numa extensão de 15 hosts do grupo LMCorp, com o núcleo de CSS compartilhado e uma camada isolada por site.

**Arquitetura:** Uma tabela única (`scripts/sites.mjs`) alimenta fetch, geração, manifest e audit. O gerador passa a rotear cada bundle de origem para um *bucket* de saída — núcleo compartilhado, grupo de home, ou site — e cada bucket vira um arquivo CSS servido por uma entrada de `content_scripts` com `matches` próprio. O isolamento entre sites é garantido pelo navegador, não por convenção de seletor.

**Tech Stack:** Node 18+ (ESM), postcss, puppeteer-core, Chrome MV3.

## Global Constraints

- Manifest V3, sem build step. O que está no repositório é o que é publicado.
- Nenhum `content_scripts.matches` pode cobrir `www.ligadragonball.com.br` ou `www.ligasegura.com.br` — motores separados, não tematizados.
- `url()` no CSS gerado tem que ser **absoluta** (`https://www.lmcorp.com.br/...`): o CSS vem de outro domínio e root-relative resolveria contra a página.
- Todo seletor gerado é prefixado com `html.lmd-dark`.
- Espaçamento de 1200 ms entre fetches e retry com espera crescente em 429 — o site limita a taxa e falha em silêncio.
- Sem framework de teste: o ciclo de verificação é `npm run check` (asserções no CSS gerado) e `npm run audit` (varredura em páginas reais).
- Versão alvo: 2.0.0 em `manifest.json` e `package.json`.

---

### Task 1: `sites.mjs` — a fonte da verdade

**Files:**
- Create: `scripts/sites.mjs`

**Interfaces:**
- Produces: `SITES` (array), `HOME_GROUPS` (objeto), `matchPatterns(site)`, `bucketFor(nomeDoBundle)`, `PAGES_POR_SITE(host)`.

- [ ] **Step 1: Escrever a tabela**

Cada entrada: `id` (curto, vira nome de arquivo e valor de `data-liga`), `host`, `home` (grupo), `bundle` (prefixo do bundle próprio, sem versão, ou `null`).

- [ ] **Step 2: Escrever `bucketFor`**

Roteia pelo nome de arquivo do bundle. Ordem importa: home antes de núcleo, porque `template-package-home-v08` também casa o prefixo de `template-package-`.

- [ ] **Step 3: Verificar**

Run: `node -e "import('./scripts/sites.mjs').then(m=>{console.log(m.SITES.length); console.log(m.bucketFor('template-package-home-v08-min.css'), m.bucketFor('template-package-v95-min.css'), m.bucketFor('template-ygo-v32-min.css'))})"`
Expected: `15` e `home-package theme site-ygo`

- [ ] **Step 4: Commit**

---

### Task 2: `gen-manifest.mjs` — manifest gerado

**Files:**
- Create: `scripts/gen-manifest.mjs`
- Modify: `manifest.json` (passa a ser saída)
- Modify: `package.json` (script `manifest`)

**Interfaces:**
- Consumes: `SITES`, `HOME_GROUPS`, `matchPatterns` da Task 1.

- [ ] **Step 1: Gerar as 19 entradas de `content_scripts`**

Ordem de injeção = ordem do array: núcleo, homes, sites. Quem vem depois vence no cascade, que é o que queremos (o bundle do site sobrepõe o núcleo).

- [ ] **Step 2: Rodar e conferir**

Run: `node scripts/gen-manifest.mjs && node -e "const m=require('./manifest.json');console.log(m.content_scripts.length)"`
Expected: `19`

- [ ] **Step 3: Verificar que nenhum padrão pega os domínios fora de escopo**

Run: `node -e "const m=require('./manifest.json');const p=m.content_scripts.flatMap(c=>c.matches);console.log(p.some(x=>/\*\.\w*dragonball/.test(x)||/ligasegura/.test(x)))"`
Expected: `false`

- [ ] **Step 4: Commit**

---

### Task 3: `apply.js` + `sites.css` — a costura por site

**Files:**
- Modify: `content/apply.js`
- Create: `content/sites.css`

- [ ] **Step 1: Carimbar `data-liga` no `document_start`**

Deriva do `location.hostname`, tabela inline (o content script não pode importar `sites.mjs`). Aplicado no mesmo ponto onde `lmd-dark` já é aplicado, e reaplicado pelo `MutationObserver` existente.

- [ ] **Step 2: Criar `sites.css` com o cabeçalho explicativo e nenhuma regra**

Arquivo vazio de propósito: é o lugar das exceções que aparecerem no audit.

- [ ] **Step 3: Verificar no Chrome**

Carregar a extensão, abrir `www.ligayugioh.com.br`, conferir `document.documentElement.dataset.liga === 'ygo'`.

- [ ] **Step 4: Commit**

---

### Task 4: `fetch-css.mjs` — descobrir os bundles dos 15 hosts

**Files:**
- Modify: `scripts/fetch-css.mjs`

**Interfaces:**
- Consumes: `SITES` da Task 1.
- Produces: `.cache/css/*.css` e `.cache/css-manifest.json` com `{nome, url, base, bucket}`.

- [ ] **Step 1: Trocar `PAGES` fixo por páginas derivadas de `SITES`**

Ligamagic mantém as 22 páginas atuais (é o host com mais superfície). Os outros 14 ganham 3 cada: `/`, `?view=cards/edicoes`, `?view=prod/home`.

- [ ] **Step 2: Resolver href relativo contra o host da página, não contra ligamagic fixo**

Bug latente hoje: `href.startsWith('/')` concatena `https://www.ligamagic.com.br`. Com 15 hosts isso passaria a apontar para o site errado.

- [ ] **Step 3: Guardar o `bucket` no manifesto**

- [ ] **Step 4: Rodar**

Run: `npm run fetch`
Expected: ~64 páginas sem erro, e o manifesto listando os 14 bundles `tcg_N` mais os 3 de home.

- [ ] **Step 5: Conferir que todo site tem seu bundle**

Run: `node -e "const m=require('./.cache/css-manifest.json');console.log([...new Set(m.map(x=>x.bucket))].sort().join(' '))"`
Expected: `home-package home-tcg02 home-v56 site-dbf site-dbm site-dgm site-fab site-fnk site-gnd site-lor site-onp site-pkm site-rft site-sor site-swu site-vgd site-ygo theme`

- [ ] **Step 6: Commit**

---

### Task 5: `gen.mjs` — rotear a saída por bucket

**Files:**
- Modify: `scripts/gen.mjs`

- [ ] **Step 1: Trocar `chunks` global por `chunks` por bucket**

`processRoot` recebe o bucket e empurra para `buckets.get(bucket)`.

- [ ] **Step 2: Manter o passo 1 (tabela de variáveis) global**

Uma variável definida no núcleo é usada nos bundles `tcg_N`. Se a coleta virar por bucket, as variáveis do núcleo somem e os bundles por site geram cor errada. Isto **não** muda.

- [ ] **Step 3: Ordenar o passo 2: núcleo → homes → sites**

O `seen` global descarta regra repetida; a primeira ocorrência tem que ser a do arquivo mais abrangente, senão uma regra do núcleo acabaria só no arquivo de um site.

- [ ] **Step 4: Escrever um arquivo por bucket**

`theme.generated.css`, `home-<grupo>.generated.css`, `sites/<id>.generated.css`.

- [ ] **Step 5: Rodar**

Run: `npm run build`
Expected: 18 arquivos escritos, contagem de regras por arquivo no log.

- [ ] **Step 6: Commit**

---

### Task 6: `check.mjs` — asserções sobre todos os arquivos

**Files:**
- Modify: `scripts/check.mjs`

- [ ] **Step 1: Iterar sobre todos os arquivos gerados em vez de um só**

As asserções existentes (url() absoluta, escopo `html.lmd-dark`, ausência de cor de marca destruída) passam a rodar por arquivo, com o nome no relatório.

- [ ] **Step 2: Adicionar asserção nova: todo arquivo de bucket tem entrada no manifest**

Evita o modo de falha silenciosa de gerar `sites/gnd.generated.css` e esquecer de referenciá-lo.

- [ ] **Step 3: Rodar**

Run: `npm run check`
Expected: todos os checks em PASS.

- [ ] **Step 4: Commit**

---

### Task 7: `audit-live.mjs` — varredura nos 15 hosts

**Files:**
- Modify: `scripts/audit-live.mjs`

- [ ] **Step 1: Manter as 22 páginas do ligamagic como suíte de regressão**

- [ ] **Step 2: Adicionar smoke de 3 páginas por host restante**

- [ ] **Step 3: Relatar por host, com total de superfícies claras e textos escuros**

- [ ] **Step 4: Rodar**

Run: `npm run audit`
Expected: 0 superfícies claras e 0 textos escuros em todos os hosts. Qualquer não-zero vira regra em `content/sites.css` e repete.

- [ ] **Step 5: Commit**

---

### Task 8: Renomear, documentar e preparar a loja

**Files:**
- Modify: `manifest.json` (nome, versão), `package.json` (nome, versão), `README.md`, `docs/index.html`, `popup/popup.html`, `store/LISTING.md`

- [ ] **Step 1: Nome "Liga Dark Mode", versão 2.0.0**
- [ ] **Step 2: Política de privacidade listando os 15 hosts**
- [ ] **Step 3: README com a tabela de sites e o pipeline novo**
- [ ] **Step 4: `LISTING.md` com o aviso de reaprovação de permissões**
- [ ] **Step 5: Commit**

---

## Self-Review

**Cobertura da spec:** inventário → Task 1/4; arquitetura de arquivos → Task 5; manifest gerado → Task 2; `data-liga` → Task 3; pipeline → Tasks 4–7; migração da loja → Task 8; risco 1 (audit como portão) → Task 7; risco 2 (símbolos por jogo) → Task 7, resolvido por evidência do audit em vez de adivinhação; risco 3 → Task 4 (fetch descobre versão pelo `<link>`).

**Consistência de tipos:** `bucketFor` devolve `theme` | `home-<grupo>` | `site-<id>`; esse mesmo string é chave do manifesto (Task 4), do mapa de buckets (Task 5) e do nome de arquivo (Task 5). `id` é a única chave usada em `data-liga`, nome de arquivo e `sites/<id>.generated.css`.
