# UI x Supabase Column Contract Audit

Data: 2026-06-18

## Escopo

Auditoria estatica da camada de UI/servicos contra o schema Supabase versionado
em `supabase/migrations`.

Foram verificados:

- colunas lidas diretamente pela UI com `.from(...).select(...)`;
- colunas usadas em filtros, ordenacoes e predicados da UI;
- colunas fornecidas diretamente pela UI em `.insert(...)`, `.update(...)` e
  `.upsert(...)`;
- RPCs chamados pela UI;
- Edge Functions chamadas pela UI e seus acessos diretos a tabelas;
- buckets literais usados por storage;
- writes dinamicos revisados manualmente.

Nao foram executados `supabase db push`, migrations, bootstraps, smokes com
service role, nem chamadas a provedores externos.

## Inventario

- Migrações analisadas: 73.
- Tabelas reconstruidas das migrações: 143.
- Views reconstruidas: 1 (`admin_webhook_events`).
- Colunas versionadas reconstruidas: 1.926.
- Arquivos `src/**/*.{ts,tsx}` analisados: 213.
- Tabelas acessadas diretamente por UI/rotas/services: 45.
- Pontos diretos `.from(...)` em `src`: 171.
- Referencias diretas de leitura por coluna: 484.
- Referencias diretas de predicado/ordenacao por coluna: 255.
- Referencias diretas de escrita por coluna: 232.
- Tabelas com escrita direta pela UI/rotas/services: 14.
- RPCs chamados pela UI: 157.
- Edge Functions chamadas pela UI: 18.
- Tabelas tocadas direta ou indiretamente por UI/RPC/Edge: 127.

## Resultado Principal

Nao foi encontrada divergencia confirmada entre UI direta e schema versionado.

- Tabelas referenciadas diretamente pela UI: 0 ausentes.
- Colunas lidas diretamente pela UI: 0 ausentes.
- Colunas usadas em filtros/ordenacoes: 0 ausentes.
- Colunas escritas diretamente pela UI: 0 ausentes.
- Inserts/upserts diretos com coluna obrigatoria sem default faltando: 0.
- Edge Functions chamadas pela UI com referencias diretas a coluna inexistente: 0.
- Buckets literais usados pela UI: cobertos pelas migrations.

Conclusao: a UI nao esta tentando consumir ou fornecer coluna inexistente nas
operacoes diretas auditadas.

## Escritas Diretas Revisadas

As escritas dinamicas abaixo foram revisadas manualmente e as chaves batem com
as tabelas correspondentes:

- `audit_logs`: `tenant_id`, `user_id`, `action`, `entity_type`, `entity_id`,
  `metadata`.
- `tenant_memberships`: `tenant_id`, `user_id`, `unit_id`, `role_code`, `role`,
  `status`, `invited_by`, `accepted_at`.
- `tenants`: `status`, `settings`.
- `tenant_units`: `tenant_id`, `code`, `name`, `status`, `metadata`.
- `feature_flags`: `tenant_id`, `key`, `enabled`, `config`.
- `role_permissions`: `tenant_id`, `role_id`, `permission_id`.
- `signature_signers` em `d4sign-send-document`: payload montado a partir de
  signatarios normalizados e gravado por Edge Function.

## Cobertura Por Contrato

O projeto nao deve expor todas as 1.926 colunas na UI. Muitas colunas sao
internas, auditaveis, sensiveis, derivadas, de provider, RLS/RBAC, storage,
retenção, cron/operacoes ou idempotencia.

O padrao predominante esta correto para este app:

- telas clinicas e administrativas chamam services;
- services chamam RPCs ou Edge Functions;
- RPCs/Edge Functions traduzem dados relacionais em envelopes JSON;
- colunas sensiveis e provider ficam atras de backend/RPC/Edge;
- a UI escreve diretamente apenas em superficies administrativas ou contratos
  controlados.

## Colunas Nao Expostas Diretamente Na UI

Foram encontradas colunas versionadas que nao aparecem como consumo direto na
UI. Isso nao e erro por si so. Exemplos relevantes:

- colunas de auditoria: `id`, `created_at`, `updated_at`, `created_by`,
  `metadata`;
- colunas de provider/billing: `wallet_id`, `wallet_id_masked`,
  `masked_metadata`, `provider`, ids externos;
- colunas de governanca/retencao: `retention_expires_at`, `retention_until`,
  `source`;
- colunas de moderacao e revisao que sao operadas via RPC;
- colunas de storage path/bucket retornadas por contratos de signed URL;
- colunas operacionais de filas, jobs e reconciliacao.

Tabelas com maior numero de colunas pouco/nao expostas diretamente e que
merecem decisao de produto, nao necessariamente correcao tecnica:

- `patient_returns`;
- `medical_records`;
- `meal_entries`;
- `asaas_subaccounts`;
- `tenant_billing_accounts`;
- `legal_signatures`;
- `prescription_regulatory_metadata`;
- `chat_sla_policies`;
- `daily_checkins`;
- `document_evidence_packages`;
- `notifications`;
- `patient_contacts`;
- `patient_daily_goals`;
- `patient_profile_change_requests`;
- `payment_links`;
- `water_entries`;
- `workout_entries`.

## Pontos De Atencao

### Wildcard selects

Recomendacao aplicada em 2026-06-18: os `select('*')` restantes na superficie
de sessao foram substituidos por listas explicitas em
`src/services/session/getCurrentAppSession.ts`.

O contrato atual da sessao passa a ler somente:

- `profiles`: `id`, `email`, `full_name`, `platform_role`,
  `active_tenant_id`, `is_active`;
- `feature_flags`: `key`, `enabled`.

As demais superficies clinicas/documentais revisadas ja usam listas explicitas
no codigo atual.

### RPCs complexos

A checagem profunda de SQL por regex gerou falsos positivos em blocos longos
com `UPDATE`, aliases e multiplas tabelas. Os casos revisados foram atribuicoes
a tabela errada pelo analisador, nao falhas confirmadas de schema.

Para uma prova definitiva de RPC contra banco real, e necessario rodar os
contract tests Supabase autorizados ou uma introspeccao controlada do banco
aplicado.

## Veredito

Contrato UI x Supabase aprovado na auditoria estatica.

Nao ha evidencia de que a UI consuma ou forneca colunas inexistentes nas
operacoes diretas. A cobertura integral de todas as colunas nao e desejavel nem
necessaria; o desenho atual usa RPCs/Edge Functions para esconder detalhes
internos e dados sensiveis. O proximo ajuste recomendado e validar RPCs contra
um banco aplicado quando houver autorizacao explicita.
