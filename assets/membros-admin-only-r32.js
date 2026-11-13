'use strict';
/* GV-3901 r32: oculta APENAS o quadro 'Área de Membros' de não administradores.
   Permissão efetiva continua no Supabase (RLS/RPC). Não é controle de segurança.
   O quadro só fica visível após checagem positiva de admin ativo e
   can_manage_members=true. Falhas de conexão não exibem o quadro.
 */
(() => {
  if (window.GV3901_R32_MEMBROS_INSTALADO) return;
  window.GV3901_R32_MEMBROS_INSTALADO = true;
  let client = null;
  let currentPanel = null;
  let serial = 0;
  const cloud = window.GV3901_CLOUD_CONFIG || {};

  function supabaseClient() {
    if (!client && cloud.url && cloud.publishableKey && window.supabase?.createClient) {
      client = window.supabase.createClient(cloud.url, cloud.publishableKey, {
        auth: {persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}
      });
    }
    return client;
  }

  async function verify(panel, token) {
    try {
      const sb = supabaseClient();
      if (!sb) return;
      const auth = await sb.auth.getUser();
      const user = auth?.data?.user;
      if (auth.error || !user) return;
      const {data, error} = await sb.from('gv3901_members')
        .select('role,active,can_manage_members')
        .eq('user_id',user.id).single();
      if (token !== serial || panel !== currentPanel || !panel.isConnected) return;
      if (location.hash !== '#/administracao') return;
      if (!error && data?.role === 'admin' && data?.active === true &&
          data?.can_manage_members === true) {
        panel.classList.add('gv32-admin-autorizado');
      }
    } catch (_) {
      /* Falha fechada: não revela o painel. A administração geral continua visível. */
    }
  }

  function scan() {
    if (location.hash !== '#/administracao') {
      currentPanel = null;
      serial++;
      return;
    }
    const panel = document.getElementById('gv-area-membros');
    if (!panel || panel === currentPanel) return;
    currentPanel = panel;
    panel.classList.remove('gv32-admin-autorizado');
    const token = ++serial;
    void verify(panel, token);
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {childList:true, subtree:true});
  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('hashchange', scan);
  window.addEventListener('focus', () => {
    if (location.hash === '#/administracao' && currentPanel) {
      currentPanel.classList.remove('gv32-admin-autorizado');
      currentPanel = null;
    }
    scan();
  });
  scan();
})();
