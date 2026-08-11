# LigaMagic Dark Mode

Extensão do Chrome (Manifest V3) que aplica um tema escuro no
[ligamagic.com.br](https://www.ligamagic.com.br/): marketplace, página de card,
decks, edições, artigos, fórum, carrinho e login.

O tema **não** é um filtro de inversão. Ele é derivado do CSS real do site: os
20 bundles são baixados, parseados e reescritos regra a regra, remapeando só os
valores de cor — e por papel, não por cor. Isso preserva o que faz o site ser
reconhecível: o laranja da marca continua laranja, o verde de "menor preço"
continua verde, o vermelho de "maior preço" continua vermelho, e os símbolos de
mana continuam exatamente como o jogo os desenha.

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
npm run theme      # fetch → measure → build → check
```

Cada etapa isolada:

| Comando | O que faz |
|---|---|
| `npm run fetch` | descobre os bundles de CSS pelos `<link>` de 22 páginas de referência e baixa os 20 arquivos. Os nomes têm versão (`template-package-v95-min.css`) e mudam a cada deploy, por isso não podem ser fixos |
| `npm run measure` | decodifica cada imagem de fundo num canvas e mede a luminância média |
| `npm run build` | gera `content/theme.generated.css` (~230 KB, 2.215 regras) |
| `npm run check` | verificações estáticas: parse, escopo dos seletores, URLs, regras-chave |
| `npm run audit` | mede o tema aplicado nas páginas reais e lista o que sobrou claro |
| `npm run icons` | regenera os PNGs do ícone |
| `npm run store` | gera as capturas e blocos promocionais da Chrome Web Store em `store/` |

Dois bundles escapam da descoberta por `<link>`, cada um por um motivo:

- **compra por lista** — é injetado por JavaScript depois que o passo do wizard
  monta, então não existe no HTML servido;
- **perfil** — a página de usuário (`?view=user&nick=...`) responde *"você
  precisa estar logado"* para quem baixa o HTML no fetch, e o `<link>` só sai
  junto com o conteúdo.

Nos dois casos a página inteira ficava fora do tema (a compra por lista com
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

O site mistura duas convenções, e o que funciona para uma quebra a outra:

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

`npm run audit` percorre 19 páginas reais com o tema aplicado, mede
`getComputedStyle` de todo elemento e lista (a) superfícies opacas com
luminância > 0,62 e (b) texto com luminância < 0,35 sobre fundo escuro. A meta é
zero dos dois — que é onde está hoje:

```
home     0/0    artigos   0/0    bazar     0/0    variacao  0/0
decks    0/0    artigo    0/0    leiloes   0/0    login     0/0
deck     0/0    forum     0/0    colecao   0/0    cadastro  0/0
card     0/0    forum_topico   0/0    lista   0/0
busca    0/0    forum_mensagem 0/0
edicoes  0/0    loja      0/0
```

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
- Se a LigaMagic publicar um deploy com CSS novo, rode `npm run theme` de novo.

## Publicar na Chrome Web Store

`store/` já tem as quatro capturas em 1280×800 e os dois blocos promocionais, e
`store/LISTING.md` traz o texto do anúncio e a justificativa de cada permissão.
`npm run check` confere o que costuma reprovar submissão sem dizer por quê:
canal alfa no PNG, dimensão errada e mais de cinco capturas.

Política de privacidade: `docs/index.html`, bilíngue (a revisão é feita em
inglês), publicada via GitHub Pages.

## Licença

MIT.
