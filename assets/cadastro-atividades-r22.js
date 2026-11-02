"use strict";
/* GV3901 REAL r22: nova interface de cadastro em Planejamento.
 * Um clique -> ler estado/versao atuais -> validar -> RPC gv3901_commit -> releitura.
 * Não escreve em outras tabelas e não ignora autenticação/RLS.
 * Não altera a especificação V1.2 congelada nem o app.js.
 */
(() => {
  const FORM_ID = 'gv-r22-cadastro';
  const PANEL_ID = 'gv-r22-painel';
  const DEFAULT_MILESTONES=()=>[
    {label:'Etapa 1',pct:25},{label:'Etapa 2',pct:25},
    {label:'Etapa 3',pct:25},{label:'Etapa 4',pct:25}
  ];
  const DEFAULT = () => ({id:'',title:'',discipline:'',source:'',from:'',to:'',qty:'',unit:'un.',weight:'',pred:'',critical:false,measurementMode:'quantity',milestonePlan:DEFAULT_MILESTONES()});
  const state = {draft:DEFAULT(),status:'Cadastro r22 (PARADA REAL) ativo. Utilize o formulário abaixo para cadastrar uma atividade real aprovada pela Manutenção.',level:'info',busy:false,client:null,lastVerified:null,reading:false};
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
  function modePicker(){
    const choices=[['quantity','Quantidade física executada (acumulada)'],['unit','Unidade concluída (0 ou 1)'],['milestones','Percentual por marcos físicos (0 a 100%)']];
    return `<div style="margin:12px 0;padding:12px;border:1px solid #b7d5e7;border-radius:10px;background:#f5faff">
      <label for="gv21-mode" style="display:block;font-weight:700;font-size:13px;margin-bottom:6px">Critério de medição da atividade *</label>
      <select class="input" id="gv21-mode" name="measurementMode" style="width:100%;max-width:100%;font-size:16px;box-sizing:border-box">
        ${choices.map(([v,l])=>`<option value="${v}" ${state.draft.measurementMode===v?'selected':''}>${l}</option>`).join('')}
      </select>
      <p data-gv-mode-help style="font-size:12px;margin:9px 0 0;line-height:1.5"></p>
      <div data-gv-milestones style="display:none;margin:10px 0 0">
        <p style="font-size:12px;line-height:1.5;margin:0 0 8px">Defina marcos verificáveis. Os percentuais devem somar 100%. O acumulado só alcança um marco quando ele estiver concluído e conferido. Exemplo para válvula: retirada 20%, revisão 40%, montagem 25%, testes/liberação 15%. Esses valores são apenas ilustrativos.</p>
        <div data-gv-milestones-list></div>
        <div class="actions" style="margin-top:9px"><button type="button" class="btn small" data-gv-milestone-add>+ Etapa</button><button type="button" class="btn small" data-gv-milestone-remove>Remover última</button></div>
        <p data-gv-milestone-sum style="font-size:12px;font-weight:700;margin:9px 0 0"></p>
      </div>
    </div>`;
  }
  function drawMilestones(){
    const list=panel()?.querySelector('[data-gv-milestones-list]'); if(!list)return;
    list.innerHTML=state.draft.milestonePlan.map((m,i)=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(95px,110px);gap:8px;margin:7px 0">
      <label style="font-size:12px">Etapa ${i+1}<input class="input" style="width:100%;box-sizing:border-box;font-size:16px" data-ms-label="${i}" value="${escapeHtml(m.label)}" /></label>
      <label style="font-size:12px">Peso (%)<input class="input" style="width:100%;box-sizing:border-box;font-size:16px" type="number" min="0.001" max="100" step="any" data-ms-pct="${i}" value="${escapeHtml(m.pct)}" /></label>
    </div>`).join('');
    updateMilestoneSum();
  }
  function updateMilestoneSum(){
    const el=panel()?.querySelector('[data-gv-milestone-sum]');if(!el)return;
    const s=state.draft.milestonePlan.reduce((a,b)=>a+numeric(b.pct),0);
    const valid=Number.isFinite(s)&&Math.abs(s-100)<0.00001;
    el.textContent='Soma dos marcos: '+(Number.isFinite(s)?s.toLocaleString('pt-BR',{maximumFractionDigits:4}):'valor inválido')+'% '+(valid?'✓':'— ajuste para 100%');
    el.style.color=valid?'#146b4f':'#9b2f2f';
  }
  function applyMode(){
    const f=form();if(!f)return;
    const mode=state.draft.measurementMode;
    const qty=f.elements.namedItem('qty'),unit=f.elements.namedItem('unit');
    const box=panel()?.querySelector('[data-gv-milestones]'),help=panel()?.querySelector('[data-gv-mode-help]');
    if(box)box.style.display=mode==='milestones'?'block':'none';
    const guided=mode==='unit'||mode==='milestones';
    for(const input of [qty,unit]){if(input){input.readOnly=guided;input.style.background=guided?'#e9f0f4':'';}}
    if(mode==='unit'){state.draft.qty='1';state.draft.unit='un.';}
    if(mode==='milestones'){state.draft.qty='100';state.draft.unit='% de execução';}
    if(qty)qty.value=state.draft.qty;
    if(unit)unit.value=state.draft.unit;
    if(help)help.textContent=mode==='unit'?'Uma única unidade: informe 0 enquanto não concluída, e 1 após conclusão e conferência. Não há avanço parcial.':
      mode==='milestones'?'Total automático de 100 unidades percentuais. Registre avanço somente pelos marcos físicos concluídos e conferidos.':
      'Quantidade física total e unidade definidas pelo planejamento (juntas, metros, válvulas etc.). Em cada medição registre o total executado até a data, não a produção do dia.';
    if(mode==='milestones')drawMilestones();
  }
  function html(){
    return `<section id="${PANEL_ID}" class="card pad" style="margin:15px 0;border:2px solid #276f94;max-width:100%;overflow:hidden">
      <h2 style="margin:0 0 7px;font-size:19px">Cadastro de atividades — r22 (PARADA REAL)</h2>
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
      </div>${modePicker()}
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
    p.querySelector('[name="measurementMode"]')?.addEventListener('change',e=>{
      const was=state.draft.measurementMode;
      if(was==='unit'||was==='milestones'){state.draft.qty='';state.draft.unit='un.';}
      state.draft.measurementMode=e.target.value;applyMode();
    });
    p.addEventListener('input',e=>{
      const idx=e.target?.dataset?.msLabel ?? e.target?.dataset?.msPct;
      if(idx===undefined)return;
      const i=Number(idx);const item=state.draft.milestonePlan[i];if(!item)return;
      if('msLabel' in e.target.dataset)item.label=e.target.value;
      if('msPct' in e.target.dataset)item.pct=e.target.value;
      updateMilestoneSum();
    });
    p.querySelector('[data-gv-milestone-add]')?.addEventListener('click',()=>{
      if(state.draft.milestonePlan.length>=8){status('Máximo de 8 marcos por atividade.','error');return}
      state.draft.milestonePlan.push({label:'Etapa '+(state.draft.milestonePlan.length+1),pct:0});drawMilestones();
    });
    p.querySelector('[data-gv-milestone-remove]')?.addEventListener('click',()=>{
      if(state.draft.milestonePlan.length<=2){status('Mantenha pelo menos 2 marcos.','error');return}
      state.draft.milestonePlan.pop();drawMilestones();
    });
    applyMode();
  }
  function updateDraft(){
    const f=form();if(!f)return;
    for(const k of Object.keys(state.draft)){
      if(k==='milestonePlan')continue;
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
    const mode=d.measurementMode;
    if(!['quantity','unit','milestones'].includes(mode))throw Error('Selecione um critério de medição válido.');
    if(mode==='unit'&&(qty!==1||d.unit!=='un.'))throw Error('Unidade concluída exige quantidade total 1 e unidade un.');
    let milestones=[];
    if(mode==='milestones'){
      if(qty!==100||d.unit!=='% de execução')throw Error('Medição por marcos exige quantidade 100 e unidade % de execução.');
      if(!Array.isArray(d.milestonePlan)||d.milestonePlan.length<2||d.milestonePlan.length>8)throw Error('Defina de 2 a 8 marcos físicos.');
      milestones=d.milestonePlan.map((m,i)=>({label:safe(m.label).trim(),pct:numeric(m.pct)}));
      if(milestones.some(m=>!m.label||!Number.isFinite(m.pct)||m.pct<=0||m.pct>100))throw Error('Cada marco precisa de descrição e percentual positivo.');
      if(Math.abs(milestones.reduce((sum,m)=>sum+m.pct,0)-100)>0.00001)throw Error('A soma dos marcos deve ser exatamente 100%.');
    }
    return {id,title,from,to,qty,weight,unit:safe(d.unit).trim(),discipline:safe(d.discipline).trim(),source:safe(d.source).trim(),pred,critical:d.critical,measurementMode:mode,measurementMilestones:milestones};
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
      api(ctx,'/rest/v1/gv3901_workspace?select=state%2Cversion%2Clast_action&code=eq.GV3901_REAL')
    ]);
    if(!Array.isArray(m)||!m.length)throw Error('Não foi encontrado vínculo ativo para este usuário na tabela gv3901_members.');
    const member=m[0];
    if(!member.active || !['admin','planner'].includes(member.role))throw Error('Conta sem permissão de planejamento: role='+member.role+', active='+member.active+'.');
    if(!Array.isArray(w)||w.length!==1)throw Error('Workspace da parada real indisponível.');
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
      const answer=await api(ctx,'/rest/v1/rpc/gv3901_commit_workspace','POST',{
        p_workspace_code:'GV3901_REAL',p_expected_version:Number(work.version),p_state:next,p_action:action,p_detail:''
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

  // Ajuda contextual ao registrar MEDIÇÕES: respeita os campos e o fluxo original do app.js.
  // A Curva S continua usando qty/quantidade total e o peso da atividade, sem fórmulas paralelas.
  let measureKey=0,measureBusy=false;
  async function mountMeasureHelper(){
    const f=document.querySelector('#active-form[data-kind="measure"]');
    if(!f||f.querySelector('#gv21-measure-helper')||measureBusy)return;
    const field=f.querySelector('[name="qty"]');if(!field)return;
    const holder=field.closest('.form-field');if(!holder)return;
    const div=document.createElement('div');div.id='gv21-measure-helper';div.style.cssText='padding:12px;margin:10px 0;background:#f0f7fb;border:1px solid #b7d5e7;border-radius:10px;font-size:13px;line-height:1.5;overflow-wrap:anywhere;';
    div.innerHTML='<strong>Critério de medição — carregando...</strong>';
    holder.insertAdjacentElement('afterend',div);
    const load=async()=>{
      const id=String(f.elements.namedItem('activityId')?.value||'').trim();
      if(!id){div.textContent='Selecione uma atividade para consultar o critério de medição.';return}
      const key=++measureKey;measureBusy=true;
      try{
        const ctx=await getToken();
        const workRows=await api(ctx,'/rest/v1/gv3901_workspace?select=state&code=eq.GV3901_REAL');
        if(!Array.isArray(workRows)||workRows.length!==1)throw Error('Workspace indisponível para consulta de critérios.');
        if(!f.isConnected||key!==measureKey)return;
        const a=workRows[0].state?.activities?.find(a=>a.id===id);
        if(!a){div.textContent='Atividade não encontrada no planejamento atual.';return}
        const mode=a.measurementMode||'quantity';
        if(mode==='quantity'){
          div.textContent='Quantidade física: informe o total acumulado executado até a data (máximo '+a.qty+' '+a.unit+'). Não informe apenas a produção diária.';return;
        }
        const options=mode==='unit'?[{qty:0,label:'Não concluída — 0 / 1'},{qty:1,label:'Concluída e conferida — 1 / 1'}]:
          [{qty:0,label:'Nenhum marco concluído — 0%'}].concat((a.measurementMilestones||[]).map((m,i,all)=>({qty:Math.round(all.slice(0,i+1).reduce((s,m)=>s+m.pct,0)*10000)/10000,label:'Até '+m.label+' — '+Math.round(all.slice(0,i+1).reduce((s,m)=>s+m.pct,0)*10000)/10000+'%'})));
        if(!options.length || (mode==='milestones'&&options.length===1)){div.textContent='Marcos físicos não cadastrados. Solicite validação do planejamento antes da medição.';return}
        const select=document.createElement('select');select.className='input';select.style.cssText='width:100%;max-width:100%;box-sizing:border-box;font-size:16px;padding:9px;';
        select.setAttribute('aria-label','Quantidade acumulada conforme critério cadastrado');
        const explanation=document.createElement('p');explanation.style.cssText='font-size:12px;line-height:1.5;margin:8px 0 0';
        explanation.textContent=mode==='unit'?'Só considerar concluído após os testes e a liberação previstos no escopo.':'Selecione o último marco integralmente concluído e conferido. A soma será preenchida no campo Quantidade ACUMULADA.';
        select.append(new Option('Selecione o avanço comprovado...', ''));
        for(const o of options)select.append(new Option(o.label,String(o.qty)));
        // Preserve draft; NEVER force zero merely by opening form.
        if(field.value!==''&&options.some(o=>Math.abs(Number(field.value)-o.qty)<0.00001))select.value=String(Number(field.value));
        field.readOnly=true;field.style.background='#e9f0f4';
        select.addEventListener('change',()=>{
          if(select.value==='')return;
          field.value=select.value;field.dispatchEvent(new Event('input',{bubbles:true}));
        });
        div.replaceChildren();const title=document.createElement('strong');title.textContent='Critério: '+(mode==='unit'?'Unidade concluída (0/1)':'Percentual por marcos físicos');
        div.append(title,document.createElement('br'),select,explanation);
      }catch(e){div.textContent='Não foi possível consultar o critério desta atividade: '+textError(e)+'. Não registre avanço sem validá-lo.';}
      finally{measureBusy=false}
    };
    f.elements.namedItem('activityId')?.addEventListener('change',()=>{div.textContent='Consultando critério...';void load()});
    await load();
  }
  document.addEventListener('submit',e=>{
    const f=e.target;
    if(f?.id!=='active-form'||f.dataset.kind!=='measure')return;
    const helper=f.querySelector('#gv21-measure-helper');
    const select=helper?.querySelector('select');
    if(!select)return; // atividades antigas ou quantidade física mantêm fluxo existente.
    const field=f.elements.namedItem('qty');
    if(select.value===''||Math.abs(Number(field.value)-Number(select.value))>0.00001){
      e.preventDefault();e.stopImmediatePropagation();
      const msg=document.createElement('p');msg.setAttribute('role','alert');msg.style.color='#9b2f2f';
      msg.textContent='Selecione a quantidade acumulada correspondente a um marco concluído e conferido.';
      helper.querySelector('[role="alert"]')?.remove();helper.append(msg);
    }
  },true);

  const mo=new MutationObserver(list=>{
    // O app pode renderizar novamente após sincronização. Reinsere sem tocar no estado remoto.
    if(active()&&!panel())mount();
    if(document.querySelector('#active-form[data-kind="measure"]')&&!document.getElementById('gv21-measure-helper'))void mountMeasureHelper();
  });
  mo.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',mount);
  window.addEventListener('hashchange',mount);
  mount();
  void mountMeasureHelper();
  window.GV3901_CADASTRO_R22_READY=true;
})();
