'use strict';
/* GV-3901 — Login direto r15.
 * Corrige o reenvio de formulário da r14: autenticação realizada em uma
 * única submissão, preservando o nome completo visível e o Supabase Auth.
 * Não altera o cadastro, a aprovação administrativa ou regras RLS.
 */
(() => {
  const CONFIG = Object.freeze({ domain: 'robexter.github.io', allowLegacyEmail: true });
  const LEGACY = /^[a-z][a-z0-9._-]{2,31}$/;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizeName = value => String(value || '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  const validName = value => value.length >= 3 && value.length <= 120 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  let loginBusy = false;
  let loginClient = null;

  async function technicalEmail(name) {
    const normalized = normalizeName(name).toLowerCase();
    if (LEGACY.test(normalized)) return `${normalized}@${CONFIG.domain}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
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
    if (label) { label.htmlFor = 'cloud-username'; label.textContent = 'Nome de usuário'; }
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.cssText = 'font-size:12px;margin-top:6px';
    note.textContent = 'Digite seu nome de cadastro. Se sua conta é antiga, o e-mail técnico também é aceito.';
    field.insertAdjacentElement('afterend', note);
  }

  function setNotice(message, error = false) {
    const area = document.querySelector('.cloud-login-card .cloud-alert');
    if (!area) return;
    area.textContent = message;
    area.setAttribute('role', 'status');
    area.setAttribute('aria-live', 'polite');
    if (error) area.dataset.gvLoginError = 'yes';
    else delete area.dataset.gvLoginError;
  }

  function getClient() {
    const cfg = window.GV3901_CLOUD_CONFIG || {};
    if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/.test(cfg.url || '') ||
        !cfg.publishableKey || typeof window.supabase?.createClient !== 'function') {
      throw new Error('client_unavailable');
    }
    if (!loginClient) {
      loginClient = window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
    }
    return loginClient;
  }

  function authMessage(error) {
    const code = String(error?.code || '').toLowerCase();
    if (code === 'invalid_credentials' || code === 'invalid_grant' || code === 'user_not_found' ||
        /invalid login credentials/i.test(String(error?.message || ''))) {
      return 'Nome de usuário ou senha não reconhecidos. Confira o nome exato do cadastro.';
    }
    if (code === 'email_not_confirmed') return 'Conta ainda não confirmada no serviço de autenticação.';
    if (error?.status === 429 || /rate.limit/i.test(code)) return 'Muitas tentativas de login. Tente novamente mais tarde.';
    return 'Não foi possível autenticar agora. Confira a conexão e tente novamente.';
  }

  // Capture do formulário: não reenvia evento e não modifica campo para e-mail.
  // O app.js só recebe um novo login depois de recarregar a sessão bem-sucedida.
  document.addEventListener('submit', event => {
    if (event.target?.id !== 'cloud-login-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (loginBusy) return;
    const form = event.target;
    const field = form.elements.namedItem('email');
    const passwordField = form.elements.namedItem('password');
    if (!field || !passwordField) return;
    const raw = normalizeName(field.value);
    const isEmail = CONFIG.allowLegacyEmail && EMAIL.test(raw);
    if (!isEmail && !validName(raw)) {
      field.setCustomValidity('Informe seu nome de usuário (3 a 120 caracteres) ou o e-mail técnico da conta antiga.');
      field.reportValidity();
      field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
      return;
    }
    // Nunca persistir a senha fora do Supabase Auth.
    const password = passwordField.value;
    const button = form.querySelector('button[type="submit"]');
    loginBusy = true;
    if (button) button.disabled = true;
    setNotice('Autenticando...');
    void (async () => {
      try {
        const email = isEmail ? raw.toLowerCase() : await technicalEmail(raw);
        const client = getClient();
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
          console.warn('GV3901 login: autenticação recusada', { code: error.code || 'unknown', status: error.status || null });
          setNotice(authMessage(error), true);
          return;
        }
        if (!data?.session) {
          setNotice('A autenticação não retornou uma sessão válida. Tente novamente.', true);
          return;
        }
        // O app.js existente recupera a sessão persistida e aplica RLS e permissões.
        window.location.reload();
      } catch (error) {
        console.warn('GV3901 login: falha de execução', error instanceof Error ? error.name : 'unknown');
        setNotice('Não foi possível iniciar a autenticação. Verifique sua conexão.', true);
      } finally {
        loginBusy = false;
        if (button?.isConnected) button.disabled = false;
      }
    })();
  }, true);

  const observer = new MutationObserver(updateLoginForm);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', updateLoginForm);
  updateLoginForm();
})();
