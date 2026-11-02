'use strict';
/* GV-3901 R22 / SOMENTE repositório principal.
 * Adapta as consultas legadas do app.js para GV3901_REAL (ambiente real).
 * Não faz chamadas HTTP nem concede permissões; RLS e RPC no Supabase
 * determinam acesso. Falha = boot bloqueado (boot-real-r22.js).
 */
(() => {
  const REAL='GV3901_REAL';
  const sdk=window.supabase;
  if(!sdk || typeof sdk.createClient!=='function'){
    window.GV3901_R22_BOOT_ERROR='Biblioteca Supabase indisponível. Não é seguro iniciar o ambiente real.';
    return;
  }
  const create=sdk.createClient.bind(sdk);
  try{
    const adaptedCreate=function(...args){
      const client=create(...args);
      if(client.__gv3901_r22_real) return client;
      const originalFrom=client.from.bind(client);
      // PostgrestQueryBuilder.select() cria um NOVO filter builder; interceptar
      // só a query original NÃO é suficiente. Encapsular cada builder retornado.
      function isolateQuery(q){
        if(!q || q.__gv3901_real_wrapped)return q;
        q.__gv3901_real_wrapped=true;
        if(typeof q.eq==='function'){
          const originalEq=q.eq.bind(q);
          q.eq=function(column,value,...rest){
            return originalEq(column,column==='code' && value==='GV3901'?REAL:value,...rest);
          };
        }
        for(const method of ['select','update','insert','upsert','delete']){
          if(typeof q[method]!=='function')continue;
          const original=q[method].bind(q);
          q[method]=function(...params){return isolateQuery(original(...params));};
        }
        return q;
      }
      client.from=function(table,...more){
        const q=originalFrom(table,...more);
        return table==='gv3901_workspace'?isolateQuery(q):q;
      };
      const originalRpc=client.rpc.bind(client);
      client.rpc=function(fn,args,opts){
        if(fn==='gv3901_commit'){
          return originalRpc('gv3901_commit_workspace',{
            ...args,p_workspace_code:REAL
          },opts);
        }
        return originalRpc(fn,args,opts);
      };
      if(typeof client.channel==='function'){
        const originalChannel=client.channel.bind(client);
        client.channel=function(...chargs){
          const channel=originalChannel(...chargs);
          if(channel && typeof channel.on==='function'){
            const originalOn=channel.on.bind(channel);
            channel.on=function(type,options,callback){
              if(type==='postgres_changes' && options?.table==='gv3901_workspace'
                 && options?.filter==='code=eq.GV3901'){
                return originalOn(type,{...options,filter:'code=eq.'+REAL},callback);
              }
              return originalOn(type,options,callback);
            };
          }
          return channel;
        };
      }
      client.__gv3901_r22_real=true;
      return client;
    };
    sdk.createClient=adaptedCreate;
    if(sdk.createClient!==adaptedCreate)throw Error('createClient está protegido contra alterações');
    window.GV3901_REAL_ADAPTER_READY=true;
    window.GV3901_ENV='REAL';
    // Indicador visível, para não confundir a parada real com a homologação.
    const badgeObserver=new MutationObserver(()=>{
      const bar=document.querySelector('.topbar');
      if(!bar || bar.querySelector('[data-gv22-env]'))return;
      const badge=document.createElement('span');
      badge.setAttribute('data-gv22-env','');
      badge.textContent='PARADA · DADOS OPERACIONAIS';
      badge.style.cssText='display:inline-block;padding:5px 8px;border:1px solid #b7d3e5;border-radius:7px;font:700 10px/1.3 system-ui;letter-spacing:.03em;background:#eff7fb;color:#20536d;';
      bar.prepend(badge);
    });
    badgeObserver.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  }catch(e){
    window.GV3901_R22_BOOT_ERROR='Não foi possível isolar o cliente Supabase: '+String(e.message||e);
  }
})();
