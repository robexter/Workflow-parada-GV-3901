 'use strict';
/* GV-3901 / Homologação r17: diagnóstico visível de salvamento.
   Observador: não escreve em Supabase, não altera requisições nem regras RLS. */
(() => {
  const ID='gv-r17-status', MESSAGE='gv-r17-form-status';
  const PATH='/rest/v1/rpc/gv3901_commit';
  const state={attempt:null, seq:0, outcome:null};

  const activityForm = () => document.querySelector('#active-form[data-kind="activity"]');
  const watchedForm = () => document.querySelector('#active-form[data-kind="activity"],#active-form[data-kind="project"]');
  function fieldName(el){
    return el?.closest?.('.form-field')?.querySelector?.('label')?.textContent?.replace('*','').trim() || el?.name || 'Campo';
  }
  function style(target,severity){
    const colors=severity==='ok'?['#eaf8f1','#125b42','#b7dfc9']:
      severity==='error'?['#fff0ee','#87322c','#e9b9b2']:
      ['#f0f6fc','#234d68','#bdcfdf'];
    target.style.background=colors[0];target.style.color=colors[1];target.style.border='1px solid '+colors[2];
  }
  function planningBanner(){
    if(location.hash!=='#/planejamento')return null;
    const area=document.querySelector('.workspace');
    if(!area)return null;
    let el=document.getElementById(ID);
    if(!el){
      el=document.createElement('div');el.id=ID;el.setAttribute('role','status');
      el.setAttribute('aria-live','polite');
      el.style.cssText='box-sizing:border-box;margin:10px 0 16px;padding:11px 13px;border-radius:10px;line-height:1.5;font-size:13px;overflow-wrap:anywhere;';
      const head=area.querySelector('.head');
      if(head)head.insertAdjacentElement('afterend',el);else area.prepend(el);
    }
    const value=state.outcome || {text:'Diagnóstico r17 ativo. Para cadastrar uma atividade utilize + Atividade → Salvar. Alterar Configurar parada não cadastra atividades.',severity:'info'};
    if(el.textContent!==value.text)el.textContent=value.text;
    style(el,value.severity);
    return el;
  }
  function formBanner(text,severity='info'){
    const f=watchedForm();if(!f)return;
    const footer=f.querySelector('.modal-foot');if(!footer)return;
    let el=f.querySelector('#'+MESSAGE);
    if(!el){
      el=document.createElement('div');el.id=MESSAGE;el.setAttribute('role','alert');el.setAttribute('aria-live','assertive');
      el.style.cssText='box-sizing:border-box;flex:1 1 100%;order:-1;padding:11px 13px;min-width:0;max-width:100%;border-radius:10px;font-size:13px;line-height:1.5;overflow-wrap:anywhere;';
      footer.style.flexWrap='wrap';footer.prepend(el);
    }
    if(el.textContent!==text)el.textContent=text;
    style(el,severity);
  }
  function inform(text,severity='info'){
    state.outcome={text,severity};
    formBanner(text,severity);
    planningBanner();
  }
  function startAttempt(form){
    const type=form?.dataset.kind;
    if(type!=='activity'&&type!=='project')return;
    const code=type==='activity'?(form.elements.namedItem('id')?.value||'').trim().toUpperCase():'';
    state.attempt={type,code,seq:++state.seq,completed:false};
    const msg=type==='activity'?'Verificando o cadastro da atividade '+(code||'(sem código)')+'...':'Verificando as configurações da parada...';
    inform(msg,'info');
  }
  function finished(text,severity){
    if(state.attempt)state.attempt.completed=true;
    inform(text,severity);
  }
  function outcomeFor(action,body,status,ok){
    const current=state.attempt;
    let kind=current?.type;
    if(/^Atividade (cadastrada|alterada):/i.test(action))kind='activity';
    else if(/^Planejamento editado/i.test(action))kind='project';
    const code=current?.code || action.split(':').slice(1).join(':').trim();
    const version=Array.isArray(body)?body[0]?.committed_version:body?.committed_version;
    if(ok && version!=null){
      return kind==='activity'
        ?['Atividade '+(code||'')+' confirmada no banco central (versão '+version+'). Confira a Lista de atividades.','ok']
        :['Configuração da parada confirmada no banco central (versão '+version+'). Para cadastrar serviços, utilize + Atividade.','ok'];
    }
    const problem=String(body?.message||body?.hint||body?.details||('HTTP '+status)).slice(0,320);
    return ['O Supabase não confirmou o salvamento: '+problem,'error'];
  }

  // Apresenta indicador persistente assim que o módulo Planejamento for montado.
  const observer=new MutationObserver(mutations=>{
    if(document.querySelector('.workspace') && location.hash==='#/planejamento')planningBanner();
    const attempt=state.attempt;
    if(!attempt||attempt.completed)return;
    for(const change of mutations){
      for(const node of change.addedNodes){
        if(node.nodeType!==1)continue;
        const toast=node.id==='toast'?node:node.querySelector?.('#toast');
        if(!toast)continue;
        const msg=toast.textContent?.trim()||'';
        if(!msg)continue;
        if(/Registro confirmado no banco central|confirmad[ao] no banco central/i.test(msg)){
          finished((attempt.type==='activity'?'Atividade '+(attempt.code||''):'Configuração da parada')+' confirmada pelo aplicativo. Confira o contador de atividades no Supabase.','ok');
        } else {
          finished('Não foi possível concluir o salvamento: '+msg,'error');
        }
        return;
      }
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',planningBanner);
  document.addEventListener('invalid',e=>{
    const el=e.target, f=el?.closest?.('#active-form');
    if(f?.dataset.kind!=='activity'&&f?.dataset.kind!=='project')return;
    const msg='Campo inválido: '+fieldName(el)+'. '+(el.validationMessage||'Informe um valor válido.');
    inform(msg,'error');
  },true);
  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('#active-form button[type="submit"]');
    if(!btn)return;
    const f=btn.closest('form');
    if(f?.dataset.kind==='activity'||f?.dataset.kind==='project')startAttempt(f);
  },true);
  document.addEventListener('submit',e=>{
    const f=e.target;if(f?.id!=='active-form')return;
    if(f.dataset.kind!=='activity'&&f.dataset.kind!=='project')return;
    if(!state.attempt||state.attempt.completed||state.attempt.type!==f.dataset.kind)startAttempt(f);
    inform('Formulário enviado. Aguardando confirmação do Supabase...','info');
    const seq=state.attempt.seq;
    setTimeout(()=>{
      if(state.attempt?.seq!==seq || state.attempt.completed)return;
      formBanner('Ainda não houve confirmação de gravação. Verifique a mensagem do aplicativo e a conexão com o Supabase.','error');
    },12000);
  },true);

  // Observação passiva: não altera corpo, cabeçalhos, autenticação ou resposta.
  const original=window.fetch;
  if(typeof original==='function')window.fetch=function(input,init){
    const url=typeof input==='string'?input:input?.url||'';
    const isCommit=String(url).includes(PATH);
    let action='';
    if(isCommit && typeof init?.body==='string'){
      try{action=JSON.parse(init.body)?.p_action||''}catch(_){/* corpo não textual */}
    }
    const relevant=isCommit && (/^Atividade (cadastrada|alterada):/i.test(action)||/^Planejamento editado/i.test(action)||!!state.attempt&&!state.attempt.completed);
    return original.apply(this,arguments).then(response=>{
      if(relevant)void response.clone().text().then(raw=>{
        let body=null;try{body=JSON.parse(raw)}catch(_){/* resposta não JSON */}
        const [msg,level]=outcomeFor(action,body,response.status,response.ok);
        finished(msg,level);
      }).catch(()=>finished('Não foi possível interpretar a resposta de gravação.','error'));
      return response;
    },error=>{
      if(relevant)finished('Falha de rede durante o salvamento: '+String(error?.message||error).slice(0,320),'error');
      throw error;
    });
  };
  planningBanner();
})();
