'use strict';
/* GV-3901 / homologação r16 — diagnóstico não invasivo do cadastro de atividades.
 * Não altera Supabase, RLS, banco, nem código principal app.js.
 * Não grava dados da atividade em localStorage e não expõe credenciais.
 */
(() => {
  const COMMIT_PATH = '/rest/v1/rpc/gv3901_commit';
  const FEEDBACK_ID = 'gv-r16-activity-feedback';
  const SUMMARY_ID = 'gv-r16-activity-summary';
  let attempt = null;
  let result = null;

  function labelFor(field) {
    return field.closest('.form-field')?.querySelector('label')?.textContent?.replace('*', '').trim()
      || field.name || 'campo obrigatório';
  }
  function updateMessage(message, isError = true) {
    const form = document.querySelector('#active-form[data-kind="activity"]');
    if (!form) return;
    const footer = form.querySelector('.modal-foot');
    if (!footer) return;
    let banner = form.querySelector('#' + FEEDBACK_ID);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = FEEDBACK_ID;
      banner.setAttribute('role', 'alert');
      banner.setAttribute('aria-live', 'assertive');
      banner.style.cssText = 'flex:1 1 100%;order:-1;min-width:0;max-width:100%;overflow-wrap:anywhere;'
        + 'box-sizing:border-box;padding:11px 13px;border-radius:10px;font-size:13px;line-height:1.45;';
      footer.style.flexWrap = 'wrap';
      footer.insertBefore(banner, footer.firstChild);
    }
    if (banner.textContent !== message) banner.textContent = message;
    const color = isError ? ['#fff1ee', '#8b2626', '#edb9b4'] : ['#e9f8f1', '#17674c', '#aedec9'];
    banner.style.background = color[0];
    banner.style.color = color[1];
    banner.style.border = '1px solid ' + color[2];
  }
  function showSummary() {
    if (!result) return;
    const workspace = document.querySelector('.workspace');
    if (!workspace || location.hash !== '#/planejamento') return;
    let banner = document.getElementById(SUMMARY_ID);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = SUMMARY_ID;
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.style.cssText = 'margin:12px 0;padding:13px 15px;border-radius:10px;'
        + 'max-width:100%;box-sizing:border-box;overflow-wrap:anywhere;font-size:14px;line-height:1.5;';
      const heading = workspace.querySelector('.head');
      if (heading) heading.insertAdjacentElement('afterend', banner);
      else workspace.prepend(banner);
    }
    if (banner.textContent !== result.message) banner.textContent = result.message;
    banner.style.background = result.ok ? '#e9f8f1' : '#fff1ee';
    banner.style.color = result.ok ? '#17674c' : '#8b2626';
    banner.style.border = '1px solid ' + (result.ok ? '#aedec9' : '#edb9b4');
  }
  function outcome(message, ok = false) {
    result = { message, ok };
    updateMessage(message, !ok);
    showSummary();
  }

  // O navegador bloqueia o submit quando algum campo obrigatório é inválido.
  // O erro agora ficará visível dentro do próprio formulário no celular.
  document.addEventListener('invalid', event => {
    const field = event.target;
    if (!field?.closest?.('#active-form[data-kind="activity"]')) return;
    updateMessage('Corrija o campo "' + labelFor(field) + '": '
      + (field.validationMessage || 'preencha um valor válido.'));
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    if (form?.id !== 'active-form' || form.dataset.kind !== 'activity') return;
    const id = form.elements.namedItem('id')?.value?.trim()?.toUpperCase() || '(sem código)';
    attempt = { code: id, completed: false };
    result = null;
    updateMessage('Formulário enviado. Aguardando confirmação do Supabase...', false);
    window.setTimeout(() => {
      if (attempt?.code === id && !attempt.completed) {
        updateMessage('Não houve confirmação da atividade. Confira o aviso da aplicação e a conexão. '
          + 'Se persistir, envie a mensagem exibida neste formulário.');
      }
    }, 12000);
  }, true);

  // Monitoramento passivo das respostas da RPC; NÃO altera cabeçalhos,
  // requisições, autenticação, resposta, nem o código de salvamento do app.
  const realFetch = window.fetch;
  if (typeof realFetch === 'function') {
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      const isCommit = url.includes(COMMIT_PATH);
      let action = '';
      if (isCommit && typeof init?.body === 'string') {
        try { action = JSON.parse(init.body)?.p_action || ''; } catch (_) { /* ignorar */ }
      }
      const isActivity = isCommit && (/^Atividade (cadastrada|alterada):/i.test(action)
        || (attempt && !attempt.completed && !!document.querySelector('#active-form[data-kind="activity"]')));
      return realFetch.apply(this, arguments).then(response => {
        if (isActivity) {
          const success = response.ok;
          void response.clone().text().then(raw => {
            let body = null;
            try { body = JSON.parse(raw); } catch (_) { /* resposta desconhecida */ }
            if (attempt) attempt.completed = true;
            if (success && (Array.isArray(body) ? body[0]?.committed_version : body?.committed_version) != null) {
              outcome('Atividade ' + (attempt?.code || '') + ' confirmada no banco central. '
                + 'Verifique a Lista de atividades em Planejamento.', true);
            } else {
              const detail = body?.message || body?.hint || body?.details || ('HTTP ' + response.status);
              outcome('O Supabase não confirmou o cadastro: ' + String(detail));
            }
          }).catch(() => {
            if (attempt) attempt.completed = true;
            outcome('Não foi possível interpretar a resposta do Supabase para esta atividade.');
          });
        }
        return response;
      }, err => {
        if (isActivity) {
          if (attempt) attempt.completed = true;
          outcome('Falha de rede durante a gravação: ' + String(err?.message || err));
        }
        throw err;
      });
    };
  }

  // O aplicativo exibe alertas por cerca de quatro segundos; enquanto o
  // formulário estiver aberto, copiamos o conteúdo para um aviso persistente.
  const observer = new MutationObserver(mutations => {
    for (const change of mutations) {
      for (const node of change.addedNodes) {
        if (node.nodeType !== 1) continue;
        const toast = node.id === 'toast' ? node : node.querySelector?.('#toast');
        if (!toast || !attempt || attempt.completed) continue;
        const message = toast.textContent?.trim() || '';
        if (message && !/^Formulário enviado|Registro confirmado/i.test(message)) {
          attempt.completed = true;
          updateMessage(message);
        }
      }
    }
    if (result) showSummary();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
