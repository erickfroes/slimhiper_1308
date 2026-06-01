# Template de evidencia redigida de backup/restore

Use este template em teste periodico, exercicio de mesa ou restore emergencial.
Nao preencha com secrets, tokens, cookies, payload bruto, PII/PHI, nomes de
pacientes/responsaveis, e-mails, telefones, storage paths completos, signed URLs
ou IDs externos de provider nao redigidos.

## Identificacao

- **Tipo:** teste periodico / exercicio de mesa / restore emergencial
- **Ambiente origem:** `<redigido: local|preview|staging|production>`
- **Ambiente destino isolado:** `<redigido>`
- **Backup timestamp UTC:** `<YYYY-MM-DDTHH:mm:ssZ>`
- **Restore inicio UTC:** `<YYYY-MM-DDTHH:mm:ssZ>`
- **Restore fim UTC:** `<YYYY-MM-DDTHH:mm:ssZ>`
- **Commit/tag de release:** `<tag-ou-commit>`
- **Owner executor:** `<role/time, sem dado pessoal sensivel>`
- **Aprovador:** `<role/time>`
- **Janela autorizada:** `<inicio-fim UTC>`

## Escopo restaurado

| Superficie | Status | Evidencia redigida |
| --- | --- | --- |
| Banco/schema/RLS/RBAC | pendente / passou / falhou | `<timestamp, manifest/checksum agregado, sem dados reais>` |
| Storage/buckets privados | pendente / passou / falhou | `<contagem agregada por bucket/classe>` |
| Edge Functions/configuracao | pendente / passou / falhou | `<commit/versao e nomes de variaveis, sem valores>` |
| Webhooks/idempotencia | pendente / passou / falhou | `<contagens/status por provider, sem payload bruto>` |
| Audit logs | pendente / passou / falhou | `<contagens por periodo/tipo>` |
| Artefatos de release | pendente / passou / falhou | `<workflow/tag/checks>` |

## RPO/RTO

| Familia | RPO alvo | RPO medido | RTO alvo | RTO medido | Aceite |
| --- | --- | --- | --- | --- | --- |
| Prontuario/PII/PHI/agenda | <= 15 min | `<valor>` | <= 4 h | `<valor>` | sim / nao |
| Documentos | <= 1 h | `<valor>` | <= 8 h | `<valor>` | sim / nao |
| Financeiro | <= 15 min | `<valor>` | <= 4 h | `<valor>` | sim / nao |
| Webhooks | <= 15 min | `<valor>` | <= 6 h | `<valor>` | sim / nao |
| CRM/leads | <= 24 h | `<valor>` | <= 24 h | `<valor>` | sim / nao |
| Estoque | <= 1 h | `<valor>` | <= 8 h | `<valor>` | sim / nao |
| Relatorios/exports/logs | <= 24 h | `<valor>` | <= 24 h | `<valor>` | sim / nao |
| Audit logs | <= 15 min | `<valor>` | <= 8 h | `<valor>` | sim / nao |

## Checks executados

Prefixe cada linha com `passou`, `falhou` ou `bloqueado` e explique bloqueios de
ambiente. Registre comandos sem imprimir secrets.

- `<status>` `git diff --check` — `<resultado>`
- `<status>` `npm run type-check` — `<resultado>`
- `<status>` `npm run lint` — `<resultado>`
- `<status>` `npm run build` — `<resultado>`
- `<status>` `node scripts/observability/post-deploy-smoke.mjs` — `<resultado>`
- `<status>` RLS/RBAC cross-tenant autorizado — `<resultado>`
- `<status>` Storage privado/signed URL curta — `<resultado>`
- `<status>` Webhooks/idempotencia read-only — `<resultado>`
- `<status>` Reconciliacao financeira/estoque agregada — `<resultado>`

## Divergencias e riscos residuais

| Divergencia | Impacto | Owner | Mitigacao | Prazo |
| --- | --- | --- | --- | --- |
| `<descricao redigida>` | S1/S2/S3/S4 | `<role>` | `<acao>` | `<data>` |

## Decisao

- **Go/no-go:** go / no-go
- **Motivo:** `<criterios atendidos ou bloqueios>`
- **Acoes obrigatorias antes de producao:** `<lista>`
- **Follow-ups:** `<issues/runbooks/checks>`

## Checklist de redacao

- [ ] Nenhum secret, token, cookie ou chave foi registrado.
- [ ] Nenhum payload bruto de D4Sign/Asaas foi anexado.
- [ ] Nenhum nome, e-mail, telefone, CPF/CNPJ, dado clinico ou financeiro
      identificavel foi registrado.
- [ ] Nenhum storage path completo ou signed URL foi registrado.
- [ ] Evidencias usam contagens agregadas, hashes/manifests ou IDs redigidos.
- [ ] Acesso temporario foi revogado e ambiente isolado foi destruido ou
      mantido com owner e prazo aprovados.
