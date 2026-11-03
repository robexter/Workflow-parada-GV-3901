/* GV-3901 · R27 / INSTALAÇÃO PWA · módulo aditivo.
 * Intercepta somente o clique em [data-action="install"].
 * Não modifica autenticação, sincronização, banco, medições ou planejamento.
 * Precisa carregar no <head> para não perder beforeinstallprompt durante o login.
 */
'use strict';
(() => {
  let savedPrompt = null;
  let installed = false;
  let overlay = null;
  const APP_URL = location.origin + location.pathname.replace(/(?:index\.html)?$/, '');
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/i.test(ua);
  const embedded = /;\s*wv\b|WhatsApp|Instagram|FBAN|FBAV|Telegram|Line\/|GSA\//i.test(ua);
  const standalone = () => installed || !!window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

  // Registro antecipado: a autenticação r22 pode demorar a carregar.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    savedPrompt = event;
  }, {capture:true});
  window.addEventListener('appinstalled', () => {
    installed = true;
    savedPrompt = null;
    if (overlay) showMessage('Aplicativo instalado com sucesso. Abra o ícone GV-3901 na tela inicial.');
  }, {capture:true});

  function node(tag, options={}) {
    const el=document.createElement(tag);
    if(options.cls) el.className=options.cls;
    if(options.text!==undefined) el.textContent=options.text;
    if(options.attrs) for (const [name,value] of Object.entries(options.attrs)) el.setAttribute(name,value);
    return el;
  }
  function button(label,handler,primary=false){
    const el=node('button',{cls:'gv27-btn'+(primary?' gv27-primary':''),text:label,attrs:{type:'button'}});
    el.addEventListener('click',handler);
    return el;
  }
  function attachStyles(){
    if(document.getElementById('gv27-install-css')) return;
    const style=node('style',{attrs:{id:'gv27-install-css'}});
    style.textContent=`
      .gv27-backdrop{position:fixed;inset:0;z-index:2147483640;background:rgba(9,28,42,.63);padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:center;}
      .gv27-dialog{color:#193244;background:#fff;border-radius:16px;box-shadow:0 20px 70px #071b29aa;width:min(100%,460px);max-height:calc(100dvh - 30px);overflow:auto;padding:21px 19px;box-sizing:border-box;font:400 14px/1.55 system-ui,-apple-system,Arial,sans-serif;}
      .gv27-dialog h2{font-size:20px;line-height:1.25;color:#10394e;margin:0 0 11px;}
      .gv27-dialog p{margin:0 0 12px;}
      .gv27-dialog ol{padding-left:22px;margin:10px 0 15px;}
      .gv27-dialog li{margin:0 0 8px;}
      .gv27-dialog .gv27-tip{padding:11px 12px;background:#eaf6fc;border-left:4px solid #087f90;border-radius:8px;overflow-wrap:anywhere;}
      .gv27-dialog .gv27-link{width:100%;box-sizing:border-box;min-width:0;border:1px solid #c9dae4;border-radius:8px;background:#f7fafb;padding:10px;font-size:12px;color:#23465a;margin:1px 0 12px;}
      .gv27-dialog .gv27-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px;}
      .gv27-dialog .gv27-btn{min-height:44px;padding:9px 13px;border:1px solid #bfd3df;border-radius:10px;background:white;color:#1e4b60;font:700 13px system-ui,sans-serif;max-width:100%;cursor:pointer;}
      .gv27-dialog .gv27-primary{background:#087f90;color:white;border-color:#087f90;}
      .gv27-dialog .gv27-feedback{font-size:12px;color:#0b6070;min-height:17px;margin:9px 0 0;overflow-wrap:anywhere;}
      @media(max-width:360px){.gv27-dialog{padding:16px 14px}.gv27-dialog h2{font-size:18px}.gv27-dialog .gv27-btn{flex:1 1 100%;}}
    `;
    document.head.appendChild(style);
  }
  function showMessage(message) {
    if (!overlay) return;
    const area=overlay.querySelector('[data-gv27-feedback]');
    if (area) area.textContent=message;
  }
  function close(){if(overlay){overlay.remove();overlay=null;}}
  async function copyLink(field){
    const url=field.value;
    try{
      if(!navigator.clipboard?.writeText)throw Error('Clipboard indisponível');
      await navigator.clipboard.writeText(url);
      showMessage('Endereço copiado. Abra o aplicativo Chrome e cole na barra de endereços.');
    }catch(_){
      field.focus();field.select();
      showMessage('Selecione e copie o endereço acima. Depois, abra o Chrome e cole na barra de endereços.');
    }
  }
  async function diagnostics(){
    const findings=[];
    findings.push('HTTPS: '+(location.protocol==='https:'?'OK':'indisponível'));
    findings.push('Service Worker: '+('serviceWorker' in navigator?'suportado':'não suportado'));
    findings.push('Instalação automática: '+(savedPrompt?'disponível':'não oferecida neste navegador'));
    if('serviceWorker' in navigator){
      try{
        const registration=await navigator.serviceWorker.getRegistration('./');
        findings.push('Registro do app: '+(registration?.active?'ativo':registration?.installing?'instalando':registration?.waiting?'aguardando':'não ativo'));
      }catch(_){findings.push('Registro do app: não pôde ser consultado');}
    }
    showMessage(findings.join(' · '));
  }
  function openHelp(){
    if(overlay){overlay.querySelector('.gv27-dialog')?.focus();return;}
    attachStyles();
    overlay=node('div',{cls:'gv27-backdrop'});
    const dialog=node('section',{cls:'gv27-dialog',attrs:{role:'dialog','aria-modal':'true','aria-label':'Instalação da GV-3901',tabindex:'-1'}});
    dialog.append(node('h2',{text:'Instalar GV-3901 no celular'}));
    if(standalone()){
      dialog.append(node('p',{text:'Este aplicativo já está aberto em modo instalado. Procure o ícone da GV-3901 na tela inicial.'}));
    }else if(ios){
      dialog.append(node('p',{text:'No iPhone/iPad, a instalação é feita pelo menu do navegador.'}));
      const ol=node('ol');
      ['Abra o endereço no Safari.','Toque em Compartilhar.','Escolha Adicionar à Tela de Início e confirme.'].forEach(s=>ol.append(node('li',{text:s})));
      dialog.append(ol);
    }else{
      const title=embedded?'Este link parece estar aberto no navegador interno de outro aplicativo.':'Este navegador ainda não disponibilizou a instalação automática.';
      dialog.append(node('p',{cls:'gv27-tip',text:title}));
      const ol=node('ol');
      ['No menu desta janela, procure “Abrir no navegador” ou “Abrir no Chrome”. Se não encontrar, copie o endereço abaixo.','Abra o aplicativo Chrome do celular e acesse o mesmo endereço diretamente pela barra de navegação.','No Chrome, toque no menu ⋮ e selecione “Instalar aplicativo” ou “Adicionar à tela inicial”. Confirme a instalação.'].forEach(s=>ol.append(node('li',{text:s})));
      dialog.append(ol);
    }
    const link=node('input',{cls:'gv27-link',attrs:{type:'text',readonly:'', 'aria-label':'Endereço para abrir no Chrome'}});
    link.value=APP_URL;
    link.addEventListener('focus',()=>link.select());
    dialog.append(link);
    const actions=node('div',{cls:'gv27-actions'});
    actions.append(button('Copiar endereço',()=>void copyLink(link),true));
    actions.append(button('Verificar instalação',()=>void diagnostics()));
    actions.append(button('Fechar',close));
    dialog.append(actions);
    const feedback=node('p',{cls:'gv27-feedback',attrs:{'data-gv27-feedback':'','aria-live':'polite'}});
    dialog.append(feedback);overlay.append(dialog);document.body.appendChild(overlay);
    dialog.focus();
    overlay.addEventListener('click',event=>{if(event.target===overlay)close()});
    const onKey=(event)=>{if(event.key==='Escape'){close();document.removeEventListener('keydown',onKey)}};
    document.addEventListener('keydown',onKey);
  }
  function tryNativeInstall(){
    if(!savedPrompt){openHelp();return;}
    const event=savedPrompt;
    savedPrompt=null;
    try{
      // Deve ocorrer imediatamente no clique: prompt exige gesto do usuário.
      Promise.resolve(event.prompt()).then(()=>event.userChoice).then(choice=>{
        if(choice?.outcome==='dismissed') openHelp();
      }).catch(()=>openHelp());
    }catch(_){openHelp()}
  }
  // Captura antes do listener global do app.js. Não modifica o aplicativo original.
  document.addEventListener('click', event => {
    const target=event.target;
    if(!(target instanceof Element))return;
    const trigger=target.closest('[data-action="install"]');
    if(!trigger)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(standalone()) openHelp();
    else tryNativeInstall();
  },true);
})();
