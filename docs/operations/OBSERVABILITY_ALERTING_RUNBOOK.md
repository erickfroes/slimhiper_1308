# Observabilidade, alertas e smoke pos-deploy

Escopo da PR 10.2: app Next.js, rotas server-side, Edge Functions, webhooks,
RPCs criticos, storage assinado, jobs operacionais, banco, releases e smokes
read-only. Este runbook nao autoriza provider APIs, retries de webhook,
`supabase db push`, migrations, restores ou rotacao de chaves em ambientes
compartilhados.

## Pre-requisitos validados

- PR 10.1 precisa estar aplicada: CI bloqueante, matriz de ambientes, templates
  de variaveis, isolamento de previews e processo de release/rollback.
- Fases 1-9 continuam como gates antes de release: `type-check`, `lint`,
  `build`, `git diff --check`, smokes Supabase locais e browser smoke
  obrigatorio em ambiente autorizado.
- `NEXT_PUBLIC_USE_MOCK_DATA=true` e permitido apenas em preview descartavel sem
  dados reais; staging/producao devem falhar o health check se mocks estiverem
  habilitados.

## Esquema de log estruturado

Todos os logs novos devem usar JSON em linha unica e estes campos minimos:

| Campo             | Obrigatorio | Observacao                                                        |
| ----------------- | ----------- | ----------------------------------------------------------------- |
| `timestamp`       | Sim         | ISO-8601 UTC.                                                     |
| `severity`        | Sim         | `debug`, `info`, `warn` ou `error`.                               |
| `event`           | Sim         | Nome estavel para metrica/alerta.                                 |
| `module`          | Sim         | Ex.: `api.health`, `api.auth.app-session`, `edge.webhook-d4sign`. |
| `request_id`      | Sim         | Recebido por header ou gerado no runtime.                         |
| `correlation_id`  | Sim         | Propagado entre app, Edge Functions e jobs.                       |
| `outcome`         | Sim         | `success`, `failure`, `denied` ou `skipped`.                      |
| `latency_ms`      | Sim         | Tempo do handler/operacao observada.                              |
| `tenant_id`       | Condicional | Deve ser pseudonimizado/redigido em sinks externos.               |
| `reason`/`status` | Condicional | Use codigos estaveis, sem payload bruto.                          |

Proibido em logs e alertas: secrets, tokens, cookies, e-mails, telefones,
CPF/CNPJ, nomes de pacientes/responsaveis, payload bruto de provider, storage
paths sensiveis, signed URLs, documentos e amostras clinicas/financeiras.

## Sinais por superficie

| Superficie            | Sinais minimos                                                                | Fonte inicial nesta PR                                          |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Frontend/Next.js      | 5xx, latencia, falha de deploy, health degraded/fail                          | `/api/health`, CI/deploy logs, smoke pos-deploy.                |
| Auth/session SSR      | `auth_session_resolved` com `denied`, session failures, redirects fail-closed | `/api/auth/app-session`.                                        |
| Edge Functions        | 5xx, envelope invalido, latencia, erro por modulo                             | Logs JSON padronizados e correlation headers.                   |
| Webhooks D4Sign/Asaas | signature failures, idempotencia, ignored, processed, internal errors         | `webhook-d4sign`, `webhook-asaas`.                              |
| RPCs criticos         | erro, denied spikes, latencia p95, contrato invalido                          | Logs da camada de servico e monitores do banco.                 |
| Storage assinado      | 403/404 esperado, erro de bucket, signed URL curta                            | `document-signed-url` e smoke autorizado.                       |
| Jobs operacionais     | atraso, falha, dry-run/execucao, divergencia                                  | Jobs devem emitir `job_started`, `job_completed`, `job_failed`. |
| Banco                 | conexoes, slow queries, RLS deny spikes, deadlocks                            | Supabase/Postgres metrics e logs redigidos.                     |
| Releases              | build/deploy failure, rollback, versao atual                                  | CI, plataforma de deploy e metadados de release.                |

## Alertas acionaveis

| Alerta                                                    | Severidade | Condicao inicial                        | Owner                | Ack maximo   | Escalonamento                                  |
| --------------------------------------------------------- | ---------- | --------------------------------------- | -------------------- | ------------ | ---------------------------------------------- |
| Indisponibilidade geral ou health `fail` em producao      | S1         | 2 checks consecutivos ou erro 5xx amplo | Platform on-call     | 15 min       | Incident commander + rollback owner.           |
| Suspeita de vazamento, log sensivel ou credencial exposta | S1         | Qualquer evidencia confirmada           | Security on-call     | 15 min       | Rotacao de chaves e LGPD owner.                |
| Webhook financeiro/documental falhando                    | S2         | >5 falhas/15 min ou dead-letter novo    | Integrations on-call | 30 min       | Backend on-call + owner financeiro/documental. |
| Signature failures anormais                               | S2         | >10 denied/15 min por provider          | Security on-call     | 30 min       | Integrations on-call.                          |
| Jobs atrasados ou divergencia de conciliacao              | S2         | atraso >2x SLA ou divergencia nova      | Operations on-call   | 30 min       | Data on-call.                                  |
| Latencia p95 elevada em RPC/Edge                          | S3         | p95 >2s por 15 min                      | Backend on-call      | 4 h uteis    | Data on-call se envolver banco.                |
| Denied spikes auth/RLS                                    | S3         | aumento >3x baseline                    | Security on-call     | 4 h uteis    | Platform owner.                                |
| Falha de build/deploy em branch protegida                 | S3         | CI/deploy failed                        | Release owner        | 4 h uteis    | Platform on-call.                              |
| Ajuste cosmetico de dashboard/runbook                     | S4         | Sem impacto operacional                 | Area owner           | 2 dias uteis | Backlog da squad.                              |

Canais: S1/S2 em pager/telefone + canal `#ops-incidents`; S3 em
`#ops-alerts`; S4 em issue/backlog. Fora do horario comercial, apenas S1/S2
acionam on-call. Todo S1/S2 requer registro de timeline e decisao de
postmortem; S1 sempre requer postmortem.

## Dashboard operacional

A rota `/admin/observability` apresenta o painel operacional por ambiente com:

- estado do health endpoint e smoke pos-deploy;
- frontend, auth/session, Edge Functions, webhooks, banco/RPCs e storage;
- owners operacionais e sinais monitorados;
- tabela S1-S4 com criterio e tempo maximo de acknowledgement.

O painel e intencionalmente seguro: nao consulta providers, nao mostra payloads
brutos, nao mostra PII/PHI e nao imprime secrets. Para producao, conecte as
fontes reais do provedor de logs/APM mantendo este mesmo contrato visual.

## M16 Jobs Operacionais

A migration `20260607170000_370_operational_jobs_cron_observability.sql` define
o catalogo versionado em `operational_job_definitions`, registra execucoes em
`operational_job_runs` e agenda `pg_cron` quando a extensao esta disponivel no
ambiente. Se `pg_cron` nao estiver instalado, o catalogo continua aplicado e o
campo `metadata.cronInstallStatus` fica como `pg_cron_unavailable`.

| Job                            | Schedule       | Limite padrao | Observacao                                                 |
| ------------------------------ | -------------- | ------------: | ---------------------------------------------------------- |
| `checkin.reminder`             | `*/30 * * * *` |           100 | Notificacoes in-app genericas para check-ins pendentes.    |
| `medication.reminder`          | `*/30 * * * *` |           100 | Notificacoes in-app genericas para lembretes ativos.       |
| `attendance.stuck`             | `*/15 * * * *` |           100 | Marca fila presa apos 45 min e audita contagem por tenant. |
| `communications.expire`        | `15 * * * *`   |           250 | Arquiva comunicacoes vencidas por retencao.                |
| `crm.retention`                | `35 2 * * *`   |           100 | Redacao de leads expirados via contrato service-role.      |
| `inventory.notification`       | `20 7 * * *`   |           100 | Alertas de estoque minimo e validade critica.              |
| `billing.asaas_reconciliation` | `*/30 * * * *` |           100 | Enfileira `billing_sync_jobs`; nao chama Asaas.            |
| `webhook.reprocess`            | `*/10 * * * *` |            50 | Triagem fail-closed da fila; nao reexecuta payload bruto.  |
| `compliance.readiness`         | `40 3 * * *`   |           100 | Reavalia lacunas de compliance por tenant.                 |
| `provider.healthcheck`         | admin-only     |             1 | Health local de providers; sem chamadas externas.          |

Execucao manual so e permitida com service role em backend/script trusted:

```sql
select public.run_operational_job('checkin.reminder', true, 100);  -- dry-run
select public.run_operational_job('checkin.reminder', false, 100); -- executa
```

Ou pelo runner trusted:

```bash
node scripts/supabase/run-operational-job.mjs --job checkin.reminder --limit 100
node scripts/supabase/run-operational-job.mjs --job checkin.reminder --limit 100 --execute
```

Todos os jobs devem manter:

- `dry-run` como primeira execucao em homologacao ou incidente;
- limite explicito por execucao, nunca lote aberto;
- logs somente com contagens, status, codigos e resumo sanitizado;
- service role restrito a backend, Edge Function trusted, script operacional
  autorizado ou `pg_cron`;
- one-shots (`permissions.seed`, `platform_settings.seed`,
  `compliance.legacy_audit`) fora do cron e fora da UI comum.

O dashboard `/admin/observability` consome `list_platform_operational_jobs` e
mostra ultima execucao, status, atraso e falha sanitizada. Falhas de job sao
capturadas em `operational_job_runs`; uma falha nao interrompe a aplicacao.

## Smoke read-only pos-deploy

Com o app publicado, execute:

```bash
node scripts/observability/post-deploy-smoke.mjs --base-url https://app.example.com
```

Sem cookies de smoke, o script valida:

- `/api/health` com `x-request-id`;
- `/auth/login` retornando 200;
- rotas clinicas criticas (`/clinic/dashboard`, `/clinic/patients`,
  Paciente 360, encounter, agenda, documentos, financeiro, programas,
  relatorios e settings), admin (`/admin`, `/admin/tenants`, `/admin/webhooks`)
  e `/patient` redirecionando anonimos para `/auth/login`.

Para staging, gere cookies curtos de sessoes dummy autorizadas e injete somente
via gerenciador de secrets ou shell local sem imprimir valores:

```bash
SLIMHIPER_SMOKE_BASE_URL=https://staging.example.com \
SLIMHIPER_CLINIC_SMOKE_COOKIE="<cookie-redigido>" \
SLIMHIPER_ADMIN_SMOKE_COOKIE="<cookie-redigido>" \
SLIMHIPER_PATIENT_SMOKE_COOKIE="<cookie-redigido>" \
SLIMHIPER_REQUIRE_AUTHENTICATED_SMOKE=true \
node scripts/observability/post-deploy-smoke.mjs
```

Com cookies por perfil, o smoke continua read-only e exige HTTP 200 nas rotas
permitidas para cada perfil:

- `SLIMHIPER_CLINIC_SMOKE_COOKIE`: rotas clinicas criticas, incluindo inbox.
- `SLIMHIPER_ADMIN_SMOKE_COOKIE`: `/admin`, `/admin/tenants` e
  `/admin/webhooks`.
- `SLIMHIPER_PATIENT_SMOKE_COOKIE`: `/patient`.

`SLIMHIPER_SMOKE_COOKIE` permanece como compatibilidade para uma sessao dummy
generica; ele prova que o cookie nao redireciona para `/auth/login`, mas nao
substitui os cookies por perfil no gate de staging. Nao use cookie real de
paciente, provider ou producao fora de janela aprovada.

Quando o objetivo for gerar a propria sessao via UI, use o smoke browser
autenticado com usuarios dummy e credenciais injetadas por secret manager ou
shell local sem imprimir valores:

```bash
SLIMHIPER_SMOKE_BASE_URL=https://staging.example.com \
SLIMHIPER_CLINIC_SMOKE_EMAIL="<email-dummy-clinica>" \
SLIMHIPER_CLINIC_SMOKE_PASSWORD="<senha-redigida>" \
SLIMHIPER_ADMIN_SMOKE_EMAIL="<email-dummy-admin>" \
SLIMHIPER_ADMIN_SMOKE_PASSWORD="<senha-redigida>" \
SLIMHIPER_PATIENT_SMOKE_EMAIL="<email-dummy-paciente>" \
SLIMHIPER_PATIENT_SMOKE_PASSWORD="<senha-redigida>" \
SLIMHIPER_SMOKE_PATIENT_ID="<patient-id-dummy>" \
node scripts/observability/staging-authenticated-browser-smoke.mjs
```

O script abre contextos isolados por perfil, faz login em `/auth/login`, valida
rotas clinic/admin/patient, exercita busca de paciente e aba mobile de
documentos do portal, verifica tela nao vazia, overlay de framework, console
errors e overflow horizontal. As screenshots sao salvas fora do repo por padrao
em um diretorio temporario; para CI/staging use `SLIMHIPER_SMOKE_SCREENSHOT_DIR`
apontando para um artefato seguro e redigido. O runner precisa ter o pacote
`playwright` e o browser Chromium instalados; se nao tiver, o script falha antes
de tentar login.

Variaveis opcionais:

- `SLIMHIPER_SMOKE_PROFILES=clinic,admin,patient` para limitar perfis.
- `SLIMHIPER_SMOKE_SCREENSHOTS=false` ou `--no-screenshots` para nao capturar
  imagens.
- `SLIMHIPER_SMOKE_HEADLESS=false` ou `--headed` para depuracao visual local.
- `SLIMHIPER_FAIL_ON_CONSOLE_WARNING=true` ou `--fail-on-console-warning` para
  transformar console warnings em gate bloqueante.

Nao registre e-mails, senhas, cookies, storage state, screenshots com dados
reais ou URLs assinadas em logs publicos. Para producao, esse smoke so pode
usar usuarios sinteticos, escopo minimo e janela aprovada.

## Teste de alerta controlado

Para exercicio local read-only de alerta e rollback/tabletop:

```bash
node scripts/operations/run-local-alert-rollback-drill.mjs --base-url http://localhost:4028
```

O drill chama `/api/health` com `x-request-id`/`x-correlation-id` controlados,
valida status seguro, registra um evento S4 sintetico em stdout e captura estado
Git suficiente para ensaio de rollback sem executar revert, reset, push ou
deploy. Em staging/producao, continue exigindo sink de alerta real, ack humano e
registro em sistema interno.

1. Em staging, gere um `x-request-id` dummy e chame `/api/health`.
2. Confirme que o evento `health_check` chegou ao sink configurado com
   severidade, modulo, request id, correlation id e latencia.
3. Use uma regra temporaria ou ambiente de teste para disparar alerta S4/S3 sem
   payload sensivel.
4. Registre owner, horario de disparo, ack, resolucao e link do evento redigido.
5. Remova a regra temporaria ou volte o threshold ao valor operacional.

## Criterios de aceite da PR 10.2

- Health endpoint seguro e smoke read-only disponiveis.
- Logs estruturados com correlation/request id no app e nos webhooks D4Sign/Asaas.
- Dashboard operacional admin documentado e acessivel sem consultar providers.
- Matriz de alertas S1-S4 com canais, owners, ack e escalonamento definida.
- Evidencias nao contem secrets, tokens, cookies, PII/PHI, payloads brutos,
  storage paths sensiveis ou signed URLs.
