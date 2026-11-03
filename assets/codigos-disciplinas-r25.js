'use strict';
/* GV-3901 / Parada Real R25. Complemento isolado para o cadastro R22.
 * Não modifica app.js, cadastro-atividades-r22.js, autenticação, RLS, B0 ou Curva S.
 * Consulta somente GV3901_REAL; sugestão não reserva número nem substitui a validação do servidor.
 */
(() => {
  const WORKSPACE = 'GV3901_REAL';
  const FORM_ID = 'gv-r22-cadastro';
  const DISCIPLINAS = Object.freeze([
    { sigla:'INST', nome:'Instrumentação', aliases:['INSTRUMENTACAO','INSTRUMENTAÇÃO','INSTR','INS'] },
    { sigla:'CAL',  nome:'Caldeiraria',    aliases:['CALDEIRARIA'] },
    { sigla:'MEC',  nome:'Mecânica',       aliases:['MECANICA','MECÂNICA'] },
    { sigla:'END',  nome:'Inspeção / END', aliases:['INSPECAO','INSPEÇÃO','INSPECAO END','INSPEÇÃO END'] },
    { sigla:'ISO',  nome:'Isolamento',     aliases:['ISOLAMENTO'] },
    { sigla:'PIN',  nome:'Pintura',        aliases:['PINTURA'] },
    { sigla:'ELE',  nome:'Elétrica',       aliases:['ELETRICA','ELÉTRICA','ELET'] },
    { sigla:'LIM',  nome:'Limpeza',        aliases:['LIMPEZA'] },
    { sigla:'AND',  nome:'Andaime',        aliases:['ANDAIME','ANDAIMES'] },
    { sigla:'REF',  nome:'Refratário',     aliases:['REFRATARIO','REFRATÁRIO'] }
  ]);
  const simplify = s => String(s ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ' ).trim();
  const bySigla = new Map(DISCIPLINAS.map(d=>[d.sigla,d]));
  function resolve(input) {
    const s = simplify(input);
    return DISCIPLINAS.find(d=>s===d.sigla || simplify(d.nome)===s || d.aliases.some(a=>simplify(a)===s)) || null;
  }
  function formatCode(sigla, numero) {
    if(!bySigla.has(sigla) || !Number.isSafeInteger(numero) || numero<1 || numero>999999) return null;
    return 'GV3901-'+sigla+'-'+String(numero).padStart(3,'0');
  }
  function nextCode(activities, sigla) {
    if(!Array.isArray(activities) || !bySigla.has(sigla)) throw new Error('Disciplina ou lista de atividades inválida.');
    let maximum = 0;
    for (const activity of activities) {
      const m = /^GV3901-([A-Z]+)-(\d+)$/i.exec(String(activity?.id||'').trim());
      if(m && m[1].toUpperCase()===sigla) maximum=Math.max(maximum,Number(m[2]));
    }
    const code = formatCode(sigla, maximum+1);
    if(!code) throw new Error('Limite de sequências alcançado para esta disciplina.');
    return code;
  }
  // Exposição limitada a funções puras para inspeção e testes da numeração.
  window.GV3901_DISCIPLINAS_R25 = Object.freeze({disciplinas:DISCIPLINAS,resolve,formatCode,nextCode});
  function note(box, message, warning=false) {
    box.textContent = message;
    box.style.color = warning ? '#9a3412' : '#28546a';
  }
  async function loadExistingActivities() {
    if(window.GV3901_ENV!=='REAL' || window.GV3901_REAL_ADAPTER_READY!==true) {
      throw new Error('A separação da Parada Real não está confirmada.');
    }
    const config=window.GV3901_CLOUD_CONFIG;
    if(!config?.url || !config?.publishableKey || !window.supabase?.createClient){
      throw new Error('Configuração do Supabase indisponível.');
    }
    const client=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}
    });
    const {data:auth,error:authError}=await client.auth.getSession();
    if(authError || !auth?.session) throw new Error('Entre com sua conta para consultar o próximo código.');
    const {data,error}=await client.from('gv3901_workspace').select('state').eq('code',WORKSPACE).single();
    if(error || !data?.state || !Array.isArray(data.state.activities)){
      throw new Error('Não foi possível confirmar as atividades atuais no Supabase.');
    }
    return data.state.activities;
  }
  function mount() {
    const form=document.getElementById(FORM_ID);
    if(!form || form.dataset.gvR25Ready==='1') return;
    const id=form.elements.namedItem('id');
    const original=form.elements.namedItem('discipline');
    if(!id || !original || original.tagName!=='INPUT')return;
    form.dataset.gvR25Ready='1';

    const select=document.createElement('select');
    select.name='discipline';
    select.className=original.className;
    select.style.cssText=original.style.cssText;
    select.style.minWidth='0';
    select.style.fontSize='16px';
    select.setAttribute('aria-label','Disciplina de manutenção');
    const blank=document.createElement('option');blank.value='';blank.textContent='Selecione uma disciplina';select.appendChild(blank);
    for(const discipline of DISCIPLINAS){
      const option=document.createElement('option');option.value=discipline.nome;
      option.textContent=discipline.nome+' ('+discipline.sigla+')';
      select.appendChild(option);
    }
    if(original.value && !DISCIPLINAS.some(d=>d.nome===original.value)){
      const previous=document.createElement('option');previous.value=original.value;
      previous.textContent=original.value+' (valor anterior)';select.appendChild(previous);
    }
    select.value=original.value;
    original.replaceWith(select);

    const helper=document.createElement('div');
    helper.setAttribute('data-gv-r25-helper','');
    helper.style.cssText='margin:6px 0 14px;padding:10px 12px;border:1px solid #b7d5e7;border-radius:9px;background:#f4f9fc;max-width:100%;box-sizing:border-box;';
    const text=document.createElement('div');
    text.setAttribute('role','status');text.setAttribute('aria-live','polite');
    text.style.cssText='font-size:12px;line-height:1.5;overflow-wrap:anywhere;color:#28546a;';
    text.textContent='Escolha a disciplina para sugerir um código, ou digite a sigla no campo acima (ex.: MEC).';
    const button=document.createElement('button');
    button.type='button';button.className='btn';button.textContent='Sugerir próximo código';
    button.style.cssText='margin-top:8px;font-size:12px;max-width:100%;white-space:normal;';
    helper.append(text,button);
    id.closest('label')?.insertAdjacentElement('afterend',helper);

    let sequence=0, autoCode='', timer=0, programmatic=false;
    const signalUpdate=()=>{
      programmatic=true;
      try{id.dispatchEvent(new Event('input',{bubbles:true}));}
      finally{programmatic=false;}
    };
    const isAutomaticOrEmpty=()=>{
      const v=id.value.trim();return !v || v===autoCode || Boolean(resolve(v));
    };
    function setCode(value,automatic=false){
      id.value=value;
      if(automatic)autoCode=value;else autoCode='';
      signalUpdate();
    }
    async function suggest(d,{force=false}={}) {
      if(!d){note(text,'Selecione uma disciplina de manutenção.',true);return;}
      if(!force && !isAutomaticOrEmpty()){
        note(text,'Já existe um código preenchido. Use “Sugerir próximo código” para substituí-lo ou mantenha o código oficial.');return;
      }
      const current=++sequence, snapshot=id.value.trim();
      button.disabled=true;
      note(text,'Consultando atividades de '+d.nome+' no Supabase...');
      try{
        const activities=await loadExistingActivities();
        if(!form.isConnected || current!==sequence || select.value!==d.nome)return;
        if(!force && id.value.trim()!==snapshot)return;
        const code=nextCode(activities,d.sigla);
        setCode(code,true);
        note(text,code+' · '+d.nome+'. Numeração sugerida; a disponibilidade será conferida novamente ao salvar.');
      }catch(e){
        if(current===sequence)note(text,'Não foi possível sugerir automaticamente: '+String(e?.message||e)+'. Informe o código manualmente, sem duplicar identificadores.',true);
      }finally{if(current===sequence)button.disabled=false;}
    }
    select.addEventListener('change',()=>{
      const d=resolve(select.value);
      if(d)void suggest(d);
      else{sequence++;note(text,'Selecione uma disciplina para gerar o identificador.');}
    });
    button.addEventListener('click',()=>void suggest(resolve(select.value),{force:true}));
    function fromCode(){
      const raw=id.value.trim().toUpperCase();
      if(!raw)return;
      const full=/^GV3901-([A-Z]+)-(\d+)$/i.exec(raw);
      if(full && bySigla.has(full[1])) {
        // Código completo digitado é sempre preservado; apenas sincronizar a disciplina.
        const d=bySigla.get(full[1]);
        if(select.value!==d.nome){select.value=d.nome;select.dispatchEvent(new Event('input',{bubbles:true}));}
        note(text,'Código informado: '+raw+' · '+d.nome+'. Será verificado ao salvar.');
        return;
      }
      const d=resolve(raw);
      if(d){
        if(select.value!==d.nome){select.value=d.nome;select.dispatchEvent(new Event('input',{bubbles:true}));}
        void suggest(d);return;
      }
      const partial=/^([A-Z]{2,14})[-\s]+(\d{1,6})$/i.exec(raw);
      const pref=partial?resolve(partial[1]):null;
      if(pref){
        if(select.value!==pref.nome){select.value=pref.nome;select.dispatchEvent(new Event('input',{bubbles:true}));}
        setCode(formatCode(pref.sigla,Number(partial[2])),false);
        note(text,'Código formatado: '+id.value+' · '+pref.nome+' (informado manualmente).');
        return;
      }
      if(/^\d{1,6}$/.test(raw) && resolve(select.value)){
        const chosen=resolve(select.value);
        setCode(formatCode(chosen.sigla,Number(raw)),false);
        note(text,'Código formatado: '+id.value+' · '+chosen.nome+' (informado manualmente).');
      }
    }
    id.addEventListener('input',()=>{
      if(programmatic)return;
      clearTimeout(timer);
      sequence++;button.disabled=false;
      if(id.value.trim()!==autoCode)autoCode='';
      const simple=resolve(id.value);
      if(simple)timer=setTimeout(()=>fromCode(),360);
    });
    id.addEventListener('blur',fromCode);
    form.addEventListener('reset',()=>{
      sequence++;clearTimeout(timer);button.disabled=false;autoCode='';
      setTimeout(()=>note(text,'Selecione uma disciplina para sugerir o próximo código.'),0);
    });
  }
  const root=document.getElementById('app')||document.body;
  if(root){
    new MutationObserver(mount).observe(root,{childList:true,subtree:true});
    mount();
  }
})();
