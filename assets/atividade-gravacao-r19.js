"use strict";
/* GV-3901 — Homologação r19: gravação explícita e verificável de atividades.
   Trata SOMENTE o formulário #active-form[data-kind=activity].
   Reutiliza a função segura gv3901_commit, as políticas RLS e o login existente.
   Não grava no navegador, não usa chave service_role, não modifica B0, não
   altera outras rotinas do app. A especificação funcional V1.2 permanece intacta.
*/
(()=>{
  const S='gv3901-atividade-r19';
  let busy=false, lastMessage='';
  const activityForm=()=>document.querySelector('#active-form[data-kind="activity"]');
  const planning=()=>location.hash==='#/planejamento'?document.querySelector('.workspace'):null;
  const dateOK=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && !Number.isNaN(Date.parse(v+'T12:00:00Z'))
    && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const num=v=>Number(String(v||'').trim().replace(',','.'));
  const safe=v=>String(v||'').slice(0,400);
  const formValue=(f,n)=>String(f.elements.namedItem(n)?.value||'').trim();
  function notify(text,kind='info'){
    const f=activityForm();
    lastMessage=text;
    let el=f?.querySelector('#'+S+'-message');
    if(f && !el){
      const foot=f.querySelector('.modal-foot');
      if(foot){
        el=document.createElement('div');el.id=S+'-message';
        el.setAttribute('role','alert');el.setAttribute('aria-live','assertive');
        el.style.cssText='flex:1 1 100%;order:-1;box-sizing:border-box;min-width:0;padding:11px 13px;border-radius:10px;overflow-wrap:anywhere;font-size:13px;line-height:1.5;';
        foot.style.flexWrap='wrap';foot.prepend(el);
      }
    }
    const area=planning();
    let p=area?.querySelector('#'+S+'-banner');
    if(area&&!p){
      const h=area.querySelector('.head');
      p=document.createElement('div');p.id=S+'-banner';p.setAttribute('role','status');
      p.style.cssText='margin:12px 0;padding:11px 13px;border-radius:10px;overflow-wrap:anywhere;font:500 13px/1.5 system-ui,sans-serif;';
      if(h)h.insertAdjacentElement('afterend',p);else area.prepend(p);
    }
    for(const box of [el,p])if(box){
      if(box.textContent!==text)box.textContent=text;
      box.style.color=kind==='error'?'#822722':kind==='ok'?'#13634a':'#295572';
      box.style.background=kind==='error'?'#fff0ee':kind==='ok'?'#ecf8ef':'#eaf3fd';
      box.style.border='1px solid '+(kind==='error'?'#e9b9b2':kind==='ok'?'#aedac3':'#bfcfdd');
    }
  }
  function fieldError(f){
    const bad=Array.from(f.elements).find(el=>el.willValidate && el.validity && !el.validity.valid);
    if(!bad)return null;
    const label=bad.closest('.form-field')?.querySelector('label')?.textContent?.replace('*','').trim()||bad.name||'campo';
    return {bad,msg:'Corrija o campo "'+label+'": '+safe(bad.validationMessage||'valor inválido')};
  }
  function checkPredecessors(items){
    const ids=new Map(items.map(a=>[a.id,a]));
    const seen=new Set(),stack=new Set();
    function visit(id){
      if(stack.has(id))throw Error('Dependência circular nas atividades; verifique predecessoras.');
      if(seen.has(id))return;
      stack.add(id);
      const a=ids.get(id);
      for(const p of a?.pred||[]){if(!ids.has(p))throw Error('Predecessora '+p+' não cadastrada (atividade '+id+').');visit(p)}
      stack.delete(id);seen.add(id);
    }
    items.forEach(a=>visit(a.id));
  }
  async function saveActivity(f){
    if(busy){notify('Já existe uma gravação em andamento. Aguarde a confirmação.');return}
    const invalid=fieldError(f);
    if(invalid){notify(invalid.msg,'error');invalid.bad.focus();return}
    const code=formValue(f,'id').toUpperCase();
    const title=formValue(f,'title');
    const from=formValue(f,'from'), to=formValue(f,'to');
    const qty=num(formValue(f,'qty')),weight=num(formValue(f,'weight'));
    if(!code||!title||!dateOK(from)||!dateOK(to)||from>to||
       !Number.isFinite(qty)||qty<=0||!Number.isFinite(weight)||weight<=0){
       notify('Atividade não enviada: confira código, descrição, datas, quantidade e peso (maiores que zero).','error');return;
    }
    const row={
      id:code,title,discipline:formValue(f,'discipline'),source:formValue(f,'source'),
      from,to,qty,weight,unit:formValue(f,'unit')||'un.',
      pred:formValue(f,'pred').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean),
      critical:Boolean(f.elements.namedItem('critical')?.checked)
    };
    if(row.pred.includes(code)){notify('Uma atividade não pode ser predecessora de si mesma.','error');return}
    const btn=f.querySelector('button[type="submit"]');
    busy=true;
    if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    notify('Preparando registro '+code+' e validando usuário e banco central...');
    try{
      if(!navigator.onLine)throw Error('Sem conexão com a internet. Cadastro não enviado.');
      const cfg=window.GV3901_CLOUD_CONFIG;
      if(!window.supabase?.createClient||!cfg?.url||!cfg?.publishableKey)
        throw Error('Configuração ou biblioteca Supabase indisponível.');
      const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{
        auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}
      });
      const {data:ud,error:ue}=await client.auth.getUser();
      if(ue||!ud?.user)throw Error('Sessão expirada ou inválida. Entre novamente no aplicativo.');
      const user=ud.user;
      const {data:member,error:me}=await client.from('gv3901_members')
        .select('display_name,role,active').eq('user_id',user.id).single();
      if(me)throw me;
      if(!member?.active||!['admin','planner'].includes(member.role))
        throw Error('Seu perfil não permite alterar o planejamento. É necessário administrador ou planejador ativo.');
      const {data:workspace,error:we}=await client.from('gv3901_workspace')
        .select('state,version').eq('code','GV3901').single();
      if(we)throw we;
      const old=workspace?.state;
      if(!old||old.schema!==1||!Array.isArray(old.activities)||!Array.isArray(old.audit))
        throw Error('Estrutura do planejamento no banco inválida. Nenhum dado foi alterado.');
      const previous=old.activities.find(x=>x.id===code);
      if(previous&&!f.querySelector('[name="id"]')?.hasAttribute('readonly'))
        throw Error('Esse código já existe. Abra a atividade na Lista de atividades para editá-la.');
      const next=JSON.parse(JSON.stringify(old));
      if(previous)next.activities=next.activities.map(a=>a.id===code?row:a);
      else next.activities.push(row);
      checkPredecessors(next.activities);
      const action=(previous?'Atividade alterada: ':'Atividade cadastrada: ')+code;
      next.updatedAt=new Date().toISOString();
      next.audit.unshift({id:'AUD-'+(crypto.randomUUID?crypto.randomUUID():String(Date.now())),
        at:next.updatedAt,operator:member.display_name,action,detail:''});
      if(next.audit.length>2000)next.audit.length=2000;
      notify('Enviando '+code+' ao Supabase, com controle de versão...');
      const {data:commit,error:ce}=await client.rpc('gv3901_commit',{
        p_expected_version:workspace.version,p_state:next,p_action:action,p_detail:''
      });
      if(ce){if(String(ce.message||'').includes('GV3901_VERSION_CONFLICT'))
        throw Error('Outro usuário alterou o banco. Clique em Sincronizar e refaça esta alteração.');
        throw ce;}
      const confirmed=Array.isArray(commit)?commit[0]:commit;
      if(!confirmed||!Number.isFinite(Number(confirmed.committed_version)))
        throw Error('O servidor não retornou a versão gravada. Verifique o banco antes de tentar novamente.');
      notify('Servidor respondeu. Conferindo se a atividade '+code+' ficou gravada...');
      // Leitura pós-gravação: não confiar apenas no retorno da RPC.
      const {data:check,error:ve}=await client.from('gv3901_workspace')
        .select('state,version,last_action').eq('code','GV3901').single();
      if(ve)throw Error('Gravação pode ter ocorrido, mas não foi possível confirmar a leitura. Não cadastre de novo antes de sincronizar: '+safe(ve.message));
      const found=check?.state?.activities?.find(x=>x.id===code);
      if(!found||found.title!==title||Number(found.qty)!==qty||Number(found.weight)!==weight)
        throw Error('O servidor respondeu, mas a atividade não apareceu na releitura do banco. Não repita o cadastro; confira o SQL Editor.');
      if(Number(check.version)<Number(confirmed.committed_version))
        throw Error('A versão lida ainda é anterior à confirmada. Sincronize antes de repetir.');
      const message='Atividade '+code+' confirmada no Supabase (versão '+check.version+'). Lista e Curva S precisam de sincronização.';
      notify(message,'ok');
      // O estado do app principal é fechado ao recarregar da fonte de verdade.
      // A reabertura/sincronização só acontece após releitura confirmada.
      sessionStorage.setItem('gv3901-r19-last-success',JSON.stringify({code,at:Date.now()}));
      f.querySelector('[data-action="close"]')?.click();
      const refresh=document.querySelector('[data-action="cloud-refresh"]');
      if(refresh)refresh.click();
    }catch(err){
      notify('Atividade NÃO confirmada: '+safe(err?.message||err||'Erro desconhecido')+' — os campos foram preservados.','error');
    }finally{
      busy=false;
      if(btn?.isConnected){btn.disabled=false;btn.textContent='Salvar'}
    }
  }
  // Captura o envio somente da atividade e evita duas gravações pelo app original.
  document.addEventListener('submit',event=>{
    const f=event.target;
    if(f?.id!=='active-form'||f.dataset.kind!=='activity')return;
    event.preventDefault();event.stopImmediatePropagation();
    void saveActivity(f);
  },true);
  document.addEventListener('invalid',event=>{
    const el=event.target;
    if(!el?.closest?.('#active-form[data-kind="activity"]'))return;
    const f=el.closest('form');const error=fieldError(f);
    if(error)notify(error.msg,'error');
  },true);
  function showStatus(){
    if(!planning())return;
    if(!lastMessage){
      const prior=sessionStorage.getItem('gv3901-r19-last-success');
      if(prior){try{const x=JSON.parse(prior);if(Date.now()-x.at<3600000)lastMessage='Última atividade confirmada pelo servidor: '+x.code+'. Confira a Lista de atividades.';}catch(_){}}
    }
    const content=lastMessage||'Gravação r19 ativa. O formulário só será fechado após gravar e reler a atividade no Supabase.';
    const el=document.getElementById(S+'-banner');
    if(!el||el.textContent!==content)notify(content,lastMessage?'ok':'info');
  }
  const observer=new MutationObserver(mutations=>{
    // Evita repintura contínua: age somente quando um novo #app é montado.
    if(mutations.some(m=>[...m.addedNodes].some(node=>node.nodeType===1&&
      (node.id==='app'||node.classList?.contains('workspace')||node.querySelector?.('.workspace')))))showStatus();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',showStatus);
  document.addEventListener('DOMContentLoaded',showStatus);
})();
