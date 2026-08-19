# Liga Dark Mode — consolidar os sites da LMCorp numa extensão só

Data: 2026-08-18
Estado: aprovado, em implementação

## Problema

A extensão `ligamagic-dark-mode` v1.0.4 tematiza um domínio. Existem outros
14 sites do mesmo grupo (LMCorp) sem modo escuro. Criar um repositório e um
item de loja por site significaria manter 15 cópias do mesmo
`theme.generated.css` e republicar 15 itens a cada deploy da LMCorp — os
bundles têm versão no nome do arquivo e sobem sem aviso.

## Descoberta que motiva o desenho

Os sites não são parecidos: são o mesmo site. Todos rodam o mesmo motor PHP
(rotas `?view=cards/search`, `?view=artigos/view`, `?view=prod/home`) e
carregam o mesmo núcleo de bundles, da mesma URL, na mesma versão, de
`www.lmcorp.com.br`:

    template-package-v95-min.css
    template-legado-v26-min.css
    legacy-adjustments-v06-min.css
    template-editions-v08-min.css
    template-marketplace-v140-min.css   (e os demais já em .cache/css/)

Esse núcleo é exatamente o que o `theme.generated.css` atual já cobre. O que
impede a aplicação nos outros sites é o `matches` do manifest, não o CSS.

Sobre esse núcleo, cada site empilha **um bundle próprio**, servido de um
diretório `tcg_N/` e carregado em **todas** as páginas (home e internas). O
LigaMagic é o único que não tem: ele é a base.

## Inventário real

### Núcleo compartilhado
Os bundles já presentes em `.cache/css/`, aplicáveis aos 15 domínios.

### Bundles de home — 3 grupos

| Grupo | Bundle | Sites |
|---|---|---|
| `package` | `template-package-home-v08` | ligamagic, ligayugioh, ligaonepiece, ligalorcana, ligafab, ligariftbound |
| `v56` | `template-home-v56` | ligavanguard, ligadigimon, ligastarwars, ligagundam, ligasorcery, masters.ligadragonball, fusion.ligadragonball, mundofunko |
| `tcg02` | `template-home-tcg-02-v15` | ligapokemon |

O repositório está com `template-package-home-v07`; precisa subir para v08.

### Bundles por site — 14

| id | Host | Bundle próprio |
|---|---|---|
| `magic` | www.ligamagic.com.br | (nenhum — é a base) |
| `pkm` | www.ligapokemon.com.br | `tcg_2/template-newlayout-package-v32` |
| `ygo` | www.ligayugioh.com.br | `tcg_3/template-ygo-v32` |
| `vgd` | www.ligavanguard.com.br | `tcg_5/template-vgd-v10` |
| `dbm` | masters.ligadragonball.com.br | `tcg_7/template-db-v13` |
| `fab` | www.ligafab.com.br | `tcg_8/template-fab-v09` |
| `lor` | www.ligalorcana.com.br | `tcg_9/template-lor-v02` |
| `dgm` | www.ligadigimon.com.br | `tcg_10/template-digimon-v06` |
| `onp` | www.ligaonepiece.com.br | `tcg_11/template-onepiece-v08` |
| `swu` | www.ligastarwars.com.br | `tcg_12/template-swu-v02` |
| `dbf` | fusion.ligadragonball.com.br | `tcg_13/template-dfw-v02` |
| `gnd` | www.ligagundam.com.br | `tcg_17/template-gundam-v02` |
| `sor` | www.ligasorcery.com.br | `tcg_18/template-sorcery-v03` |
| `rft` | www.ligariftbound.com.br | `tcg_19/template-rb-v02` |
| `fnk` | www.mundofunko.com.br | `tcg_92/template-mundofunko-v15` |

Total a tematizar além do que já existe: **17 bundles** (14 por site, 2 homes
novas, 1 bump de versão).

## Escopo

15 hosts. Padrões de match, um por host — **sem wildcard de subdomínio**:

    *://www.ligamagic.com.br/*        *://www.ligastarwars.com.br/*
    *://ligamagic.com.br/*            *://www.ligagundam.com.br/*
    *://www.ligayugioh.com.br/*       *://www.ligasorcery.com.br/*
    *://www.ligapokemon.com.br/*      *://www.ligariftbound.com.br/*
    *://www.ligaonepiece.com.br/*     *://www.mundofunko.com.br/*
    *://www.ligalorcana.com.br/*      *://masters.ligadragonball.com.br/*
    *://www.ligafab.com.br/*          *://fusion.ligadragonball.com.br/*
    *://www.ligavanguard.com.br/*
    *://www.ligadigimon.com.br/*

### Fora de escopo, e por quê

Dois domínios rodam motores separados, sem nenhum bundle em comum com o
núcleo. Aplicar tema neles produziria página meio clara, meio escura:

- `www.ligadragonball.com.br` (a raiz) — `tcg_250/package-v01-min.css`
- `www.ligasegura.com.br` — `tcg_150/template-package-v23-min.css`

Isso é o que proíbe o wildcard `*://*.ligadragonball.com.br/*`: ele cobriria a
raiz não tematizada junto com `masters.` e `fusion.`, que são do núcleo. Os
dois subdomínios entram listados explicitamente.

## Arquitetura

`apply.js` e `theme-core.css` não contêm nenhuma referência a ligamagic — o
código publicado já é agnóstico de domínio. Só os scripts de build conhecem o
nome do site.

    scripts/sites.mjs              NOVO — fonte da verdade: host, id, home, bundle
    content/
      apply.js                     carimba data-liga="<id>" no <html>
      theme-core.css               inalterado
      theme.generated.css          núcleo compartilhado, 15 hosts
      home-package.generated.css   NOVO — grupo package
      home-v56.generated.css       NOVO — grupo v56
      home-tcg02.generated.css     NOVO — grupo tcg02
      sites/<id>.generated.css     NOVO — 14 arquivos, um por site
      sites.css                    NOVO — overrides manuais [data-liga="..."]

### Por que arquivos separados, e não um concatenado

Os bundles por site e os três templates de home foram escritos pelo mesmo time
e reciclam nomes de classe genéricos sobre estruturas diferentes. Num arquivo
único, uma regra do bundle do Pokémon casaria num elemento homônimo do Magic.
Arquivos separados, servidos por entradas de `content_scripts` com `matches`
distintos, tornam a colisão impossível: o CSS do Pokémon não é sequer injetado
numa aba do Magic.

Isolamento por match pattern é mais forte que isolamento por seletor — a
garantia passa a ser do navegador em vez de depender de disciplina a cada
regra nova.

### `sites.mjs` como fonte da verdade

Com 15 hosts, `manifest.json` passa a ser **gerado**. Escrever 19 entradas de
`content_scripts` à mão é convite a divergência entre a lista de fetch, a de
audit e a do manifest. Uma tabela só alimenta os quatro consumidores: fetch,
gen, gen-manifest e audit. Adicionar o site 16 vira uma linha.

### Papel do `data-liga`

Não separa os grupos; o manifest faz isso. Existe para a exceção pontual
futura ("o acento do ligagundam ficou ilegível"), resolvida com uma regra em
`sites.css`, sem arquivo novo nem entrada nova no manifest. `apply.js` deriva o
valor do hostname no `document_start`, junto com `lmd-dark`.

### Manifest gerado

19 entradas de `content_scripts`, todas `run_at: document_start`,
`all_frames: false`:

1. Compartilhada — os 16 padrões; css `theme.generated.css`, `theme-core.css`,
   `sites.css`; js `apply.js`
2–4. Uma por grupo de home — os padrões do grupo; css `home-<grupo>.generated.css`
5–19. Uma por site com bundle próprio — o padrão do host; css `sites/<id>.generated.css`

As entradas de home aplicam em todas as páginas do domínio, não só em `/`. As
classes dos templates de home só existem na home, então isso não causa erro —
apenas evita depender de casar path exato.

## Pipeline

| Script | Mudança |
|---|---|
| `sites.mjs` | Novo. Tabela de sites e grupos de home; exporta helpers de roteamento bundle → bucket. |
| `fetch-css.mjs` | Mantém as 22 páginas do ligamagic (o site com mais superfície: fórum, leilões, bazar, coleção) e ganha 3 páginas por site restante (home, edições, loja). ~64 fetches. |
| `gen.mjs` | Passo 1 (tabela de variáveis) continua global sobre todos os bundles — uma variável definida no núcleo é usada nos bundles por site. Passo 2 passa a acumular chunks **por bucket** e escrever um arquivo por bucket. |
| `gen-manifest.mjs` | Novo. Gera `manifest.json` a partir de `sites.mjs` e da versão do `package.json`. |
| `check.mjs` | Verificações passam a rodar sobre todos os arquivos gerados, não só um. |
| `audit-live.mjs` | As 22 páginas do ligamagic (regressão) mais smoke de 3 páginas por site restante. |

O site responde 429 numa varredura longa; o espaçamento e o retry existentes
são requisito, não otimização. Como os fetches novos se espalham por 14 hosts,
o limite por host é menos apertado que no ligamagic.

### Dedupe entre buckets

`gen.mjs` mantém um `seen` global de regras. Se uma regra idêntica aparece no
núcleo e num bundle por site, a segunda é descartada — correto, porque o
arquivo do núcleo é injetado em todos os hosts. A ordem de processamento
precisa ser: núcleo primeiro, depois homes, depois por site.

## Migração da Chrome Web Store

Item existente renomeado e expandido (14 usuários instalados; base pequena o
bastante para absorver a reaprovação de permissões).

- Repositório e pasta local: `ligamagic-dark-mode` → `liga-dark-mode`
- Nome da extensão: "Liga Dark Mode"
- Versão: 2.0.0
- `docs/index.html` (política de privacidade) passa a listar os 15 hosts
- **A URL da política muda ao renomear o repositório.** O campo na listagem
  precisa ser atualizado antes da submissão.
- Capturas novas via `store-assets.mjs`, preservando o truque do antes/depois
  em um único carregamento (os banners dos anunciantes giram a cada request e
  quebrariam a ilusão da página partida ao meio)
- Changelog avisando que a extensão fica desabilitada até reaprovar permissões

## Riscos

1. **Um bug de tema quebra 15 sites.** `audit-live` deixa de ser opcional e
   passa a ser portão de release.
2. **Vocabulário de símbolo por jogo.** A deny-list (`SELECTOR_DENY`,
   `gen.mjs:386`) foi escrita com vocabulário de Magic. `card-color-*` já é
   compartilhado entre jogos (Yu-Gi-Oh usa `card-color-d` onde Magic usa
   `card-color-c`) e está coberto. Os ícones de interface são por jogo
   (`icon-filter-new-tcg-1` no Magic, `-3` no Yu-Gi-Oh, `-11` no One Piece),
   mas são ícones de UI, não semântica de jogo — devem ser tematizados. O que
   precisa de conferência é o equivalente de `mtg-symbol` em cada bundle
   `tcg_N`, que só aparece depois do fetch.
3. **17 bundles versionados independentemente.** `fetch-css` já detecta versão
   pelo `<link>`, então o risco real é um site novo aparecer sem ninguém notar.

## Critérios de aceitação

- `npm run check` passa em todos os arquivos gerados
- `audit-live` reporta 0 superfícies claras e 0 textos escuros nas 22 páginas
  do ligamagic (paridade com hoje) e no smoke dos 15 hosts
- Semântica de preço (verde/vermelho/dourado) e símbolos de custo preservados
  em cada jogo
- `manifest.json` gerado carrega sem erro e o tema aparece nos 15 hosts, home
  e página interna
- Nenhum padrão de match cobre `www.ligadragonball.com.br` ou `ligasegura`
