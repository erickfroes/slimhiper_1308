# Runbook de rollback e operacao diaria

Escopo da PR 10.4: rollback tecnico, modo degradado, pausa de webhooks,
reprocessamento idempotente e checklist operacional diario/semanal. Este
runbook nao autoriza `supabase db push`, migrations, provider APIs, retries de
webhook, restores ou rotacao real sem janela e aprovacao explicita.

## Objetivos

- Restaurar operacao segura rapidamente sem comprometer confidencialidade,
  integridade, idempotencia ou auditoria.
- Dar rotina diaria/semanal para detectar filas, divergencias e acessos
  indevidos antes que virem incidente S1/S2.
- Garantir que suporte/break-glass seja temporario, aprovado, auditado,
  expiravel e revisavel.

## Rollback tecnico

| Acao                        | Quando usar                                                                    | Pre-requisitos                                                                    | Validacao                                                            | Riscos/observacoes                                              |
| --------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| Revert de deploy            | Bug de app/SSR/UI/API introduzido por release recente sem schema incompatível. | Release/tag anterior conhecida, owner de release, changelog e smoke.              | Health, login, rotas protegidas, dashboard admin/clinico e logs 5xx. | Nao corrige RLS/migration vulneravel ja aplicada.               |
| Roll-forward de migration   | Policy/grant/schema incorreto em ambiente compartilhado.                       | Nova migration revisada, rollback logico, teste staging/local autorizado.         | Contrato RLS/RBAC, RPCs afetados, app build e smoke.                 | Preferir roll-forward a editar migration antiga.                |
| Rollback de migration       | Apenas em janela autorizada quando dados/contratos permitem.                   | Backup/restore point, script reversivel, owner Data/Platform e aceite de impacto. | Integridade, constraints, RLS, app compativel e auditoria.           | Pode causar perda de dados; nao executar sem plano formal.      |
| Desativar Edge Function     | Function com falha, vazamento ou provider side-effect inseguro.                | Alternativa fail-closed, comunicacao ao owner, dashboard/alerta.                  | Chamadas retornam erro seguro; app mostra estado pendente/degradado. | Evitar retries automáticos que dupliquem side-effects.          |
| Feature flag segura         | Funcionalidade isolavel sem derrubar app inteira.                              | Flag server-side por ambiente, default fail-closed, evidencia de estado.          | UI esconde/desabilita acao, API nega writes e logs motivo.           | Nao usar `NEXT_PUBLIC_USE_MOCK_DATA=true` em staging/producao.  |
| Pausa de provider webhook   | Replay/fraude/backlog, segredo em rotacao, provider instavel.                  | Owner Integrations, idempotencia, plano de retomada e reconciliacao.              | Eventos ficam em backlog/quarantine; replay processa uma vez.        | Requer cuidado para nao perder eventos ou duplicar cobrancas.   |
| Reprocessamento idempotente | Backlog de webhook/job apos correcao.                                          | Chaves idempotentes, janela aprovada, dry-run/contagem, limite de lote.           | Contagem processada/ignorada/falha, sem duplicidade, audit log.      | Nunca reprocessar payload bruto inseguro sem redacao/validacao. |

## Criterios para abortar mudanca em andamento

- Health `fail` ou 5xx amplo por 2 checks consecutivos em producao.
- Auth/session deixa de ser fail-closed ou mostra tenant/workspace incorreto.
- RLS/RBAC cross-tenant suspeito ou confirmado.
- Logs, alertas ou UI exibem PII/PHI, secret, signed URL ou payload provider.
- Webhook perde idempotencia, aceita assinatura invalida ou cria side-effect
  duplicado.
- Financeiro gera cobranca duplicada, valor divergente ou conciliacao destrutiva.
- Owner humano requerido nao esta disponivel para aprovar continuidade.

## Checklist diario

Execute em dias uteis para staging/producao apos go-live e em qualquer dia com
incidente/release. Registre apenas contagens e evidencias redigidas.

| Item                     | Como verificar                                                             | Acao se falhar                                                               |
| ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Health e alertas abertos | Dashboard operacional, `/api/health`, alert channels.                      | Classificar S1-S4 e abrir incidente se impacto confirmado.                   |
| Filas de documentos      | Pendentes/falhas de geracao, D4Sign, signed URLs expiradas.                | Pausar envios se houver falha sistemica; reprocessar idempotente com janela. |
| Webhooks com falha       | Dead-letter, signature failures, retries, idempotency ignored.             | Investigar assinatura/config/backlog; nao reenviar em massa sem dry-run.     |
| Divergencias financeiras | Invoices/subscriptions pendentes, conciliacao, valores/status divergentes. | Congelar criacao/retries se houver risco de duplicidade; acionar financeiro. |
| Jobs atrasados           | Ultima execucao, locks, duracao, falhas.                                   | Reexecutar somente se job for idempotente e autorizado.                      |
| Backups                  | Ultimo snapshot/PITR/storage, evidencia de sucesso.                        | Abrir S2 se backup critico vencido; seguir DR runbook.                       |
| Usuarios admin/suporte   | Novos admins, break-glass ativo, expiracoes, MFA/SSO.                      | Revogar acesso fora de janela; abrir incidente se sem justificativa.         |
| Memberships e convites   | Convites pendentes, roles elevadas, membros inativos.                      | Revogar/ajustar com audit log e owner da clinica/plataforma.                 |
| Exports e relatorios     | Exports recentes, signed URLs, expiracao, audit log.                       | Expurgar temporarios vencidos e investigar export incomum.                   |
| Logs de suporte          | Acessos support/break-glass, justificativa e relatorio.                    | Exigir revisao humana e follow-up se incompleto.                             |

## Checklist semanal

| Item                                                       | Evidencia esperada                                     | Owner                  |
| ---------------------------------------------------------- | ------------------------------------------------------ | ---------------------- |
| Revisar tendencias de alertas S2/S3 e falsos positivos.    | Top eventos, p95 latency, denied spikes e acoes.       | Observability/Platform |
| Revisar backlog documental e financeiro.                   | Contagens por status, idade maxima e follow-up.        | Documents/Finance      |
| Revisar usuarios privilegiados e memberships cross-tenant. | Lista redigida de alteracoes, revogacoes e pendencias. | Security/Admin         |
| Revisar jobs de retencao/governanca em dry-run.            | Contagens agregadas, sem payload bruto.                | Data/LGPD              |
| Confirmar backup/restore readiness.                        | Ultimo backup, proximo exercicio, pendencias DR.       | Data/Platform          |
| Revisar incidentes e postmortems abertos.                  | Owners, prazos, riscos residuais e bloqueios.          | Incident commander     |
| Testar alerta controlado nao sensivel quando programado.   | Evento, ack, owner, resolucao e evidencia.             | Observability          |

## Reprocessamento idempotente seguro

1. Confirmar causa raiz corrigida e provider/app em modo seguro.
2. Fazer dry-run com contagem, intervalo UTC, tipo de evento e limite de lote.
3. Verificar chaves idempotentes e estados que podem transicionar.
4. Executar menor lote possivel em janela aprovada.
5. Registrar processados, ignorados, duplicados, falhas e request ids redigidos.
6. Validar ledger/timeline/status sem duplicidade.
7. Repetir por lotes ou abortar se erro ultrapassar limite definido.

## Suporte e break-glass operacional

| Controle      | Regra                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Aprovacao     | Obrigatoria antes do acesso, exceto emergencia S1 documentada em ate 24 h.    |
| Escopo        | Menor tenant/modulo/acao possivel; sem acesso amplo por conveniencia.         |
| Janela        | Ate 2 h por padrao; expiracao automatica ou revogacao manual registrada.      |
| Justificativa | Ticket/incidente, motivo, dados acessados por classe e resultado esperado.    |
| Auditoria     | `audit_logs`/log equivalente com ator, aprovador, horario UTC, modulo e acao. |
| Relatorio     | Revisao apos uso com evidencias redigidas, achados, revogacao e follow-up.    |

## Evidencia diaria/semanal

Use um registro enxuto por ambiente:

```text
Data UTC:
Ambiente:
Release/tag atual:
Responsavel:
Checks OK:
Alertas abertos:
Backlogs relevantes:
Acessos privilegiados revisados:
Acoes executadas:
Riscos/follow-up:
```

Nao anexar screenshots com dados reais, exports, signed URLs, cookies, tokens,
CPF/CNPJ, email, telefone, nomes de pacientes ou payloads provider.

## Relacao com outros runbooks

- `docs/operations/INCIDENT_RESPONSE_RUNBOOK.md`: classificacao S1-S4,
  comunicacao e postmortem.
- `docs/operations/SECRET_ROTATION_RUNBOOK.md`: rollback de secrets e janela de
  rotacao.
- `docs/operations/RELEASE_PROCESS.md`: rollback/release, smoke e criterios de
  abortar promocao.
- `docs/operations/BACKUP_RESTORE_DR_RUNBOOK.md`: restore isolado e modo DR.
- `docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md`: alertas, owners, ack e
  dashboard operacional.
