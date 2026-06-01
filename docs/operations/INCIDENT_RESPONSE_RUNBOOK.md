# Runbook de resposta a incidentes

Escopo da PR 10.4: incidentes de seguranca, privacidade, autenticacao, RLS,
agenda/prontuario, webhooks, financeiro, assinatura documental e restore
emergencial. Este runbook nao autoriza provider APIs, `supabase db push`,
rotacao real de chaves, restore real, retries de webhook ou mutacoes em
ambientes compartilhados sem janela, owner humano, plano de rollback e registro
de evidencia redigida.

## Principios obrigatorios

- Proteger pacientes, responsaveis, clinicas, documentos, dados financeiros e
  payloads de provider antes de otimizar disponibilidade.
- Preservar evidencias sem copiar secrets, tokens, cookies, PII/PHI, payloads
  brutos, storage paths sensiveis ou signed URLs para tickets, chats ou logs.
- Preferir isolamento fail-closed a continuacao insegura de writes clinicos,
  billing, documentos ou webhooks.
- Todas as acoes S1/S2 exigem incident commander, owner tecnico, owner
  operacional e owner Security/LGPD identificados.
- Qualquer contato externo, notificacao legal ou mensagem a clientes precisa de
  aprovacao humana Security/LGPD e owner de negocio.

## Classificacao e SLA inicial

| Severidade | Exemplos                                                                                                                                                                         | Ack maximo          | Atualizacao         | Autoridade minima                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------- | ---------------------------------------------------------------------------- |
| S1         | Vazamento confirmado de PII/PHI ou segredo, quebra RLS cross-tenant, indisponibilidade ampla de prontuario/agenda, cobranca duplicada em massa, restore emergencial de producao. | 15 min              | 30 min              | Incident commander + Security/LGPD + owner executivo.                        |
| S2         | Falha de webhook provider com backlog relevante, auth instavel, divergencia financeira relevante, documentos sem assinatura em lote, jobs criticos atrasados.                    | 30 min              | 60 min              | On-call tecnico + owner operacional + Security quando houver risco de dados. |
| S3         | Incidente localizado, degradacao parcial, erro operacional com workaround seguro, alerta recorrente sem impacto confirmado.                                                      | 4 h uteis           | Diario ate resolver | Owner do modulo.                                                             |
| S4         | Anomalia informativa, falso positivo, melhoria de runbook, exercicio de mesa.                                                                                                    | Proxima janela util | No fechamento       | Owner do modulo.                                                             |

## Playbook universal de triagem

1. **Detectar:** registrar fonte do alerta, ambiente, release/tag, modulo,
   horario UTC, request/correlation ids e sintomas agregados.
2. **Classificar:** atribuir severidade S1-S4 com impacto em confidencialidade,
   integridade, disponibilidade, financeiro e obrigacoes legais.
3. **Isolar:** aplicar menor acao fail-closed suficiente: desabilitar feature
   flag, pausar envio provider, bloquear rota/Edge Function, congelar writes ou
   reverter deploy conforme `ROLLBACK_DAILY_OPERATIONS_RUNBOOK.md`.
4. **Preservar evidencias:** guardar apenas artefatos redigidos: hashes, ids
   pseudonimizados, contagens, timestamps, versao, checks executados e decisao
   humana. Nao anexar exports com dados reais.
5. **Comunicar:** abrir canal interno S1/S2, definir incident commander, owners,
   frequencia de atualizacao e mensagem externa aprovada quando aplicavel.
6. **Corrigir:** executar hotfix, rollback/roll-forward, rotacao planejada,
   reprocessamento idempotente ou restore isolado somente com autorizacao.
7. **Validar:** rodar checks minimos aplicaveis, health, smoke read-only,
   verificacao de auditoria, backlog e ausencia de vazamento adicional.
8. **Encerrar:** registrar causa raiz, timeline, impacto, evidencias, decisoes,
   riscos residuais e owners de follow-up.
9. **Postmortem:** S1/S2 exigem postmortem em ate 5 dias uteis; S3 recorrente
   tambem deve gerar acao preventiva.

## Cenários de incidente

### Vazamento ou risco de PII/PHI

- Severidade inicial: S1 para exposicao confirmada; S2 para suspeita restrita.
- Isolamento: remover acesso ao sink, pausar exports/signed URLs, revogar
  compartilhamento de evidencia, bloquear feature ou rota que vazou dados.
- Evidencia permitida: contagem de registros afetados, classes de dados,
  timestamps, ambiente, release, hash de artefato e responsaveis.
- Evidencia proibida: nome, CPF, telefone, email, prontuario, documento,
  payload bruto, storage path e URL assinada.
- Correcao: patch de redacao/autorizacao, purge de logs quando suportado,
  rotacao se houve segredo, revisao LGPD e comunicacao legal.
- Validacao: busca por novos eventos sensiveis em logs redigidos, smoke
  fail-closed da rota afetada e revisao humana de ticket/evidencias.

### Falha de autenticacao ou sessao

- Severidade inicial: S1 se usuarios acessam tenant errado ou bypassam auth; S2
  se login/refresh esta instavel sem vazamento confirmado.
- Isolamento: reverter deploy de auth, endurecer middleware/layout clinico,
  invalidar sessoes afetadas quando autorizado e bloquear mock em staging/prod.
- Validacao: `/api/health`, `/api/auth/app-session`, redirects anonimos,
  perfil sem workspace, perfil inativo, admin/clinic/patient fail-closed.
- Follow-up: revisar cookies, SSR Supabase clients, guards server-side e alertas
  de `auth_session_resolved`.

### Quebra de RLS ou acesso cross-tenant

- Severidade inicial: S1 ate provar impacto limitado.
- Isolamento: congelar writes no modulo, retirar rota do ar via feature flag,
  desabilitar RPC/Edge Function vulneravel quando possivel e pausar exports.
- Evidencia: tabela/RPC, tenant pseudonimizado, tipo de permissao, contagem de
  linhas possivelmente expostas e migration/release relacionado.
- Correcao: nova migration roll-forward com policy/grant corrigido; rollback de
  deploy nao substitui correcao de schema quando policy esta vulneravel.
- Validacao: smoke RLS cross-tenant local/staging autorizado, leitura propria,
  leitura negada cross-tenant, writes negados e audit log criado.

### Indisponibilidade de agenda ou prontuario

- Severidade inicial: S1 se impacta operacao clinica ampla; S2 se parcial.
- Isolamento: ativar modo degradado seguro, bloquear writes inseguros, orientar
  registro manual temporario aprovado e preservar backlog para reconciliacao.
- Correcao: rollback de deploy, roll-forward de migration, restore isolado ou
  correção de Edge/RPC conforme causa.
- Validacao: rotas clinicas principais, Paciente 360, encounter, agenda,
  timeline e auditoria sem overlay/blank screen.

### Webhook replay, fraude ou assinatura invalida

- Severidade inicial: S2; S1 se resultou em cobranca/documento indevido ou
  exposicao de dados.
- Isolamento: rejeitar fail-closed, pausar retries externos quando autorizado,
  bloquear reprocessamento automatico e manter eventos em quarantine/dead-letter
  sem payload bruto.
- Correcao: revisar HMAC/secret, idempotency keys, tolerancia temporal, mapping
  tenant/provider, status transitions e retries manuais.
- Validacao: assinatura invalida negada, replay ignorado, evento duplicado
  idempotente, evento valido processado uma vez e logs sem payload bruto.

### Divergencia financeira

- Severidade inicial: S2; S1 para cobranca duplicada em massa ou exposicao de
  dados financeiros sensiveis.
- Isolamento: pausar criacao de cobrancas/subscricoes, congelar retries,
  preservar ledger local e impedir conciliacao destrutiva.
- Correcao: reconciliar localmente por ids seguros, aplicar ajuste auditado,
  reprocessar eventos idempotentes e comunicar financeiro.
- Validacao: saldos, status de invoices/subscriptions, timeline financeira,
  audit logs e ausencia de segunda cobranca.

### Falha de assinatura documental

- Severidade inicial: S2 quando bloqueia documentos; S1 se expõe documento ou
  envia para signatario errado.
- Isolamento: pausar envio D4Sign, invalidar signed URLs curtas se possivel,
  bloquear download/assinatura afetada e manter documentos como pendentes.
- Correcao: validar signatario derivado server-side, cofre/configuracao,
  webhook, idempotencia e permissao `documents.write/read`.
- Validacao: documento gerado localmente, PDF exigido, signer correto,
  assinatura pendente unica, signed URL permissionada e timeline redigida.

### Restore emergencial

- Severidade inicial: S1 para producao.
- Isolamento: congelar writes, pausar jobs e providers, preservar release atual
  e evidencias, anunciar modo degradado.
- Execucao: seguir `BACKUP_RESTORE_DR_RUNBOOK.md` em ambiente isolado primeiro;
  restore real exige autorizacao explicita, janela e plano de rollback.
- Validacao: checks de integridade, RLS/RBAC, storage, health, smoke read-only,
  webhooks pausados/retomados com idempotencia e aceite dos owners.

## Suporte e break-glass

- Break-glass e permitido apenas para incidente, suporte critico ou auditoria
  autorizada, com aprovador humano, escopo, justificativa, janela e expiracao.
- Acesso deve ser temporario, minimo necessario, auditado em `audit_logs` ou
  sistema equivalente e revisado no fechamento.
- A janela padrao e de ate 2 horas para S1/S2; extensoes exigem nova aprovacao.
- Proibido usar break-glass para exploracao casual, debug sem ticket ou acesso a
  dados reais em preview/local.
- O relatorio revisavel deve conter: quem aprovou, quem acessou, modulo, horario
  UTC, duracao, motivo, evidencia redigida, acoes executadas e revogacao.

## Evidencia minima redigida

| Campo         | Conteudo esperado                                                                        |
| ------------- | ---------------------------------------------------------------------------------------- |
| Identificacao | ID do incidente, severidade, ambiente, modulo, release/tag e janela UTC.                 |
| Impacto       | Classes de dados/funcionalidades, tenants pseudonimizados e contagens agregadas.         |
| Timeline      | Deteccao, ack, isolamento, correcao, validacao, comunicacoes e encerramento.             |
| Evidencias    | Logs redigidos, hashes, metricas, screenshots sem dados reais, comandos e checks.        |
| Decisoes      | Owner humano, aprovacao de rollback/rotacao/restore/comunicacao e criterios de go/no-go. |
| Follow-up     | Causa raiz, acoes preventivas, owners, prazos e risco residual aceito.                   |

## Relacao com outros runbooks

- `docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md`: fontes de alerta,
  severidade, ack, dashboard e teste de alerta.
- `docs/operations/SECRET_ROTATION_RUNBOOK.md`: rotacao segura e rollback de
  secrets sem expor valores reais.
- `docs/operations/ROLLBACK_DAILY_OPERATIONS_RUNBOOK.md`: rollback tecnico,
  feature flags, pausa de webhooks e checklist diario/semanal.
- `docs/operations/BACKUP_RESTORE_DR_RUNBOOK.md`: restore isolado, RPO/RTO e DR.
- `docs/operations/RELEASE_PROCESS.md`: criterios de abortar promocao,
  rollback de release e smoke pos-deploy.
