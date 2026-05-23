# SlimHiper Project Module Checklist

Auditoria de modulos baseada nos arquivos presentes no repositorio local em
2026-05-19. Este documento nao altera escopo tecnico por si so; ele registra o
estado atual, dependencias, riscos e testes necessarios antes de novas
implementacoes.

Status usados:

- `feito`: fluxo implementado e com ponto de verificacao claro.
- `parcial`: ha UI, schema, Edge Function, service ou mock, mas falta integracao
  completa, teste automatizado ou caminho de producao.
- `ausente`: nao ha modulo dedicado; pode existir apenas tipo, mock ou mencao.

## 1. Auth/RBAC/multi-tenant

- Status: parcial.
- Arquivos existentes:
  - `src/app/auth/login/page.tsx`
  - `src/app/api/auth/app-session/route.ts`
  - `src/lib/supabase/client.ts`
  - `src/lib/supabase/server.ts`
  - `src/lib/supabase/middleware.ts`
  - `src/middleware.ts`
  - `src/lib/auth/getCurrentUserContext.ts`
  - `src/lib/auth/canAccessPlatformAdmin.ts`
  - `src/services/session/getCurrentAppSession.ts`
  - `src/services/session/permissions.ts`
  - `src/services/session/roles.ts`
  - `src/services/mockSession.ts`
  - `supabase/migrations/20260508110000_core_multitenant_foundation.sql`
  - `supabase/migrations/20260508123000_core_role_model_upgrade.sql`
  - `supabase/migrations/20260508133000_core_multitenant_rls_alignment.sql`
  - `supabase/tests/core_rbac_smoke_tests.sql`
  - `scripts/supabase/bootstrap-core-auth.mjs`
- Dependencias:
  - `@supabase/ssr`, `@supabase/supabase-js`, Next middleware, Supabase Auth,
    tabelas `profiles`, `tenants`, `tenant_memberships`, `roles`,
    `permissions`, `role_permissions`.
- Riscos:
  - Session e permissoes ainda misturam fallback/mock com Supabase real.
  - Patient portal ainda nao tem vinculo final de conta paciente.
  - Smoke tests de RBAC sao manuais e dependem de ambiente.
- Proximo passo:
  - Consolidar contrato de sessao app, guards de rota e matriz de permissao em
    uma task dedicada, sem mudar migrations antigas.
- Testes necessarios:
  - `npm run type-check`
  - `npm run build`
  - Teste manual de login por perfil.
  - `supabase/tests/core_rbac_smoke_tests.sql` em ambiente autorizado.

## 2. Dashboard

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/dashboard/page.tsx`
  - `src/app/components/DashboardContent.tsx`
  - `src/components/DashboardShell.tsx`
  - `src/components/charts/AdherenceChart.tsx`
  - `src/components/charts/OccupancyChart.tsx`
  - `src/components/charts/WeightEvolutionChart.tsx`
  - `src/services/mockApi.ts`
  - `src/data/mockData.ts`
- Dependencias:
  - `recharts`, `lucide-react`, `DashboardShell`, `StatusBadge`, dados mockados.
- Riscos:
  - KPIs e listas ainda dependem de mock API.
  - Nao ha query server-side ou RPC consolidada para dashboard de tenant.
  - Alertas e contadores podem divergir de Paciente 360 e Agenda.
- Proximo passo:
  - Definir contrato de dados do dashboard por tenant e trocar mocks por service
    com fallback controlado.
- Testes necessarios:
  - Build e type-check.
  - Teste visual responsivo do dashboard.
  - Teste de permissao para usuarios sem `patients.read` ou `financial.read`.

## 3. Pacientes

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/patients/page.tsx`
  - `src/app/clinic/patients/[patientId]/page.tsx`
  - `src/app/patient-list/page.tsx`
  - `src/app/patient-list/components/PatientListContent.tsx`
  - `src/components/PatientHeaderCard.tsx`
  - `src/domain/types.ts`
  - `src/services/mockApi.ts`
  - `src/data/mockData.ts`
  - `supabase/migrations/20260508140000_patient360_clinical_foundation.sql`
- Dependencias:
  - Supabase tables `patients`, `patient_pii`, `patient_care_team`,
    `patient_program_enrollments`, `measurements`, mock data.
- Riscos:
  - Lista e detalhe ainda podem usar dados mockados ou service intermediario.
  - PII precisa de RLS e mascaramento consistente.
  - Rotas antigas `/patient-list` redirecionam e podem confundir testes.
- Proximo passo:
  - Criar service de pacientes com leitura real por tenant e fallback explicito
    apenas em ambiente mock.
- Testes necessarios:
  - Listagem por tenant.
  - Bloqueio cross-tenant.
  - Estado empty/loading/error.
  - Build e type-check.

## 4. Paciente 360

- Status: parcial.
- Arquivos existentes:
  - `src/app/paciente-360/page.tsx`
  - `src/app/paciente-360/components/Patient360Content.tsx`
  - `src/app/paciente-360/components/Patient360Tabs.tsx`
  - `src/app/paciente-360/components/tabs/TabResumo.tsx`
  - `src/app/paciente-360/components/tabs/TabTimeline.tsx`
  - `src/app/paciente-360/components/tabs/TabConsultas.tsx`
  - `src/app/paciente-360/components/tabs/TabDocumentos.tsx`
  - `src/app/paciente-360/components/tabs/TabFinanceiro.tsx`
  - `src/app/paciente-360/components/tabs/TabNutricao.tsx`
  - `src/app/paciente-360/components/tabs/TabPacotes.tsx`
  - `src/app/paciente-360/components/tabs/TabPrescricoes.tsx`
  - `src/app/paciente-360/components/tabs/TabRelatorios.tsx`
  - `src/app/paciente-360/components/tabs/TabChat.tsx`
  - `src/services/patient360Api.ts`
  - `supabase/functions/patient-360-summary/index.ts`
  - `supabase/functions/patient-timeline/index.ts`
  - `scripts/supabase/bootstrap-patient360-demo.mjs`
  - `scripts/supabase/test-patient360-contract.mjs`
- Dependencias:
  - Edge Functions `patient-360-summary` e `patient-timeline`, tabelas clinicas,
    timeline, documents, billing, mock fallback.
- Riscos:
  - Superficie ampla: uma mudanca em tipos pode quebrar varias tabs.
  - Permissoes sensiveis como `timeline.sensitive.read` e `soap.read` precisam
    ser validadas por token real.
  - Algumas tabs ainda aparentam mockadas.
- Proximo passo:
  - Rodar contrato Patient 360 em ambiente autorizado e fechar discrepancias de
    payload antes de novas features.
- Testes necessarios:
  - `scripts/supabase/test-patient360-contract.mjs` com tokens segregados.
  - Teste cross-tenant.
  - Teste sem `patients.read`.
  - Teste visual das tabs.

## 5. Agenda/fila

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/agenda/page.tsx`
  - `src/app/clinic/agenda/components/AgendaContent.tsx`
  - `src/components/StatusBadge.tsx`
  - `src/domain/types.ts`
  - `src/services/mockApi.ts`
  - `src/data/mockData.ts`
  - `supabase/migrations/20260508140000_patient360_clinical_foundation.sql`
- Dependencias:
  - Tabelas `appointments`, `queue_events`, permissao `agenda.read` e
    `agenda.write`, mock agenda/fila.
- Riscos:
  - Workflow visual existe, mas transicoes de status e persistencia real ainda
    nao estao fechadas.
  - Datas e timezone precisam ser padronizados por tenant/unidade.
  - Nao ha teste automatizado de mudanca de fila.
- Proximo passo:
  - Implementar service de agenda/fila com regras de transicao e permissao.
- Testes necessarios:
  - Criar/listar consultas por tenant.
  - Transicoes `agendado` -> `triagem` -> `em_consulta` -> `checkout`.
  - Empty state e conflito de horario.

## 6. Atendimento/encounter

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/patients/[patientId]/encounter/page.tsx`
  - `src/domain/types.ts`
  - `supabase/migrations/20260508140000_patient360_clinical_foundation.sql`
  - `src/data/mockData.ts`
- Dependencias:
  - Tabelas `encounters`, `appointments`, `measurements`, `soap_notes`,
    permissoes `encounters.read`, `encounters.write`, `soap.read`, `soap.write`.
- Riscos:
  - Tela concentra atendimento, SOAP, medidas e alertas no mesmo arquivo.
  - Salvar rascunho/finalizar atendimento nao parece integrado a Supabase.
  - Permissoes de medico/nutricionista precisam ser diferenciadas.
- Proximo passo:
  - Separar contrato de encounter e service de persistencia antes de modularizar
    UI.
- Testes necessarios:
  - Abrir atendimento com permissao correta.
  - Bloquear usuario sem `encounters.write`.
  - Salvar rascunho e finalizar com timeline.

## 7. Anamnese/SOAP

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/patients/[patientId]/encounter/page.tsx`
  - `src/domain/types.ts`
  - `supabase/migrations/20260508140000_patient360_clinical_foundation.sql`
  - `scripts/supabase/bootstrap-patient360-demo.mjs`
- Dependencias:
  - Tabela `soap_notes`, permissoes `soap.read` e `soap.write`, timeline
    `soap_atualizado`.
- Riscos:
  - Anamnese aparece como evento/tipo e mock, mas nao ha tela/formulario dedicado.
  - SOAP existe como editor na tela de atendimento, mas sem contrato de autosave
    ou auditoria visivel.
  - Dados clinicos sensiveis exigem RLS e logs.
- Proximo passo:
  - Criar fluxo minimo de SOAP persistido com historico e auditoria.
- Testes necessarios:
  - Create/update SOAP por profissional autorizado.
  - Leitura negada sem `soap.read`.
  - Evento de timeline ao finalizar SOAP.

## 8. Medidas/bioimpedancia/labs

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/patients/[patientId]/encounter/page.tsx`
  - `src/app/paciente-360/components/tabs/TabResumo.tsx`
  - `src/app/paciente-360/components/tabs/TabTimeline.tsx`
  - `src/components/charts/WeightEvolutionChart.tsx`
  - `src/domain/types.ts`
  - `supabase/migrations/20260508140000_patient360_clinical_foundation.sql`
  - `scripts/supabase/bootstrap-patient360-demo.mjs`
- Dependencias:
  - Tabelas `measurements`, `bioimpedance_results`, `lab_orders`,
    `lab_results`, permissoes clinicas.
- Riscos:
  - UI mostra dados e graficos, mas nao ha CRUD dedicado para medidas/labs.
  - Bioimpedancia e labs aparecem no schema e bootstrap, mas sem modulo isolado.
  - Unidades, faixas de referencia e historico precisam ser padronizados.
- Proximo passo:
  - Definir service e formulario de registro de medidas/bioimpedancia/labs.
- Testes necessarios:
  - Insercao por tenant.
  - Leitura no Paciente 360.
  - Validacao de unidades e valores obrigatorios.

## 9. Document templates

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/documents/page.tsx`
  - `src/services/documentsApi.ts`
  - `src/components/DocumentStatusBadge.tsx`
  - `supabase/migrations/20260508160000_storage_clinical_documents_foundation.sql`
  - `supabase/migrations/20260508170000_documents_schema_foundation.sql`
  - `supabase/functions/generate-document/index.ts`
  - `supabase/functions/patient-documents/index.ts`
  - `supabase/functions/document-signed-url/index.ts`
  - `scripts/supabase/bootstrap-document-templates-demo.mjs`
  - `scripts/supabase/test-documents-contract.mjs`
  - `docs/supabase/DOCUMENT_TEMPLATES_RUNBOOK.md`
- Dependencias:
  - Tabelas `document_templates`, `generated_documents`,
    `signature_requests`, Supabase Storage, Edge Functions.
- Riscos:
  - Interpolacao de template precisa ser restrita e testada contra dados PII.
  - Politicas de leitura para paciente estao marcadas como TODO na migration de
    documentos.
  - UI de gerenciamento de templates ainda parece concentrada na pagina de
    documentos.
- Proximo passo:
  - Fechar contrato de templates, variaveis permitidas e permissao de paciente.
- Testes necessarios:
  - Contract test de documentos.
  - Geracao com template valido e invalido.
  - Signed URL limitado por tenant/paciente.

## 10. Documentos/D4Sign

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/documents/page.tsx`
  - `src/services/documentsApi.ts`
  - `supabase/functions/d4sign-send-document/index.ts`
  - `supabase/functions/webhook-d4sign/index.ts`
  - `supabase/migrations/20260508170000_documents_schema_foundation.sql`
  - `docs/integrations/D4SIGN_RUNBOOK.md`
- Dependencias:
  - D4Sign API, webhook HMAC, `signature_requests`, `signature_signers`,
    `d4sign_events`, `generated_documents`, timeline.
- Riscos:
  - Webhook usa service role em Edge Function, correto para server-side, mas
    precisa de segredo configurado fora do repo.
  - Idempotencia e reconciliacao de status precisam de teste com payload real.
  - Falta cobertura automatizada de webhook D4Sign.
- Proximo passo:
  - Criar suite de contrato/local fixture para webhook D4Sign e validar
    assinatura.
- Testes necessarios:
  - Envio para assinatura com usuario autorizado.
  - Webhook com assinatura valida/invalida.
  - Reprocessamento idempotente.

## 11. Financeiro/Billing/Asaas

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/financeiro/page.tsx`
  - `src/app/clinic/financeiro/components/ClinicFinanceiroContent.tsx`
  - `src/app/admin/billing/page.tsx`
  - `src/services/billingApi.ts`
  - `supabase/migrations/20260509120000_billing_asaas_foundation.sql`
  - `supabase/functions/asaas-create-tenant-subaccount/index.ts`
  - `supabase/functions/asaas-create-patient-customer/index.ts`
  - `supabase/functions/asaas-create-patient-invoice/index.ts`
  - `supabase/functions/asaas-create-patient-subscription/index.ts`
  - `supabase/functions/webhook-asaas/index.ts`
  - `scripts/supabase/bootstrap-billing-demo.mjs`
  - `scripts/supabase/test-billing-contract.mjs`
  - `docs/integrations/ASAAS_BILLING_RUNBOOK.md`
- Dependencias:
  - Asaas API, Edge Functions, tabelas `tenant_billing_accounts`,
    `asaas_subaccounts`, `patient_customers`, `patient_invoices`,
    `patient_subscriptions`, `payments`, `billing_webhook_events`.
- Riscos:
  - Funcoes Asaas externas podem chamar API real; exigem ambiente autorizado.
  - Webhook Asaas precisa validacao forte de autenticidade, idempotencia e
    conciliacao.
  - UI financeira pode cair em mock fallback e mascarar falhas de backend.
- Proximo passo:
  - Fechar contrato de billing em ambiente sandbox e mapear estados Asaas para
    estados internos.
- Testes necessarios:
  - Contract test de billing em sandbox.
  - Permissoes `financial.read` e `financial.write`.
  - Webhook duplicado, assinatura invalida e evento desconhecido.

## 12. Programas/pacotes

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/programs/page.tsx`
  - `src/app/clinic/programs/components/ProgramsContent.tsx`
  - `src/app/clinic/programs/builder/page.tsx`
  - `src/app/clinic/programs/builder/components/ProgramBuilderContent.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepDadosGerais.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepFases.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepServicos.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepEntitlements.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepCheckins.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepDocumentos.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepFinanceiro.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepEquipe.tsx`
  - `src/app/clinic/programs/builder/components/steps/StepRevisao.tsx`
  - `src/data/mockBuilderData.ts`
  - `src/domain/types.ts`
- Dependencias:
  - UI builder, tipos `ClinicProgram`, mock data, relacao com documentos,
    financeiro, equipe e app do paciente.
- Riscos:
  - Builder parece local/mock sem persistencia real.
  - Pacotes impactam billing, agenda, documentos e entitlements do app paciente.
  - Faltam validacoes de rascunho/publicacao.
- Proximo passo:
  - Desenhar schema/service de programas em PR separado antes de persistir UI.
- Testes necessarios:
  - Validacao do builder por etapa.
  - Criacao/edicao de programa.
  - Enroll de paciente e reflexo no Paciente 360.

## 13. CRM/leads

- Status: ausente.
- Arquivos existentes:
  - `src/domain/types.ts` tem tipos de timeline `lead_criado` e
    `lead_convertido`.
  - `src/data/mockData.ts` contem eventos mock de lead.
- Dependencias:
  - Futuras tabelas de leads, origem/canal, funil, tarefas comerciais e
    conversao para paciente.
- Riscos:
  - Nao ha rota, menu, schema, service ou permissoes dedicadas.
  - Eventos de lead no Paciente 360 podem sugerir funcionalidade que nao existe.
  - Conversao lead -> paciente impacta PII, consentimento e billing.
- Proximo passo:
  - Criar PR de discovery/contrato de CRM antes de UI.
- Testes necessarios:
  - Quando existir: CRUD de lead por tenant, conversao para paciente,
    duplicidade por CPF/email/telefone.

## 14. Estoque

- Status: ausente.
- Arquivos existentes:
  - Nenhuma rota, service, schema ou componente dedicado encontrado.
- Dependencias:
  - Futuras tabelas de produtos, lotes, movimentacoes, unidades, fornecedores,
    validade, consumo por atendimento/programa.
- Riscos:
  - Pode cruzar com financeiro e atendimento sem modelo definido.
  - Requer trilha de auditoria e controle de unidade/tenant.
  - Produtos clinicos podem ter exigencias reguladoras.
- Proximo passo:
  - Definir escopo minimo de estoque e modelo multi-unidade antes de qualquer UI.
- Testes necessarios:
  - Quando existir: entrada/saida, saldo por unidade, bloqueio cross-tenant,
    auditoria de movimentacao.

## 15. Relatorios

- Status: parcial.
- Arquivos existentes:
  - `src/app/paciente-360/components/tabs/TabRelatorios.tsx`
  - `src/domain/types.ts`
  - `src/app/clinic/settings/components/ClinicSettingsContent.tsx`
  - `src/app/admin/tenants/[tenantId]/components/TenantDetailContent.tsx`
- Dependencias:
  - Dados clinicos, financeiros, agenda, documentos e permissao `reports.read`.
- Riscos:
  - Existe relatorio no contexto Paciente 360 e mencoes em settings/admin, mas
    nao ha modulo/rota de relatorios da clinica.
  - Exportacao aparece como conceito de tipo, nao como implementacao completa.
  - Relatorios podem expor PII/financeiro sem filtro de permissao.
- Proximo passo:
  - Criar rota/contrato de relatorios clinicos e financeiros por permissao.
- Testes necessarios:
  - `reports.read` por perfil.
  - Exportacao com dados mascarados quando aplicavel.
  - Filtros por periodo, unidade e profissional.

## 16. Chat/notificacoes

- Status: parcial.
- Arquivos existentes:
  - `src/app/paciente-360/components/tabs/TabChat.tsx`
  - `src/domain/types.ts`
  - `src/data/mockData.ts`
  - `src/app/clinic/settings/components/ClinicSettingsContent.tsx`
  - `src/components/DashboardShell.tsx`
- Dependencias:
  - Futuro backend de mensagens, notificacoes, horarios de atendimento, SLA,
    permissao de equipe e app paciente.
- Riscos:
  - Chat existe como tab de Paciente 360, mas sem service real.
  - Notificacoes aparecem na UI, mas nao ha infraestrutura de push/in-app.
  - Mensagens podem conter dados sensiveis e precisam de retencao/auditoria.
- Proximo passo:
  - Definir modelo de conversas, mensagens, notificacoes e opt-in do paciente.
- Testes necessarios:
  - Quando persistido: envio/recebimento, unread count, permissao por equipe,
    horario de atendimento e retencao.

## 17. App paciente

- Status: parcial.
- Arquivos existentes:
  - `src/app/patient/page.tsx`
  - `src/domain/types.ts`
  - `src/data/mockData.ts`
  - `supabase/migrations/20260508170000_documents_schema_foundation.sql`
- Dependencias:
  - Supabase Auth, futura ligacao usuario-paciente, documentos liberados,
    pagamentos, chat, check-ins e entitlements de programas.
- Riscos:
  - Rota `/patient` e apenas placeholder.
  - Migration de documentos marca politica de leitura de paciente como TODO.
  - Sem vinculo usuario-paciente, qualquer exposicao de dados seria alto risco.
- Proximo passo:
  - Implementar primeiro o modelo de patient-account linkage e RLS de leitura
    propria.
- Testes necessarios:
  - Paciente ve apenas seus dados.
  - Paciente nao acessa outro tenant/paciente.
  - Documentos liberados, pagamentos e chat obedecem entitlements.

## 18. Configuracoes/admin

- Status: parcial.
- Arquivos existentes:
  - `src/app/clinic/settings/page.tsx`
  - `src/app/clinic/settings/components/ClinicSettingsContent.tsx`
  - `src/app/admin/page.tsx`
  - `src/app/admin/layout.tsx`
  - `src/app/admin/components/AdminContent.tsx`
  - `src/app/admin/components/PlatformAdminGuard.tsx`
  - `src/app/admin/tenants/page.tsx`
  - `src/app/admin/tenants/components/TenantsManagementContent.tsx`
  - `src/app/admin/tenants/[tenantId]/page.tsx`
  - `src/app/admin/tenants/[tenantId]/components/TenantDetailContent.tsx`
  - `src/app/admin/integrations/page.tsx`
  - `src/app/admin/billing/page.tsx`
  - `src/services/adminApi.ts`
- Dependencias:
  - `canAccessPlatformAdmin`, session service, tenant tables, billing,
    webhooks, settings mock/local state.
- Riscos:
  - Admin possui muita UI mockada e algumas leituras reais com fallback.
  - Settings da clinica parecem majoritariamente locais.
  - Guard de admin precisa cobrir todos os subpaths e estados loading/forbidden.
- Proximo passo:
  - Separar admin platform real de mock/demo e criar contratos de settings por
    tenant.
- Testes necessarios:
  - Platform admin entra.
  - Usuario de clinica nao entra em `/admin`.
  - Settings persistem por tenant.

## 19. Seguranca/auditoria

- Status: parcial.
- Arquivos existentes:
  - `src/app/admin/audit/page.tsx`
  - `src/app/admin/security/page.tsx`
  - `src/app/admin/webhooks/page.tsx`
  - `src/app/admin/webhooks/components/WebhookMonitorContent.tsx`
  - `src/app/admin/support/page.tsx`
  - `src/services/adminApi.ts`
  - `supabase/migrations/20260508110000_core_multitenant_foundation.sql`
  - `supabase/functions/webhook-d4sign/index.ts`
  - `supabase/functions/webhook-asaas/index.ts`
- Dependencias:
  - Tabelas `audit_logs`, `support_sessions`, `break_glass_requests`,
    `asaas_events`, `d4sign_events`, service role somente server-side/Edge.
- Riscos:
  - Auditoria existe em schema/admin UI, mas cobertura de eventos ainda pode ser
    incompleta.
  - Webhooks e break-glass exigem trilhas imutaveis e revisao de permissao.
  - Secrets nao podem ir para `NEXT_PUBLIC_*`.
- Proximo passo:
  - Definir matriz de eventos auditaveis e verificar escrita em todos os fluxos
    sensiveis.
- Testes necessarios:
  - Eventos de login/admin/billing/documentos.
  - Break-glass com aprovacao/expiracao.
  - Webhook duplicado e falho.

## 20. Testes/CI

- Status: parcial.
- Arquivos existentes:
  - `package.json`
  - `tsconfig.json`
  - `next.config.mjs`
  - `supabase/tests/core_rbac_smoke_tests.sql`
  - `supabase/tests/patient360_contract_checks.md`
  - `scripts/supabase/test-patient360-contract.mjs`
  - `scripts/supabase/test-documents-contract.mjs`
  - `scripts/supabase/test-billing-contract.mjs`
  - `docs/testing/CONTRACT_TESTS.md`
  - `.github/workflows/ci.yml`
  - `.github/workflows/contract-fixtures.yml`
  - `eslint.config.mjs`
- Dependencias:
  - `npm run type-check`, `npm run build`, `npm run lint` via ESLint CLI,
    scripts de contrato dependentes de env/tokens autorizados.
- Riscos:
  - Contract tests chamam funcoes/ambientes externos quando envs reais existem.
  - CI automatico nao deve exigir secrets nem chamar providers externos.
- Proximo passo:
  - Manter CI automatico sem secrets e ampliar contratos gated somente com
    autorizacao.
- Testes necessarios:
  - `git diff --check`
  - `npm run type-check`
  - `npm run build`
  - `npm run lint`.
  - Contract tests somente com autorizacao e ambiente sandbox.

## Top 10 prioridades tecnicas

1. Fechar Auth/RBAC/session real por tenant e guards de rota.
2. Validar RLS cross-tenant para pacientes, documentos e financeiro.
3. Executar e estabilizar contract tests de Paciente 360.
4. Resolver patient-account linkage antes de expor app paciente.
5. Consolidar services reais para pacientes, dashboard e agenda.
6. Fortalecer webhooks D4Sign e Asaas com fixtures, idempotencia e auditoria.
7. Persistir encounter/SOAP com historico e permissoes por perfil.
8. Modelar programas/pacotes antes de ligar billing, agenda e entitlements.
9. Criar modulo de relatorios com permissoes e mascaramento.
10. Criar CI minimo com checks locais obrigatorios e jobs gated para contratos.

## Observacoes de governanca

- Nao editar migrations antigas; criar migration nova somente em task explicita.
- Nao rodar `supabase db push` sem autorizacao.
- Nao usar secrets em docs, exemplos ou comandos.
- `service_role` deve ficar apenas em server-side, scripts autorizados ou Edge
  Functions.
- Mudancas em `package.json` precisam de justificativa clara.
