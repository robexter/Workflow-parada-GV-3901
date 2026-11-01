# GV-3901 — Correção login direto r15

## Diagnóstico
O usuário aprovado autenticou normalmente com seu e-mail técnico, mas não com o nome. O domínio técnico `robexter.github.io` foi confirmado. A r14 ainda usa interceptação de `submit` com reenvio (`requestSubmit`), sensível ao comportamento do navegador.

## Correção
- O código r15 converte o nome informado para o mesmo identificador técnico usado na Edge Function r11, e chama `supabase.auth.signInWithPassword` DIRETAMENTE, sem tentar reenviar o formulário.
- Ao receber uma sessão válida, recarrega a página. O `app.js` original recarrega a sessão e verifica `gv3901_members` e políticas RLS.
- Mantém login por e-mail técnico para contas antigas/admins, sem converter o e-mail.
- Melhora mensagens de erro sem revelar senha, e-mail completo ou detalhes de conta.
- Preserva formulário/cadastro, Cloudflare Turnstile, aprovação administrativa, estrutura de dados e a especificação funcional congelada V1.2.

## Substituições GitHub (não mexer em outros arquivos)
1. `assets/username-login.js` — substituir pelo fornecido.
2. `index.html` — raiz; muda `username-login.js` r14 para r15.
3. `sw.js` — raiz; atualiza o cache para r15.

O código parte dos arquivos exatos publicados no GitHub na revisão r14, hashes previamente conferidos. **Não faça alterações no Supabase, nem exclua usuários.**

## Teste
1. Confirmar GitHub Pages com publicação concluída.
2. Abrir guia anônima em `https://robexter.github.io/homologacao-da-caldeira-/?login=r15`.
3. Informar o nome EXATAMENTE como no cadastro e a senha correspondente. Não informar a senha ao assistente.
4. Confirmar que a página carrega com a permissão liberada após autenticação.
5. Se houver mensagem "Nome de usuário ou senha não reconhecidos", confirmar, apenas no Supabase Authentication > Users, se o e-mail técnico daquela conta começa por `gv-` (nome completo) ou está no padrão antigo. Comparar o identificador calculado com o registrado sem divulgá-lo integralmente em público.
6. Conta administrativa antiga com e-mail não derivado do nome continua podendo usar o próprio e-mail técnico.

## Limitação
Testes automatizados locais de DOM e autenticação simulada não substituem o teste real contra o Supabase. A conta real não foi acessada e a publicação no GitHub não é automática.
