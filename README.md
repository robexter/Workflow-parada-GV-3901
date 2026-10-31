## Atualização dos ícones — 31/10/2026

Os cinco PNGs em `assets/` foram substituídos pela arte aprovada **Parada GV-3901**:
`icon-192.png`, `icon-512.png`, `icon-maskable-192.png`,
`icon-maskable-512.png`, `apple-touch-icon.png`.
O `sw.js` também teve sua versão de cache alterada para forçar a atualização dos recursos.
O nome exibido na instalação permanece **GV-3901 parada**.
Este pacote não altera a especificação funcional V1.2 congelada e não ativa
conexão com o Supabase: configure `assets/cloud-config.js` em ambiente de testes.

---

# GV-3901 parada — V1.1 MULTIUSUÁRIO (candidata à homologação)

**Base funcional V1.2 CONGELADA: preservada.** Esta é uma nova versão de implementação, **não uma nova versão da especificação**.

## O que esta versão faz

- Mantém os dez módulos da aplicação limpa (sem registros ou avanços fictícios).
- Inclui entrada com **login e senha individuais** de usuários previamente autorizados no Supabase Auth.
- Obtém a identificação de quem fez login de `gv3901_members`, e não de um seletor livre.
- Guarda o estado compartilhado em PostgreSQL através do Supabase com políticas de acesso (RLS), perfis (`admin`, `planner`, `operator`, `viewer`) e controle de versão atômico.
- Recarrega informações de outro operador por assinatura Realtime de alterações no workspace (requer serviço e políticas do projeto configurados).
- Gera audit trail **no servidor** para cada atualização, registrando identidade autenticada, data, ação e estados anterior/novo em schema privado.
- Se dois operadores tentarem editar dados da mesma versão, **não sobrescreve dados de outro dispositivo**. A edição não confirmada fica em memória e pode ser exportada manualmente; exige reaplicação sobre a versão atualizada.
- Preserva linhas de base já congeladas mesmo em caso de tentativa de atualização do banco.
- Exibe estado de conexão e botão **Sincronizar**. Nome de instalação permanece **GV-3901 parada**.

## O que ainda NÃO está concluído

- **Não existe projeto Supabase conectado** neste ambiente (a consulta à sua conta retornou zero projetos). Nenhuma base real foi criada, nenhum login real foi testado e nenhum dado foi enviado.
- **Nenhuma alteração foi publicada na branch `main`** do seu GitHub. Esta candidata é entregue em ZIP para avaliação técnica.
- Sem homologação de segurança e política de dados pela empresa. **Não preencher informações industriais reais ou confidenciais.**
- Sem edição offline: se a rede estiver indisponível, a edição não pode ser confirmada no servidor. As alterações que falharem ficam em memória até exportação/recarga.
- Não há merge automático de edições concorrentes. Atualmente o banco é um único workspace JSON versionado, indicado apenas para piloto de poucos usuários; uma versão definitiva com maior concorrência deverá **normalizar registros individuais** por atividade/relato/medição e definir resolução de conflitos por entidade.
- Auditoria não substitui backups automáticos e testes de recuperação. Agendamento, retenção, restauração e monitoramento deverão ser configurados e aprovados pelo administrador da infraestrutura.
- Curva S e projeção mantêm metodologia candidata e exigem homologação dos pesos, calendário, precedências e medições.
- Sem testes de ponta a ponta contra Supabase real ou teste físico em Android/iPhone. Foram executados testes de simulação de cliente.

## Configuração em ambiente de teste autorizado (NÃO com dados da refinaria)

1. Peça à TI autorização de hospedagem/armazenamento, classificação dos dados, política de dispositivos e gestão de identidade. Considere hospedagem corporativa se serviços externos não forem permitidos.
2. Crie ou vincule um **projeto Supabase de teste aprovado pela organização**. **Nenhum projeto foi criado automaticamente.**
3. No Supabase SQL Editor, execute `supabase/01_schema_seguro.sql` **após revisão pela TI**. Ele cria tabelas, permissões, RLS, auditoria e `gv3901_commit`; não insere relatos/medições.
4. No Auth, crie os usuários individuais autorizados (convites, senha e MFA, segundo política da TI). Desabilite cadastro público, se aplicável.
5. Com os UUIDs dos usuários criados em `auth.users`, execute inserções de membership conforme `supabase/02_convites_exemplo.sql` (substitua UUIDs, jamais senhas). Perfil `admin`/`planner` para planejamento, `operator` para registros, `viewer` para consulta.
6. Edite somente `assets/cloud-config.js` com a URL HTTPS do Supabase e sua **publishable key** (`sb_publishable_...`). A chave é pública por definição, mas **NUNCA** coloque `service_role`, secret key, senhas ou tokens no GitHub.
7. Publique os arquivos do ZIP **em branch ou ambiente de teste separado** do `main`/Pages de produção. Para teste local de PWA use HTTPS ou localhost.
8. Entre com duas contas de teste distintas em dois navegadores; crie relato **fictício**, confira a atualização no segundo e simule edição simultânea.
9. Avalie autorização real de papéis, RLS, auditoria, revogação de usuários, backups e recuperação. Só depois considere uso com dados permitidos pela empresa.

## Testes locais de lógica

```sh
node --check assets/app.js
node tests/test_cloud.cjs
```

Esses testes usam um **Supabase simulado em memória**, não um banco remoto; não comprovam autorização, persistência ou sincronização real.

## Sobre revezamento e autoria

O login individual define a identidade autenticada. O responsável pelo turno pode ser selecionado como atributo do turno, mas o histórico confiável é o `user_id` gravado no servidor, associado ao cadastro do operador. Usuários especiais devem ter **sua própria conta** e membership ativo.

## Prevenção de perda de dados

- Atualizações concorrentes não serão mescladas automaticamente; o sistema bloqueia a gravação divergente e permite exportar a edição pendente em JSON.
- Nunca force atualização do app com uma edição pendente ou após erro de gravação sem antes conferir/exportar o conteúdo.
- Backup central e restauração são responsabilidades de infraestrutura, **ainda não configuradas**.
- A função de apagar tudo é bloqueada no modo multiusuário; importação de backup global também.

## Atualização do código do GitHub

**Não substitua o app atual antes de ter Supabase e usuários de teste configurados**, porque esta versão exige conexão com backend e, sem ela, abre uma tela de configuração bloqueada por segurança. O pacote preserva `index.html` na raiz, `assets` e manifest/Service Worker.

Versões: especificação V1.2 congelada; implementação local V1.0 candidata; implementação multiusuário V1.1 candidata (este pacote).
