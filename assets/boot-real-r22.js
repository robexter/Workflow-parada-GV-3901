'use strict';
/* O aplicativo principal NÃO inicia sem o roteamento de ambiente carregado.
 * Isso evita gravar acidentalmente dados reais no ambiente de homologação. */
(() => {
  const ok=window.GV3901_REAL_ADAPTER_READY===true && window.GV3901_CADASTRO_R22_READY===true;
  if(!ok){
    const message=window.GV3901_R22_BOOT_ERROR||'Arquivos r22 ausentes, desatualizados ou indisponíveis.';
    const app=document.getElementById('app');
    if(app){
      app.replaceChildren();
      const wrap=document.createElement('div');
      wrap.style.cssText='margin:30px auto;max-width:600px;padding:24px;font:16px/1.5 system-ui,sans-serif';
      const h=document.createElement('h2');h.textContent='Parada real protegida — inicialização bloqueada';
      const p=document.createElement('p');p.textContent=message+' Nenhum registro foi enviado.';
      wrap.append(h,p);app.append(wrap);
    }
    return;
  }
  const app=document.createElement('script');
  app.src='./assets/app.js?v=gv3901-real-r22';
  app.onerror=()=>{
    const root=document.getElementById('app');
    if(root)root.textContent='Não foi possível carregar app.js. Nenhum dado foi gravado.';
  };
  document.body.appendChild(app);
})();
