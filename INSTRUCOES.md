# GV-3901 — Correção do Cadastro e Turnstile r10

Esta atualização é SOMENTE da interface de cadastro da homologação; a Edge Function do Supabase, as tabelas/RLS, as configurações e a especificação funcional V1.2 congelada não são alteradas.

## Arquivos a SUBSTITUIR no repositório robexter/homologacao-da-caldeira-

| Arquivo do ZIP | Destino no GitHub |
|---|---|
| index.html | raiz /index.html |
| sw.js | raiz /sw.js |
| assets/membros-acesso.js | /assets/membros-acesso.js |
| assets/cadastro-mobile.css | /assets/cadastro-mobile.css |

Não publique a pasta "GV3901_Correcao_Cadastro_Turnstile_r10" como subpasta: os quatro arquivos devem manter as rotas acima.

## Como publicar
1. Faça cópia da versão r9 em branch de homologação ou ZIP antes de substituir qualquer arquivo.
2. Substitua cada arquivo pelo conteúdo correspondente deste pacote; faça commit.
3. Teste em aba anônima no Chrome primeiro (não comece pelo PWA instalado, pois poderá ter cache antigo).
4. Teste formulário: nome de identificação (ex. Amanda Nogueira), **nome de usuário** (ex. amanda01), senha de teste (6+ caracteres), confirmação igual.
5. Confira o Cloudflare. Se não carregar, aguarde a mensagem de falha e pressione "Recarregar validação antirrobô".
6. Teste o envio e examine os Logs/Invocations no Supabase caso não seja processado. Um retorno POST 400/429/500/503 exige diagnóstico no backend; um OPTIONS 404 indica possível problema de implantação/rota.

## Alterações
- Mensagem esclarece que regra de 3 a 32 caracteres se aplica ao nome de usuário, não à senha.
- Nome de usuário tem instruções adicionais e recebe foco quando inválido.
- Cloudflare é carregado com callback de disponibilidade, inclusive para tela dinâmica.
- Expiração, falha de carregamento e erro do desafio passam a ter mensagem específica e botão para recarregar.
- O widget é checado contra o elemento atualmente exibido no DOM.
- Novo cache r10 e versões de script e CSS para reduzir uso de arquivos antigos no PWA.

## Não alterado
- Senha com mínimo de 6 caracteres, obrigatoriedade de confirmação, e ícone de mostrar senha.
- Site Key pública existente, chaves secretas armazenadas somente no Supabase.
- Regras de administração, aprovação pendente e autorização via RLS/RPC.
- Os demais módulos operacionais, o app.js e a base funcional congelada.

Observação: tests de sintaxe Node e verificações estáticas foram executados; não foi possível testar o Cloudflare real ou a conexão Supabase deste ambiente. Não é garantia de sucesso do cadastro real.
