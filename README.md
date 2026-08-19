# Liga Dark Mode

Extensão do Chrome (Manifest V3) que aplica um tema escuro nos **15 sites da
Liga** (LMCorp): marketplace, página de card, decks, edições, artigos, fórum,
leilões, bazar, carrinho e login.

| Site | Host | | Site | Host |
|---|---|---|---|---|
| LigaMagic | `ligamagic.com.br` | | Liga Vanguard | `ligavanguard.com.br` |
| Liga Yu-Gi-Oh! | `ligayugioh.com.br` | | Liga Digimon | `ligadigimon.com.br` |
| Liga Pokémon | `ligapokemon.com.br` | | Liga Star Wars | `ligastarwars.com.br` |
| Liga One Piece | `ligaonepiece.com.br` | | Liga Gundam | `ligagundam.com.br` |
| Liga Lorcana | `ligalorcana.com.br` | | Liga Sorcery | `ligasorcery.com.br` |
| Liga Flesh and Blood | `ligafab.com.br` | | Dragon Ball Masters | `masters.ligadragonball.com.br` |
| Liga Riftbound | `ligariftbound.com.br` | | Dragon Ball Fusion | `fusion.ligadragonball.com.br` |
| | | | Mundo Funko | `mundofunko.com.br` |

O tema **não** é um filtro de inversão. Ele é derivado do CSS real dos sites: os
37 bundles são baixados, parseados e reescritos regra a regra, remapeando só os
valores de cor — e por papel, não por cor. Isso preserva o que faz cada site ser
reconhecível: a cor da marca continua a mesma, o verde de "menor preço" continua
verde, o vermelho de "maior preço" continua vermelho, e os símbolos de custo
continuam exatamente como cada jogo os desenha.

## Por que uma extensão e não quinze

Os sites da Liga não são parecidos: são o **mesmo site**. Rodam o mesmo motor
PHP (`?view=cards/search`, `?view=artigos/view`) e carregam o mesmo núcleo de
bundles de `www.lmcorp.com.br`. Sobre esse núcleo, cada site empilha um bundle
próprio em `tcg_N/`, carregado em todas as páginas — o LigaMagic é o único sem,
porque ele *é* a base.

Manter um repositório por site significaria manter 15 cópias do mesmo tema e
republicar 15 itens a cada deploy da LMCorp, já que os bundles trazem a versão
no nome do arquivo.

### Como o isolamento entre sites é garantido

A saída do gerador é dividida em *buckets*, e cada um vira uma entrada de
`content_scripts` com o `matches` daquele host:

| Bucket | Arquivo | Injetado em |
|---|---|---|
| núcleo | `content/theme.generated.css` | os 15 hosts |
| home (3 grupos) | `content/home-<grupo>.generated.css` | os sites do grupo |
| site (14) | `content/sites/<id>.generated.css` | um host só |

Os bundles próprios reciclam nomes de classe genéricos sobre estruturas
diferentes, então uma regra do Pokémon casaria num elemento homônimo do Magic se
tudo morasse num arquivo só. Com arquivos separados, **o CSS de um site nem
chega a ser injetado no outro**: a garantia é do navegador, não de convenção de
seletor.

`scripts/sites.mjs` é a fonte da verdade dessa tabela. Fetch, geração, manifest
e audit leem dela — antes cada script tinha a sua lista, e listas que divergem
em silêncio produzem um site sem tema sem nenhum erro aparecer. O
`manifest.json` é **gerado** (`npm run manifest`); não edite à mão.

## Instalar

1. `chrome://extensions` → ligue **Modo do desenvolvedor**
2. **Carregar sem compactação** → aponte para esta pasta

O tema já vem ligado. O ícone na barra abre um popup com três controles:

| Opção | O que faz |
|---|---|
| **Modo escuro** | liga/desliga (é só uma classe no `<html>`: instantâneo, sem recarregar) |
| **Seguir o tema do sistema** | fica claro quando o Windows estiver no modo claro |
| **Suavizar banners** | reduz o brilho de banners e capas de artigo; **as artes de carta ficam intactas** |

## Como o tema é gerado

```
npm install
npm run theme      # fetch → measure → build → manifest → check
```

Cada etapa isolada:

| Comando | O que faz |
|---|---|
| `npm run fetch` | descobre os bundles pelos `<link>` de 64 páginas de referência (22 no LigaMagic, 3 em cada um dos outros 14) e baixa os 37 arquivos. Os nomes têm versão (`template-package-v95-min.css`) e mudam a cada deploy, por isso não podem ser fixos |
| `npm run measure` | decodifica cada imagem de fundo num canvas e mede a luminância média |
| `npm run build` | gera os 18 arquivos de bucket (~380 KB somados, 4.514 regras) |
| `npm run manifest` | gera `manifest.json` a partir de `scripts/sites.mjs` |
| `npm run check` | verificações estáticas em todos os arquivos gerados: parse, escopo dos seletores, URLs, símbolos preservados, cobertura dos 15 hosts, e se a tabela repetida em `apply.js` bate com `sites.mjs` |
| `npm test` | roda o `apply.js` num Chrome real e confere `data-liga` por host, o não-carimbo em host desconhecido e a recuperação pelo `MutationObserver` |
| `npm run audit` | mede o tema nas páginas reais dos 15 hosts, com a pilha de CSS certa em cada um, e lista o que sobrou claro. Aceita `--shot` e `--site=ygo,pkm` |
| `npm run icons` | regenera os PNGs do ícone |
| `npm run store` | gera as capturas e blocos promocionais da Chrome Web Store em `store/` |

Dois bundles escapam da descoberta por `<link>`, cada um por um motivo:

- **compra por lista** — é injetado por JavaScript depois que o passo do wizard
  monta, então não existe no HTML servido;
- **perfil** — a página de usuário (`?view=user&nick=...`) responde *"você
  precisa estar logado"* para quem baixa o HTML no fetch, e o `<link>` só sai
  junto com o conteúdo.

Os dois são do núcleo: valem para os 15 hosts. Nos dois casos a página inteira ficava fora do tema (a compra por lista com
zebrado branco e botão branco no branco; o perfil com todos os blocos em
`#fff`). Eles estão fixados em `SEM_LINK`, em `scripts/fetch-css.mjs`. Como ali
não há `<link>` para ler a versão, a versão conhecida é só o ponto de partida:
se ela morrer, o fetch procura as próximas e avisa qual encontrou. Fixar o
número devolveria o silêncio.

### Mapeamento por papel

O papel de uma cor muda o tratamento dela:

- **fundo** — a ordem de elevação é *preservada*, não invertida. No tema claro o
  card branco fica sobre a página cinza; no escuro o card continua sendo a
  camada mais clara. Inverter a luminosidade deixaria o card mais escuro que a
  página e mataria a hierarquia.
- **texto** — escuro clareia, claro fica como está.
- **borda** — um pouco mais clara que a superfície, senão some.
- **sombra** — vira preta; sombra clara não existe no escuro.
- **acentos** (saturação alta) — sobrevivem, é a marca e a semântica de preço.
  Clareados até a luminância *percebida* (WCAG) atingir o alvo, não até um valor
  fixo de HSL: em `L = 0,55` o amarelo já passa de 0,7 de luminância e o
  vermelho fica em 0,22 — tratar os dois igual deixaria o vermelho ilegível.

### Custom properties: duas famílias, dois tratamentos

Os sites misturam duas convenções, e o que funciona para uma quebra a outra:

- As próprias (`--color-white`, `--color-gray`) nomeiam a **cor**, não o papel:
  `--color-white` aparece 28× como `background-color` e 20× como `color`.
  Remapear a definição erraria metade dos usos — então `var(--x)` é resolvido no
  ponto de **uso**, onde a propriedade revela o papel.
- As do Bootstrap 5 (`--bs-dropdown-bg`, `--bs-card-color`) nomeiam o **papel** e
  são definidas no próprio componente, não na raiz. Essas são remapeadas na
  **definição**, com o papel lido do sufixo do nome.

Uma variável nunca cai nos dois caminhos.

### Camada de ajuste à mão

`content/theme-core.css` carrega depois da camada gerada e cuida do que o
algoritmo não alcança sozinho:

- base da página, scrollbar, seleção, autofill, `color-scheme: dark`
- tabelas (zebrado e cabeçalho) — o site é feito de tabelas de preço
- Bootstrap e jQuery UI (o datepicker tem fundo em PNG branco, que nenhum
  remapeamento de cor alcança)
- **Highcharts**: os três painéis da página de deck são SVG, onde a cor está em
  `fill`/`stroke`. O gerador nem chega lá — ele pula qualquer seletor que toque
  `svg`, para não estragar os símbolos de mana
- rede de segurança para `style=""` inline, que o site (renderizado em PHP)
  escreve em vários pontos
- **HTML de apresentação**: as áreas mais antigas (tópico e mensagem do fórum,
  leilões) ainda usam `bgcolor` no `<tr>` e `<font color=red>`. Isso não está em
  stylesheet nenhum, então o gerador nunca alcança — quem apontou foi o audit,
  com 50 superfícies claras e 48 textos vermelhos ilegíveis nessas páginas
- **`filter:` sobre controle de formulário**: os filtros dos painéis da home
  tingem a seta do `<select>` com uma cadeia `invert()/sepia()/hue-rotate()`
  aplicada no próprio elemento. Filtro não atinge só o `background-image`:
  atinge tudo. No claro isso passa (o select não tem caixa), no escuro ele
  pintava o retângulo inteiro da cor do painel e engolia o texto. A camada à mão
  desliga o filtro e devolve a seta como SVG embutido
- **degrau de elevação na ponta escura da escala**: mapear por papel preserva a
  ordem certa, mas não a distância percebida — `#fff`/`#e7e7e7` viram
  `#242424`/`#191919`, que é metade do contraste em L\*. O zebrado da compra por
  lista precisou do ajuste à mão

## Verificação

`npm run audit` percorre 64 páginas reais nos 15 hosts com o tema aplicado, mede
`getComputedStyle` de todo elemento e lista (a) superfícies opacas com
luminância > 0,62 e (b) texto com luminância < 0,35 sobre fundo escuro. A meta é
zero dos dois — que é onde está hoje:

```
[ok] magic  www.ligamagic.com.br            claras=0  textoEscuro=0
[ok] ygo    www.ligayugioh.com.br           claras=0  textoEscuro=0
[ok] onp    www.ligaonepiece.com.br         claras=0  textoEscuro=0
[ok] lor    www.ligalorcana.com.br          claras=0  textoEscuro=0
[ok] fab    www.ligafab.com.br              claras=0  textoEscuro=0
[ok] rft    www.ligariftbound.com.br        claras=0  textoEscuro=0
[ok] pkm    www.ligapokemon.com.br          claras=0  textoEscuro=0
[ok] vgd    www.ligavanguard.com.br         claras=0  textoEscuro=0
[ok] dgm    www.ligadigimon.com.br          claras=0  textoEscuro=0
[ok] swu    www.ligastarwars.com.br         claras=0  textoEscuro=0
[ok] gnd    www.ligagundam.com.br           claras=0  textoEscuro=0
[ok] sor    www.ligasorcery.com.br          claras=0  textoEscuro=0
[ok] dbm    masters.ligadragonball.com.br   claras=0  textoEscuro=0
[ok] dbf    fusion.ligadragonball.com.br    claras=0  textoEscuro=0
[ok] fnk    www.mundofunko.com.br           claras=0  textoEscuro=0
```

O audit injeta em cada host **exatamente** os arquivos que o `manifest.json`
declara para ele, lidos do próprio manifest. Jogar todos os arquivos em toda
página daria um verde que não corresponde ao que o usuário vê: o arquivo do
Pokémon consertaria uma superfície do Yu-Gi-Oh que na extensão real fica clara,
porque lá ele nem chega a ser injetado.

A medição desconta área recortada por ancestral com `overflow` — sem isso o
indicador de hover do menu do Pokémon (um bloco de 80 px empurrado por
`transform` para fora de um container recortado) aparecia como pendência, sendo
acento de marca preservado de propósito e invisível no estado normal.

> O Chrome 137+ removeu `--load-extension`, então o audit **replica** o content
> script via `evaluateOnNewDocument` em vez de carregar a extensão. Isso valida o
> CSS, que é o grosso do trabalho; o empacotamento se verifica em
> `npm run check`.

## Limitações conhecidas

- Páginas atrás de login (meus decks, minha loja, pedidos, mensagens) não puderam
  ser verificadas visualmente — o tema cobre o CSS delas, porque ele vem dos
  bundles e não da renderização, mas ninguém olhou o resultado. E o audit
  também não as vê: o perfil ficou branco até alguém logado reclamar, porque a
  folha dele nem estava sendo baixada. Uma página fora do audit é uma página
  cujo bundle pode estar faltando sem que nada acuse.
- Banners de anunciantes são imagens: continuam claros. É para isso que serve a
  opção **Suavizar banners**.
- Se a LMCorp publicar um deploy com CSS novo, rode `npm run theme` de novo. O
  `fetch` avisa quando um bundle carregado por um único site não-magic cai no
  núcleo: é o sinal de que um site ganhou template próprio e o prefixo precisa
  entrar em `SITES[].bundles`.
- `www.ligadragonball.com.br` (a raiz) e `ligasegura.com.br` ficam **de fora**:
  rodam motores separados (`tcg_250/`, `tcg_150/`), sem nenhum bundle em comum
  com o núcleo. Aplicar o tema neles daria página meio clara, meio escura — é
  por isso que os padrões de match usam host exato em vez de wildcard de
  subdomínio.

## Publicar na Chrome Web Store

`store/` já tem as quatro capturas em 1280×800 e os dois blocos promocionais, e
`store/LISTING.md` traz o texto do anúncio e a justificativa de cada permissão.
`npm run check` confere o que costuma reprovar submissão sem dizer por quê:
canal alfa no PNG, dimensão errada e mais de cinco capturas.

Política de privacidade: `docs/index.html`, bilíngue (a revisão é feita em
inglês), publicada via GitHub Pages.

## Licença

MIT.
