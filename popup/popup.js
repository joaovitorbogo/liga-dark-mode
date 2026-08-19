'use strict';

const DEFAULTS = {
  enabled: true,
  followSystem: false,
  dimMedia: false,
};
const KEYS = Object.keys(DEFAULTS);

const el = Object.fromEntries(KEYS.map((k) => [k, document.getElementById(k)]));
const statusEl = document.getElementById('status');
// As sub-opções só fazem sentido com o tema ligado.
const groupEl = document.querySelector('.group');
const scopeEl = document.getElementById('scope');

function paint(cfg) {
  for (const k of KEYS) el[k].checked = !!cfg[k];
  groupEl.dataset.disabled = String(!cfg.enabled);

  const on = cfg.enabled && (!cfg.followSystem || matchMedia('(prefers-color-scheme: dark)').matches);
  statusEl.textContent = !cfg.enabled
    ? 'Desligado'
    : cfg.followSystem
      ? (on ? 'Ligado (sistema no escuro)' : 'Em espera (sistema no claro)')
      : 'Ligado';
  statusEl.dataset.on = String(on);
}

chrome.storage.sync.get(DEFAULTS, (cfg) => paint({ ...DEFAULTS, ...cfg }));

for (const k of KEYS) {
  el[k].addEventListener('change', () => {
    const cfg = Object.fromEntries(KEYS.map((key) => [key, el[key].checked]));
    chrome.storage.sync.set(cfg);
    paint(cfg);
  });
}

// Avisa quando a aba aberta nao e de um site da Liga: sem isso o usuario mexe
// nos controles e nao ve nada mudar.
//
// A lista de hosts sai do PROPRIO manifest, em vez de repetida aqui. Sao 15
// hosts, e ja existem duas copias da tabela (scripts/sites.mjs e a de
// apply.js, que nao pode importar modulo). Uma terceira, aqui, poderia
// divergir e o popup diria "esta aba nao e da Liga" numa aba que a extensao
// esta tematizando. Lendo do manifest a resposta e sempre a que o Chrome usou
// para decidir injetar.
const padroes = (chrome.runtime.getManifest().content_scripts || [])
  .flatMap(c => c.matches || []);

const cobre = (url) => padroes.some(p => {
  const re = '^' + p
    .replace(/[.]/g, '\\.')
    .replace(/^\*:/, 'https?:')
    .replace(/\*/g, '[^/]*');
  return new RegExp(re).test(url);
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab || !tab.url) return;
  try {
    const host = new URL(tab.url).hostname;
    if (cobre(tab.url)) {
      scopeEl.textContent = `Ativo em ${host}`;
    } else {
      scopeEl.textContent = 'Esta aba nao e de um site da Liga';
      scopeEl.style.color = '#e0a24a';
    }
  } catch { /* url interna do chrome: ignora */ }
});
