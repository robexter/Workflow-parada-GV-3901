# Correção de cache / Supabase da GV-3901 (somente HOMOLOGAÇÃO)

## Antes de substituir
- O repositório `robexter/homologacao-da-caldeira-` já tem `assets/cloud-config.js` com URL e chave publicável preenchidas.
- Esta correção altera APENAS `index.html` e `sw.js`, ambos na raiz do repositório.
- NÃO apague `assets/cloud-config.js`, NÃO rode SQL e NÃO edite o repositório principal `Workflow-parada-GV-3901`.
- Faça backup do conteúdo atual de `index.html` e `sw.js`, para reverter se necessário.

## Como publicar
1. Entre em https://github.com/robexter/homologacao-da-caldeira-
2. Na raiz, abra `index.html`, clique em Edit (lapis), substitua integralmente pelo conteúdo do `index.html` deste ZIP e confirme o commit.
3. Repita para `sw.js`, mantendo o arquivo na raiz, e confirme o commit.
4. Abra GitHub Actions e verifique que `pages build and deployment` terminou em `success`.
5. Para teste, use uma janela anônima/privativa no navegador, de preferência fora do PWA instalado.
6. Abra: https://robexter.github.io/homologacao-da-caldeira-/?teste=r2
7. Se aparecer login, digite somente as credenciais no formulário da PWA; não compartilhe senhas em mensagens.
8. Se ainda mostrar a tela de configuração, informe a mensagem e qual navegador utilizou.

## O que mudou
- `index.html` usa um parâmetro de versão no carregamento do cloud-config.js.
- `sw.js` mudou a versão de cache, elimina caches V1.1 antigos da homologação e não intercepta nem armazena o cloud-config.js.
- Nenhuma credencial real ou informação operacional está incluída.
- A V1.2 funcional congelada fica intacta.

**Segurança:** uso somente com dados fictícios. Não libera a aplicação para dados reais da refinaria.
