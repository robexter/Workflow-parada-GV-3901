'use strict';
/* GV-3901 r28 | OFFLINE V1, CONSULTA SOMENTE
 * Código isolado: não altera app.js, RPC, Auth, B0, medições nem escrita.
 * Snapshot opt-in, cifrado AES-GCM/PBKDF2, 48h, vinculado à identidade autenticada.
 * O Service Worker guarda só arquivos estáticos; dados ficam no IndexedDB cifrado.
 */
(() => {
  const REAL='GV3901_REAL', DB='gv3901_offline_consulta_r28', STORE='snapshots', KEY='real';
  const LIMIT=48*3600*1000, ITERATIONS=260000;
  const enc=new TextEncoder(), dec=new TextDecoder();
  const $=(s,base=document)=>base.querySelector(s);
  const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateText=(s)=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'medium'}):'Não disponível';};
  const dt=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?String(s):'';
  const formatDate=s=>dt(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
  const pct=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'—';
  function openDb(){return new Promise((resolve,reject)=>{
    if(!indexedDB||!crypto?.subtle){reject(Error('Armazenamento seguro indisponível neste navegador.'));return;}
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Falha ao abrir o IndexedDB'));
  });}
  async function operation(mode,value){const db=await openDb();return new Promise((resolve,reject)=>{
    const tr=db.transaction(STORE,mode);const os=tr.objectStore(STORE),req=value===undefined?os.get(KEY):value===null?os.delete(KEY):os.put({...value,key:KEY});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    tr.oncomplete=()=>db.close();tr.onerror=()=>db.close();tr.onabort=()=>db.close();
  });}
  const get=()=>operation('readonly');const put=v=>operation('readwrite',v);const remove=()=>operation('readwrite',null);
  async function hashOwner(id){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(REAL+'|'+id)));return [...b].map(v=>v.toString(16).padStart(2,'0')).join('');}
  async function keyFromPassword(password,salt){const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  async function seal(payload,password){
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await keyFromPassword(password,salt);
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(payload)));
    return {salt,ciphertext,iv};
  }
  async function unseal(record,password){const key=await keyFromPassword(password,new Uint8Array(record.salt));const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(record.iv)},key,record.ciphertext);return JSON.parse(dec.decode(data));}
  function fresh(record){return record && record.workspace===REAL && record.format===1 && Date.now()-Date.parse(record.savedAt)>=0 && Date.now()-Date.parse(record.savedAt)<=LIMIT;}
  const empty=(txt)=>`<div class="empty">${esc(txt)}</div>`;
  function onlineApp(){
    const host=$('#app');if(!host)return;
    let locked=false;
    function mount(){
      const workspace=$('main.workspace');if(!workspace||!location.hash.includes('/administracao')||$('#gv-offline-v1-panel'))return;
      const root=document.createElement('section');root.id='gv-offline-v1-panel';root.className='card pad';root.style.cssText='margin:16px 0;border:1px solid #bcd9e5;max-width:100%;overflow-wrap:anywhere';
      root.innerHTML='<h3 style="font-size:18px;margin:0 0 7px">Consulta offline — V1</h3>'+
        '<p style="font-size:13px;line-height:1.6;margin:0 0 12px">Prepare uma cópia criptografada, somente leitura, da <b>Parada Real</b>. Prazo máximo de consulta: <b>48 horas</b>. Não permite criar atividades, alterar B0 ou registrar medições. Use apenas em dispositivo autorizado pela TI.</p>'+
        '<p data-offline-info style="font-size:12px;padding:10px;background:#f2f7fa;border-radius:8px;margin:0 0 12px">Conferindo cópia local...</p>'+
        '<div class="buttons" style="display:flex;flex-wrap:wrap;gap:8px">'+
        '<button type="button" class="btn primary" data-offline-create>Preparar / atualizar cópia offline</button>'+
        '<a class="btn" href="./offline.html">Abrir consulta offline</a>'+
        '<button type="button" class="btn" data-offline-delete>Apagar cópia local</button></div>'+
        '<form data-offline-form hidden style="margin-top:14px;border-top:1px solid #deebef;padding-top:14px">'+
        '<label style="display:block;font-size:13px;font-weight:700">Senha local da consulta (mínimo 10 caracteres)<input type="password" name="password" minlength="10" required autocomplete="new-password" class="input" style="display:block;width:100%;margin:7px 0"/></label>'+
        '<label style="display:block;font-size:13px;font-weight:700">Confirme a senha<input type="password" name="confirm" minlength="10" required autocomplete="new-password" class="input" style="display:block;width:100%;margin:7px 0"/></label>'+
        '<label style="display:flex;align-items:flex-start;gap:7px;font-size:12px;line-height:1.5;margin:10px 0"><input type="checkbox" name="approval" required/> Confirmo que a política de TI permite guardar essa cópia neste dispositivo pessoal ou corporativo autorizado.</label>'+
        '<button type="submit" class="btn primary">Salvar cópia protegida</button> <button type="button" class="btn" data-offline-cancel>Cancelar</button></form>';
      const header=workspace.querySelector('.head');(header||workspace.firstElementChild)?.insertAdjacentElement('afterend',root);
      const status=$('[data-offline-info]',root),form=$('[data-offline-form]',root);
      const msg=(s,bad=false)=>{status.textContent=s;status.style.color=bad?'#a33426':'#20536d';};
      get().then(r=>msg(r?(fresh(r)?'Última cópia: '+dateText(r.savedAt)+' · banco na versão '+r.version+'.':'A cópia local expirou (48h) e não pode mais ser consultada.'):'Nenhuma cópia offline preparada neste dispositivo.')).catch(e=>msg('Armazenamento indisponível: '+e.message,true));
      $('[data-offline-create]',root).onclick=()=>{form.hidden=false;$('input[name=password]',form).focus();};
      $('[data-offline-cancel]',root).onclick=()=>{form.hidden=true;form.reset();};
      $('[data-offline-delete]',root).onclick=async()=>{if(!confirm('Apagar definitivamente a cópia offline armazenada neste dispositivo?'))return;try{await remove();msg('Cópia offline apagada.');}catch(e){msg('Não foi possível apagar: '+e.message,true)}};
      form.onsubmit=async e=>{
        e.preventDefault();if(locked)return;
        const password=form.elements.namedItem('password').value,confirmation=form.elements.namedItem('confirm').value;
        if(password.length<10||password!==confirmation){msg('A senha deve ter pelo menos 10 caracteres, e as duas entradas devem coincidir.',true);return;}
        if(!form.elements.namedItem('approval').checked){msg('É necessário confirmar a autorização do dispositivo pela TI.',true);return;}
        if(!navigator.onLine){msg('Conecte-se à internet antes de preparar a cópia.',true);return;}
        locked=true;const send=form.querySelector('[type=submit]');send.disabled=true;msg('Consultando sua autenticação e os dados mais recentes no Supabase...');
        try{
          const config=window.GV3901_CLOUD_CONFIG;
          if(window.GV3901_ENV!=='REAL'||window.GV3901_REAL_ADAPTER_READY!==true)throw Error('Ambiente real não confirmado.');
          if(!config?.url||!config.publishableKey||!window.supabase?.createClient)throw Error('Serviço de autenticação indisponível.');
          const client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
          const {data:{user},error:ue}=await client.auth.getUser();if(ue||!user)throw Error('Autenticação online necessária. Entre novamente no aplicativo.');
          const {data:member,error:me}=await client.from('gv3901_members').select('user_id,role,active').eq('user_id',user.id).single();
          if(me||!member?.active)throw Error('Conta sem autorização ativa.');
          const {data:ws,error:we}=await client.from('gv3901_workspace').select('code,state,version,updated_at').eq('code',REAL).single();
          if(we||!ws||ws.code!==REAL||ws.state?.schema!==1||!Array.isArray(ws.state.activities)||!Array.isArray(ws.state.baselines))throw Error('Estado do workspace real não confirmado.');
          const ownerHash=await hashOwner(user.id),old=await get();
          if(old?.ownerHash && old.ownerHash!==ownerHash)throw Error('Há cópia de outro usuário no aparelho. Apague-a antes de preparar uma nova.');
          const savedAt=new Date().toISOString();
          const payload={workspace:REAL,ownerHash,savedAt,serverUpdatedAt:ws.updated_at,version:ws.version,state:ws.state};
          const encrypted=await seal(payload,password);
          await put({...encrypted,format:1,workspace:REAL,ownerHash,savedAt,serverUpdatedAt:ws.updated_at,version:ws.version});
          form.hidden=true;form.reset();msg('Cópia criptografada salva em '+dateText(savedAt)+' · versão '+ws.version+'. Consulte em offline.html; válida por 48 horas.');
          try{await navigator.storage?.persist?.();}catch(_){/* A persistência é opcional e não garantida. */}
        }catch(e){msg('Cópia não atualizada: '+(e?.message||e),true);}
        finally{locked=false;send.disabled=false;}
      };
    }
    new MutationObserver(mount).observe(host,{childList:true,subtree:true});mount();
    // A V1 não permite alterações offline. Impede submissões e operações de escrita.
    const writeAction=v=>/^(modal:|import-activities|restore|erase|freeze|backup|export|cloud-discard)/.test(v||'');
    function offlineBlock(ev){
      if(navigator.onLine)return;
      const target=ev.target.closest?.('[data-action]');
      if(ev.type==='submit'||(target&&writeAction(target.dataset.action))){
        ev.preventDefault();ev.stopImmediatePropagation();
        if(confirm('Sem conexão. Gravação e edição desabilitadas. Abrir a Consulta Offline (somente leitura)?'))location.assign('./offline.html');
      }
    }
    document.addEventListener('submit',offlineBlock,true);
    document.addEventListener('click',offlineBlock,true);
    window.addEventListener('offline',()=>{
      const control=$('#gv-offline-v1-panel [data-offline-info]');
      if(control)control.textContent='Sem conexão: impossível atualizar a cópia. Abra a Consulta Offline.';
    });
    // Depois da saída, descartar a cópia sem permitir reutilização acidental da conta.
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-action="cloud-signout"]'))remove().catch(()=>{});},true);
  }
  function viewer(){
    const info=$('#offline-info'),login=$('#offline-unlock'),field=$('#offline-password'),screen=$('#offline-screen'),nav=$('#offline-tabs');
    let snapshot=null,record=null;
    const tell=(s,bad=false)=>{info.textContent=s;info.style.color=bad?'#a33426':'#24506b';};
    async function start(){try{record=await get();if(!record){tell('Nenhuma cópia offline foi preparada neste navegador. Conecte-se e abra Administração → Consulta offline.',true);login.hidden=true;return;}
      if(!fresh(record)){tell('Esta cópia expirou após 48 horas. Conecte-se e prepare uma nova cópia na Administração.',true);login.hidden=true;return;}
      $('#offline-last-sync').textContent=dateText(record.savedAt);$('#offline-version').textContent=String(record.version);
      tell('Cópia criptografada disponível. Informe a senha local definida na preparação.');
    }catch(e){tell('Não foi possível acessar a cópia: '+e.message,true);login.hidden=true;}}
    $('#unlock-form').onsubmit=async e=>{e.preventDefault();if(!record||!fresh(record))return;const btn=login.querySelector('button');btn.disabled=true;tell('Descriptografando a última cópia...');
      try{const data=await unseal(record,field.value);field.value='';
        if(data.workspace!==REAL||data.ownerHash!==record.ownerHash||data.savedAt!==record.savedAt||data.version!==record.version||data.state?.schema!==1)throw Error('Cópia incompatível.');
        snapshot=data.state;login.hidden=true;nav.hidden=false;screen.hidden=false;
        $('#offline-meta').hidden=false;
        $('#offline-cutoff').textContent=formatDate(snapshot.settings?.cutoff);
        tell('Consulta offline ativa. Dados de '+dateText(record.savedAt)+'. Qualquer informação posterior NÃO está disponível aqui.');
        show('resumo');
      }catch(_){tell('Senha incorreta ou cópia indisponível. Nenhum dado foi exibido.',true);}
      finally{btn.disabled=false;}
    };
    $('#offline-wipe').onclick=async()=>{if(!confirm('Apagar a cópia criptografada deste dispositivo?'))return;try{await remove();location.reload();}catch(e){tell('Falha ao apagar: '+e.message,true)}};
    $('#offline-return').onclick=()=>location.assign('./');
    nav.onclick=e=>{const b=e.target.closest('[data-view]');if(!b||!snapshot)return;show(b.dataset.view);};
    const rows=(items,cols)=>'<div class="table-scroll"><table><thead><tr>'+cols.map(c=>'<th>'+esc(c[0])+'</th>').join('')+'</tr></thead><tbody>'+items.map(x=>'<tr>'+cols.map(c=>'<td>'+esc(c[1](x))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    const card=(title,value,detail='')=>`<article class="metric"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;
    const section=(title,body)=>`<section class="surface"><h2>${esc(title)}</h2>${body}</section>`;
    function show(which){
      nav.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===which));
      const st=snapshot,baselines=st.baselines||[],base=baselines.at(-1),activities=st.activities||[],measurements=st.measurements||[],events=st.events||[],issues=st.issues||[],joints=st.joints||{},cutoff=st.settings?.cutoff||'',workdays=st.settings?.workdays||[1,2,3,4,5,6];
      const dateMs=s=>new Date(s+'T12:00:00Z').getTime();
      const datesBetween=(a,b)=>Math.round((dateMs(b)-dateMs(a))/86400000);
      const addDays=(s,n)=>new Date(dateMs(s)+n*86400000).toISOString().slice(0,10);
      function calendarDates(from,to,cal){if(!dt(from)||!dt(to)||from>to)return[];const ds=[];for(let d=from,i=0;d<=to&&i<850;d=addDays(d,1),i++)if(cal.includes(new Date(dateMs(d)).getUTCDay()))ds.push(d);return ds;}
      function planProgress(a,date,cal){if(date<a.from)return 0;if(date>=a.to)return 1;const ds=calendarDates(a.from,a.to,cal);if(!ds.length)return Math.max(0,Math.min(1,(datesBetween(a.from,date)+1)/Math.max(1,datesBetween(a.from,a.to)+1)));return ds.filter(d=>d<=date).length/ds.length;}
      function cumulative(id,date){const arr=measurements.filter(m=>m.checked&&m.activityId===id&&m.date<=date).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));return arr.length?Number(arr[arr.length-1].qty):null;}
      function planned(date,b=base){if(!b?.activities?.length||b.activities.some(a=>Number(a.weight)<=0))return null;const total=b.activities.reduce((s,a)=>s+Number(a.weight),0);if(!total)return null;return b.activities.reduce((s,a)=>s+Number(a.weight)*planProgress(a,date,b.workdays||workdays),0)/total*100;}
      function realized(date){if(!base?.activities?.length)return null;const a=base.activities;if(a.some(x=>!Number.isFinite(Number(x.weight))||Number(x.weight)<=0||!Number.isFinite(Number(x.qty))||Number(x.qty)<=0))return null;if(!measurements.some(m=>m.checked&&m.date<=date&&a.some(x=>x.id===m.activityId)))return null;const total=a.reduce((s,x)=>s+Number(x.weight),0);return a.reduce((s,x)=>s+Number(x.weight)*Math.max(0,Math.min(Number(x.qty),cumulative(x.id,date)??0))/Number(x.qty),0)/total*100;}
      let html='';
      if(which==='resumo'){
        const p=planned(cutoff),r=realized(cutoff);
        html='<div class="metrics">'+card('Atividades',activities.length,'Plano na cópia local')+card('Planejado',p===null?'Aguardando':pct(p),'Até '+formatDate(cutoff))+card('Realizado',r===null?'Sem medição':pct(r),'Somente conferidas')+card('Desvio',p!==null&&r!==null?pct(r-p).replace('%',' p.p.'):'—','Realizado − planejado')+'</div>'+
          section('Situação dos registros','<div class="metrics">'+card('Linhas de base',baselines.length)+card('Medições',measurements.length)+card('Relatos',events.length)+card('Pendências abertas',issues.filter(x=>x.status!=='Concluída').length)+'</div>')+
          section('Registro de corte',`<p>Data operacional: <b>${esc(formatDate(cutoff))}</b>. Esta página representa apenas a versão salva em ${esc(dateText(record.savedAt))}.</p>`);
      }else if(which==='planejamento'){
        let gantt='';const valid=activities.filter(a=>dt(a.from)&&dt(a.to));
        if(valid.length){const from=[st.project?.start,...valid.map(a=>a.from)].filter(dt).sort()[0],to=[st.project?.end,...valid.map(a=>a.to)].filter(dt).sort().at(-1);const total=Math.max(1,datesBetween(from,to)+1);
          gantt='<div class="gantt">'+valid.map(a=>{let left=100*Math.max(0,datesBetween(from,a.from))/total,width=100*Math.max(1,datesBetween(a.from,a.to)+1)/total;return `<div class="gantt-line"><div>${esc(a.id)}</div><div class="gantt-track"><span style="left:${Math.min(100,left).toFixed(2)}%;width:${Math.max(1,Math.min(100-left,width)).toFixed(2)}%"></span></div></div>`;}).join('')+'</div>';
        }
        html=section('Cronograma · Gantt (consulta)',gantt||empty('Sem cronograma cadastrado.'))+
          section('Atividades · '+activities.length,activities.length?rows(activities,[['Código',x=>x.id],['Descrição',x=>x.title],['Disciplina',x=>x.discipline],['Início',x=>formatDate(x.from)],['Fim',x=>formatDate(x.to)],['Quantidade',x=>x.qty+' '+x.unit],['Peso',x=>x.weight],['Predecessoras',x=>(x.pred||[]).join(', ')]]):empty('Sem atividades.'));
      }else if(which==='curva'){
        const p=planned(cutoff),r=realized(cutoff),original=baselines[0];
        html='<div class="metrics">'+card('Planejado',p===null?'Aguardando':pct(p))+card('Realizado',r===null?'Sem medição':pct(r))+card('Desvio',p!==null&&r!==null?pct(r-p).replace('%',' p.p.'):'—')+'</div>';
        if(base?.activities?.length){const ds=base.activities;const first=[base.project?.start,...ds.map(a=>a.from)].filter(dt).sort()[0],last=[base.project?.end,...ds.map(a=>a.to)].filter(dt).sort().at(-1);
          if(first&&last&&first<=last){const span=Math.max(1,datesBetween(first,last)),points=[];const step=Math.max(1,Math.ceil(span/54));for(let t=0;t<=span;t+=step)points.push(addDays(first,t));if(points.at(-1)!==last)points.push(last);
            const defs=[{key:'B0',color:'#7591a5',fn:d=>planned(d,original||base)},{key:'Vigente',color:'#086a9a',fn:d=>planned(d)},{key:'Conferido',color:'#05876b',fn:d=>d<=cutoff?realized(d):null}];
            const px=i=>44+i/Math.max(1,points.length-1)*724,py=v=>20+(100-v)/100*195;
            const paths=defs.map(def=>{let chunks=[],last='';for(let i=0;i<points.length;i++){const v=def.fn(points[i]);if(v===null||!Number.isFinite(v)){last='';continue;}const point=px(i).toFixed(1)+','+py(v).toFixed(1);if(last)chunks.push(`<path d="M${last} L${point}" fill="none" stroke="${def.color}" stroke-width="3" stroke-linecap="round"/>`);last=point;}return chunks.join('');}).join('');
            const grids=[0,25,50,75,100].map(n=>`<line x1="44" x2="770" y1="${py(n)}" y2="${py(n)}" stroke="#e0e8ef" stroke-dasharray="3 3"/><text x="37" y="${py(n)+3}" text-anchor="end" font-size="11" fill="#637d8e">${n}</text>`).join('');
            html+=section('Curva S baseada na cópia sincronizada',`<svg class="curve" viewBox="0 0 790 250" role="img" aria-label="Curva S prevista e realizada, dados da última sincronização">${grids}${paths}</svg><p class="legend">B0: cinza · Vigente: azul · Realizado: verde. <b>Projeção futura não recalculada offline.</b></p>`);
          }
        }else html+=section('Curva S',empty('Aguardando B0 e atividades.'));
        html+=section('Medições conferidas',measurements.length?rows([...measurements].sort((a,b)=>String(b.date).localeCompare(String(a.date))),[['Data',m=>formatDate(m.date)],['Atividade',m=>m.activityId],['Acumulado',m=>m.qty],['Conferida',m=>m.checked?'Sim':'Não'],['Autor',m=>m.author]]):empty('Nenhuma medição registrada.'));
      }else if(which==='sh2'){
        const j=Object.entries(joints);let counts={};for(const [_,v]of j)counts[String(v.status||'Não iniciada')]=(counts[String(v.status||'Não iniciada')]||0)+1;
        html='<div class="metrics">'+card('Posições SH2',st.settings?.sh2Count||192)+card('Registradas',j.length)+card('Aceitas',counts.Aceita||0)+'</div>'+section('Juntas registradas',j.length?rows(j.map(([position,r])=>({position,...r})),[['Posição',j=>j.position],['Situação',j=>j.status],['Data',j=>formatDate(j.date)],['Observação',j=>j.note]]):empty('Nenhum registro SH2 na cópia.'));
      }else if(which==='diario'){
        html=section('Relatos · '+events.length,events.length?events.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(e=>`<article class="entry"><b>${esc(e.title)}</b><small>${esc(dateText(e.at))} · ${esc(e.author)} · ${esc(e.shift)}</small><p>${esc(e.body)}</p></article>`).join(''):empty('Nenhum relato registrado.'));
      }else if(which==='pendencias'){
        html=section('Pendências · '+issues.length,issues.length?rows(issues,[['Título',i=>i.title],['Responsável',i=>i.owner],['Prazo',i=>formatDate(i.deadline)],['Prioridade',i=>i.priority],['Situação',i=>i.status],['Descrição',i=>i.description]]):empty('Nenhuma pendência registrada.'));
      }
      screen.innerHTML=html;
    }
    start();
  }
  if(document.documentElement.dataset.gvOfflineViewer==='1')viewer();else onlineApp();
})();
