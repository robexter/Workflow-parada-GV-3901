# GV-3901 — critérios para homologação do módulo multiusuário

**Status**: não liberado para uso operacional.

| Verificação | Critério mensurável | Situação |
|---|---|---|
| Identidade | Contas diferentes para Robson, Pedro e especial; nenhuma mudança livre de autor | Implementado em cliente / não testado remotamente |
| RLS | Visitantes anônimos não leem ou gravam; viewer não escreve; membro inativo não acessa | SQL preparado / sem teste remoto |
| Dados limpos | Projeto sem atividades fictícias, eventos ou medições antes dos lançamentos | Teste local aprovado |
| Compartilhamento | Evento de um usuário aparece em outro após commit + atualização | Código Realtime preparado / sem teste remoto |
| Gravação | Sucesso exige confirmação do servidor e versão retornada | Teste com mock aprovado |
| Concorrência | Duas atualizações a partir de mesma versão não sobrescrevem dados | Teste com mock aprovado |
| Auditoria | Registra UUID, hora e alteração, imutável para cliente comum | SQL preparado / sem teste remoto |
| B0 | Revisão aprovada não pode ser alterada ou removida | Guarda SQL criada / sem teste remoto |
| Recuperação | Backup automático externo, retenção, restauração testada | **Pendente** |
| Offline | Sem conexão: impedir gravação; sem prometer sincronização automática | Pendente de teste em dispositivo |
| Segurança industrial | Aprovação TI / Operação / governança antes de dados reais | **Pendente** |
| Performance | Avaliar volume e concorrência; limite workspace 5 MiB | **Pendente** |
| Curva S | Homologar pesos, marcos, calendário, medição | **Pendente** |
| GitHub Pages | Testar PWA versão nova em branch/ambiente, sem produção | **Pendente** |

**Limitação importante do modelo de estado único**: cada escrita atualiza o workspace completo, exigindo versionamento otimista. Este desenho reduz o risco de perda silenciosa no piloto, mas dificulta trabalho simultâneo; antes de operação contínua com várias equipes, recomenda-se migrar o backend para tabelas por entidade e políticas específicas de edição.
