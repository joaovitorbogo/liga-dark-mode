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

// Avisa quando a aba aberta nao e do ligamagic: sem isso o usuario mexe nos
// controles e nao ve nada mudar.
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab || !tab.url) return;
  try {
    const host = new URL(tab.url).hostname;
    if (!/(^|\.)ligamagic\.com\.br$/.test(host)) {
      scopeEl.textContent = 'Esta aba nao e do ligamagic.com.br';
      scopeEl.style.color = '#e0a24a';
    }
  } catch { /* url interna do chrome: ignora */ }
});
