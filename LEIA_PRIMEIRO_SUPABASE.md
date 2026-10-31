# GV-3901 parada — Configuração Supabase (V1.1 Multiusuário)

**Uso:** homologação somente com dados fictícios. A especificação funcional V1.2 congelada não foi alterada.

## 1. Criar projeto Supabase de testes
1. Acesse https://supabase.com/dashboard e entre na sua organização autorizada.
2. Crie um projeto de TESTES, na região e no plano permitidos pela sua empresa.
3. Não envie documentos internos de refinaria para um projeto não aprovado pela TI.

## 2. Criar banco
1. Abra o SQL Editor do projeto de TESTES.
2. Revise com a TI o arquivo `supabase/01_schema_seguro.sql`.
3. Execute o SQL apenas depois da revisão.
4. Confira a existência de `gv3901_members` e `gv3901_workspace` e as políticas RLS.
5. A tabela `gv3901_workspace` começa sem histórico de eventos ou medições.

## 3. Criar usuários e permitir acesso
1. Em Authentication > Users, crie ou convide contas individuais de teste para Robson e Pedro.
2. Copie o UUID de cada conta (não a senha).
3. Abra `supabase/02_convites_exemplo.sql`, substitua os UUIDs e remova os comentários das instruções que você realmente for executar.
4. Cadastre Robson como `admin`, Pedro como `operator`, e novos operadores com contas individuais e papel adequado.
5. Não permita cadastramento anônimo indiscriminado; use Auth e RLS.

## 4. Conectar PWA
1. Em Supabase, acesse Connect ou Project Settings > API Keys e copie a **Project URL** e a **publishable key** (`sb_publishable_...`).
2. Edite `assets/cloud-config.js`, preenchendo `url` e `publishableKey`.
3. **Nunca** coloque senha de banco, chave `service_role`, secret key, token ou credenciais no repositório.
4. Configure os URLs de redirecionamento de Auth para o ambiente de testes, se necessário.

## 5. Publicar e validar sem sobrescrever seu app atual
1. Use um repositório/ambiente GitHub Pages de HOMOLOGAÇÃO, separado da versão ativa.
2. Publique `index.html`, `manifest.webmanifest`, `sw.js` e pastas `assets` etc. preservando a estrutura.
3. Faça login em dois dispositivos com contas diferentes.
4. Registre acontecimentos **fictícios** e confirme leitura do outro usuário.
5. Teste permissões, conflito de edição, atualização, auditoria e recuperação. 

## Limites atuais e liberação
- Sem projeto Supabase real configurado e sem testes fim a fim.
- Não há backup automático/restauração testada.
- O armazenamento atual usa um `workspace` JSON compartilhado, com controle de versão; para vários usuários simultâneos, planejar normalização dos registros por tabela.
- Antes de dados reais: autorização da empresa, arquitetura de dados aprovada, backups, teste em celular/PC e homologação de segurança.

Arquivos principais: `supabase/01_schema_seguro.sql`, `supabase/02_convites_exemplo.sql`, `assets/cloud-config.js`.
