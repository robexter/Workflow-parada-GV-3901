'use strict';
/* GV-3901 Homologação r14 — login por nome completo, preservando nomes antigos.
 * A conversão gera somente um identificador técnico interno para Supabase Auth.
 * Não armazena senha ou hashes em navegador, nem modifica os módulos operacionais.
 */
(() => {
  const CONFIG = Object.freeze({domain: 'robexter.github.io', allowLegacyEmail: true});
  const LEGACY = /^[a-z][a-z0-9._-]{2,31}$/;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizeName = s => String(s || '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  const validName = s => s.length >= 3 && s.length <= 120 && !/[\u0000-\u001f\u007f-\u009f]/u.test(s);
  async function accountEmail(name) {
    const normalized = normalizeName(name).toLowerCase();
    if (LEGACY.test(normalized)) return `${normalized}@${CONFIG.domain}`;
    const bytes = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    return `gv-${hex.slice(0, 56)}@${CONFIG.domain}`;
  }
  function updateLoginForm() {
    const form = document.getElementById('cloud-login-form');
    if (!form) return;
    const field = form.elements.namedItem('email');
    if (!field || field.dataset.usernameReady === 'yes') return;
    field.type = 'text';
    field.id = 'cloud-username';
    field.maxLength = 120;
    field.autocapitalize = 'words';
    field.autocomplete = 'username';
    field.spellcheck = false;
    field.placeholder = 'Ex.: João Carlos Almeida';
    field.dataset.usernameReady = 'yes';
    const label = form.querySelector('label[for="cloud-email"]');
    if (label) {
      label.setAttribute('for', 'cloud-username');
      label.textContent = 'Nome de usuário';
    }
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.fontSize = '12px';
    note.style.marginTop = '6px';
    note.textContent = 'Digite o mesmo nome utilizado no cadastro (espaços e acentos são aceitos). Não é necessário e-mail pessoal.';
    field.insertAdjacentElement('afterend', note);
  }
  const observer = new MutationObserver(updateLoginForm);
  observer.observe(document.documentElement, {childList:true, subtree:true});
  document.addEventListener('DOMContentLoaded', updateLoginForm);
  updateLoginForm();

  // Intercepta ANTES do listener do app.js, que ainda espera o campo name=email.
  // O segundo submit entrega o e-mail técnico ao app e preserva o nome visível.
  document.addEventListener('submit', event => {
    if (event.target?.id !== 'cloud-login-form') return;
    const form = event.target;
    if (form.dataset.gv3901Prepared === 'yes') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const field = form.elements.namedItem('email');
    if (!field) return;
    const raw = normalizeName(field.value);
    const isLegacyEmail = CONFIG.allowLegacyEmail && EMAIL.test(raw);
    if (!isLegacyEmail && !validName(raw)) {
      field.setCustomValidity('Digite seu nome de usuário com 3 a 120 caracteres. Espaços e acentos são aceitos.');
      field.reportValidity();
      field.addEventListener('input', () => field.setCustomValidity(''), {once:true});
      return;
    }
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    void (async () => {
      try {
        const email = isLegacyEmail ? raw.toLowerCase() : await accountEmail(raw);
        if (!form.isConnected) return;
        field.value = email;
        form.dataset.gv3901Prepared = 'yes';
        // IMPORTANTE: requestSubmit() não dispara o submit com o botão
        // desabilitado em alguns navegadores, inclusive no Chromium.
        // Reabilitar somente após concluir a conversão do identificador.
        if (submitButton) submitButton.disabled = false;
        // Esperar o fim da tarefa atual: o Chromium bloqueia reenvios
        // enquanto o evento submit original ainda está em processamento.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!form.isConnected) return;
        try { form.requestSubmit(); }
        finally { field.value = raw; delete form.dataset.gv3901Prepared; }
      } catch (error) {
        console.error('Erro ao preparar identificador de login:', error instanceof Error ? error.name : 'unknown');
        if (field.isConnected) {
          field.setCustomValidity('Não foi possível preparar o login. Verifique sua conexão segura e tente novamente.');
          field.reportValidity();
          field.addEventListener('input', () => field.setCustomValidity(''), {once:true});
        }
      } finally {
        if (submitButton?.isConnected) submitButton.disabled = false;
      }
    })();
  }, true);
})();
