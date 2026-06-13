# Template De Evidencia Staging E Go/No-Go

Use este template para cada release candidate que pretende chegar a producao.
Preencha com dados redigidos e links internos seguros. O default operacional e
NO-GO ate todos os gates obrigatorios estarem assinados por owners humanos.

## Identificacao

| Campo | Valor |
| --- | --- |
| Data/hora da execucao | |
| Branch | |
| Commit SHA | |
| Release candidate/tag | |
| Ambiente | staging |
| Base URL | |
| Owner release | |
| Owner LGPD/security | |
| Owner operacao | |
| Owner juridico/contratos | |
| Decisao final | NO-GO |

## Configuracao Publica Segura

| Gate | Evidencia | Resultado |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_ENV` e staging/producao-like | | |
| `NEXT_PUBLIC_USE_MOCK_DATA` ausente ou `false` | | |
| `.env.example` cobre variaveis exigidas sem valores reais | | |
| `/api/health` retorna status nao `fail` e `x-request-id` | | |
| Nenhum secret em `NEXT_PUBLIC_*` | | |

## Comandos Obrigatorios

Registre o comando, horario, executor, ambiente e resultado. Nao cole logs com
secrets, cookies, e-mails reais, PII/PHI, payloads brutos ou signed URLs.

```bash
git diff --check
npm run type-check
npm run lint
npm run build
NEXT_PUBLIC_APP_ENV=staging NEXT_PUBLIC_USE_MOCK_DATA=false node scripts/operations/check-production-readiness.mjs
node scripts/operations/check-supabase-contracts.mjs --strict
node scripts/observability/post-deploy-smoke.mjs --base-url <staging-url>
node scripts/observability/staging-authenticated-browser-smoke.mjs --base-url <staging-url>
node scripts/operations/run-local-restore-drill.mjs
node scripts/operations/run-local-alert-rollback-drill.mjs --base-url <staging-url>
```

| Comando | Resultado | Evidencia redigida | Skip aprovado? |
| --- | --- | --- | --- |
| `git diff --check` | | | |
| `npm run type-check` | | | |
| `npm run lint` | | | |
| `npm run build` | | | |
| readiness production-like | | | |
| Supabase contracts strict | | | |
| post-deploy HTTP smoke | | | |
| browser authenticated smoke | | | |
| local restore schema-only drill | | | |
| alert/rollback drill | | | |

## Matriz Auth/RBAC/RLS

| Perfil dummy | Rotas/acoes testadas | Resultado esperado | Evidencia |
| --- | --- | --- | --- |
| Clinica/staff | Dashboard, pacientes, Paciente 360, settings, inbox | 200 e dados do tenant correto | |
| Admin plataforma | Admin, tenants, webhooks | 200 somente com permissao platform admin | |
| Paciente/responsavel | Portal, documentos, diario/jornada quando liberados | Somente escopo proprio | |
| Usuario sem workspace | `/no-workspace` e logout | Sem acesso a dados de tenant | |
| Usuario revogado | Rotas protegidas | 401/403/redirect fail-closed | |
| Cross-tenant | Paciente/doc/financeiro/chat/report de outro tenant | 403/404 sem vazamento | |

## Componentes MVP

| Componente | Nivel alvo | Evidencia staging | Status |
| --- | --- | --- | --- |
| CI, release e ambientes | N4 | | |
| Auth, sessao, RBAC e multi-tenant | N4 | | |
| Supabase schema, RLS e storage | N4 | | |
| Shell/UI clinica | N4 | | |
| Core clinico | N4 | | |
| Paciente 360 e prontuario | N4 | | |
| Portal paciente, diario e jornada | N4 | | |
| Documentos e D4Sign | N4 | | |
| Financeiro e Asaas | N4 | | |
| Programas, catalogo e comercial | N4 | | |
| Relatorios e exports | N4 | | |
| Admin plataforma | N4 | | |
| Seguranca, LGPD e operacao | N4 | | |

## Modulos Pos-MVP

Modulos abaixo podem permanecer N3 se estiverem bloqueados por feature flag,
rota/permissao clara e sem exposicao de dados reais.

| Modulo | Gate de bloqueio | Evidencia | Owner |
| --- | --- | --- | --- |
| CRM | | | |
| Estoque | | | |
| Comunidade | | | |
| Automacoes avancadas | | | |

## Providers E Webhooks

| Provider/superficie | Janela autorizada | Evidencia | Resultado |
| --- | --- | --- | --- |
| D4Sign sandbox send | | | |
| D4Sign webhook HMAC/idempotencia | | | |
| D4Sign signed URL curta | | | |
| Asaas sandbox customer/invoice/subscription/refund/sync | | | |
| Asaas webhook autenticado/idempotente | | | |
| Conciliacao e divergencias | | | |

## Operacao

| Gate operacional | Evidencia | Resultado |
| --- | --- | --- |
| Smoke pos-deploy staging | | |
| Alerta controlado e ack | | |
| Restore isolado testado | | |
| Rollback ensaiado | | |
| Backup restauravel | | |
| Incidente/tabletop | | |
| Runbooks atualizados | | |

## Riscos Residuals

| Risco | Impacto | Mitigacao | Owner | Aceite? |
| --- | --- | --- | --- | --- |
| | | | | |

## Assinaturas

| Area | Responsavel | Decisao | Data/hora |
| --- | --- | --- | --- |
| Release | | GO / NO-GO | |
| LGPD/security | | GO / NO-GO | |
| Juridico/contratos | | GO / NO-GO | |
| Operacao/suporte | | GO / NO-GO | |
| Produto/clinica | | GO / NO-GO | |

## Decisao

```text
Decisao final:
Motivo:
Rollback owner:
Janela de deploy:
Plano de comunicacao:
Proximo checkpoint:
```
