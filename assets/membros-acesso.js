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
  let captchaElement = null;
  let captchaWaitTimer = null;
  let captchaRendering = false;
  let captchaResizeTimer = null;
  let adminBusy = false;
  let pendingStatusChecked = false;
  let listedMembers = [];
  let memberSearch = '';
  let memberStatus = 'all';
  let memberPageSize = 12;
  const getClient = () => {
    if (!client && cloud.url && cloud.publishableKey && window.supabase?.createClient) {
      client = window.supabase.createClient(cloud.url,cloud.publishableKey,
        {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    }
    return client;
  };
  // Nome de usuário = nome de identificação; o servidor aplica a mesma normalização.
  const normalizeName = s => String(s || '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  const validName = s => s.length >= 3 && s.length <= 120 && !/[\u0000-\u001f\u007f-\u009f]/u.test(s);
  const msg = (el,t,error=false) => { if (el) {el.textContent=t;el.style.color=error?'#bd3737':'#16765f';} };
  function signupMarkup() {
    return `<div id="gv-member-signup" class="gv-signup-panel" style="margin:16px 0 0;padding:16px;border:1px solid #c8d8e0;border-radius:13px">
      <h2 style="font-size:18px;margin:0 0 8px">Solicitar acesso à GV-3901</h2>
      <p class="muted gv-signup-intro">Preencha os dados abaixo. Seu acesso ficará pendente até a aprovação do administrador.</p>
      <form id="gv-members-signup-form" autocomplete="off">
        <label for="gv-reg-user">Nome de usuário (3 a 120 caracteres)</label><input class="input" id="gv-reg-user" name="username" minlength="3" maxlength="120" required autocapitalize="words" autocorrect="off" spellcheck="false" autocomplete="name" placeholder="Ex.: João Carlos Almeida" />
        <small class="gv-username-hint">Digite seu nome. Espaços e acentos são aceitos. Ele será utilizado automaticamente como nome de identificação e também no login.</small>
        <label for="gv-reg-password">Senha (mínimo 6 caracteres)</label><input class="input" type="password" id="gv-reg-password" name="password" minlength="6" maxlength="128" required autocomplete="new-password" />
        <label for="gv-reg-confirm">Confirme a senha</label><input class="input" type="password" id="gv-reg-confirm" name="confirm" minlength="6" maxlength="128" required autocomplete="new-password" />
        <div id="gv-turnstile" class="gv-signup-captcha" aria-label="Validação antirrobô"></div>
        <p class="gv-captcha-feedback" id="gv-captcha-feedback" role="status" aria-live="polite"></p>
        <button class="btn" id="gv-captcha-retry" type="button" hidden>Recarregar validação antirrobô</button>
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
  function captchaNotice(message, isError=false) {
    const status = document.getElementById('gv-captcha-feedback');
    const retry = document.getElementById('gv-captcha-retry');
    if (status && status.textContent !== message) msg(status, message, isError);
    if (retry && retry.hidden === isError) retry.hidden = !isError;
  }
  // O widget flexible do Cloudflare exige largura disponível >= 300px.
  // Ler o container real evita escolher o modo pelo tamanho total da tela.
  function captchaSizeFor(element) {
    const width = Math.floor(element.getBoundingClientRect().width ||
      element.parentElement?.getBoundingClientRect().width || 0);
    return width > 0 && width < 304 ? 'compact' : 'flexible';
  }
  function remountCaptchaForWidth() {
    const el = document.getElementById('gv-turnstile');
    if (!signupVisible || !el || !window.turnstile?.render) return;
    const desired = captchaSizeFor(el);
    if (!el.dataset.gvWidgetSize || desired === el.dataset.gvWidgetSize) return;
    if (captchaId !== null && window.turnstile?.remove) {
      try { window.turnstile.remove(captchaId); } catch (_e) {}
    }
    captchaId = null;
    captchaElement = null;
    delete el.dataset.rendered;
    el.replaceChildren();
    captchaNotice('Ajustando validação à largura da tela...');
    mountCaptcha();
  }
  function mountCaptcha() {
    const el = document.getElementById('gv-turnstile');
    if (!signupVisible || !el || !el.isConnected || captchaRendering) return;
    if (!conf.siteKey) {
      captchaNotice('A validação antirrobô não está configurada. Contate a administração.',true);
      return;
    }
    if (!window.turnstile || typeof window.turnstile.render !== 'function') {
      if (captchaWaitTimer === null) {
        captchaWaitTimer=window.setTimeout(() => {
          captchaWaitTimer=null;
          if (signupVisible && !window.turnstile?.render)
            captchaNotice('Cloudflare não carregou. Verifique a conexão ou bloqueador de conteúdo e recarregue.',true);
        },4000);
      }
      return;
    }
    if (captchaWaitTimer !== null) {
      window.clearTimeout(captchaWaitTimer);
      captchaWaitTimer=null;
    }
    if (captchaElement === el && captchaId !== null) return;
    if (captchaId !== null) {
      try { window.turnstile.remove(captchaId); } catch (_e) {}
      captchaId=null;
    }
    captchaRendering=true;
    try {
      captchaElement=el;
      const widgetSize = captchaSizeFor(el);
      el.dataset.gvWidgetSize = widgetSize;
      captchaNotice('');
      const nextId=window.turnstile.render(el,{
        sitekey:conf.siteKey,
        theme:'auto',
        size:widgetSize,
        appearance:'always',
        retry:'auto',
        callback:()=>captchaNotice('Validação antirrobô concluída.'),
        'error-callback':code=>{
          console.warn('Erro Cloudflare Turnstile:',String(code));
          captchaNotice('A validação falhou. Clique em Recarregar validação antirrobô.',true);
          return true;
        },
        'expired-callback':()=>captchaNotice('A validação expirou. Recarregue o Cloudflare.',true),
        'timeout-callback':()=>captchaNotice('Tempo esgotado. Recarregue a validação antirrobô.',true)
      });
      if (nextId === undefined || nextId === null) throw Error('widget não inicializado');
      captchaId=nextId;
      el.dataset.rendered='yes';
    } catch (_e) {
      captchaId=null;
      captchaElement=null;
      captchaNotice('Não foi possível iniciar o Cloudflare. Clique em Recarregar validação.',true);
    } finally {
      captchaRendering=false;
    }
  }
  function retryCaptcha() {
    if (window.turnstile?.reset && captchaId !== null) {
      try {
        window.turnstile.reset(captchaId);
        captchaNotice('Validação reiniciada.');
        return;
      } catch (_e) {}
    }
    if (window.turnstile?.remove && captchaId !== null) {
      try { window.turnstile.remove(captchaId); } catch (_e) {}
    }
    captchaId=null;
    captchaElement=null;
    const el=document.getElementById('gv-turnstile');
    if(el) el.replaceChildren();
    captchaNotice('Carregando validação...');
    if (window.turnstile?.render) {
      mountCaptcha();
      return;
    }
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=gv3901TurnstileReady';
    script.async=true;
    script.onerror=()=>captchaNotice('O Cloudflare não carregou. Verifique conexão, bloqueador de conteúdo ou DNS.',true);
    document.head.appendChild(script);
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
    const u = normalizeName(form.elements.username.value);
    const pass = String(form.elements.password.value);
    if (!validName(u)) {
      msg(status,'Nome de usuário inválido: use de 3 a 120 caracteres. Espaços e acentos são aceitos.',true);
      form.elements.username.focus();
      return;
    }
    form.elements.username.value = u;
    if (pass.length<6 || pass!==form.elements.confirm.value) return msg(status,'As senhas devem coincidir e conter pelo menos 6 caracteres.',true);
    if (!conf.siteKey || !cloud.url || !cloud.publishableKey) return msg(status,'Cadastro não configurado para este ambiente.',true);
    let token = '';
    if (captchaId !== null && captchaElement === document.getElementById('gv-turnstile')) {
      try { token = window.turnstile?.getResponse(captchaId) || ''; } catch (_e) {}
    }
    if (!token) {
      mountCaptcha();
      captchaNotice('A validação antirrobô não foi concluída ou expirou. Recarregue a validação.',true);
      return msg(status,'Conclua a validação antirrobô antes de solicitar o cadastro.',true);
    }
    submit.disabled=true; msg(status,'Enviando solicitação...');
    try {
      const response = await fetch(`${cloud.url.replace(/\/$/,'')}/functions/v1/${conf.functionName||'gv3901-solicitar-acesso'}`,{
        method:'POST',headers:{'Content-Type':'application/json','apikey':cloud.publishableKey},
        body:JSON.stringify({username:u,password:pass,captchaToken:token})
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
  // Apresentação da Área de Membros; não altera a autorização no servidor.
  const memberUiCss = `<style>
    #gv-area-membros, #gv-area-membros * {box-sizing:border-box}
    #gv-area-membros {width:100%;max-width:100%;overflow:hidden}
    #gv-area-membros .gv-members-head {display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
    #gv-area-membros .gv-members-head h2 {margin:0;font-size:clamp(17px,3.5vw,22px);line-height:1.25}
    #gv-area-membros .gv-members-help {margin:6px 0 0;color:#627b89;font-size:12px}
    #gv-area-membros .gv-member-stats {display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 14px}
    #gv-area-membros .gv-member-stat {border:1px solid #d7e5ea;border-radius:9px;padding:8px 11px;font-size:12px;background:#f6fafb}
    #gv-area-membros .gv-member-stat strong {font-variant-numeric:tabular-nums}
    #gv-area-membros .gv-members-tools {display:grid;grid-template-columns:minmax(0,1fr) minmax(140px,200px);gap:10px;margin:12px 0 14px}
    #gv-area-membros .gv-members-tools .input {min-width:0;width:100%;max-width:100%;margin:0}
    #gv-area-membros .gv-members-list {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px;min-width:0}
    #gv-area-membros .gv-member-item {min-width:0;max-width:100%;padding:13px;border:1px solid #d7e5ea;border-radius:12px;background:#fff}
    #gv-area-membros .gv-member-title {display:flex;flex-wrap:wrap;justify-content:space-between;align-items:start;gap:8px}
    #gv-area-membros .gv-member-name {font-size:14px;font-weight:700;line-height:1.4;overflow-wrap:anywhere}
    #gv-area-membros .gv-member-user {font-size:12px;color:#627b89;overflow-wrap:anywhere}
    #gv-area-membros .gv-member-status {display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eaf2f7;color:#23485d;font-size:11px;font-weight:600;white-space:normal}
    #gv-area-membros .gv-member-status.pending {background:#fff5db;color:#785000}
    #gv-area-membros .gv-member-status.active {background:#e7f5ed;color:#175f3e}
    #gv-area-membros .gv-member-status.suspended {background:#fbecec;color:#963535}
    #gv-area-membros .gv-member-meta {font-size:12px;color:#516a78;margin:10px 0}
    #gv-area-membros .gv-member-actions {display:flex;gap:8px;flex-wrap:wrap;align-items:stretch}
    #gv-area-membros .gv-member-actions .input {width:100%;min-width:0;max-width:100%;margin:0}
    #gv-area-membros .gv-member-actions .btn {flex:1 1 110px;min-width:0;white-space:normal;text-align:center;justify-content:center}
    #gv-area-membros .gv-member-actions .gv-member-role {flex:1 1 100%;min-width:0}
    #gv-area-membros .gv-members-bottom {display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
    #gv-area-membros .gv-members-bottom .btn {white-space:normal}
    #gv-area-membros .gv-member-help-details, #gv-area-membros .gv-member-audit {margin-top:12px;border-top:1px solid #d7e5ea;padding-top:12px}
    #gv-area-membros summary {cursor:pointer;font-weight:600;overflow-wrap:anywhere}
    #gv-area-membros .gv-member-audit-row {border-bottom:1px solid #e1eaf0;padding:9px 0;overflow-wrap:anywhere;font-size:12px}
    #gv-area-membros .gv-member-operation {font-size:12px;overflow-wrap:anywhere;min-height:1em;margin:10px 0 0}
    #gv-area-membros .gv-members-empty {padding:22px 10px;color:#627b89;text-align:center}
    @media(max-width:580px){
      #gv-area-membros {padding:14px 12px!important}
      #gv-area-membros .gv-members-tools {grid-template-columns:minmax(0,1fr)}
      #gv-area-membros .gv-member-stat {flex:1 1 120px}
      #gv-area-membros .gv-members-list {grid-template-columns:minmax(0,1fr)}
      #gv-area-membros .gv-member-actions .btn {flex:1 1 125px}
    }
  </style>`;
  function memberCard() {
    return `<section class="card pad" id="gv-area-membros" style="margin:16px 0;min-width:0;max-width:100%">
      ${memberUiCss}
      <div class="gv-members-head"><h2>Área de Membros</h2></div>
      <p class="gv-members-help">Aprovação e permissões de acesso</p>
      <div id="gv-area-membros-body" aria-live="polite">Verificando permissão...</div>
    </section>`;
  }
  function mountAdmin() {
    if (location.hash!=='#/administracao') return;
    const workspace = document.querySelector('.workspace');
    if (!workspace || workspace.querySelector('#gv-area-membros')) return;
    const el=document.createElement('div'); el.innerHTML=memberCard();
    const card=el.firstElementChild;
    const grid=workspace.querySelector('.grid.half');
    if(grid) grid.insertAdjacentElement('beforebegin',card); else workspace.appendChild(card);
    void loadAdmin(card);
  }
  function renderMemberRows() {
    const list = document.getElementById('gv-members-list');
    const count = document.getElementById('gv-members-result-count');
    const more = document.getElementById('gv-members-more');
    if (!list) return;
    const search = memberSearch.trim().toLocaleLowerCase('pt-BR');
    const matched = listedMembers.filter(m => {
      const pending = !m.active && !m.approved_at;
      const status = pending ? 'pending' : m.active ? 'active' : 'suspended';
      if (memberStatus !== 'all' && memberStatus !== status) return false;
      return !search || `${m.display_name||''} ${m.username||''}`.toLocaleLowerCase('pt-BR').includes(search);
    });
    // Pendências primeiro, seguido de usuários conforme ordenação do servidor.
    matched.sort((a,b)=>Number(!b.active&&!b.approved_at)-Number(!a.active&&!a.approved_at));
    const visible = matched.slice(0,memberPageSize);
    list.innerHTML=visible.map(m => {
      const privileged=['admin','planner'].includes(m.role);
      const pending=!m.active&&!m.approved_at;
      const status=pending?'Pendente':m.active?'Liberado':'Suspenso';
      const kind=pending?'pending':m.active?'active':'suspended';
      return `<article class="gv-member-item">
        <div class="gv-member-title"><div style="min-width:0;flex:1">
          <div class="gv-member-name">${escapeHtml(m.display_name)}</div>
          <div class="gv-member-user">@${escapeHtml(m.username||'conta-antiga')}</div>
        </div><span class="gv-member-status ${kind}">${status}</span></div>
        <div class="gv-member-meta">Perfil: <strong>${escapeHtml(m.role)}</strong></div>
        ${privileged ? '<div class="gv-member-meta">Perfil administrativo protegido</div>' :
          `<div class="gv-member-actions">
            <div class="gv-member-role"><label for="gv-member-role-${escapeHtml(m.user_id)}" style="display:block;font-size:12px;margin-bottom:4px">Permissão</label>
            <select id="gv-member-role-${escapeHtml(m.user_id)}" class="input" data-gv-member-select="${escapeHtml(m.user_id)}">
              <option value="viewer" ${m.role==='viewer'?'selected':''}>Somente leitura</option>
              <option value="operator" ${m.role==='operator'?'selected':''}>Escrita operacional</option>
            </select></div>
            <button type="button" class="btn primary" data-gv-member-set="${escapeHtml(m.user_id)}">${pending?'Aprovar':'Salvar perfil'}</button>
            ${m.active?`<button type="button" class="btn" data-gv-member-suspend="${escapeHtml(m.user_id)}">Suspender</button>`:''}
          </div>`}
      </article>`;
    }).join('') || '<div class="gv-members-empty">Nenhum membro encontrado para este filtro.</div>';
    if(count) count.textContent=`Mostrando ${visible.length} de ${matched.length}`;
    if(more) more.hidden=visible.length>=matched.length;
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
        body.innerHTML=`<p style="overflow-wrap:anywhere"><strong>Seu perfil:</strong> ${escapeHtml(me.role==='viewer'?'Somente leitura':me.role==='operator'?'Escrita operacional':me.role)}</p><p class="gv-members-help">A gestão das permissões é exclusiva da administração.</p>`;
        return;
      }
      const {data:members,error:membersError}=await sb.from('gv3901_members')
        .select('user_id,username,display_name,role,active,approved_at,requested_at')
        .order('requested_at',{ascending:false}).limit(500);
      if(membersError) throw membersError;
      listedMembers=members||[];
      const pending=listedMembers.filter(m=>!m.active&&!m.approved_at).length;
      const active=listedMembers.filter(m=>m.active).length;
      body.innerHTML=`<div class="gv-member-stats">
        <span class="gv-member-stat"><strong>${pending}</strong> pendentes</span>
        <span class="gv-member-stat"><strong>${active}</strong> liberados</span>
        <span class="gv-member-stat"><strong>${listedMembers.length}</strong> no total</span>
      </div>
      <div class="gv-members-tools">
        <input id="gv-member-search" class="input" type="search" placeholder="Buscar nome ou usuário" aria-label="Buscar membro" value="${escapeHtml(memberSearch)}" autocomplete="off">
        <select id="gv-member-status" class="input" aria-label="Filtrar status">
          <option value="all" ${memberStatus==='all'?'selected':''}>Todos os status</option>
          <option value="pending" ${memberStatus==='pending'?'selected':''}>Pendentes</option>
          <option value="active" ${memberStatus==='active'?'selected':''}>Liberados</option>
          <option value="suspended" ${memberStatus==='suspended'?'selected':''}>Suspensos</option>
        </select>
      </div>
      <div id="gv-members-list" class="gv-members-list"></div>
      <p id="gv-member-operation" class="gv-member-operation" role="status" aria-live="polite"></p>
      <div class="gv-members-bottom">
        <span id="gv-members-result-count" class="gv-members-help"></span>
        <button type="button" class="btn" id="gv-members-more">Ver mais membros</button>
        <button type="button" class="btn" id="gv-members-refresh">Atualizar</button>
      </div>
      <details class="gv-member-help-details"><summary>Como gerenciar permissões</summary>
        <p class="gv-members-help">Selecione leitura ou escrita e toque em Aprovar ou Salvar perfil. Para suspender, use Suspender. Justifique toda alteração; a ação será auditada. Perfis administrativos estão protegidos.</p>
      </details>
      <details class="gv-member-audit"><summary>Histórico de alterações de acesso</summary><div id="gv-access-history">Carregando...</div></details>`;
      renderMemberRows();
      const {data:history,error:historyError} = await sb.rpc('gv3901_access_history',{p_limit:30});
      const historyBox=card.querySelector('#gv-access-history');
      if(historyBox) historyBox.innerHTML=historyError?'Histórico indisponível.':(history||[]).map(h=>
        `<div class="gv-member-audit-row"><strong>${escapeHtml(h.target_name)}</strong>: ${escapeHtml(h.old_role)} → ${escapeHtml(h.new_role)}
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
    if (e.target.closest('#gv-captcha-retry')) {e.preventDefault();retryCaptcha();return;}
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
    if(e.target.closest('#gv-members-more')) {memberPageSize+=12;renderMemberRows();return;}
    if(e.target.closest('#gv-members-refresh')) {const panel=document.getElementById('gv-area-membros');if(panel)void loadAdmin(panel);return;}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='gv-member-search') {
      memberSearch=e.target.value;
      memberPageSize=12;
      renderMemberRows();
    }
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='gv-member-status') {
      memberStatus=e.target.value;
      memberPageSize=12;
      renderMemberRows();
    }
  });
  document.addEventListener('submit', e=>{
    if(e.target.id==='gv-members-signup-form'){e.preventDefault();void doSignup(e.target);}
  },true);
  window.addEventListener('resize', () => {
    if (captchaResizeTimer !== null) window.clearTimeout(captchaResizeTimer);
    captchaResizeTimer = window.setTimeout(() => {
      captchaResizeTimer = null;
      remountCaptchaForWidth();
    }, 250);
  });
  window.gv3901TurnstileReady = () => { mountCaptcha(); };
  const hydrate=()=>{mountLogin();mountPasswordEyes();mountPending();mountAdmin();};
  const observer=new MutationObserver(hydrate);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',hydrate);
  window.addEventListener('hashchange',hydrate);
  window.addEventListener('load',()=>{hydrate();mountCaptcha();});
  hydrate();
})();
