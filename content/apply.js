/* Liga Dark Mode - content script
 *
 * O CSS do tema fica sempre injetado, mas todas as regras sao escopadas em
 * `html.lmd-dark`. Ligar/desligar e so mexer na classe do <html>: nao recarrega
 * a pagina e nao pisca.
 */
(() => {
  'use strict';

  const ROOT_CLASS = 'lmd-dark';
  const DIM_CLASS = 'lmd-dim';

  // Qual site da Liga estamos vendo. NAO e isso que separa os temas -- disso
  // cuida o `matches` de cada entrada de content_scripts, que impede o CSS de
  // um site de sequer ser injetado no outro.
  //
  // Este atributo existe para a excecao pontual: quando o audit achar um
  // detalhe errado num site so, a correcao vira uma regra
  // `[data-liga="gnd"] .x {...}` em sites.css, sem arquivo novo nem entrada
  // nova no manifest.
  //
  // A tabela e repetida aqui de proposito: content script nao importa modulo,
  // entao nao da para ler scripts/sites.mjs. Sao 15 linhas que mudam junto com
  // ela; check.mjs compara as duas e falha se divergirem.
  const SITE_POR_HOST = {
    'www.ligamagic.com.br': 'magic',
    'ligamagic.com.br': 'magic',
    'www.ligayugioh.com.br': 'ygo',
    'ligayugioh.com.br': 'ygo',
    'www.ligaonepiece.com.br': 'onp',
    'ligaonepiece.com.br': 'onp',
    'www.ligalorcana.com.br': 'lor',
    'ligalorcana.com.br': 'lor',
    'www.ligafab.com.br': 'fab',
    'ligafab.com.br': 'fab',
    'www.ligariftbound.com.br': 'rft',
    'ligariftbound.com.br': 'rft',
    'www.ligapokemon.com.br': 'pkm',
    'ligapokemon.com.br': 'pkm',
    'www.ligavanguard.com.br': 'vgd',
    'ligavanguard.com.br': 'vgd',
    'www.ligadigimon.com.br': 'dgm',
    'ligadigimon.com.br': 'dgm',
    'www.ligastarwars.com.br': 'swu',
    'ligastarwars.com.br': 'swu',
    'www.ligagundam.com.br': 'gnd',
    'ligagundam.com.br': 'gnd',
    'www.ligasorcery.com.br': 'sor',
    'ligasorcery.com.br': 'sor',
    'masters.ligadragonball.com.br': 'dbm',
    'fusion.ligadragonball.com.br': 'dbf',
    'www.mundofunko.com.br': 'fnk',
    'mundofunko.com.br': 'fnk',
  };
  const SITE = SITE_POR_HOST[location.hostname] || '';
  const DEFAULTS = {
    enabled: true,
    followSystem: false,
    dimMedia: false,   // as artes de carta sao o conteudo aqui: desligado por padrao
  };

  function boot(html) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    // Estado ainda desconhecido (storage e assincrono). Como "ligado" e o caso
    // normal, aplicamos ja no document_start para evitar o flash branco. Se a
    // preferencia for outra, a correcao chega poucos milissegundos depois.
    html.classList.add(ROOT_CLASS);
    if (DEFAULTS.dimMedia) html.classList.add(DIM_CLASS);
    // O data-liga acompanha o tema e nao a preferencia: fica no <html> mesmo
    // com o tema desligado, porque nao pinta nada sozinho -- so da o gancho
    // para as regras de excecao, que ja sao escopadas em html.lmd-dark.
    if (SITE) html.setAttribute('data-liga', SITE);

    let config = { ...DEFAULTS };
    let ready = false;
    let applying = false;

    const isOn = (cfg) => cfg.enabled && (!cfg.followSystem || media.matches);

    function render() {
      const on = isOn(config);
      // O MutationObserver abaixo reage a mudancas de classe; a flag evita que
      // as nossas proprias escritas disparem um novo ciclo.
      applying = true;
      html.classList.toggle(ROOT_CLASS, on);
      html.classList.toggle(DIM_CLASS, on && config.dimMedia);
      if (SITE && html.getAttribute('data-liga') !== SITE) {
        html.setAttribute('data-liga', SITE);
      }
      applying = false;
    }

    chrome.storage.sync.get(DEFAULTS, (stored) => {
      ready = true;
      if (chrome.runtime.lastError) return; // sem sync: segue no padrao (ligado)
      config = { ...DEFAULTS, ...stored };
      render();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      let touched = false;
      for (const key of Object.keys(DEFAULTS)) {
        if (key in changes) {
          config[key] = changes[key].newValue;
          touched = true;
        }
      }
      if (touched) render();
    });

    media.addEventListener('change', () => {
      if (config.followSystem) render();
    });

    // Os sites da Liga sao renderizados no servidor, entao a classe nao e
    // apagada por hidratacao como acontece numa SPA. Ainda assim varios trechos
    // (carrinho, busca do topo, paineis de deck) sao remontados por jQuery, e
    // alguns scripts do site mexem no <html>. O observer custa quase nada e
    // garante que o tema nao caia no meio da navegacao.
    new MutationObserver(() => {
      if (applying || !ready) return;
      const stale =
        html.classList.contains(ROOT_CLASS) !== isOn(config) ||
        html.classList.contains(DIM_CLASS) !== (isOn(config) && config.dimMedia) ||
        (SITE && html.getAttribute('data-liga') !== SITE);
      if (stale) render();
    }).observe(html, { attributes: true, attributeFilter: ['class', 'data-liga'] });
  }

  // Em execucoes muito precoces o <html> ainda nao existe e documentElement e
  // null. Espera o parser criar a raiz antes de aplicar qualquer coisa.
  if (document.documentElement) {
    boot(document.documentElement);
  } else {
    const waiting = new MutationObserver(() => {
      if (!document.documentElement) return;
      waiting.disconnect();
      boot(document.documentElement);
    });
    waiting.observe(document, { childList: true });
  }
})();
