'use strict';
/* GV-3901 r29 — SOMENTE camada visual.
 * Preserva todos os eventos, autenticação, sincronização, dados e seleção de ambiente.
 * O app.js re-renderiza o cabeçalho: reconstituir APENAS um elemento decorativo
 * e não substituir botões, badges ou elementos interativos preexistentes.
 */
(() => {
  const root = document.getElementById('app');
  if (!root) return;
  const factory = '<svg aria-hidden="true" width="29" height="29" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 27.5h25v-11L21 20v-7.5L13 16V8H8v9l-4.5 2.4v8.1Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M7.4 23h2.5M13.2 23h2.5M19 23h2.5M24.8 23h1.5M9.4 8V4h2.5v4M3.5 27.5H29" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  function enhance() {
    const header = root.querySelector('.app .main > header.topbar');
    if (!header || header.querySelector(':scope > .gv29-hero')) return;
    const hero = document.createElement('div');
    hero.className = 'gv29-hero';
    hero.innerHTML = '<span class="gv29-hero-icon">' + factory + '</span><span class="gv29-hero-copy"><strong>GV-3901</strong><small>Parada de Manutenção</small></span><span class="gv29-hero-accent" aria-hidden="true"></span>';
    header.prepend(hero);
    header.classList.add('gv29-premium-ready');
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; enhance(); });
  });
  observer.observe(root, { childList: true, subtree: true });
  enhance();
})();
