"use strict";
/* GV3901 HML r20: nova interface de cadastro em Planejamento.
 * Um clique -> ler estado/versao atuais -> validar -> RPC gv3901_commit -> releitura.
 * Não escreve em outras tabelas e não ignora autenticação/RLS.
 * Não altera a especificação V1.2 congelada nem o app.js.
 */
(() => {
  const FORM_ID = 'gv-r20-cadastro';
  const PANEL_ID = 'gv-r20-painel';
  const DEFAULT = () => ({id:'',title:'',discipline:'',source:'',from:'',to:'',qty:'',unit:'un.',weight:'',pred:'',critical:false});
  const state = {draft:DEFAULT(),status:'Cadastro r20 ativo. Utilize o formulário abaixo para cadastrar uma atividade de teste.',level:'info',busy:false,client:null,lastVerified:null,reading:false};
  const palette = {info:['#edf5fc','#20536d','#b7d5e7'],ok:['#eaf8f0','#155b40','#b3dfc7'],error:['#fff0ee','#8c2723','#e8b4b1']};
  const safe = v => String(v??'');
  const escapeHtml = v => safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const textError = e => [e?.message,e?.details,e?.hint,e?.code?'Código '+e.code:''].filter(Boolean).join(' | ').slice(0,950)||'Erro sem detalhes retornado pelo servidor.';
  const active = () => location.hash === '#/planejamento' && !!document.querySelector('.workspace .head');
  const panel = () => document.getElementById(PANEL_ID);
  const form = () => document.getElementById(FORM_ID);
  const numeric = v => Number(safe(v).trim().replace(',','.'));
  const dateValid = s => {if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d.valueOf())&&d.toISOString().slice(0,10)===s};
  function status(message,level='info') {
    state.status=message;state.level=level;
    const el=panel()?.querySelector('[data-gv-status]');
    if(el){el.textContent=message;const pal=palette[level];el.style.background=pal[0];el.style.color=pal[1];el.style.border='1px solid '+pal[2];}
  }
  function field(name,label,type='text',extra='') {
    const val=state.draft[name]??'';
    return `<label style="display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#23465a;min-width:0">${escapeHtml(label)}<input class="input" name="${name}" type="${type}" value="${escapeHtml(val)}" ${extra} style="width:100%;max-width:100%;box-sizing:border-box;min-width:0;font-size:16px;padding:10px"/></label>`;
  }
  function html(){
    return `<section id="${PANEL_ID}" class="card pad" style="margin:15px 0;border:2px solid #276f94;max-width:100%;overflow:hidden">
      <h2 style="margin:0 0 7px;font-size:19px">Cadastro de atividades — r20</h2>
      <p class="muted" style="font-size:13px;margin:0 0 12px">Novo fluxo de homologação: gravação verificada no Supabase. Não confunda com “Configurar parada”.</p>
      <div role="status" aria-live="polite" data-gv-status style="padding:12px;border-radius:9px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:12px;font-size:13px"></div>
      <div class="actions" style="margin:0 0 12px"><button type="button" class="btn" data-gv-check>Consultar acesso e atividades no banco (sem gravar)</button><strong data-gv-counter style="font-size:13px"></strong></div>
      <form id="${FORM_ID}" novalidate>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px">
        ${field('id','Código da atividade *','text','required maxlength="80"')}
        ${field('title','Descrição da atividade *','text','required')}
        ${field('discipline','Disciplina / área')}
        ${field('source','Origem do planejamento')}
        ${field('from','Início previsto *','date','required')}
        ${field('to','Término previsto *','date','required')}
        ${field('qty','Quantidade total *','number','required min="0.000001" step="any"')}
        ${field('unit','Unidade *','text','required')}
        ${field('weight','Peso do avanço *','number','required min="0.000001" step="any"')}
        ${field('pred','Predecessoras (códigos separados por vírgula)')}
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin:12px 0;font-size:13px"><input name="critical" type="checkbox" ${state.draft.critical?'checked':''}/> Atividade crítica</label>
      <p class="muted" style="font-size:12px">A criação da atividade não congela a B0. Somente dados fictícios ou autorizados na homologação.</p>
      <button type="submit" class="btn primary" data-gv-submit ${state.busy?'disabled':''}>${state.busy?'Gravando e conferindo...':'Salvar atividade no Supabase'}</button>
      </form>
    </section>`;
  }
  function mount(){
    if(!active())return;
    if(panel()){const s=panel().querySelector('[data-gv-status]');if(s&&s.textContent!==state.status)status(state.status,state.level);return;}
    const w=document.querySelector('.workspace'), h=w?.querySelector('.head');if(!w||!h)return;
    h.insertAdjacentHTML('afterend',html());
    status(state.status,state.level);
    const p=panel();
    const f=p?.querySelector('form');
    if(!f)return;
    f.addEventListener('input',updateDraft);
    f.addEventListener('change',updateDraft);
    f.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();updateDraft();void saveActivity();});
    p.querySelector('[data-gv-check]')?.addEventListener('click',()=>void checkStatus());
  }
  function updateDraft(){
    const f=form();if(!f)return;
    for(const k of Object.keys(state.draft)){
      const el=f.elements.namedItem(k);
      if(!el)continue;
      state.draft[k]=k==='critical'?Boolean(el.checked):safe(el.value);
    }
  }
  function requireFields(){
    const d=state.draft;
    const id=safe(d.id).trim().toUpperCase(), title=safe(d.title).trim();
    const from=safe(d.from), to=safe(d.to), qty=numeric(d.qty),weight=numeric(d.weight);
    if(!id)throw Error('Preencha o Código da atividade.');
    if(!title)throw Error('Preencha a Descrição da atividade.');
    if(!dateValid(from)||!dateValid(to)||to<from)throw Error('Datas inválidas. Informe início e término em ordem cronológica.');
    if(!Number.isFinite(qty)||qty<=0)throw Error('Quantidade deve ser maior que zero.');
    if(!Number.isFinite(weight)||weight<=0)throw Error('Peso do avanço deve ser maior que zero.');
    if(!safe(d.unit).trim())throw Error('Unidade é obrigatória.');
    const pred=safe(d.pred).split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
    if(pred.includes(id))throw Error('Atividade não pode depender dela mesma.');
    return {id,title,from,to,qty,weight,unit:safe(d.unit).trim(),discipline:safe(d.discipline).trim(),source:safe(d.source).trim(),pred,critical:d.critical};
  }
  function validatePredecessors(acts){
    const ids=new Map(acts.map(a=>[a.id,a]));const visited=new Set(),path=new Set();
    function dfs(id){if(path.has(id))throw Error('Dependência circular no cronograma.');if(visited.has(id))return;
      path.add(id);for(const p of ids.get(id)?.pred||[]){if(!ids.has(p))throw Error('Predecessora não cadastrada: '+p);dfs(p);}path.delete(id);visited.add(id);}
    acts.forEach(a=>dfs(a.id));
  }
  async function getToken(){
    const config=window.GV3901_CLOUD_CONFIG;
    if(!config?.url||!config?.publishableKey||!window.supabase?.createClient)throw Error('Configuração ou biblioteca Supabase indisponível.');
    if(!state.client)state.client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await state.client.auth.getSession();
    if(error)throw Error('Não foi possível ler sua sessão: '+textError(error));
    const token=data?.session?.access_token;
    if(!token)throw Error('Não existe sessão válida neste navegador. Saia e entre novamente com sua conta administradora.');
    return {url:config.url.replace(/\/$/,''),apikey:config.publishableKey,token,userId:data.session.user?.id};
  }
  async function api(ctx,endpoint,method='GET',body){
    const headers={'apikey':ctx.apikey,'Authorization':'Bearer '+ctx.token,'Accept':'application/json'};
    if(body!==undefined)headers['Content-Type']='application/json';
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const res=await fetch(ctx.url+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:controller.signal});
      let data=null;const raw=await res.text();try{data=raw?JSON.parse(raw):null}catch(_){data={message:raw.slice(0,500)}}
      if(!res.ok)throw Error('Supabase HTTP '+res.status+': '+textError(data));
      return data;
    }finally{clearTimeout(timer);}
  }
  async function readCurrent(ctx){
    const [m,w]=await Promise.all([
      api(ctx,'/rest/v1/gv3901_members?select=user_id%2Cdisplay_name%2Crole%2Cactive&user_id=eq.'+encodeURIComponent(ctx.userId)),
      api(ctx,'/rest/v1/gv3901_workspace?select=state%2Cversion%2Clast_action&code=eq.GV3901')
    ]);
    if(!Array.isArray(m)||!m.length)throw Error('Não foi encontrado vínculo ativo para este usuário na tabela gv3901_members.');
    const member=m[0];
    if(!member.active || !['admin','planner'].includes(member.role))throw Error('Conta sem permissão de planejamento: role='+member.role+', active='+member.active+'.');
    if(!Array.isArray(w)||w.length!==1)throw Error('Workspace GV3901 indisponível.');
    const work=w[0];
    if(!work.state||work.state.schema!==1||!Array.isArray(work.state.activities)||!Array.isArray(work.state.audit))throw Error('Estado do workspace incompleto ou incompatível.');
    return {member,work};
  }
  async function checkStatus(){
    if(state.busy)return;
    if(state.reading)return;
    state.reading=true;status('Consultando perfil, versão e atividades no Supabase...');
    try{
      const ctx=await getToken();const {member,work}=await readCurrent(ctx);
      const project=work.state.project||{};
      for(const k of ['from','to']){
        const target=k==='from'?'start':'end';
        if(!state.draft[k]&&dateValid(project[target])){
          state.draft[k]=project[target];const field=form()?.elements.namedItem(k);if(field)field.value=project[target];
        }
      }
      status('Conexão confirmada. Perfil '+member.role+' ativo. Banco na versão '+work.version+'. Atividades: '+work.state.activities.length+'. Última ação: '+(work.last_action||'não registrada')+'.','ok');
    }catch(e){status('Falha ao consultar: '+textError(e),'error')}
    finally{state.reading=false;}
  }
  async function saveActivity(){
    if(state.busy)return;
    let row;
    try{row=requireFields()}catch(e){status('Cadastro não enviado: '+textError(e),'error');return;}
    state.busy=true;
    const btn=form()?.querySelector('[data-gv-submit]');if(btn){btn.disabled=true;btn.textContent='Gravando e conferindo...'}
    status('Validado. Consultando versão atual do banco para gravar '+row.id+'...');
    try{
      const ctx=await getToken();
      const {member,work}=await readCurrent(ctx);
      if(work.state.activities.some(a=>a.id===row.id))throw Error('O código '+row.id+' já existe no banco; não será duplicado. Confira a Lista de atividades.');
      const next=structuredClone(work.state);
      next.activities.push(row);
      validatePredecessors(next.activities);
      next.updatedAt=new Date().toISOString();
      const action='Atividade cadastrada: '+row.id;
      next.audit.unshift({id:'AUD-'+(crypto.randomUUID?.()||Date.now()),at:next.updatedAt,operator:member.display_name,action,detail:''});
      next.audit=next.audit.slice(0,2000);
      status('Enviando '+row.id+' ao banco via gv3901_commit. Aguarde a confirmação...');
      const answer=await api(ctx,'/rest/v1/rpc/gv3901_commit','POST',{
        p_expected_version:Number(work.version),p_state:next,p_action:action,p_detail:''
      });
      const ack=Array.isArray(answer)?answer[0]:answer;
      if(!Number.isFinite(Number(ack?.committed_version)))throw Error('Resposta do servidor sem número de versão. O registro pode ter sido feito; consulte o banco antes de tentar novamente.');
      status('Resposta do servidor recebida. Conferindo se o cadastro persistiu...');
      const verified=await readCurrent(ctx);
      const stored=verified.work.state.activities.find(a=>a.id===row.id);
      if(!stored)throw Error('Gravação NÃO confirmada: a atividade não foi encontrada após a releitura. Não repita sem consultar o banco.');
      state.lastVerified={id:row.id,version:verified.work.version};
      status('CONFIRMADO NO SUPABASE: atividade '+row.id+' salva. Versão '+verified.work.version+', total '+verified.work.state.activities.length+' atividade(s). A B0 deve ser aprovada apenas com o plano completo.', 'ok');
      state.draft=DEFAULT();
      const f=form();if(f)f.reset();
      const refresh=document.querySelector('[data-action="cloud-refresh"]');if(refresh)refresh.click();
    }catch(e){status('ATIVIDADE NÃO CONFIRMADA: '+textError(e)+' — dados mantidos. Não cadastre novamente antes de resolver o motivo.', 'error');}
    finally{state.busy=false;const b=form()?.querySelector('[data-gv-submit]');if(b){b.disabled=false;b.textContent='Salvar atividade no Supabase'} }
  }
  // Substitui o caminho de cadastro inicial sem modificar o app.js.
  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('[data-action="modal:activity"]');
    if(!b||!active())return;
    e.preventDefault();e.stopImmediatePropagation();mount();
    const el=panel();el?.scrollIntoView({behavior:'smooth',block:'start'});
    el?.querySelector('[name="id"]')?.focus({preventScroll:true});
  },true);
  const mo=new MutationObserver(list=>{
    // O app pode renderizar novamente após sincronização. Reinsere sem tocar no estado remoto.
    if(active()&&!panel())mount();
  });
  mo.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',mount);
  window.addEventListener('hashchange',mount);
  mount();
})();
