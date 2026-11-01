# GV-3901 — Correção do Primeiro Login r14

## Problema confirmado
No assets/username-login.js da versão r11, o botão de envio é desativado para aguardar o cálculo do e-mail técnico, mas o próprio código usa `form.requestSubmit()` com o botão ainda desabilitado. No Chromium isso impede a emissão do segundo evento de submit, e nenhum pedido de autenticação é feito. Um teste local reproduziu exatamente o problema.

## Alteração
O botão permanece desativado enquanto o nome é convertido, mas é habilitado antes do `requestSubmit()`. O reenquadramento ocorre na tarefa seguinte, pois o Chromium não despacha um segundo `submit` enquanto o primeiro ainda está ativo. O campo visível é restaurado após o encaminhamento ao app.js. O restante do fluxo de autenticação, aprovação e autorização foi preservado.

## Arquivos (3 substituições)
1. assets/username-login.js  => substituir no repositório /assets/
2. index.html                => substituir na raiz (mantém referencias r13 dos demais scripts e incrementa somente a versão do login a r14)
3. sw.js                     => substituir na raiz (troca cache r12 por r14)

Não substituir assets/membros-acesso.js, assets/membros-config.js ou assets/app.js. Não alterar a Edge Function nem SQL apenas por causa desta falha de login.

## Publicação
1. Faça backup dos três arquivos anteriores.
2. Substitua no GitHub nos mesmos caminhos; confirme a publicação no GitHub Pages.
3. Abra aba anônima no Chrome, acesse https://robexter.github.io/homologacao-da-caldeira-/?login=r14
4. Faça login com o nome EXATAMENTE como foi cadastrado e a senha correspondente (sem compartilhá-la).
5. Em caso de nova falha, verifique a mensagem exibida na tela e, no Supabase, Auth > Users e o domínio técnico do endereço de autenticação.

## Segunda verificação importante
O front-end converte o nome para e-mail técnico no domínio `robexter.github.io`.
O servidor de cadastro usa GV3901_USER_DOMAIN, que precisa coincidir com aquele domínio, ou o usuário já cadastrado precisa ter seu e-mail técnico igual ao gerado pelo front-end. Não altere nomes de usuário, e-mails de Auth ou segredos sem verificar os dados existentes.

## Testes realizados
- SHA Git blob dos arquivos originais conferidos contra a main atual.
- Sintaxe JavaScript validada com node --check.
- Comportamento de submit antes/depois testado em Chromium com Supabase simulado (sem dados reais).
- Não houve publicação automática nem teste contra o projeto Supabase remoto.
