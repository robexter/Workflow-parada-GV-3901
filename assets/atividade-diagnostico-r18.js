 'use strict';
/* GV-3901 HML r18 — Observação do formulário de atividade (sem gravação em banco).
   Não altera o app.js, nem SQL/RLS, nem dados do usuário. Captura somente os
   estágios de submissão e a resposta HTTP para diagnosticar a falha.
*/
(() => {
  const ID='gv-r18-status', FORM='gv-r18-form-status';
  const PATH='/rest/v1/rpc/gv3901_commit';
  let attempt=null, counter=0, last={type:'info',message:'Diagnóstico r18 ativo. Abra + Atividade e clique Salvar; o estado será exibido aqui.'};
  const elForm=()=>document.querySelector('#active-form[data-kind="activity"]');
  const escapeText=x=>String(x||'').replace(/\s+/g,' ').slice(0,260);
  function palette(type){return type==='error'?['#fff1ed','#842821','#ebbbb7']:type==='ok'?['#e8f7ef','#145c43','#aadcbf']:['#eaf3ff','#215675','#b6d1e7'];}
  function color(el,type){const c=palette(type);el.style.background=c[0];el.style.color=c[1];el.style.border='1px solid '+c[2];}
  function plan(){
    if(location.hash!=='#/planejamento')return;
    const w=document.querySelector('.workspace');if(!w)return;
    let b=document.getElementById(ID);
    if(!b){b=document.createElement('div');b.id=ID;b.setAttribute('role','status');b.setAttribute('aria-live','polite');b.style.cssText='box-sizing:border-box;max-width:100%;margin:12px 0;padding:13px;border-radius:10px;font:500 13px/1.5 system-ui,sans-serif;overflow-wrap:anywhere;';const h=w.querySelector('.head');if(h)h.insertAdjacentElement('afterend',b);else w.prepend(b)}
    if(b.textContent!==last.message)b.textContent=last.message;
    color(b,last.type);
  }
  function form(){
    const f=elForm();if(!f)return;
    const foot=f.querySelector('.modal-foot');if(!foot)return;
    let b=f.querySelector('#'+FORM);
    if(!b){b=document.createElement('div');b.id=FORM;b.setAttribute('role','status');b.setAttribute('aria-live','polite');b.style.cssText='box-sizing:border-box;flex:1 1 100%;min-width:0;max-width:100%;padding:12px;border-radius:9px;font:500 13px/1.5 system-ui,sans-serif;overflow-wrap:anywhere;order:-1;';foot.style.flexWrap='wrap';foot.prepend(b)}
    const msg=attempt?last.message:'Diagnóstico r18 carregado no cadastro. Preencha os campos e clique Salvar.';
    if(b.textContent!==msg)b.textContent=msg;
    color(b,last.type);
  }
  function floating(){
    // O aplicativo frequentemente redesenha todo #app. Esta mensagem fica fora dele.
    if(!attempt)return;
    let b=document.getElementById('gv-r18-floating');
    if(!b){b=document.createElement('div');b.id='gv-r18-floating';b.setAttribute('role','status');b.setAttribute('aria-live','assertive');b.style.cssText='position:fixed;top:max(6px,env(safe-area-inset-top));left:8px;right:8px;max-width:650px;margin:0 auto;z-index:20000;box-sizing:border-box;padding:12px 14px;border-radius:10px;box-shadow:0 5px 22px #172f4540;font:600 13px/1.5 system-ui,sans-serif;overflow-wrap:anywhere;pointer-events:none;';document.body.append(b)}
    if(b.textContent!==last.message)b.textContent=last.message;
    color(b,last.type);
  }
  function report(message,type='info'){last={message,type};plan();form();floating()}
  function fieldName(el){return escapeText(el?.closest?.('.form-field')?.querySelector('label')?.textContent?.replace('*','').trim()||el?.name||'Campo obrigatório');}
  function firstInvalid(f){return Array.from(f?.elements||[]).find(e=>e.willValidate && e.validity && !e.validity.valid)}
  function onSaveClick(f){
    const code=escapeText(f.elements.namedItem('id')?.value?.trim()?.toUpperCase()||'(sem código)');
    const a={code,seq:++counter,submitted:false,rpc:false,finished:false};attempt=a;
    report('Clique em Salvar detectado (atividade '+code+'). Verificando o envio...');
    const invalid=firstInvalid(f);
    setTimeout(()=>{
      if(attempt!==a || a.submitted || a.rpc || a.finished)return;
      const m=invalid||firstInvalid(f);
      if(m){a.finished=true;report('O navegador bloqueou o cadastro. Corrija o campo '+fieldName(m)+': '+escapeText(m.validationMessage||'valor inválido')+'.','error');}
      else{a.finished=true;report('Clique detectado, mas o evento de envio do formulário não ocorreu. O registro NÃO foi confirmado.','error');}
    },600);
    setTimeout(()=>{
      if(attempt!==a || a.finished || a.rpc)return;
      report('Formulário enviado, mas o diagnóstico não observou resposta da gravação. Verifique o banco central antes de tentar de novo.','error');a.finished=true;
    },12000);
  }
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('#active-form[data-kind="activity"] button[type="submit"]');
    if(button)onSaveClick(button.closest('form'));
  },true);
  document.addEventListener('invalid',e=>{
    if(!e.target?.closest?.('#active-form[data-kind="activity"]'))return;
    if(attempt)attempt.finished=true;
    report('Campo inválido: '+fieldName(e.target)+'. '+escapeText(e.target.validationMessage||'Preenchimento inválido'), 'error');
  },true);
  document.addEventListener('submit',e=>{
    const f=e.target;
    if(f?.id!=='active-form'||f.dataset.kind!=='activity')return;
    if(!attempt||attempt.finished)onSaveClick(f);
    attempt.submitted=true;attempt.finished=false;
    report('Envio do formulário confirmado. Aguardando o retorno do Supabase...');
  },true);
  const baseFetch=window.fetch;
  if(typeof baseFetch==='function'){
    window.fetch=function(input,init){
      const url=typeof input==='string'?input:input?.url||'';
      const tracked=Boolean(attempt&&!attempt.finished&&String(url).includes(PATH));
      const a=attempt;
      if(tracked){a.rpc=true;report('Requisição de gravação ao Supabase observada. Aguardando resposta...')}
      return baseFetch.apply(this,arguments).then(response=>{
        if(tracked)void response.clone().text().then(raw=>{
          if(attempt!==a)return;
          let body=null;try{body=JSON.parse(raw)}catch(_){}
          a.finished=true;
          const version=Array.isArray(body)?body[0]?.committed_version:body?.committed_version;
          if(response.ok&&version!=null){report('Supabase confirmou a versão '+version+' para atividade '+a.code+'. Confira a Lista de atividades.', 'ok');}
          else{let reason=escapeText(body?.message||body?.details||body?.hint||('HTTP '+response.status));report('Supabase não confirmou a atividade: '+reason,'error')}
        }).catch(()=>{if(attempt===a){a.finished=true;report('Houve resposta do Supabase, mas não foi possível interpretá-la.','error')}});
        return response;
      },err=>{if(tracked&&attempt===a){a.finished=true;report('Falha de rede ao gravar atividade: '+escapeText(err?.message||err),'error')}throw err});
    };
  }
  // Tratamento para exceções que ocorram antes de chamar a API do banco.
  window.addEventListener('error',e=>{
    if(attempt&&!attempt.finished&&!attempt.rpc){attempt.finished=true;report('Erro de execução durante o cadastro: '+escapeText(e.message||'desconhecido'),'error')}
  });
  window.addEventListener('unhandledrejection',e=>{
    if(attempt&&!attempt.finished&&!attempt.rpc){attempt.finished=true;report('Falha de execução no formulário antes da gravação.','error')}
  });
  const mo=new MutationObserver(mutations=>{
    plan();form();
    if(!attempt||attempt.finished)return;
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType!==1)continue;
        const toast=node.id==='toast'?node:node.querySelector?.('#toast');if(!toast)continue;
        const msg=escapeText(toast.textContent);
        if(!msg)continue;
        // Aviso nativo não comprova persistência: exige conferência no Supabase.
        if(/Registro confirmado no banco central/.test(msg)){
          attempt.finished=true;report('Aplicativo informou sucesso para '+attempt.code+'. Confirme no Supabase antes de criar a B0.','ok');
        }else{
          attempt.finished=true;report('O aplicativo informou: '+msg,'error');
        }
        return;
      }
    }
  });
  mo.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',plan);
  document.addEventListener('DOMContentLoaded',()=>{plan();form()});
  plan();form();
})();
