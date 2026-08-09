# Material para a Chrome Web Store

## Imagens (prontas nesta pasta)

| Arquivo | Tamanho | Onde entra |
| --- | --- | --- |
| `../icons/icon128.png` | 128×128 | Ícone da loja (obrigatório) |
| `screenshot-1-antes-depois.png` | 1280×800 | Captura 1 (obrigatório: ao menos uma) |
| `screenshot-2-marketplace.png` | 1280×800 | Captura 2 |
| `screenshot-3-decks.png` | 1280×800 | Captura 3 |
| `screenshot-4-controles.png` | 1280×800 | Captura 4 |
| `promo-small-440x280.png` | 440×280 | Bloco promocional pequeno (opcional) |
| `promo-marquee-1400x560.png` | 1400×560 | Bloco promocional marquee (opcional) |

Use `screenshot-1` como primeira — é a que aparece maior na página da loja.

O "antes/depois" é a mesma página cortada ao meio, clara de um lado e escura do
outro. As duas metades vêm de **um único carregamento**, alternando a classe da
raiz: a LigaMagic gira os banners dos anunciantes a cada request, e capturar em
dois carregamentos deixava anúncios diferentes nos dois lados — o truque
desmontava na hora.

### Requisitos que estas imagens já cumprem

| Exigência da loja | Situação |
| --- | --- |
| Máximo de 5 capturas | 4 |
| 1280×800 ou 640×400 | todas em 1280×800 |
| PNG de 24 bits **sem alfa**, ou JPEG | PNG colorType 2, sem `tRNS` |

O ponto que costuma reprovar submissão é o canal alfa: PNG de 32 bits é
recusado, e a mensagem de erro não diz que o problema é esse. O Chrome descarta
o alfa sozinho quando a página capturada é opaca, que é o caso aqui — mas isso é
consequência do conteúdo, não garantia. `npm run check` verifica profundidade,
colorType, ausência de `tRNS`, dimensões e a contagem de capturas, então uma
peça nova fora do padrão aparece antes de você subir.

## Nome

```
LigaMagic Dark Mode
```

## Descrição breve (até 132 caracteres)

```
Modo escuro para a LigaMagic: marketplace, cards, decks, edições e fórum. Liga e desliga em um clique.
```

## Descrição completa

```
Modo escuro para o ligamagic.com.br.

A LigaMagic não tem tema escuro próprio. Esta extensão aplica um, escurecendo o
site inteiro — marketplace, página de card, decks, edições, artigos, fórum,
leilões, bazar, carrinho e login — sem mexer no laranja da marca.

O que ela faz

• Escurece fundos, tabelas de preço, filtros, menus, formulários e caixas de
  diálogo.
• Mantém as cores que carregam significado. O verde de menor preço, o laranja de
  médio e o vermelho de maior continuam dizendo exatamente a mesma coisa, só que
  legíveis no escuro.
• Não toca nos símbolos de mana nem nas cores de carta: o W continua branco e o
  B continua preto. São a linguagem visual do jogo, não decoração de interface.
• Trata os gráficos da página de deck (curva de mana e análise de cores), que
  são SVG e ficariam brancos com qualquer solução genérica.
• Preserva a hierarquia visual: o que era uma caixa sobre a página continua
  parecendo uma caixa sobre a página.
• Liga e desliga em um clique, sem recarregar a página.
• Pode seguir o tema do Windows: claro de dia, escuro de noite.
• Suaviza banners de anunciantes, se você quiser. As artes de carta ficam
  intactas — é o produto que você está avaliando.

Como funciona

O tema não é um filtro de inversão em cima da tela. Ele é gerado a partir do CSS
real da LigaMagic: cada regra de cor do site é lida e remapeada de acordo com o
papel dela na página — fundo, texto, borda ou sombra. É por isso que o resultado
não tem aquele aspecto lavado de inversão automática, e é por isso que a arte das
cartas e as fotos das lojas continuam com as cores certas.

Privacidade

A extensão não coleta, não envia e não armazena nenhum dado seu. Roda apenas em
ligamagic.com.br, e a única permissão que usa é a de salvar as três preferências
do popup no seu perfil do Chrome.

Projeto independente, sem vínculo com a LigaMagic. Magic: The Gathering é marca
registrada da Wizards of the Coast, que também não tem relação com este projeto.
Código aberto sob licença MIT.
```

## Categoria

**Funcionalidade e interface do usuário.**

## Justificativa das permissões

Campos obrigatórios na aba **Práticas de privacidade** do painel. Um campo por
permissão. Os textos abaixo são para colar e podem ser conferidos no código —
cada permissão tem exatamente um ponto de uso.

### storage

```
A extensão guarda três preferências do usuário, todas booleanas: modo escuro
ligado, seguir o tema do sistema e suavizar banners. São exatamente os três
controles do popup.

Uso chrome.storage.sync para que a escolha acompanhe o perfil do Chrome do
usuário em vez de se perder a cada máquina ou reinstalação, e para que o content
script leia a preferência já no document_start — sem isso a página apareceria
clara por um instante antes de escurecer.

Nenhum dado pessoal é armazenado. Não há histórico, identificador, conteúdo de
página ou qualquer informação de navegação. Os pontos de uso são
content/apply.js (leitura e chrome.storage.onChanged) e popup/popup.js (leitura
e gravação quando o usuário mexe num controle).
```

### activeTab

```
Usada apenas dentro do popup, e apenas para ler o endereço da aba ativa no
momento em que o usuário clica no ícone da extensão.

A extensão só atua em ligamagic.com.br. Se o popup for aberto em outra página,
os controles não produzem efeito visível, e sem aviso isso parece defeito. Com o
endereço da aba, o popup compara só o nome do host e mostra a mensagem "Esta aba
não é do ligamagic.com.br".

É o único uso: uma chamada a chrome.tabs.query em popup/popup.js, da qual se lê
apenas tab.url para extrair o hostname. Nenhum conteúdo da página é lido, nada é
injetado por essa via e o endereço não é armazenado nem transmitido — ele existe
só enquanto o popup está aberto.
```

### Acesso ao host (`*://*.ligamagic.com.br/*`, `*://ligamagic.com.br/*`)

```
É a função da extensão: aplicar um tema escuro nas páginas da LigaMagic.

O acesso é necessário para injetar duas folhas de estilo e um script pequeno em
document_start. O script não lê nem modifica o conteúdo da página: ele apenas
liga e desliga uma classe CSS no elemento <html>, o que permite alternar o tema
sem recarregar. Precisa rodar em document_start para o tema já estar aplicado na
primeira renderização.

O escopo está limitado ao domínio da própria LigaMagic, o único site que a
extensão tematiza. Os dois padrões cobrem o mesmo domínio com e sem subdomínio
(www). Não há acesso a nenhum outro site. all_frames está desligado, então nem
iframes de terceiros dentro da página são alcançados.

Nenhum dado sai do navegador. A extensão não faz requisições de rede, não carrega
código remoto e não tem service worker.
```

## Uso de código remoto

Responda **não**. Todo o CSS e JS estão empacotados na extensão.
