# IMPORTANTE — r12 integra r11, não é uma versão paralela

O pacote r12 contém todas as alterações r11 (campo único de usuário, SQL, login
compatível, Edge Function) e a melhoria de responsividade do Turnstile.

A captura mostrava "Nome de identificação" e o erro "3 a 32 caracteres":
esses elementos pertencem a uma versão antiga. Portanto, publicar somente CSS
não seria suficiente para ativar o nome de usuário unificado.

Melhorias específicas r12:
- Widget nativo do Cloudflare em modo `flexible` quando o formulário possui
  pelo menos 304px disponíveis; caso contrário, modo `compact` (150px),
  sem cortar conteúdo, distorcer a verificação ou forçar rolagem horizontal.
- Seleção feita a partir da largura REAL disponível ao widget, não pelo viewport.
- A largura flexível ocupa 100% do campo de cadastro, respeitando padding e margens.
- Redimensionamentos que cruzam o limite mobile/compacto reinicializam o widget.
- Não altera chaves, verificação antirrobô no servidor, ou a aprovação.

**Se já executou o SQL e implantou a Edge Function da r11**, não precisa
repeti-los: basta atualizar os 5 arquivos do GitHub abaixo:
`index.html`, `sw.js`, `assets/membros-acesso.js`,
`assets/username-login.js`, `assets/cadastro-mobile.css`.

**Se ainda estiver na r9/r10**, siga a ordem completa de SQL, Edge Function,
5 arquivos GitHub descrita abaixo. A tela antiga com dois campos prova que
pelo menos a camada HTML/JS r11 não está refletida no navegador dessa captura.

**ATENÇÃO**: Cloudflare controla o conteúdo interno do iframe. A aparência
pode variar conforme o desafio; a mudança garante dimensionamento do contêiner,
mas não altera o layout interno do Cloudflare.

---

# GV-3901 — Nome unificado + responsividade Cloudflare r12

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
