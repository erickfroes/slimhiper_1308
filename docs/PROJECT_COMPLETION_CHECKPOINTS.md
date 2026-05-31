# SlimHiper Completion Checkpoints

Documento mestre para transformar o estado atual do SlimHiper em produto
completamente funcional, seguro e validado. Este arquivo nao substitui os
runbooks tecnicos; ele consolida os gates de conclusao, evidencia esperada,
comparativo competitivo e ordem de finalizacao.

## Objetivo

- Dar uma lista unica de chegada para todas as funcionalidades ja desenhadas na
  UI.
- Evitar que mocks, placeholders e fallback silencioso sejam confundidos com
  produto pronto.
- Manter a prioridade em um MVP clinico seguro com dados reais antes de CRM,
  estoque e expansoes comerciais.
- Registrar boas praticas de seguranca para dados clinicos, financeiros,
  documentos, webhooks e multi-tenant.
- Definir quando cada modulo sai de "parcial" para "pronto para producao".

## Fontes Internas

| Area | Fonte primaria | Como usar |
| --- | --- | --- |
| Regras operacionais | `AGENTS.md` | Fonte de seguranca, Supabase, UI, migrations e checks obrigatorios. |
| Inventario de modulos | `docs/PROJECT_MODULE_CHECKLIST.md` | Status por modulo, arquivos existentes, riscos e proximos passos. |
| Sequencia de PRs | `docs/NEXT_IMPLEMENTATION_SEQUENCE.md` | Ordem preferencial de implementacao em PRs pequenos. |
| Auth/RBAC | `docs/auth/AUTH_RBAC_SESSION_CONTRACT.md` | Contrato de sessao, tabelas esperadas, roles e permissoes. |
| Supabase Auth/RBAC | `docs/supabase/CORE_AUTH_RBAC_RUNBOOK.md` | Bootstrap, validacao e operacao do core multi-tenant. |
| Paciente 360 | `docs/supabase/PATIENT360_RUNBOOK.md` | Payloads, Edge Functions, fixture e contrato real. |
| Document templates | `docs/supabase/DOCUMENT_TEMPLATES_RUNBOOK.md` | Templates, variaveis, storage e bootstrap. |
| D4Sign | `docs/integrations/D4SIGN_RUNBOOK.md` | Webhook, signed URLs, fixtures e sandbox. |
| Asaas | `docs/integrations/ASAAS_BILLING_RUNBOOK.md` | Billing, fixtures, sandbox e reconciliacao. |
| Env hygiene | `docs/security/ENV_HYGIENE.md` | Variaveis publicas, server-only e placeholders seguros. |
| Testes | `docs/testing/CONTRACT_TESTS.md` | Matriz de testes locais, Supabase autorizado e providers. |
| Browser smoke | `docs/testing/BROWSER_SMOKE_CHECKLIST.md` | Roteiro operacional para validar rotas criticas no navegador. |
| Baseline | `docs/testing/BASELINE_CHECKS.md` | Snapshot de checks, pendencias e ambiente usado. |

## Benchmark De Mercado

Comparacao feita por leitura de paginas oficiais de concorrentes e guias de
seguranca. O objetivo nao e copiar features, mas entender o minimo competitivo
para uma plataforma clinica SaaS no Brasil.

| Referencia | Capacidades divulgadas | Implicacao para SlimHiper |
| --- | --- | --- |
| iClinic | Agenda, prontuario, teleconsulta, financeiro, TISS, repasse medico e lancamento financeiro a partir da agenda/prontuario. | O MVP precisa integrar agenda, atendimento e financeiro em fluxo unico, nao como telas isoladas. |
| Feegow | Agenda, prontuario, aplicativo, relatorios, API, LGPD, financeiro e gestao de convenios/TISS. | SlimHiper precisa de relatorios operacionais, permissao clara e API/contratos estaveis antes de escalar. |
| Ninsaude | Agenda multiunidade, confirmacao de consulta, check-in, sessoes/pacotes, prontuario, telemedicina, assinatura digital, arquivos, estoque e insights. | Pacotes, fila, atendimento, documentos e estoque devem compartilhar contexto de paciente/unidade/profissional. |
| Clinicorp | Agenda, financeiro, relatorios, dashboard analitico, CRM/relacionamento, estoque, metas e faturamento. | O roadmap deve fechar dashboard, financeiro, CRM e estoque como operacao conectada, com indicadores confiaveis. |

Fontes externas consultadas:

- iClinic: https://iclinic.com.br/sistema-medico/
- Feegow: https://feegowclinic.com.br/
- Ninsaude agenda: https://www.ninsaude.com/en/medical-scheduling-software/
- Ninsaude prontuario: https://www.ninsaude.com/en/productive-personalized-electronic-health-record/
- Ninsaude estoque: https://www.ninsaude.com/en/inventory-management-software-for-clinics/
- Clinicorp: https://www.clinicorp.com/
- Supabase RLS: https://supabase.com/docs/learn/auth-deep-dive/auth-row-level-security
- Supabase Storage signed URLs: https://supabase.com/docs/guides/storage/serving/downloads
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- ANPD LGPD FAQ: https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-frequentes

## Vocabulario De Status

- **N0 ausente**: sem rota, schema ou service dedicado.
- **N1 UI/mock**: tela existe, mas dados e acoes ainda sao mock/local.
- **N2 contrato**: service, fixture, script ou runbook existem; integracao real incompleta.
- **N3 backend parcial**: Supabase/Edge Function/RPC existe, mas faltam hardening, RLS, testes reais ou UI completa.
- **N4 producao candidata**: dados reais, RLS, erros, empty states, contracts e operacao validados.
- **N5 pronto**: coberto por CI, smoke/contract tests, monitoramento, auditoria e runbook operacional.

## Gates Globais Nao Negociaveis

- [x] `.env` real nao esta versionado e `.env.example` possui apenas chaves vazias ou placeholders seguros.
- [x] `package-lock.json` esta versionado e `npm install` nao gera diff inesperado.
- [x] `rocketCritical` e scripts Rocket externos nao foram removidos sem task especifica.
- [ ] `NEXT_PUBLIC_*` contem apenas valores publicos seguros.
- [x] `SUPABASE_SERVICE_ROLE_KEY` aparece somente em scripts server-side, Edge Functions ou backend confiavel.
- [ ] Nenhuma tela de producao cai em mock silencioso quando backend/RLS falha.
- [ ] Todas as rotas clinicas/admin/paciente possuem guard, loading, empty, error e forbidden quando aplicavel.
- [ ] Todas as tabelas expostas em `public` possuem RLS habilitado e policies explicitas.
- [ ] Cross-tenant smoke cobre pelo menos tenant A e tenant B para paciente, documento, financeiro, chat e relatorios.
- [ ] Webhooks D4Sign/Asaas sao fail-closed, idempotentes e nao logam payload sensivel.
- [ ] Documentos privados usam signed URL curta gerada server-side ou Edge Function, nunca URL publica direta.
- [ ] Dados de saude e financeiros possuem minimizacao, retencao, auditoria e base de acesso documentadas.
- [x] `git diff --check`, `npm run type-check`, `npm run lint` e `npm run build` passam no branch antes de merge.
- [x] Contratos locais passam: Patient360 fixture, D4Sign fixtures e Billing fixtures.
- [ ] Contratos reais/sandbox so rodam com autorizacao explicita e ambiente segregado.
- [x] O ultimo baseline verde esta registrado em `docs/testing/BASELINE_CHECKS.md` com data, branch, commit, caminhos tocados, skips, riscos e limitacoes.

## Gates De Seguranca E LGPD

- [ ] Classificar dados por tipo: publico, operacional, pessoal, sensivel de saude, financeiro e provider payload.
- [ ] Revisar bases de tratamento e finalidade para dados clinicos, billing, assinatura, notificacoes e portal paciente.
- [ ] Garantir menor privilegio por role: `clinic_admin`, `receptionist`, `physician`, `nutritionist`, `fitness_professional`, `financial_user`, `patient`, `guardian`, `external_professional` e `platform_admin`.
- [ ] Separar escopo staff tenant-wide de escopo paciente/guardian por `patient_accounts` e `guardian_links`.
- [ ] Bloquear portal paciente ate existir linkage paciente-conta com RLS propria e smoke cross-patient.
- [ ] Remover permissao direta client-writable em tabelas provider-owned, ou trocar por RPC/Edge Function validada.
- [ ] Cobrir auditoria para login sensivel, troca de tenant, documentos, billing, webhooks, admin, break-glass e exportacoes.
- [ ] Definir retencao e redaction para `billing_webhook_events.payload`; preferir resumo operacional ao payload bruto.
- [ ] Garantir que erros 500 nao exponham detalhes internos, SQL, tokens, headers, secrets ou payload provider.
- [ ] Fixar configuracao de deploy das Edge Functions de webhook para aceitar provider sem JWT Supabase e validar segredo proprio.
- [ ] Revisar CSP/security headers sem quebrar Rocket, Supabase, D4Sign, Asaas, imagens e assets Next.
- [ ] Documentar incidente, backup, restore, rotacao de chaves e revogacao de acessos.

## Estado Atual Resumido

| Modulo | Nivel atual | Foco de conclusao |
| --- | --- | --- |
| Auth/RBAC/multi-tenant | N3 | Fechar guards, roles, RLS e portal fail-closed. |
| Dashboard | N2/N3 | Remover fallback silencioso, badges reais, quick actions e estados inline. |
| Pacientes | N2/N3 | CRUD real, PII protegida, filtros/paginacao e criar paciente. |
| Paciente 360 | N3 | Completar tabs com dados reais, permissoes por tab e smoke real. |
| Agenda/fila | N2 | Usar `updateAppointmentStatus`, criar/editar consulta e timezone. |
| Encounter/SOAP | N2/N3 | Ligar acoes auxiliares, validacao, exames, prescricoes e tarefas. |
| Medidas/labs | N2 | Conectar `clinicalRecordsApi` a formularios reais e timeline. |
| Document templates | N3 | Variaveis permitidas, geracao pela UI e policy paciente. |
| Documentos/D4Sign | N2/N3 | Sandbox autorizado, signer real, reconciliacao e monitor. |
| Financeiro/Asaas | N2/N3 | Corrigir RPCs, reconciliar webhooks e impedir writes provider-owned no client. |
| Programas/pacotes | N1/N2 | Criar `programsApi`, persistir builder e enrollment. |
| CRM/leads | N0/N1 | Criar rota/service e funil lead -> paciente. |
| Estoque | N0/N1 | Criar rota/service e fluxos lote/movimentacao. |
| Relatorios | N1/N2 | Rota clinica, filtros, export seguro e `reports.read`. |
| Chat/notificacoes | N1/N2 | Modelo real de conversa, unread count, envio e retencao. |
| App paciente | N1 | Linkage seguro, RLS propria e UX minima. |
| Settings/admin | N1/N2 | Persistencia real, admin shell, erros, break-glass e support. |
| Seguranca/auditoria | N2/N3 | Eventos auditaveis, retencao, monitoramento e incident response. |
| Testes/CI | N2/N3 | CI completo, fixtures em PR e contracts reais gated. |

## Checkpoints Por UI Existente

### Shell, Login E Navegacao

- [ ] `src/app/layout.tsx`: remover dependencia de overlay global para logout quando `DashboardShell`/admin shell assumirem sessao.
- [ ] `src/components/auth/AuthStateButton.tsx`: mover logout para menu de usuario e evitar botao fixo competindo com topbars.
- [ ] `src/components/DashboardShell.tsx`: trocar badges hardcoded por contadores reais ou ocultar quando indisponiveis.
- [ ] `src/components/DashboardShell.tsx`: implementar busca global ou transformar input em busca escopada documentada.
- [ ] `src/app/auth/login/page.tsx` e `src/components/auth/AuthForm.tsx`: loading de submit, erro amigavel, foco/acessibilidade e redirecionamento por role validado.
- [ ] `src/app/no-workspace/page.tsx`: estado acionavel para usuario sem tenant, com logout e suporte.
- [ ] `src/app/patient/page.tsx`: manter fail-closed ate `patient_accounts`/`guardian_links` estarem prontos.

### Dashboard Clinico

- [ ] `src/app/components/DashboardContent.tsx`: exibir erro inline quando stats falham, nao retornar `null`.
- [ ] `src/app/components/DashboardContent.tsx`: tratar empty state para agenda/fila/alertas/pacientes em revisao.
- [ ] `src/app/components/DashboardContent.tsx`: ligar quick actions a rotas/modais reais ou desabilitar com motivo.
- [ ] `src/services/dashboardApi.ts`: producao deve falhar visivelmente sem mock; mock somente com `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [ ] Validar KPIs com dados reais de `appointments`, `patient_alerts`, `patient_invoices` e documentos pendentes.

### Pacientes

- [ ] `src/app/patient-list/components/PatientListContent.tsx`: adicionar erro persistente e retry quando `patientsApi` falhar.
- [ ] `src/app/patient-list/components/PatientListContent.tsx`: implementar "Novo paciente" com service real e validacao de PII.
- [ ] `src/app/patient-list/components/PatientListContent.tsx`: evitar divisao por zero em progresso/semanas.
- [ ] `src/services/patientsApi.ts`: adicionar criar/editar paciente, paginacao server-side e filtros por tenant/unidade/status.
- [ ] Garantir que PII so aparece para roles com permissao adequada.

### Paciente 360

- [ ] `src/services/patient360Api.ts`: manter contrato real e remover fallback silencioso em producao.
- [ ] `src/app/paciente-360/components`: deep-link de abas, loading/error por aba e forbidden por permissao.
- [ ] `TabDocumentos`: remover email hardcoded `paciente@example.com` e resolver signatario real.
- [ ] `TabFinanceiro`: validar valores, loading de criacao e tratamento claro de falha Edge Function.
- [ ] `TabRelatorios`: substituir `mockReportDefinitions` por `reportsApi`.
- [ ] Tab chat: criar service real de threads/mensagens/unread.
- [ ] Tabs consultas/nutricao/pacotes/prescricoes: substituir derivacoes mock por tabelas ou Edge Functions.

### Agenda E Fila

- [ ] `src/app/clinic/agenda/components/AgendaContent.tsx`: usar `updateAppointmentStatus` nas transicoes visiveis.
- [ ] Implementar criar/editar/cancelar consulta com permissao e validacao.
- [ ] Definir timezone por tenant/unidade/profissional.
- [ ] Trocar tokens Tailwind indefinidos como `destructive` por classes existentes ou criar token global justificado.
- [ ] Exibir estados loading, empty, error e forbidden.
- [ ] Criar smoke: agendado -> chegou -> triagem -> atendimento -> checkout -> concluido.

### Atendimento, SOAP, Medidas E Labs

- [ ] `src/app/clinic/patients/[patientId]/encounter/page.tsx`: remover `onClick={() => {}}` das acoes auxiliares.
- [ ] Usar `encounterApi` para rascunho, finalizacao, timeline e audit log.
- [ ] Conectar `clinicalRecordsApi` para bioimpedancia, medidas, exames, sintomas e pendencias.
- [ ] Validar finalizacao de SOAP por role e por tenant.
- [ ] Gerar eventos de timeline auditaveis para medico/nutricao/fitness quando aplicavel.
- [ ] Smoke: abrir atendimento, salvar rascunho, finalizar SOAP, ver timeline no Paciente 360.

### Documentos E D4Sign

- [ ] `src/app/clinic/documents/page.tsx`: substituir painel hardcoded por service real de templates/documentos/eventos.
- [ ] `src/services/documentsApi.ts`: manter D4Sign apenas via Edge Function, sem segredo no browser.
- [ ] `document-signed-url`: validar tenant, paciente, documento e permissao antes de signed URL.
- [ ] Aplicar policy paciente/guardian antes de liberar portal para documentos.
- [ ] Confirmar assinatura com signatario real e resumo de payload seguro.
- [ ] Smoke local: fixtures D4Sign valid/invalid e idempotencia.
- [ ] Smoke sandbox autorizado: envio, webhook, reconciliacao e auditoria.

### Financeiro E Asaas

- [ ] `src/services/billingApi.ts`: validar contratos das RPCs e Edge Functions com schema atual.
- [ ] Corrigir `get_clinic_finance_overview()` se ainda usar assinatura/colunas divergentes do schema.
- [ ] Bloquear writes diretos client-side em tabelas provider-owned; usar Edge Function/RPC com checks.
- [ ] `webhook-asaas`: atualizar invoices/payments de forma idempotente e auditavel.
- [ ] Reduzir armazenamento de payload bruto ou criar retencao/redaction formal.
- [ ] UI do paciente e clinica: loading/error/forbidden e reconciliacao visual.
- [ ] Smoke: pagamento confirmado, vencido, cancelado, duplicado e token invalido.

### Programas E Pacotes

- [ ] `src/app/clinic/programs/components/ProgramsContent.tsx`: substituir `mockClinicPrograms` por `programsApi`.
- [ ] `src/app/clinic/programs/builder`: substituir `mockBuilderData` por dados reais de fases, servicos, checkins e equipe.
- [ ] Persistir rascunho, publicar, arquivar e clonar programa.
- [ ] Enrollment de paciente deve refletir no Paciente 360, agenda e financeiro.
- [ ] Validar permissoes para criar/publicar programas.

### Configuracoes Clinicas

- [ ] `src/app/clinic/settings/components/ClinicSettingsContent.tsx`: persistir unidades, equipe, roles, integracoes e programas padrao.
- [ ] Separar settings de tenant, unidade e usuario.
- [ ] Validar campos sensiveis e nunca exibir secrets de integracao.
- [ ] Implementar optimistic UI somente com rollback claro.
- [ ] Smoke: editar unidade, convidar equipe, alterar role e revisar auditoria.

### Admin Plataforma

- [ ] Usar `PlatformAdminGuard` de forma consistente ou remover duplicidade apenas em task dedicada.
- [ ] Criar shell admin compartilhado para evitar sidebars/topbars repetidas.
- [ ] `src/app/admin/components/AdminContent.tsx`: substituir tenants mockados por dados reais.
- [ ] `src/app/admin/tenants/[tenantId]`: substituir usuarios/unidades/audit/support/break-glass mockados.
- [ ] `src/app/admin/webhooks`: usar `admin_webhook_events.external_id` e permissao de plataforma apropriada.
- [ ] Break-glass precisa de justificativa, duracao, aprovacao/auditoria e revogacao.

### CRM, Estoque, Relatorios, Chat E Portal Paciente

- [ ] CRM: criar rota, service, funil, origem, eventos e conversao lead -> paciente.
- [ ] Estoque: criar rota, service, itens, lotes, validade, unidade, entrada/saida/ajuste e auditoria.
- [ ] Relatorios: criar `/clinic/reports`, filtros salvos, permissao `reports.read` e export seguro.
- [ ] Chat/notificacoes: criar envio real, unread count, retencao, moderacao e permissao por paciente/tenant.
- [ ] App paciente: liberar somente apos linkage, RLS propria, documentos/financeiro/chat limitados ao proprio paciente.

## Matriz De Mocks A Eliminar

- [ ] `src/services/mockApi.ts`: manter apenas para desenvolvimento explicito e fixtures, nunca fallback de producao.
- [ ] `src/services/mockSession.ts`: remover do fluxo real apos session/guards fechados.
- [ ] `src/data/mockData.ts`: separar fixtures de desenvolvimento de dados operacionais.
- [ ] `src/data/mockBuilderData.ts`: substituir por API de programas/builder.
- [ ] `src/services/adminApi.ts`: nao retornar mock quando backend falha em producao.
- [ ] `src/services/patientsApi.ts`: mock so com `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [ ] `src/services/dashboardApi.ts`: provider mock somente com `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [ ] `src/services/agendaApi.ts`: provider mock somente com `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [ ] `src/services/billingApi.ts`: mock financeiro so em dev e sem mascarar Edge Function real.
- [ ] `src/services/documentsApi.ts`: remover dependencia de `getPatientDocuments360` mock para producao.
- [ ] `src/app/admin/components/AdminContent.tsx`: remover tenants hardcoded.
- [ ] `src/app/admin/tenants/[tenantId]/components/TenantDetailContent.tsx`: remover dados internos mockados.
- [ ] `src/app/admin/webhooks/components/WebhookMonitorContent.tsx`: remover eventos mockados como fallback de producao.
- [ ] `src/app/clinic/settings/components/ClinicSettingsContent.tsx`: remover settings locais/mock.
- [ ] `src/app/clinic/programs/components/ProgramsContent.tsx`: remover `mockClinicPrograms`.
- [ ] `src/app/clinic/programs/builder`: remover `mockBuilderData`.
- [ ] `src/app/paciente-360/components/tabs/TabRelatorios.tsx`: remover `mockReportDefinitions`.
- [ ] `src/app/clinic/patients/[patientId]/encounter/page.tsx`: substituir mocks laterais por dados reais.

## Ordem Recomendada De Finalizacao

### Fase 0 - Baseline, CI E Higiene

- [x] Atualizar `docs/testing/BASELINE_CHECKS.md` com commit/branch atual.
- [x] Garantir `git diff --check`, `npm run type-check`, `npm run lint` e `npm run build` verdes.
- [x] Rodar fixtures locais em CI de PR: Patient360, D4Sign e Billing.
- [ ] Registrar ambiente Supabase local green sem secrets.
- [x] Adicionar checklist de browser smoke para rotas criticas.

### Fase 1 - Auth, RBAC, Guards E RLS

- [ ] Fechar `role_code`, `profiles.is_active`, `active_tenant_id` e permissao por tenant.
- [ ] Criar guard clinico server-side com estados `forbidden`, `no_workspace`, `session_error`.
- [ ] Fechar patient/guardian linkage antes do portal.
- [ ] Criar smoke RLS cross-tenant para paciente, documentos, financeiro, chat e relatorios.
- [ ] Remover fallback permissivo de mock/session.

### Fase 2 - Core Clinico Com Dados Reais

- [ ] Finalizar `patientsApi` com CRUD, PII, paginacao e filtros.
- [ ] Finalizar Dashboard real com KPIs, fila, alertas e quick actions.
- [ ] Finalizar `agendaApi` e UI de fila/transicoes.
- [ ] Finalizar Encounter/SOAP com medidas/labs/timeline/auditoria.
- [ ] Garantir loading/empty/error/forbidden em todas as rotas clinicas.

### Fase 3 - Paciente 360 Completo

- [ ] Rodar contrato real autorizado com token de staff.
- [ ] Rodar forbidden real com usuario sem `patients.read`.
- [ ] Rodar cross-tenant real tenant A/B.
- [ ] Completar tabs: resumo, timeline, consultas, documentos, financeiro, nutricao, pacotes, prescricoes, relatorios e chat.
- [ ] Remover mocks diretos apos fallback controlado.

### Fase 4 - Documentos E Assinatura

- [ ] Finalizar templates, variaveis permitidas e geracao pela UI.
- [ ] Implementar policy de leitura propria do paciente/guardian.
- [ ] Finalizar D4Sign sandbox com envio, webhook, idempotencia e auditoria.
- [ ] Criar monitor operacional de documentos pendentes/falhados.

### Fase 5 - Financeiro E Asaas

- [ ] Corrigir e validar RPCs financeiras contra schema real.
- [ ] Criar fluxo seguro de customer, invoice, subscription e payment link.
- [ ] Endurecer webhook para atualizar invoices/payments e registrar eventos de timeline.
- [ ] Rodar fixtures locais e sandbox autorizado.
- [ ] Implementar conciliacao e tela de divergencias.

### Fase 6 - Programas, Pacotes E Jornadas

- [ ] Criar `programsApi` e persistir builder.
- [ ] Ligar enrollment a paciente, agenda, financeiro e documentos obrigatorios.
- [ ] Criar check-ins reais e visiveis no Paciente 360.
- [ ] Validar permissao para publicacao/arquivamento.

### Fase 7 - Admin, Settings E Auditoria

- [ ] Persistir settings clinicas e admin tenants/users/units.
- [ ] Fechar admin shell e guards de plataforma.
- [ ] Implementar support/break-glass com auditoria forte.
- [ ] Criar eventos auditaveis para fluxos sensiveis.

### Fase 8 - Relatorios, Chat, Notificacoes E Portal

- [ ] Criar modulo de relatorios clinicos com export seguro.
- [ ] Criar chat/notificacoes reais com unread count.
- [ ] Liberar app paciente minimo depois de RLS/linkage.
- [ ] Criar retencao e moderacao para comunicacoes.

### Fase 9 - CRM E Estoque

- [ ] Criar CRM/leads com funil e conversao lead -> paciente.
- [ ] Criar estoque com itens, lotes, validade, unidades e movimentacoes.
- [ ] Integrar CRM e estoque a relatorios e auditoria.

### Fase 10 - Producao, Observabilidade E Operacao

- [ ] Configurar CI/CD, preview environments e variaveis por ambiente.
- [ ] Monitorar Edge Functions, webhooks, erros de frontend e jobs.
- [ ] Criar rotina de backup/restore testado.
- [ ] Criar runbook de incidente, rotacao de chaves e rollback.
- [ ] Realizar revisao final LGPD/security antes de producao.

## Sequencia De PRs Recomendada

- [ ] `chore/baseline-evidence-and-ci-fixtures`
- [ ] `fix/auth-rbac-guards-and-session-fail-closed`
- [ ] `test/rls-cross-tenant-smoke-suite`
- [ ] `fix/provider-owned-table-write-hardening`
- [ ] `feat/patients-crud-real-service`
- [ ] `feat/dashboard-real-actions-and-states`
- [ ] `feat/agenda-queue-status-transitions`
- [ ] `feat/encounter-clinical-records-foundation`
- [ ] `feat/patient360-real-tabs-completion`
- [ ] `feat/document-workspace-and-patient-policy`
- [ ] `feat/d4sign-sandbox-operational-flow`
- [ ] `feat/billing-rpcs-and-asaas-reconciliation`
- [ ] `feat/programs-builder-persistence`
- [ ] `feat/clinic-settings-persistence`
- [ ] `feat/platform-admin-real-data`
- [ ] `feat/reports-clinic-module`
- [ ] `feat/chat-notifications-foundation`
- [ ] `feat/patient-portal-linkage-minimum`
- [ ] `feat/crm-leads-foundation`
- [ ] `feat/inventory-foundation`
- [ ] `hardening/production-observability-security`

## Evidencia De Aceite Por PR

- [ ] `git diff --check`.
- [ ] `npm run type-check`.
- [ ] `npm run lint`.
- [ ] `npm run build`.
- [ ] Caminhos tocados listados no resumo do PR.
- [ ] Checks pulados justificados com motivo concreto e proximo passo.
- [ ] Teste de fixture aplicavel ao modulo.
- [ ] Browser smoke na rota tocada, quando houver UI.
- [ ] Teste de loading, empty, error e forbidden.
- [ ] Teste cross-tenant quando houver dado tenant-scoped.
- [ ] Confirmacao de que producao nao cai em mock.
- [ ] Atualizacao do runbook ou checklist afetado.
- [ ] Nenhum secret impresso, commitado ou movido para `NEXT_PUBLIC_*`.
- [ ] Riscos residuais e limitacoes conhecidas descritos antes do merge.

## Browser Smoke Obrigatorio Antes De Release

- [ ] `/auth/login`: login, erro de credencial, loading e redirecionamento por role.
- [ ] `/clinic/dashboard`: KPIs, fila, agenda, alertas, quick actions e erro backend.
- [ ] `/clinic/patients`: lista, filtro, busca, novo paciente, empty e erro.
- [ ] `/clinic/patients/[patientId]`: Paciente 360, abas e permissoes.
- [ ] `/clinic/patients/[patientId]/encounter`: rascunho, finalizar SOAP, timeline.
- [ ] `/clinic/agenda`: criar, alterar status, cancelar, fila e timezone.
- [ ] `/clinic/documents`: templates, gerar, assinar, signed URL e erro.
- [ ] `/clinic/financeiro`: resumo, cobrancas, inadimplencia e conciliacao.
- [ ] `/clinic/programs`: lista, builder, publicar e enrollment.
- [ ] `/clinic/settings`: salvar unidade, equipe, roles e integracoes.
- [ ] `/admin`: guard plataforma e dashboard real.
- [ ] `/admin/tenants`: listagem, detalhe, usuarios, unidades e flags.
- [ ] `/admin/webhooks`: eventos unificados, filtros, retry/triagem e permissao.
- [ ] `/patient`: acesso bloqueado ate linkage; depois portal proprio com dados scoped.

## Decisoes Humanas Pendentes

- [ ] Confirmar se o portal paciente entra no MVP ou fica explicitamente bloqueado ate depois do core clinico.
- [ ] Confirmar se D4Sign e Asaas devem ser requisitos do MVP ou entram como fase sandbox antes da producao.
- [ ] Definir politica de retencao para raw payloads de Asaas e logs de webhooks.
- [ ] Definir se teleconsulta/prescricao digital/TISS entram no roadmap curto ou ficam fora do escopo inicial.
- [ ] Definir o nivel de certificacao/compliance desejado para prontuario, assinatura digital e guarda documental.
- [ ] Definir escopo inicial de CRM e estoque: minimo operacional ou paridade com concorrentes.
- [ ] Definir proprietario de dados/controlador-operador e textos juridicos de privacidade/termos.

## Checklist De Pronto Para Producao

- [ ] Todos os modulos MVP estao N4 ou N5.
- [ ] Todos os mocks de producao foram removidos ou bloqueados por flag segura.
- [ ] Todos os runbooks criticos foram testados em ambiente limpo.
- [ ] Supabase local e ambiente remoto aplicam schema sem erro.
- [ ] RLS cross-tenant passa para todas as familias de dados.
- [ ] Edge Functions tem secrets segregados, logs redigidos e retries/idempotencia.
- [ ] Backups e restore foram testados.
- [ ] CI bloqueia type, lint, build, diff e fixtures.
- [ ] Monitoramento de frontend, backend, Edge Functions e webhooks esta ativo.
- [ ] Politica de privacidade, termos, DPA/operacao LGPD e canal de suporte existem.
- [ ] Treinamento operacional interno cobre admin, clinica, financeiro, documentos e incidentes.
- [ ] Release notes registram limitacoes conhecidas e features fora do MVP.

## Como Manter Este Documento

- Atualizar o nivel do modulo apenas quando houver evidencia de teste no PR.
- Nunca marcar N4/N5 se a UI ainda tiver mock silencioso, acao no-op ou ausencia de forbidden/error state.
- Linkar PRs e commits nos runbooks especificos, nao duplicar detalhes longos aqui.
- Quando migrations mudarem, atualizar runbook Supabase, scripts, types e checks no mesmo PR.
- Quando provider sandbox for autorizado, registrar data, ambiente, comandos e resultado sem secrets.
- Revisar este documento a cada fase concluida e antes de abrir uma branch grande nova.
