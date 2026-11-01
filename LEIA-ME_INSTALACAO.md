# GV-3901 — Nome de usuário unificado r11

## O que foi alterado
- No cadastro, REMOVIDO o campo **Nome de identificação**.
- O campo **Nome de usuário** aceita 3 a 120 caracteres, incluindo espaços e acentos, como o nome de identificação antigo.
- O servidor grava automaticamente **username = display_name**, com o mesmo texto (normalizado quanto a espaços).
- A tela de login aceita o nome completo cadastrado e o converte para identificador técnico interno, sem pedir e-mail.
- Para os usuários antigos com identificadores simples (ex.: operador01), o login antigo e os registros continuam compatíveis.
- O Turnstile da versão r10 e o acesso sujeito a aprovação administrativa são mantidos.

## ORDEM CORRETA DE IMPLANTAÇÃO (importante)

1. Faça backup dos arquivos atuais e um backup/revisão do banco. Não inclua segredos no GitHub.
2. No Supabase, abra **SQL Editor** do projeto GV-3901, cole e execute todo o conteúdo de `supabase/05_nome_unificado_r11.sql`. Confira a conclusão `Success`.
   - O SQL apenas amplia a restrição do campo `username`; não altera usuários existentes.
3. Em **Supabase -> Edge Functions -> gv3901-solicitar-acesso -> Code**, faça backup do `index.ts` atual. Substitua integralmente pelo conteúdo de `supabase/functions/gv3901-solicitar-acesso/index.ts`. Clique **Deploy updates**.
   - Mantenha **Verify JWT desativado** APENAS para a função pública de solicitação, que mantém Turnstile, origem permitida e limite de tentativas.
   - Não copie chaves secretas para o código ou GitHub.
4. GitHub repositório `robexter/homologacao-da-caldeira-`: substitua APENAS esses cinco arquivos, mantendo os caminhos:
   - `/index.html`
   - `/sw.js`
   - `/assets/membros-acesso.js`
   - `/assets/username-login.js`
   - `/assets/cadastro-mobile.css`
5. Verifique o GitHub Pages na aba anônima primeiro; PWA instalado pode manter cache r10.
6. Teste um nome completo de 3..120 caracteres (ex.: `João Carlos Almeida`) e senha com >=6 caracteres, completar Turnstile. No Supabase, verifique Auth e `gv3901_members` (`username` e `display_name` iguais, active=false).
7. Depois da aprovação, teste login digitando **o mesmo nome completo**, com a mesma senha.

## ATENÇÃO — identidades que já existem
- Se dois colaboradores usarem o MESMO nome de usuário (ignorando diferença de maiúsculas, espaços repetidos), ele representa a mesma identidade técnica. Recomende nome completo que diferencie homônimos.
- Usuários criados antes da revisão NÃO são renomeados nem têm seu login alterado.
- Somente o formato simples antigo (3..32 caracteres, iniciando por letra, sem espaços e acentos) continua usando `nome@domínio`; os demais nomes são derivados em endereços técnicos SHA-256. Esse endereço técnico não aparece na tela.
- O login depende de HTTPS e da API Web Crypto do navegador para nomes completos; GitHub Pages fornece HTTPS.
- O domínio de login em `assets/username-login.js` deve corresponder a `GV3901_USER_DOMAIN` configurado nos Secrets do Supabase. Se seu Secret for diferente de `robexter.github.io`, ajuste o `domain` do arquivo ANTES de publicar.
- A implantação real não pôde ser testada contra a base Supabase privada; consulte Logs/Invocations depois dos testes.

## Preservados
- Senha e ícones de visualização; Turnstile; pendência até aprovação; RLS/RPC; Área de Membros; app.js e dez módulos; especificação V1.2 congelada.
