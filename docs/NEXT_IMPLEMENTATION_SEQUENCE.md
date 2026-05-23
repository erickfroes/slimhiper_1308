# Next Implementation Sequence

Ordem recomendada para transformar o estado atual em PRs pequenos e revisaveis.
Cada PR deve manter escopo unico, registrar checks executados e evitar misturar
migration, UI e integracao externa quando isso nao for inevitavel.

## Regras para todos os PRs

- Nao editar migrations antigas.
- Criar migrations somente em PRs dedicados e nomeados.
- Nao rodar `supabase db push` sem autorizacao explicita.
- Nao usar secrets no repo, em exemplos reais ou em `NEXT_PUBLIC_*`.
- Manter `service_role` apenas server-side, scripts autorizados ou Edge
  Functions.
- Rodar sempre `git diff --check`, `npm run type-check` e `npm run build`.
- Rodar `npm run lint` para mudancas de frontend, lint ou TypeScript. O script
  usa ESLint CLI, nao `next lint`.

## Sequencia de PRs

### PR 1: docs/module-checklist-roadmap

- Objetivo: adicionar checklist de modulos e roadmap tecnico.
- Branch sugerida: `docs/module-checklist-roadmap`.
- Arquivos esperados:
  - `docs/PROJECT_MODULE_CHECKLIST.md`
  - `docs/NEXT_IMPLEMENTATION_SEQUENCE.md`
- Checks:
  - `git diff --check`

### PR 2: chore/lint-next15-migration

- Objetivo: corrigir estrategia de lint para Next 15 sem mudar feature.
- Escopo:
  - Migrar de `next lint` para ESLint CLI.
  - Manter `rocketCritical` sem remocao.
  - Documentar que lint cobre `src/**/*.{ts,tsx}`.
- Risco principal: alterar `package.json` sem justificativa.
- Checks:
  - `npm run lint`
  - `npm run type-check`
  - `npm run build`

### PR 3: chore/ci-baseline-checks

- Objetivo: versionar pipeline minimo sem secrets.
- Escopo:
  - Rodar whitespace check, type-check, lint e build em CI.
  - Deixar testes de contrato apenas como jobs manuais/gated.
  - Manter contratos reais fora do CI automatico.
- Risco principal: CI exigir env real ou chamar provider externo.
- Checks:
  - `git diff --check`
  - `npm run lint`
  - `npm run type-check`
  - `npm run build`

### PR 4: auth/session-rbac-hardening

- Objetivo: estabilizar sessao app e guards de rota.
- Escopo:
  - Revisar `getCurrentAppSession`, `canAccessPlatformAdmin` e middleware.
  - Padronizar estados loading/forbidden.
  - Confirmar matriz de permissoes por role.
- Nao incluir:
  - Patient portal linkage.
  - Migrations antigas.
- Checks:
  - Type-check/build.
  - Smoke test RBAC em ambiente autorizado.

### PR 5: security/rls-audit-smoke-tests

- Objetivo: validar isolamento multi-tenant antes de novas features.
- Escopo:
  - Expandir checklist SQL/manual de RLS.
  - Cobrir pacientes, documentos, billing e admin.
  - Registrar comandos sem secrets.
- Risco principal: testes dependerem de dados reais.
- Checks:
  - Type-check/build.
  - SQL smoke tests apenas em ambiente autorizado.

### PR 6: patient360-contract-stabilization

- Objetivo: fechar contrato das Edge Functions de Paciente 360.
- Escopo:
  - `patient-360-summary`
  - `patient-timeline`
  - Normalizacao de payload e estados de erro.
  - Atualizacao de docs de contrato.
- Risco principal: quebrar tabs por mudanca de tipo.
- Checks:
  - `scripts/supabase/test-patient360-contract.mjs` em ambiente autorizado.
  - Type-check/build.

### PR 7: patients-real-service

- Objetivo: trocar lista/detalhe de pacientes para service real com fallback
  controlado.
- Escopo:
  - `src/app/clinic/patients/*`
  - `src/services/mockApi.ts` apenas se necessario.
  - Novo service se o padrao do repo pedir.
- Risco principal: vazamento PII e cross-tenant.
- Checks:
  - Type-check/build.
  - Teste manual de lista vazia, erro e permissao.

### PR 8: feat/dashboard-provider-contract

- Objetivo: isolar o Dashboard de `mockApi` direto e definir contrato de
  provider por tenant.
- Escopo:
  - Criar `src/services/dashboardApi.ts`.
  - KPIs, fila, alertas e pacientes em revisao.
  - Provider mock mantido apenas quando `NEXT_PUBLIC_USE_MOCK_DATA=true` ou em
    ambiente `development`.
  - Stub Supabase futuro deve falhar explicitamente ate existir backend seguro.
  - Estados loading/empty/error.
- Risco principal: KPIs divergirem de pacientes/agenda/billing.
- Checks:
  - Type-check/build.
  - Teste visual responsivo.
- Proxima etapa real:
  - Implementar provider Supabase real em PR dedicado, usando somente consultas
    sob sessao do usuario/RLS.
  - Definir origem de cada KPI: agenda, pacientes, billing, documentos, chat e
    alertas clinicos.
  - Garantir estados empty/forbidden/error sem cair em mock silencioso em
    producao.

### PR 9: agenda-queue-service

- Objetivo: implementar service de agenda/fila e transicoes.
- Escopo:
  - Listagem do dia.
  - Mudanca de status.
  - Regras de permissao `agenda.read`/`agenda.write`.
- Risco principal: timezone e conflitos de horario.
- Checks:
  - Type-check/build.
  - Teste manual de fluxo completo da fila.

### PR 10: encounter-soap-persistence

- Objetivo: persistir atendimento e SOAP com auditoria.
- Escopo:
  - Rascunho/finalizacao.
  - Timeline de `atendimento_concluido` e `soap_atualizado`.
  - Permissoes `encounters.*` e `soap.*`.
- Risco principal: dados clinicos sensiveis sem auditoria.
- Checks:
  - Type-check/build.
  - Testes manuais com physician, nutritionist e receptionist.

### PR 11: measurements-labs-crud

- Objetivo: criar fluxo minimo de medidas, bioimpedancia e labs.
- Escopo:
  - Registrar medida.
  - Ler historico no Paciente 360.
  - Preparar labs sem UI excessiva.
- Risco principal: unidade/valor invalido contaminando graficos.
- Checks:
  - Type-check/build.
  - Validacao de valores obrigatorios e historico.

### PR 12: documents-contract-and-patient-policy

- Objetivo: fechar templates, documentos gerados e politica de leitura do
  paciente.
- Escopo:
  - Contract tests de documentos.
  - Regras de storage path.
  - Patient-read policy em migration nova, se autorizada.
- Risco principal: exposicao de documentos entre pacientes.
- Checks:
  - Type-check/build.
  - `scripts/supabase/test-documents-contract.mjs` em ambiente autorizado.

### PR 13: d4sign-webhook-fixtures

- Objetivo: fortalecer D4Sign sem chamar API real por padrao.
- Escopo:
  - Fixtures de webhook.
  - Validacao de HMAC.
  - Idempotencia.
- Risco principal: aceitar payload falso ou duplicado.
- Checks:
  - Type-check/build.
  - Testes locais com fixture assinada.

### PR 14: billing-asaas-sandbox-contract

- Objetivo: estabilizar billing/Asaas em sandbox.
- Escopo:
  - Customer, invoice, subscription.
  - Webhook Asaas.
  - Mapeamento de estados internos.
- Risco principal: chamar Asaas real sem sandbox/autorizacao.
- Checks:
  - Type-check/build.
  - Contract test apenas com ambiente autorizado.

### PR 15: programs-package-schema-design

- Objetivo: modelar programas/pacotes antes de persistir o builder.
- Escopo:
  - RFC/schema proposto.
  - Relacao com documentos, agenda, billing e entitlements.
  - Migration somente se task autorizar.
- Risco principal: modelo errado propagando para varios modulos.
- Checks:
  - Docs diff check.
  - Type-check/build se houver codigo.

### PR 16: programs-builder-persistence

- Objetivo: salvar e publicar programas.
- Escopo:
  - Builder steps.
  - Validacoes.
  - Estados rascunho/ativo/arquivado.
- Risco principal: publicar programa incompleto.
- Checks:
  - Type-check/build.
  - Teste manual por etapa do builder.

### PR 17: reports-clinic-module

- Objetivo: criar modulo de relatorios da clinica.
- Escopo:
  - Rota dedicada.
  - Filtros por periodo/unidade/profissional.
  - Permissao `reports.read`.
- Risco principal: expor PII/financeiro indevido.
- Checks:
  - Type-check/build.
  - Testes de permissao e mascaramento.

### PR 18: patient-portal-linkage

- Objetivo: implementar vinculo usuario-paciente e portal minimo.
- Escopo:
  - Account linkage.
  - RLS de leitura propria.
  - Portal com documentos liberados e resumo basico.
- Risco principal: paciente acessar dados de outro paciente.
- Checks:
  - Type-check/build.
  - Teste cross-patient/cross-tenant.

### PR 19: chat-notifications-foundation

- Objetivo: criar base de chat e notificacoes.
- Escopo:
  - Conversas, mensagens, unread count.
  - Preferencias e horarios de atendimento.
  - Notificacoes in-app antes de push externo.
- Risco principal: retencao de mensagens sensiveis.
- Checks:
  - Type-check/build.
  - Testes de permissao e unread count.

### PR 20: crm-leads-foundation

- Objetivo: introduzir CRM/leads em base pequena.
- Escopo:
  - Lead, origem, status, responsavel.
  - Conversao lead -> paciente.
  - Timeline comercial.
- Risco principal: duplicidade e PII sem consentimento.
- Checks:
  - Type-check/build.
  - Teste de duplicidade e conversao.

### PR 21: inventory-discovery-then-foundation

- Objetivo: primeiro discovery, depois base de estoque.
- Escopo:
  - Produtos, lotes, unidade, validade, movimentacoes.
  - Auditoria.
  - Integracao com atendimento apenas depois.
- Risco principal: saldo incorreto por unidade/tenant.
- Checks:
  - Type-check/build quando houver codigo.
  - Testes de entrada/saida e auditoria.

### PR 22: admin-audit-hardening

- Objetivo: ampliar seguranca, auditoria e monitoramento operacional.
- Escopo:
  - Audit logs em fluxos sensiveis.
  - Break-glass.
  - Monitor de webhooks.
- Risco principal: eventos criticos sem trilha ou com payload sensivel demais.
- Checks:
  - Type-check/build.
  - Testes manuais de break-glass e webhooks.

## Proxima task recomendada

Depois da Fase 0 de lint/CI/baseline, a proxima task recomendada e
`fix/auth-rbac-schema-alignment`, porque Auth/RBAC/RLS e a base segura para
trocar mocks clinicos por dados reais sem vazar informacao entre tenants.
