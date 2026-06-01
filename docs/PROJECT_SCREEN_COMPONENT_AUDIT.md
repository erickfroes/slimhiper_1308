# Auditoria funcional tela a tela e componente a componente

Data da análise: 2026-06-01.

Esta auditoria documenta o estado funcional observado no código do projeto SlimHiper. A avaliação é estática: foi feita pela leitura das rotas, componentes, serviços, clientes Supabase e contratos locais. Não foram lidos arquivos `.env`, não foram chamados provedores externos, não foram executadas migrações ou bootstraps Supabase e não foi feita validação visual em navegador.

## Legenda de status

| Status | Significado |
| --- | --- |
| **Funcional integrado** | A tela ou serviço possui UI, carregamento, estados de erro/vazio e integração real com Supabase, RPC, Edge Function ou tabela. Ainda depende de ambiente configurado e permissões/RLS. |
| **Funcional com fallback mock** | A tela ou serviço possui caminho real e também caminho mock controlado por `NEXT_PUBLIC_USE_MOCK_DATA` ou fallback local. Bom para demonstração, mas requer validação em backend real. |
| **Parcial / contrato dependente** | A UI está implementada, mas a operação principal depende fortemente de RPCs, Edge Functions, políticas RLS ou variáveis que não foram executadas nesta análise. |
| **Estático / informativo** | A tela renderiza conteúdo fixo ou leitura simples, sem operação de escrita relevante. |
| **Redirecionamento / guarda** | A rota só redireciona ou protege acesso. |

## Arquitetura funcional observada

- O app usa Next.js App Router com layouts separados para clínica, admin, portal do paciente e autenticação.
- O acesso é protegido no `middleware`, que atualiza sessão Supabase, redireciona usuários não autenticados para `/auth/login` e direciona perfis para admin, clínica, paciente ou `/no-workspace`.
- O shell clínico (`DashboardShell`) centraliza navegação lateral, busca de pacientes, logout, resumo de comunicações, menus de mensagens/notificações e marcação de itens como lidos.
- O shell admin (`AdminShell`) centraliza navegação de plataforma, colapso de sidebar e cabeçalho com refresh.
- Os serviços frontend seguem o padrão de envelope `{ data, error }` ou lançam erro em pontos antigos; vários módulos têm fallback mock para desenvolvimento.
- Integrações reais usam Supabase browser/server clients, RPCs, Edge Functions ou chamadas diretas a tabelas com RLS.

## Rotas públicas, autenticação e guardas

| Rota / arquivo | Status | O que está funcional | Dependências e observações |
| --- | --- | --- | --- |
| `/` — `src/app/page.tsx` | Redirecionamento / guarda | Redireciona sempre para `/auth/login`. | Sem UI própria. |
| `/auth/login` — `src/app/auth/login/page.tsx` | Funcional integrado | Consulta contexto do usuário e redireciona para admin, dashboard clínico, portal paciente ou workspace pendente; se não houver sessão, renderiza `AuthForm`. | Depende de `getCurrentUserContext` e Supabase Auth configurado. |
| `/no-workspace` — `src/app/no-workspace/page.tsx` | Estático / informativo | Mostra mensagem para usuário autenticado sem workspace ativo ou vínculo paciente. | Ações ficam em `NoWorkspaceActions`. |
| `NoWorkspaceActions` | Funcional integrado | Oferece ação de logout/retorno conforme sessão cliente. | Depende do cliente Supabase browser quando disponível. |
| `src/middleware.ts` | Redirecionamento / guarda | Protege `/admin`, `/clinic` e `/patient`; resolve sessão e escolhe destino com base em permissões, role e vínculo ativo. | Em erro de sessão clínica, permite resposta para evitar bloqueio indevido em alguns casos; requer atenção em testes de autorização. |
| `/api/auth/app-session` | Funcional integrado | Retorna sessão sanitizada, permissões, destino sugerido e headers de observabilidade. | O campo `canAccessPatientPortal` está fixo como `false` neste endpoint, mesmo existindo cálculo em sessão em outros pontos; isso deve ser revisado se o portal paciente depender desta rota. |
| `/api/health` | Funcional integrado | Healthcheck dinâmico com status de Next, variáveis públicas Supabase, política de mock data e metadados de release. | Não testa conexão real com banco; sinaliza configuração. |

## Área clínica — rotas e telas

| Tela / rota | Status | O que está funcional | Componentes principais | Serviços/contratos usados |
| --- | --- | --- | --- | --- |
| `/clinic/dashboard` | Funcional com fallback mock | Dashboard operacional com métricas, fila, agenda do dia, alertas e pacientes que precisam de revisão. | `DashboardShell`, `DashboardContent`, cards, charts e badges. | `dashboardApi`, tabelas clínicas/financeiras/comunicações e RPC `get_crm_inventory_dashboard_insights`; fallback mock. |
| `/clinic/patients` | Funcional com fallback mock | Lista de pacientes com busca, filtros, ordenação, paginação, seleção em massa, modal de criação/edição, links para Paciente 360 e ações rápidas. | `PatientListContent`, `PatientFormModal`, `SortableHeader`, `StatusBadge`, `EmptyState`, `SkeletonTableRow`. | `patientsApi`, tabelas `patients`, `patient_pii`, programas, invoices, alertas e agenda; fallback mock. |
| `/clinic/patients/[patientId]` | Funcional com fallback mock | Abre o Paciente 360 dentro do shell clínico usando `patientId` da rota e contexto do usuário. | `Patient360Content`, `Patient360Tabs` e abas. | `patient360Api`, `clinicalRecordsApi`, `documentsApi`, `billingApi`, `agendaApi`, `chatApi`, `nutritionApi`, `reportsApi`, conforme aba. |
| `/clinic/patients/[patientId]/encounter` | Funcional com fallback mock | Tela de atendimento SOAP com contexto do paciente, rascunho e finalização. | Página própria de encounter. | `encounterApi`, tabelas `encounters`, `soap_notes`, timeline e auditoria; fallback mock. |
| `/clinic/agenda` | Funcional com fallback mock | Agenda/fila com carregamento diário, atualização de status e criação/edição/cancelamento de consultas. | `AgendaContent`. | `agendaApi`, tabelas `appointments`, `queue_events`, `patient_pii`, `profiles`; fallback mock. |
| `/clinic/programs` | Funcional com fallback mock | Lista programas/pacotes, permite mudar status, clonar e matricular paciente. | `ProgramsContent`. | `programsApi`, RPCs `get_clinic_programs`, `update_program_status`, `clone_program`, `enroll_patient_in_program`; fallback mock. |
| `/clinic/programs/builder` | Funcional com fallback mock | Builder multi-etapas para pacote/programa com dados gerais, fases, serviços, check-ins, documentos, entitlements, financeiro, equipe e revisão. | `ProgramBuilderContent` e steps `StepDadosGerais`, `StepFases`, `StepServicos`, `StepCheckins`, `StepDocumentos`, `StepEntitlements`, `StepFinanceiro`, `StepEquipe`, `StepRevisao`. | `programsApi`, RPCs `get_program_builder_options` e `upsert_program_from_builder`; fallback mock. |
| `/clinic/documents` | Parcial / contrato dependente | Workspace de documentos clínicos com templates, geração, envio para assinatura, URL assinada e liberação ao paciente. | `ClinicDocumentsContent`, `DocumentStatusBadge`, estados de loading/erro. | `clinicDocumentsApi`, tabelas `document_templates`, `generated_documents`, `d4sign_events`; Edge Functions via serviços relacionados. Sem fallback mock explícito neste serviço. |
| `/clinic/financeiro` | Funcional com fallback mock | Visão financeira da clínica, reconciliação, cobranças e indicadores. | `ClinicFinanceiroContent`, cards de status financeiro. | `billingApi`, RPCs `get_clinic_finance_overview`, `get_clinic_finance_reconciliation`; fallback mock. |
| `/clinic/reports` | Parcial / contrato dependente | Catálogo e execução de relatórios clínicos/exportações. | `ClinicReportsContent`. | `clinicReportsApi`, Edge Function `clinic-reports`; depende de contrato de exportação. |
| `/clinic/settings` | Funcional integrado | Configurações da clínica e unidades, com leitura e atualização via RPC. | `ClinicSettingsContent`. | `clinicSettingsApi`, RPCs `get_clinic_settings_snapshot`, `update_clinic_settings`, `upsert_clinic_unit`. |
| `/clinic/inbox` | Funcional com fallback mock | Inbox de comunicações, notificações, chat threads, marcar lido, arquivar, atribuir e alterar status. | `ClinicInboxContent`, menus do `DashboardShell`. | `notificationsApi`, RPCs de comunicações; fallback mock. |
| `/clinic/crm` | Funcional com fallback mock | Pipeline CRM com leads, detalhe, criação/edição, movimentação de etapa, atividade, tarefa, conversão em paciente e notificações operacionais. | `CrmPipelineContent`. | `crmApi`, RPCs `list_crm_leads`, `get_crm_lead_detail`, `create_crm_lead`, `update_crm_lead`, `move_crm_lead_stage`, `convert_crm_lead_to_patient`; fallback mock. |
| `/clinic/inventory` | Funcional com fallback mock | Operações de estoque: snapshot, itens, lotes, movimentações, transferências e alertas de estoque/vencimento. | `InventoryOperationsContent`. | `inventoryApi`, RPCs `list_inventory_operations_snapshot`, `upsert_inventory_item`, `create_inventory_lot`, `create_inventory_movement`, `transfer_inventory_stock`; fallback mock. |
| `/patient-list` | Redirecionamento / guarda | Redireciona rota legada para `/clinic/patients`. | Nenhum componente próprio além da rota. | N/A. |
| `/paciente-360` | Redirecionamento / guarda | Redireciona rota legada para `/clinic/patients`. | Nenhum componente próprio além da rota. | N/A. |

## Paciente 360 — container e abas

| Componente | Status | O que está funcional | Dependências e pontos de atenção |
| --- | --- | --- | --- |
| `Patient360Content` | Funcional com fallback mock | Orquestra carregamento do resumo, estado de loading/erro, cabeçalho do paciente e tabs. | Usa `getPatient360Summary`; depende de `patientId` ou mock. |
| `Patient360Tabs` | Funcional | Controla navegação entre abas e renderização condicional. | Estado local; repassa permissões e snapshot. |
| `TabResumo` | Funcional com fallback mock | Mostra resumo, KPIs, alertas, próximas ações, evolução e cards principais. | Consome dados do snapshot 360 e componentes compartilhados. |
| `TabTimeline` | Funcional com fallback mock | Lista eventos cronológicos do paciente. | `getPatientTimeline`; Edge Function `patient-timeline` ou mock. |
| `TabConsultas` | Funcional com fallback mock | Agenda/consultas do paciente e histórico básico. | `agendaApi.getPatientAppointments`; dependente de agenda real. |
| `TabDocumentos` | Funcional com fallback mock | Lista documentos do paciente, gera, envia assinatura e obtém link assinado. | `documentsApi`; depende de D4Sign/Edge Functions e permissões de documento. |
| `TabFinanceiro` | Funcional com fallback mock | Mostra situação financeira, faturas e ações de cobrança. | `billingApi.getPatientFinancialSummary`; ações Asaas dependem de Edge Functions/provedor autorizado. |
| `TabNutricao` | Funcional com fallback mock | Plano nutricional via Edge Function ou mock. | `nutritionApi`, Edge Function `patient-nutrition-plan`. |
| `TabPrescricoes` | Parcial / permissão dependente | Exibe prescrições/área clínica conforme permissão médica. | Deve respeitar `canViewMedicalPrescriptions`; validar com perfis reais. |
| `TabPacotes` | Funcional com fallback mock | Exibe pacotes/programas, progresso e status. | Dados do snapshot 360/programas. |
| `TabRelatorios` | Funcional com fallback mock | Lista definições de relatórios disponíveis ao paciente. | `reportsApi`, Edge Function `patient-reports` ou mock. |
| `TabChat` | Funcional com fallback mock | Thread de comunicação paciente-clínica, envio de mensagem e marcação de leitura. | `chatApi`; depende de tabelas de chat e RLS. |

## Portal do paciente

| Tela / componente | Status | O que está funcional | Dependências e observações |
| --- | --- | --- | --- |
| `/patient` | Funcional integrado | Exige Supabase server client e usuário autenticado, valida RPC `get_patient_portal_snapshot` e renderiza portal; se a RPC negar, mostra tela de acesso não liberado. | A primeira chamada valida acesso, mas descarta o payload e o conteúdo busca novamente pelo serviço. |
| `PatientPortalContent` | Funcional integrado | Carrega snapshot do portal, mostra documentos, finanças, check-ins, notificações e chat/mensagens do paciente. | `patientPortalApi` usa RPCs `get_patient_portal_snapshot`, `send_patient_portal_message`, `submit_patient_portal_checkin`, `mark_patient_portal_notification_read`. |

## Área admin / plataforma

| Tela / rota | Status | O que está funcional | Componentes principais | Serviços/contratos usados |
| --- | --- | --- | --- | --- |
| `/admin` | Funcional integrado | Visão geral da plataforma com tenants, webhooks, finanças, uso, storage, integrações, segurança, suporte e auditoria a partir de snapshot. | `AdminContent`, `AdminShell`, `StatCard`, tabelas e badges internos. | `adminApi.getPlatformAdminSnapshot`, RPCs `list_platform_tenants` e `list_platform_webhook_events`. |
| `/admin/tenants` | Funcional integrado | Gestão de tenants com listagem, filtros/visão operacional e navegação para detalhe. | `TenantsManagementContent`. | `adminApi.listTenants`. |
| `/admin/tenants/[tenantId]` | Parcial / contrato dependente | Detalhe do tenant com overview, usuários, integrações, suporte, break-glass e auditoria; permite convidar/editar vínculos, solicitar/encerrar suporte e fluxos break-glass. | `TenantDetailContent` e subcomponentes internos. | `adminApi.getTenantDetail`, RPCs admin e rota `/api/admin/tenants/[tenantId]/invitations`. Depende de service role para convite. |
| `/admin/billing` | Funcional integrado | Renderiza seção financeira do `AdminContent`. | `AdminContent`. | Snapshot admin. |
| `/admin/integrations` | Funcional integrado | Renderiza seção de integrações do `AdminContent`. | `AdminContent`. | Snapshot admin. |
| `/admin/security` | Funcional integrado | Renderiza seção de segurança do `AdminContent`. | `AdminContent`. | Snapshot admin. |
| `/admin/support` | Funcional integrado | Renderiza seção de suporte do `AdminContent`. | `AdminContent`. | Snapshot admin. |
| `/admin/audit` | Funcional integrado | Renderiza seção de auditoria do `AdminContent`. | `AdminContent`. | Snapshot admin. |
| `/admin/webhooks` | Funcional integrado | Monitor de eventos de webhook Asaas/D4Sign com status, filtros e resumo. | `WebhookMonitorContent`. | `adminApi.listWebhookSummaries`. |
| `/admin/observability` | Estático / informativo | Dashboard estático de monitores, alertas e sinais operacionais. | `ObservabilityDashboardContent`, `AdminShell`. | Não consulta backend diretamente. |
| `AdminLayout` | Redirecionamento / guarda | Resolve sessão server-side, calcula autorização e envolve páginas com `PlatformAdminGuard`. | `getCurrentAppSession`, `canAccessPlatformAdminFromSession`. |
| `PlatformAdminGuard` | Funcional integrado | Revalida autorização no cliente por `/api/auth/app-session`, redireciona não autenticados e exibe bloqueio quando sem permissão. | Depende do endpoint de sessão. |
| `/api/admin/tenants/[tenantId]/invitations` | Funcional integrado | Convite auditável de usuário para tenant com validação de role, tenant, unidade, usuário auth, profile, membership e audit log. | Usa service-role server-side e Supabase Auth Admin. Não deve ser chamado sem ambiente real e autorização. |

## Componentes compartilhados

| Componente | Status | Função funcional | Observações |
| --- | --- | --- | --- |
| `DashboardShell` | Funcional integrado | Layout clínico com sidebar responsiva, topbar, busca por paciente, logout, mensagens/notificações e polling de comunicações. | Uma peça crítica: qualquer falha em `notificationsApi` deve ficar isolada para não quebrar as telas filhas. |
| `PageHeader` | Funcional | Cabeçalho padrão com título, descrição e ações. | Usado por páginas clínicas. |
| `StatusBadge` | Funcional | Badge visual para status clínicos/financeiros/programas. | Verificar se todos os status do domínio têm mapeamento. |
| `DocumentStatusBadge` | Funcional | Badge para documentos pendentes, assinados, vencidos, cancelados e em análise. | Tem fallback genérico para status desconhecido. |
| `FinancialStatusCard` | Funcional | Card de resumo financeiro. | Consome status e valores do domínio. |
| `PatientHeaderCard` | Funcional | Cabeçalho do Paciente 360 com identificação e status. | Deve receber dados já sanitizados. |
| `QuickActionsCard` | Funcional | Ações rápidas de fluxo clínico. | Links dependem de rotas existentes. |
| `PackageProgressCard` | Funcional | Progresso de pacotes/programas. | Dados vêm do snapshot do paciente. |
| `TimelineEventCard` | Funcional | Renderização de evento de timeline. | Depende de normalização de evento. |
| `AlertPanel` | Funcional | Lista alertas ativos, com severidade e link opcional. | Filtra alertas resolvidos. |
| `EmptyState` | Funcional | Estado vazio reutilizável. | Usado em listas/tabelas. |
| `LoadingSkeleton` / `SkeletonTableRow` | Funcional | Skeletons para carregamento. | Usado em pacientes e fallback de telas. |
| `AdherenceChart` | Funcional | Gráfico Recharts de aderência. | Client component. |
| `OccupancyChart` | Funcional | Gráfico radial Recharts de ocupação. | Client component. |
| `WeightEvolutionChart` | Funcional | Gráfico de evolução de peso com linha de referência. | Atenção se `data` vier vazio, pois cálculos com `Math.min/Math.max` precisam dados válidos. |
| `AuthForm` | Funcional integrado | Login com Supabase Auth e redirecionamento pós-login. | Depende de Supabase public config. |
| `AppIcon` | Funcional | Wrapper dinâmico para Heroicons com fallback. | Usa `any` para props dinâmicas; lint atual aceita. |
| `AppImage` | Funcional | Wrapper de `next/image` com fallback, loading e erro. | URLs externas ficam `unoptimized`. |
| `AppLogo` | Funcional | Logo por imagem ou ícone fallback. | Usado nos shells. |

## Serviços frontend e grau de integração

| Serviço | Status | Funções expostas / responsabilidade | Backend usado |
| --- | --- | --- | --- |
| `adminApi` | Funcional integrado | Snapshots admin, tenants, webhooks, suporte, break-glass, atualização de membership e convite. | RPCs admin de plataforma e rota server para convite. |
| `agendaApi` | Funcional com fallback mock | Agenda do dia, consultas do paciente, criação/edição/cancelamento e status. | Tabelas `appointments`, `queue_events`, `patients`, `patient_pii`, `profiles`. |
| `billingApi` | Funcional com fallback mock | Resumo financeiro do paciente, overview/reconciliação da clínica e criação de customer/invoice/subscription. | RPCs financeiros; ações Asaas dependem de funções/contratos. |
| `chatApi` | Funcional com fallback mock | Thread de chat, envio de mensagem e marcação de leitura. | Tabelas de chat e RPC `mark_thread_read`. |
| `clinicDocumentsApi` | Parcial / contrato dependente | Workspace de templates/documentos, geração, assinatura, URL assinada e liberação. | Tabelas de documentos e eventos D4Sign; requer funções relacionadas configuradas. |
| `clinicReportsApi` | Parcial / contrato dependente | Definições, execução, status e download/exportação de relatório clínico. | Edge Function `clinic-reports`. |
| `clinicSettingsApi` | Funcional integrado | Snapshot e atualização de configurações/unidades. | RPCs de settings. |
| `clinicalRecordsApi` | Funcional com fallback mock | Medidas, bioimpedância, pedidos/resultados laboratoriais. | Tabelas clínicas, timeline e audit logs. |
| `crmApi` | Funcional com fallback mock | Pipeline, lead detail, tarefas, atividades, conversão e notificações. | RPCs CRM/inventory. |
| `dashboardApi` | Funcional com fallback mock | Métricas, fila, agenda, alertas e revisão. | Tabelas clínicas/financeiras/comunicações e RPC de insights. |
| `documentsApi` | Funcional com fallback mock | Documentos do paciente, geração, assinatura e URL assinada. | Edge Functions/documentos D4Sign. |
| `encounterApi` | Funcional com fallback mock | Contexto de atendimento, salvar rascunho SOAP e finalizar. | Tabelas `encounters`, `soap_notes`, timeline e auditoria. |
| `inventoryApi` | Funcional com fallback mock | Snapshot, itens, lotes, movimentos, transferências e notificações. | RPCs de inventário. |
| `notificationsApi` | Funcional com fallback mock | Resumo de comunicações, inbox, marcar lido, arquivar, atribuir e status de thread. | RPCs de comunicações. |
| `nutritionApi` | Funcional com fallback mock | Plano nutricional do paciente. | Edge Function `patient-nutrition-plan`. |
| `patient360Api` | Funcional com fallback mock | Resumo 360 e timeline. | Edge Functions `patient-360-summary` e `patient-timeline`. |
| `patientPortalApi` | Funcional integrado | Snapshot do portal, mensagem, check-in e notificação lida. | RPCs do portal paciente. |
| `patientsApi` | Funcional com fallback mock | Lista, snapshot de formulário, criação e atualização de paciente. | Tabelas `patients`, `patient_pii`, programas, invoices e alertas. |
| `programsApi` | Funcional com fallback mock | Programas, opções do builder, salvar draft, status, clone e matrícula. | RPCs de programas. |
| `reportsApi` | Funcional com fallback mock | Definições de relatórios do paciente. | Edge Function `patient-reports`. |
| `mockApi` / `mockSession` | Funcional mock | Dados e permissões de desenvolvimento. | Não deve mascarar validações de produção. |

## Supabase, RLS e integrações externas

- Há migrações para core auth/RBAC, Patient 360, documentos/D4Sign, billing/Asaas, programas, reports, comunicações, admin, CRM e inventário.
- Edge Functions presentes: documentos, D4Sign, Asaas, relatórios, patient 360/timeline, nutrição e observabilidade clínica.
- Scripts Supabase de contrato/smoke existem, mas muitos podem depender de variáveis reais e/ou mutar dados; não foram executados nesta análise.
- D4Sign e Asaas não foram chamados. Qualquer validação funcional real desses fluxos exige ambiente autorizado, secrets configurados e dados de teste controlados.

## Principais achados e riscos funcionais

1. **Portal paciente no endpoint de sessão:** `/api/auth/app-session` fixa `canAccessPatientPortal` como `false`, enquanto o middleware usa `session.canAccessPatientPortal()`. Isso pode gerar divergência em guardas cliente que dependem desse endpoint.
2. **Validação real depende de Supabase configurado:** a maior parte das telas é funcional no código, mas muitas operações dependem de RPCs, RLS e Edge Functions não executadas aqui.
3. **Mocks são amplos e úteis, mas podem esconder falhas de contrato:** dashboard, pacientes, agenda, CRM, inventário, programas, 360, chat e billing possuem fallback mock. Recomenda-se rodar smokes com `NEXT_PUBLIC_USE_MOCK_DATA=false` antes de produção.
4. **Documentos, relatórios e provedores são áreas de maior dependência externa:** geração, assinatura, signed URLs, Asaas e D4Sign precisam testes controlados e não devem ser validados por chamadas reais sem autorização explícita.
5. **Componente `WeightEvolutionChart` deve receber dados não vazios:** se chamado com array vazio, os cálculos de mínimo/máximo podem produzir valores inválidos.
6. **Admin tenant detail é funcionalmente rico e sensível:** convites, suporte e break-glass exigem testes de permissão, audit log, service-role server-side e trilha de justificativa.

## Recomendações de validação por prioridade

1. Rodar `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` em cada mudança de código.
2. Validar browser smoke das rotas clínicas principais: `/clinic/dashboard`, `/clinic/patients`, `/clinic/patients/[id]`, `/clinic/agenda`, `/clinic/financeiro` e `/clinic/inbox`.
3. Validar browser smoke admin: `/admin`, `/admin/tenants`, `/admin/tenants/[tenantId]`, `/admin/webhooks` e `/admin/observability`.
4. Em ambiente de teste real, executar contratos Supabase autorizados para auth/RBAC, Patient 360, documentos, billing, reports, CRM/inventory e comunicações.
5. Revisar divergência do portal paciente em `/api/auth/app-session` antes de depender dele para navegação cliente.
6. Para produção, garantir `NEXT_PUBLIC_USE_MOCK_DATA` desabilitado e healthcheck sem status `fail`.

## Escopo não validado nesta rodada

- Não houve execução de browser smoke por rota.
- Não houve execução de scripts Supabase, migrações, bootstraps ou testes que exigem ambiente real.
- Não houve chamada a Asaas, D4Sign ou qualquer provider externo.
- Não houve inspeção de dados reais, pacientes reais, payloads reais ou arquivos `.env`.
