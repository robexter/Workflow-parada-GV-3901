
'use strict';
/* GV-3901 r31.1 — correção do ciclo de renderização; mesmas funções visuais */
(() => {
  const root = document.getElementById('app');
  if (!root) return;
  const iconSvg = '<svg aria-hidden="true" width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 27.5h25v-11L21 20v-7.5L13 16V8H8v9l-4.5 2.4v8.1Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M7.4 23h2.5M13.2 23h2.5M19 23h2.5M24.8 23h1.5M9.4 8V4h2.5v4M3.5 27.5H29" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

  function enhanceTopbar() {
    const header = root.querySelector('.app .main > header.topbar');
    if (!header) return;
    if (!header.querySelector(':scope > .gv31-hero')) {
      const hero = document.createElement('div');
      hero.className = 'gv31-hero';
      hero.innerHTML = '<span class="gv31-hero-icon">'+iconSvg+'</span><span class="gv31-hero-copy"><strong>GV-3901</strong><small>Parada de Manutenção</small></span><span class="gv31-hero-accent" aria-hidden="true"></span>';
      header.prepend(hero);
    }
    const env = header.querySelector(':scope > [data-gv22-env]');
    if (env && !env.querySelector('.gv31-env-title')) {
      env.innerHTML = '<span class="gv31-env-title"><strong>GV-3901</strong><small>Acompanhamento da Parada</small></span>';
      env.setAttribute('aria-label','GV-3901 Acompanhamento da Parada');
    }
  }

  function enhanceWarning() {
    const warning = root.querySelector('.app .main .workspace > .warning');
    if (!warning) return;
    if (!warning.querySelector('.gv31-production-pill')) {
      const pill = document.createElement('span');
      pill.className = 'gv31-production-pill';
      pill.textContent = 'Ambiente: Produção';
      warning.appendChild(pill);
    }
  }

  function enhanceCards() {
    root.querySelectorAll('.app .main .cards .card.kpi').forEach((card, idx) => {
      if (card.getAttribute('data-gv31-kpi') !== String(idx+1)) {
        card.setAttribute('data-gv31-kpi', String(idx+1));
      }
    });
  }

  function enhanceAll() {
    enhanceTopbar();
    enhanceWarning();
    enhanceCards();
  }

  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceAll();
    });
  };
  new MutationObserver(run).observe(root, { childList:true, subtree:true });
  enhanceAll();
})();
