'use strict';
/* Área de Membros GV-3901 HML: cadastro público (via Edge Function + Turnstile)
 * e moderação pelos gestores de membros. Autorizações efetivas ocorrem na RLS/RPC,
 * nunca neste arquivo estático. NÃO colocar service_role aqui. */
(() => {
  const conf = window.GV3901_MEMBROS_CONFIG || {};
  const cloud = window.GV3901_CLOUD_CONFIG || {};
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let client;
  let signupVisible = false;
  let captchaId = null;
  let adminBusy = false;
  let pendingStatusChecked = false;
  const getClient = () => {
    if (!client && cloud.url && cloud.publishableKey && window.supabase?.createClient) {
      client = window.supabase.createClient(cloud.url,cloud.publishableKey,
        {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    }
    return client;
  };
  const validName = s => /^[a-z][a-z0-9._-]{2,31}$/.test(s);
  const msg = (el,t,error=false) => { if (el) {el.textContent=t;el.style.color=error?'#bd3737':'#16765f';} };
  function signupMarkup() {
    return `<div id="gv-member-signup" style="margin:16px 0 0;padding:16px;border:1px solid #c8d8e0;border-radius:13px">
      <h2 style="font-size:18px;margin:0 0 8px">Solicitar acesso à GV-3901</h2>
      <p class="muted" style="font-size:12px;line-height:1.55">Crie seu nome de usuário e sua senha. O acesso permanecerá bloqueado até aprovação do administrador.</p>
      <form id="gv-members-signup-form" autocomplete="off">
        <label for="gv-reg-name">Nome de identificação</label><input class="input" id="gv-reg-name" name="displayName" minlength="3" maxlength="120" required autocomplete="name" />
        <label for="gv-reg-user">Nome de usuário</label><input class="input" id="gv-reg-user" name="username" minlength="3" maxlength="32" required autocapitalize="none" autocomplete="off" placeholder="Ex.: operador01" />
        <label for="gv-reg-password">Senha (mínimo 6 caracteres)</label><input class="input" type="password" id="gv-reg-password" name="password" minlength="6" maxlength="128" required autocomplete="new-password" />
        <label for="gv-reg-confirm">Confirme a senha</label><input class="input" type="password" id="gv-reg-confirm" name="confirm" minlength="6" maxlength="128" required autocomplete="new-password" />
        <div id="gv-turnstile" style="margin:14px 0;max-width:100%;overflow:hidden"></div>
        <div id="gv-registration-message" role="status" aria-live="polite" style="font-size:12px;margin:12px 0"></div>
        <button class="btn primary" type="submit" id="gv-register-submit">Solicitar cadastro</button>
      </form></div>`;
  }
  // Visualizar/ocultar senha no login, cadastro e confirmação.
  // Instala no máximo um botão por campo, inclusive após re-render do app.js.
  const eyeSvg = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeOffSvg = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>`;
  function setPasswordVisibility(field, button, visible) {
    if (!field || !button) return;
    field.type = visible ? 'text' : 'password';
    const label = visible ? 'Ocultar senha' : 'Mostrar senha';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('title', label);
    button.innerHTML = visible ? eyeOffSvg : eyeSvg;
  }
  function mountPasswordEyes() {
    for (const id of ['cloud-pass', 'gv-reg-password', 'gv-reg-confirm']) {
      const field = document.getElementById(id);
      if (!field || field.dataset.gvEyeReady === 'yes') continue;
      const parent = field.parentElement;
      if (!parent) continue;
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;width:100%;max-width:100%;min-width:0;';
      parent.insertBefore(wrapper, field);
      wrapper.appendChild(field);
      field.style.paddingRight = '54px';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.gvPasswordEye = id;
      button.style.cssText = 'position:absolute;right:3px;top:50%;transform:translateY(-50%);width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:#31576d;cursor:pointer;z-index:1;';
      setPasswordVisibility(field, button, field.type === 'text');
      wrapper.appendChild(button);
      field.dataset.gvEyeReady = 'yes';
    }
  }
  function mountLogin() {
    const form = document.getElementById('cloud-login-form');
    if (!form) return;
    const card = form.closest('.cloud-login-card');
    if (!card) return;
    if (!card.querySelector('#gv-member-register-trigger')) {
      const b = document.createElement('button');
      b.type='button'; b.id='gv-member-register-trigger'; b.className='btn';
      b.style.cssText='margin:12px 0;width:100%;';
      b.textContent='Ainda não tenho cadastro — solicitar acesso';
      form.insertAdjacentElement('afterend',b);
    }
    if (!card.querySelector('#gv-member-signup')) {
      const shell = document.createElement('div');
      shell.innerHTML=signupMarkup();
      card.querySelector('#gv-member-register-trigger').insertAdjacentElement('afterend',shell.firstElementChild);
    }
    const signup = card.querySelector('#gv-member-signup');
    const trigger = card.querySelector('#gv-member-register-trigger');
    form.hidden=signupVisible; signup.hidden=!signupVisible;
    const nextLabel = signupVisible
  ? 'Voltar ao login'
  : 'Ainda não tenho cadastro — solicitar acesso';

if (trigger.textContent !== nextLabel) {
  trigger.textContent = nextLabel;
}
    if (signupVisible) mountCaptcha();
  }
  function mountCaptcha() {
    const el = document.getElementById('gv-turnstile');
    if (!el || el.dataset.rendered) return;
    if (!conf.siteKey) {
      msg(document.getElementById('gv-registration-message'),
        'Cadastro ainda não habilitado: configure a chave pública Turnstile em assets/membros-config.js.',true);
      return;
    }
    if (window.turnstile?.render) {
      try {
        captchaId=window.turnstile.render(el,{sitekey:conf.siteKey,theme:'auto'});
        el.dataset.rendered='yes';
      } catch (_e) {msg(document.getElementById('gv-registration-message'),'Falha ao carregar a validação antirrobô.',true);}
    }
  }
  function mountPending() {
    const card = document.querySelector('.cloud-login-card');
    if (!card || card.querySelector('#gv-members-pending')) return;
    if (card.querySelector('#cloud-login-form')) return;
    const text = card.querySelector('.cloud-alert')?.textContent||'';
    if (!/sem autorização|cadastro|permissões|solicitação|conta/i.test(text)) return;
    const row = document.createElement('div'); row.id='gv-members-pending';
    row.innerHTML=`<p class="muted" style="margin-top:12px;font-size:12px">Se você acabou de se cadastrar, aguarde a liberação do administrador e clique em “Tentar novamente”. Caso sua permissão tenha sido suspensa, procure a administração.</p><button type="button" class="btn" id="gv-members-signout">Sair desta conta</button>`;
    card.appendChild(row);
    if (!pendingStatusChecked) {
      pendingStatusChecked = true;
      void (async () => {
        try {
          const sb = getClient(); if (!sb) return;
          const {data:{user}} = await sb.auth.getUser(); if (!user) return;
          const {data:member} = await sb.from('gv3901_members')
            .select('active,approved_at').eq('user_id',user.id).single();
          const alert = document.querySelector('.cloud-login-card .cloud-alert');
          if (alert && member && !member.active) alert.textContent = member.approved_at
            ? 'Acesso suspenso pelo administrador. Entre em contato com Robson.'
            : 'Cadastro recebido. Aguardando aprovação de Robson na Área de Membros.';
        } catch (_e) { /* estado protegido; nenhuma permissão é inferida na interface */ }
      })();
    }
  }
  async function doSignup(form) {
    const status = document.getElementById('gv-registration-message');
    const submit = document.getElementById('gv-register-submit');
    const u = String(form.elements.username.value).trim().toLowerCase();
    const name = String(form.elements.displayName.value).trim();
    const pass = String(form.elements.password.value);
    if (!validName(u)) return msg(status,'Usuário deve começar com letra e ter de 3 a 32 caracteres.',true);
    if (pass.length<6 || pass!==form.elements.confirm.value) return msg(status,'As senhas devem coincidir e conter pelo menos 6 caracteres.',true);
    if (!conf.siteKey || !cloud.url || !cloud.publishableKey) return msg(status,'Cadastro não configurado para este ambiente.',true);
    const token = window.turnstile?.getResponse(captchaId);
    if (!token) return msg(status,'Conclua a validação antirrobô.',true);
    submit.disabled=true; msg(status,'Enviando solicitação...');
    try {
      const response = await fetch(`${cloud.url.replace(/\/$/,'')}/functions/v1/${conf.functionName||'gv3901-solicitar-acesso'}`,{
        method:'POST',headers:{'Content-Type':'application/json','apikey':cloud.publishableKey},
        body:JSON.stringify({username:u,displayName:name,password:pass,captchaToken:token})
      });
      const body=await response.json().catch(()=>({}));
      msg(status,body.message||(response.ok?'Solicitação registrada.':'Não foi possível registrar.'),!response.ok);
      if (response.ok) {
        form.reset();
        for (const id of ['gv-reg-password', 'gv-reg-confirm']) {
          const field = document.getElementById(id);
          const eye = document.querySelector('[data-gv-password-eye="' + id + '"]');
          setPasswordVisibility(field, eye, false);
        }
      }
    } catch (_e) {msg(status,'Não foi possível enviar a solicitação. Verifique sua conexão.',true);}
    finally {submit.disabled=false; if(window.turnstile&&captchaId!==null) window.turnstile.reset(captchaId);}
  }
  function memberCard() {
    return `<section class="card pad" id="gv-area-membros" style="margin:16px 0;min-width:0">
      <div class="section-head"><h2>Área de Membros · Aprovações e perfis</h2></div>
      <p class="muted" style="font-size:12px;margin-bottom:12px">Solicitações de novos usuários e alteração de leitura/escrita. Ações administrativas são auditadas no Supabase.</p>
      <div id="gv-area-membros-body" role="status" aria-live="polite">Verificando permissão...</div>
    </section>`;
  }
  function mountAdmin() {
    if (location.hash!=='#/administracao') return;
    const workspace = document.querySelector('.workspace');
    if (!workspace || workspace.querySelector('#gv-area-membros')) return;
    const el=document.createElement('div'); el.innerHTML=memberCard();
    const card=el.firstElementChild;
    const grid = workspace.querySelector('.grid.half');
    if(grid) grid.insertAdjacentElement('beforebegin',card); else workspace.appendChild(card);
    void loadAdmin(card);
  }
  async function loadAdmin(card) {
    if (adminBusy) return;
    adminBusy=true;
    const body=card.querySelector('#gv-area-membros-body');
    try {
      const sb=getClient(); if(!sb) throw Error('Conexão Supabase indisponível.');
      const {data:{user},error:userError}=await sb.auth.getUser();
      if(userError||!user) throw Error('É necessário fazer login.');
      const {data:me,error:meError}=await sb.from('gv3901_members')
        .select('display_name,role,active,can_manage_members').eq('user_id',user.id).single();
      if(meError||!me) throw Error('Cadastro não encontrado.');
      if(!me.active) throw Error('Aguardando autorização do administrador.');
      if(!me.can_manage_members || me.role!=='admin') {
        body.innerHTML=`<p><strong>Seu perfil atual:</strong> ${escapeHtml(me.role==='viewer'?'Somente leitura':me.role==='operator'?'Edição de registros':me.role)}</p><p class="muted">Mudanças de perfil e liberação de novos membros são feitas por Robson.</p>`;
        return;
      }
      const {data:members,error:membersError}=await sb.from('gv3901_members')
        .select('user_id,username,display_name,role,active,approved_at,requested_at')
        .order('requested_at',{ascending:false}).limit(500);
      if(membersError) throw membersError;
      const pending=(members||[]).filter(m=>!m.active&&!m.approved_at).length;
      const rows=(members||[]).map(m=>{
        const privileged=['admin','planner'].includes(m.role);
        const pendingAccess=!m.active&&!m.approved_at;
        const status=pendingAccess?'Aguardando aprovação':m.active?'Liberado':'Suspenso';
        return `<tr><td><strong>${escapeHtml(m.display_name)}</strong><br><small>${escapeHtml(m.username||'Conta antiga')}</small></td>
          <td>${status}</td><td>${escapeHtml(m.role)}</td><td style="min-width:220px">
          ${privileged?'<small>Perfil protegido</small>':`<div style="display:flex;flex-wrap:wrap;gap:6px">
          <select class="input" aria-label="Acesso para ${escapeHtml(m.username)}" data-gv-member-select="${escapeHtml(m.user_id)}" style="width:auto;max-width:150px">
          <option value="viewer" ${m.role==='viewer'?'selected':''}>Somente leitura</option>
          <option value="operator" ${m.role==='operator'?'selected':''}>Escrita operacional</option></select>
          <button type="button" class="btn primary" data-gv-member-set="${escapeHtml(m.user_id)}">${pendingAccess?'Aprovar':'Salvar perfil'}</button>
          ${m.active?`<button type="button" class="btn" data-gv-member-suspend="${escapeHtml(m.user_id)}">Suspender</button>`:''}</div>`}</td></tr>`;
      }).join('');
      body.innerHTML=`<p><strong>${pending} solicitação(ões) pendente(s)</strong> · ${members.length} usuários listados</p>
        <p class="muted" style="font-size:12px">Escolha leitura ou escrita e confirme. Para uma liberação temporária, retorne posteriormente e escolha “Somente leitura”. Administradores não podem alterar o próprio acesso nesta tela.</p>
        <div style="overflow-x:auto"><table class="table"><thead><tr><th>Membro</th><th>Status</th><th>Perfil atual</th><th>Gerenciar</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Nenhum membro cadastrado.</td></tr>'}</tbody></table></div>
        <p id="gv-member-operation" aria-live="polite" style="font-size:12px;margin-top:12px"></p>
        <button type="button" class="btn" id="gv-members-refresh" style="margin-top:10px">Atualizar lista</button>
        <details style="margin-top:14px"><summary>Histórico de alterações de acesso</summary><div id="gv-access-history">Carregando...</div></details>`;
      const {data:history,error:historyError} = await sb.rpc('gv3901_access_history',{p_limit:30});
      const historyBox=card.querySelector('#gv-access-history');
      if(historyBox) historyBox.innerHTML=historyError?'Histórico indisponível.':(history||[]).map(h=>
        `<div style="border-bottom:1px solid #ddd;padding:8px 0"><strong>${escapeHtml(h.target_name)}</strong>: ${escapeHtml(h.old_role)} → ${escapeHtml(h.new_role)}
        <small> por ${escapeHtml(h.actor_name)} · ${escapeHtml(h.changed_at)} </small><p>${escapeHtml(h.reason)}</p></div>`).join('')||'Sem alterações registradas.';
    } catch (error) {if(body) msg(body,'Área de Membros indisponível: '+String(error.message||'erro'),true);}
    finally {adminBusy=false;}
  }
  async function changeMember(target,action) {
    const panel=document.getElementById('gv-area-membros');
    if(!panel)return;
    const status=panel.querySelector('#gv-member-operation');
    const reason=prompt('Justificativa para a alteração do acesso (será auditada):',
      action==='suspend'?'Suspensão temporária autorizada':`Ajuste de perfil para ${action}`);
    if(reason===null)return;
    if(reason.trim().length<5)return msg(status,'Justificativa muito curta (mínimo 5 caracteres).',true);
    const button=panel.querySelector(`[data-gv-member-set="${target}"], [data-gv-member-suspend="${target}"]`);
    if(button) button.disabled=true;
    try {
      const sb=getClient();
      const {error}=await sb.rpc('gv3901_set_access',{p_target:target,p_action:action,p_reason:reason.trim()});
      if(error)throw error;
      msg(status,'Permissão atualizada no servidor e registrada na auditoria.');
      await loadAdmin(panel);
    } catch(e) {msg(status,'Não foi possível alterar o acesso: '+String(e.message||e),true);}
    finally {if(button)button.disabled=false;}
  }
  document.addEventListener('click',e=>{
    const eye = e.target.closest('[data-gv-password-eye]');
    if (eye) {
      e.preventDefault();
      const input = document.getElementById(eye.dataset.gvPasswordEye);
      if (input) {
        setPasswordVisibility(input, eye, input.type === 'password');
        input.focus({preventScroll:true});
      }
      return;
    }
    const trigger=e.target.closest('#gv-member-register-trigger');
    if(trigger){signupVisible=!signupVisible;mountLogin();return;}
    if(e.target.closest('#gv-members-signout')) {void getClient()?.auth.signOut().then(()=>location.reload());return;}
    const target=e.target.closest('[data-gv-member-set],[data-gv-member-suspend]');
    if(target){const id=target.dataset.gvMemberSet||target.dataset.gvMemberSuspend;
      const action=target.dataset.gvMemberSuspend?'suspend':document.querySelector(`[data-gv-member-select="${id}"]`)?.value;
      if(id && action)void changeMember(id,action);return;}
    if(e.target.closest('#gv-members-refresh')) {const panel=document.getElementById('gv-area-membros');if(panel)void loadAdmin(panel);}
  });
  document.addEventListener('submit', e=>{
    if(e.target.id==='gv-members-signup-form'){e.preventDefault();void doSignup(e.target);}
  },true);
  const hydrate=()=>{mountLogin();mountPasswordEyes();mountPending();mountAdmin();};
  const observer=new MutationObserver(hydrate);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',hydrate);
  window.addEventListener('hashchange',hydrate);
  window.addEventListener('load',()=>{hydrate();mountCaptcha();});
  hydrate();
})();
