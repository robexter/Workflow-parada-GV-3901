'use strict';
/*
 * GV-3901 Turnaround Control — homologação / login por identificador amigável.
 * Não substitui Supabase Auth, não consulta tabela de senhas, não grava tokens.
 * Para alterar domínio, editar a propriedade `domain` e usar EXATAMENTE o
 * mesmo domínio no cadastramento administrativo de usuários Supabase Auth.
 * `example.com` é domínio reservado para testes/documentação. Não é domínio
 * corporativo aprovado. Não usar como configuração final de produção.
 */
(() => {
  const CONFIG = Object.freeze({
    domain: 'login.gv3901.example.com',
    allowLegacyEmail: true // Compatibilidade temporária com contas por e-mail já existentes.
  });
  const USERNAME = /^[a-z][a-z0-9._-]{2,31}$/;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const clean = value => String(value || '').trim().toLowerCase();

  function updateLoginForm() {
    const form = document.getElementById('cloud-login-form');
    if (!form) return;
    const field = form.elements.namedItem('email');
    if (!field || field.dataset.usernameReady === 'yes') return;

    // Mantém `name=email` porque o app.js V1.1 lê esse nome em seu listener.
    field.type = 'text';
    field.id = 'cloud-username';
    field.maxLength = 120;
    field.autocapitalize = 'none';
    field.autocomplete = 'username';
    field.spellcheck = false;
    field.placeholder = 'Ex.: operador01';
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
    note.textContent = 'Utilize o usuário e a senha fornecidos pelo administrador. Não é necessário e-mail pessoal.';
    field.insertAdjacentElement('afterend', note);
  }

  // O app.js V1.1 cria/recria a tela por innerHTML em uma closure.
  // Este adaptador altera só o formulário visível, sem modificar os módulos.
  const observer = new MutationObserver(updateLoginForm);
  observer.observe(document.documentElement, {childList:true, subtree:true});
  document.addEventListener('DOMContentLoaded', updateLoginForm);
  updateLoginForm();

  // Captura ANTES do listener principal de submit do app.js.
  document.addEventListener('submit', event => {
    if (event.target?.id !== 'cloud-login-form') return;
    const field = event.target.elements.namedItem('email');
    if (!field) return;
    const raw = clean(field.value);
    if (USERNAME.test(raw)) {
      field.value = `${raw}@${CONFIG.domain}`;
      return;
    }
    if (CONFIG.allowLegacyEmail && EMAIL.test(raw)) {
      field.value = raw; // Somente para migração de contas existentes.
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    field.setCustomValidity('Informe um usuário com 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado (iniciando por letra).');
    field.reportValidity();
    field.addEventListener('input', () => field.setCustomValidity(''), {once:true});
  }, true);
})();
