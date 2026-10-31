// Editar antes da homologação. Este arquivo é PÚBLICO (somente parâmetros não secretos).
// Turnstile SITE key é pública; SECRET key vai apenas nas secrets da Edge Function.
window.GV3901_MEMBROS_CONFIG = Object.freeze({
  siteKey: '', // Cloudflare Turnstile site key para robexter.github.io
  functionName: 'gv3901-solicitar-acesso',
  // Não exibir e-mail pessoal. A função Edge cria o endereço técnico privado.
});
