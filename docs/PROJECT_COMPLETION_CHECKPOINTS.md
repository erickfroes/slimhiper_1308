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

## Execucao Atual

- Data: 2026-05-31 19:43 -03:00.
- Branch: `test/asaas-billing-contract-hardening`.
- Commit base: `bb190f1`.
- Alvo aprovado: MVP clinico.
- Ambiente aprovado: local seguro com migrations/bootstraps e sandbox provider
  autorizados quando o alvo estiver segregado.
- Lote em andamento: Fase 6 - Programas/pacotes concluida para MVP local. As
  migrations novas `20260531180000_140_programs_builder_contract.sql` e
  `20260531181000_141_program_checkin_template_fk_fix.sql`, mais
  `20260531182000_142_program_enrollment_operational_reflections.sql`,
  adicionam metadados do builder em `programs`, `program_team_members`,
  `patient_program_checkins`, RLS e RPCs para listar opcoes, salvar/publicar,
  arquivar, clonar e matricular paciente em programa. O enrollment agora cria
  consulta inicial em `appointments`, cobranca local pendente em
  `patient_invoices` quando ha preco, tarefas em `patient_tasks` para documentos
  obrigatorios e check-ins da jornada, sem chamar Asaas/D4Sign. `/clinic/programs`
  agora usa `programsApi`; o builder persiste rascunho/publicacao por RPC e le
  equipe e templates reais do tenant; `patient-360-summary` retorna check-ins
  reais do enrollment e `TabPacotes` os exibe. Smoke local Fase 6 passou com
  `test-programs-phase6-local-smoke.mjs`.
- Lote concluido anteriormente: Fase 3 - Paciente 360 completo para MVP local.
  As Edge Functions `patient-360-summary` e `patient-timeline` preservam eventos
  `exame_solicitado` e `exame_resultado_recebido`; os services Patient 360,
  documentos, nutricao, chat, agenda e billing carregam mocks somente quando
  `NEXT_PUBLIC_USE_MOCK_DATA=true`. O smoke
  `node scripts/supabase/test-patient360-local-real-smoke.mjs` semeia dados
  locais deterministas, autentica staff e usuario sem `patients.read`, roda
  `test-patient360-contract.mjs --mode=real` com forbidden e cross-tenant reais,
  e valida abas resumo/timeline/consultas/documentos/financeiro/nutricao/
  pacotes/prescricoes/relatorios/chat por Edge Functions, RLS e RPC.
- Lote anterior: Fase 2 - Core clinico com dados reais. `patientsApi` possui
  CRUD/snapshot/PII/paginacao/filtros, dashboard usa KPIs reais, agenda cria/
  edita/cancela/move consultas, e Encounter/SOAP cria medidas, bioimpedancia,
  exames, audit log e timeline clinica. Smoke local mutavel
  `node scripts/supabase/test-clinical-core-contract.mjs` passou e limpou os
  dados ao final. Fase 1 - Auth/RBAC/guards/RLS tambem esta concluida para MVP
  local. Fase 8/8 de Browser smoke
  local foi registrada. Fase 7/8 de Admin/settings minimos ficou parcialmente
  implementada: settings clinicas agora
  usam snapshot RPC sanitizado, service real e UI sem mocks locais; unidade
  persiste via RPC auditada; tenant settings persistem perfil, branding, portal,
  financeiro, integracoes sem secrets e programas padrao. Equipe e RBAC aparecem
  por dados reais, mas convites e alteracao de roles seguem bloqueados ate
  mutators auditados. Migrations `070`, `080`, `090` e `100` foram aplicadas no
  Supabase local; bootstrap core foi reexecutado localmente; contrato real local
  de settings passou por RPC/HTTP. Linkage paciente/guardian agora tem RLS
  propria para leitura do vinculo ativo e smoke local cross-patient; o portal
  paciente segue fail-closed ate existir UI/contratos de dados scoped.
- Checks ja executados neste lote: `npx supabase migration up --local
--include-all`, bootstrap core local, `npm run type-check`,
  `npm run lint`, `npm run build`, `git diff --check`, fixtures locais
  Patient360/D4Sign/Billing, contrato real local Patient360, contrato real local
  documentos, contrato RPC local de settings (`get_clinic_settings_snapshot`,
  `update_clinic_settings`, `upsert_clinic_unit`), smoke HTTP autenticado de
  `/api/auth/app-session`, `/clinic/dashboard`, `/clinic/patients`,
  `/clinic/agenda`, `/clinic/documents`, `/clinic/financeiro`,
  `/clinic/settings`, paciente 360 demo e encounter demo, redirects
  fail-closed de `/admin`, `/admin/tenants`, `/admin/webhooks` e `/patient`
  para usuario clinico, smoke Browser anonimo de login/guards, e smoke local do
  guard clinico server-side em `/clinic/dashboard` e `/clinic/settings` com
  estados anonimo, workspace valido, no-workspace, forbidden e perfil inativo,
  smoke RLS cross-tenant automatizado para paciente, documentos, financeiro,
  chat e relatorios, migration local `110` e smoke local
  `test-patient-linkage-contract.mjs` para paciente/guardian,
  `node scripts/supabase/test-clinical-core-contract.mjs`, smoke HTTP anonimo
  de `/auth/login`, `/clinic/dashboard`, `/clinic/patients`, `/clinic/agenda`
  e `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/encounter`. Neste
  lote Fase 3 passaram o smoke local-real de Patient 360
  (`scripts/supabase/test-patient360-local-real-smoke.mjs`) e
  `npm run type-check` apos os ajustes de services/Edge Functions. Neste lote
  Fase 4 passaram `npx supabase migration up --local --include-all`,
  `node scripts/supabase/test-documents-phase4-local-smoke.mjs`,
  fixtures Patient360/D4Sign/Billing, `npm run type-check`, `npm run lint`,
  `npm run build`, `git diff --check`, e smoke HTTP local: `/auth/login` 200 e
  `/clinic/documents` 307 para `/auth/login` sem sessao. O smoke com
  `RUN_D4SIGN_SANDBOX_SEND=true` e `D4SIGN_AUTO_DISCOVER_SAFE=true` tambem foi
  executado e chegou ao provider, mas falhou corretamente em
  `provider_safe_not_found` porque a conta sandbox nao retornou cofre.
- Neste lote Fase 5 passaram `npx supabase migration up --local --include-all`,
  `node scripts/supabase/test-billing-reconciliation-local-smoke.mjs`,
  fixtures Patient360/D4Sign/Billing, `node --check
  scripts/supabase/test-billing-contract.mjs`, e
  `REQUIRE_ASAAS_PROVIDER_SUCCESS=true node
  scripts/supabase/test-billing-contract.mjs` com paciente local novo e
  `TEST_PATIENT_CPF_CNPJ` dummy, validando customer, invoice e subscription 200
  contra sandbox Asaas sem expor IDs provider.
- Neste lote Fase 6 passaram `npx supabase migration up --local --include-all`,
  `node scripts/supabase/test-programs-phase6-local-smoke.mjs`,
  `node scripts/supabase/test-patient360-local-real-smoke.mjs`, fixtures
  Patient360/D4Sign/Billing, `node --check` dos scripts tocados,
  `npm run type-check`, `npm run lint`, `npm run build` e Browser smoke anonimo
  de `/auth/login`, `/clinic/programs`, `/clinic/programs/builder` e Paciente
  360 pacotes com redirect fail-closed para `/auth/login`. A revalidacao final
  aplicou tambem a migration
  `20260531182000_142_program_enrollment_operational_reflections.sql` e o smoke
  Fase 6 confirmou appointment, invoice local e tarefa de documento obrigatorio
  criados pelo enrollment.
- Skips deliberados: valores de secrets nao foram impressos; `.env` foi usado
  apenas em processo local para bootstrap/smoke sem exibir valores; Supabase
  remoto nao foi mutado; `supabase db push` remoto nao foi executado; Browser
  autenticado de `/clinic/settings` ficou blocked porque o runtime do in-app
  Browser nao conseguiu digitar sem clipboard virtual; foi substituido por RPC e
  smoke HTTP autenticado com cookie SSR local. Teste visual de credencial
  invalida tambem ficou blocked pelo mesmo limite de input do Browser. Neste
  lote Fase 4, envio D4Sign sandbox real foi tentado e segue blocked
  porque a conta sandbox nao possui cofre retornado por `GET /safes`; o smoke
  local validou webhook/idempotencia/auditoria sem depender de provider. O in-app
  Browser autenticado nao foi usado; smoke visual ficou limitado a HTTP anonimo
  e build. Neste lote Fase 5, o Asaas sandbox foi chamado em ambiente local
  segregado e passou em modo provider-success; D4Sign sandbox permanece blocked
  por falta de cofre.
- Evidencia deste lote: `QuickActionsCard` sem no-op silencioso, dashboard com
  empty states, agenda usando `updateAppointmentStatus` em transicoes visiveis,
  lista de pacientes sem toasts fake para chat/revisao, atendimento sem arrays
  `mock*` laterais, TabDocumentos sem signatario fake no browser e com envio
  D4Sign via Edge Function que deriva signatario real de `patient_pii`,
  Patient 360 com deep-link `?tab=...`, forbidden local por
  permissao para abas sensiveis antes de montar componentes com dados
  restritos, loading/error/retry em tabs com fetch proprio, badge de chat vindo
  do payload, patient360Api sem fallback silencioso para sucesso vazio/malformado
  da Edge Function, TabRelatorios sem import direto de mock em producao e agora
  chamando `patient-reports`/`report_definitions` com acoes de execucao/export
  bloqueadas ate existir executor backend,
  TabFinanceiro com validacao de valor/data/descricao, loading de criacao, erro
  visivel de Edge Function e acoes pos-MVP desabilitadas, TabChat usando
  `chatApi` com tabelas `patient_chat_threads`/`patient_chat_messages`,
  loading/error/retry, envio e marcar respondido por Supabase/RLS, historico sem
  fixture hardcoded e `patient-360-summary` lendo unread/ultima mensagem quando
  houver `chat.read`, `TabConsultas` buscando `appointments` por service real
  com loading/error/retry, `patient-360-summary` lendo
  `patient_program_enrollments`/`programs`/servicos/entitlements para pacote,
  prescricoes mapeando campos reais de `prescriptions_placeholder`, acoes
  mutantes de consultas/pacotes/prescricoes/nutricao desabilitadas ate contrato
  real, `nutrition_plans`/`nutrition_plan_notes` versionadas em migration nova
  nao aplicada, `patient-nutrition-plan` expondo plano alimentar ativo,
  historico e notas via `nutrition.read`, `TabNutricao` com loading/error/retry e
  `patient-360-summary` lendo nutricao quando permitido, `patient-documents`
  expondo `canRequestSignature`/motivo seguro sem
  storage path/signed URL/PII de signatario, `d4sign-send-document` bloqueando
  prescricao, assinatura pendente duplicada e `missing_patient_signer` antes de
  provider, tela clinica de documentos com acoes placeholder desabilitadas,
  billing/Asaas com Edge Functions de customer/invoice/subscription/subaccount
  resolvendo tenant por paciente/usuario ativo, exigindo `financial.write`,
  validando payload antes de provider, redigindo erro Asaas e retornando apenas
  ids locais/status/links seguros ao browser, `billingApi` criando/reusando
  customer antes de cobranca/assinatura e rota `/clinic/financeiro` com
  loading/error/retry/empty state, migration `090` corrigindo
  `get_clinic_finance_overview()` para ler `patients.preferred_name`,
  `generate-document` escrevendo storage/metadados/timeline com service role
  apos validar JWT/membership/`documents.write`, build verde, contrato real
  local Patient360/documentos e smoke Browser autenticado local de
  `/clinic/financeiro` e
  `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?tab=financeiro`,
  `get_clinic_settings_snapshot` retornando tenant/equipe/roles/permissoes reais,
  `upsert_clinic_unit` salvando `Unidade Matriz` local com audit log,
  `update_clinic_settings` salvando portal/integracoes sem secrets,
  `/api/auth/app-session` autenticado local retornando `/clinic/dashboard` e
  `/clinic/settings` retornando 200 com shell autenticado via cookie SSR.
  Lote 8/8: Browser anonimo confirmou `/auth/login` com campos `E-mail`/`Senha`,
  botao `Entrar`, CSS carregado e console sem erros; Browser anonimo confirmou
  redirects fail-closed de `/clinic/dashboard`, `/clinic/settings`, `/admin` e
  `/patient` para `/auth/login`; smoke HTTP autenticado com cookie SSR local
  confirmou 200 em `/api/auth/app-session`, `/clinic/dashboard`,
  `/clinic/patients`, `/clinic/agenda`, `/clinic/documents`,
  `/clinic/financeiro`, `/clinic/settings`,
  `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` e
  `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/encounter`; com usuario
  clinico, `/admin`, `/admin/tenants`, `/admin/webhooks` e `/patient`
  redirecionaram para `/clinic/dashboard` sem overlay de erro.
  Fase 1 guard: `src/lib/auth/clinicAccessGuard.ts` centraliza estados
  `ok`, `unauthenticated`, `no_workspace`, `forbidden` e `session_error`;
  `src/app/clinic/layout.tsx` aplica o guard server-side em todas as rotas
  clinicas; `src/middleware.ts` continua redirecionando anonimos e usuarios sem
  workspace, mas deixa casos `forbidden`/`session_error` chegarem ao layout
  clinico. Smoke local criou apenas usuarios demo locais para validar:
  anonimo -> `/auth/login`, clinic admin -> 200, usuario sem workspace ->
  `/no-workspace`, role `patient` com membership ativa -> tela `Acesso clinico
negado`, e perfil `is_active=false` -> `app-session` `authenticated=false`,
  sem overlay Next. RLS cross-tenant: `test-rls-cross-tenant-contract.mjs`
  cria seeds demo A/B locais, autentica usuarios smoke via anon key e confirmou
  que tenant A le o proprio paciente mas nao le tenant B em `patients`,
  `patient_pii`, `generated_documents`, `patient_invoices`,
  `patient_chat_threads`, `patient_chat_messages` e `report_definitions`; a
  tentativa de update cross-tenant em paciente B afetou 0 linhas e o valor
  permaneceu inalterado por leitura service-role. Linkage paciente/guardian:
  migration `20260531135000_110_patient_guardian_linkage_rls.sql` adiciona
  leitura propria em `patient_accounts`/`guardian_links`, revoga writes diretos
  de `authenticated`, preserva `patients` fechado para contas linked, e
  `test-patient-linkage-contract.mjs` confirmou paciente A/responsavel A lendo
  apenas o proprio vinculo ativo, sem acesso ao vinculo B nem a `patients`.
  Fase 3: `test-patient360-local-real-smoke.mjs` confirmou contrato real local
  de staff, forbidden 403 sem `patients.read`, cross-tenant 404 tenant A/B,
  abas do Paciente 360 por Edge/RLS/RPC e timeline com
  `exame_solicitado`/`exame_resultado_recebido`.
  Fase 4: `src/app/clinic/documents/components/ClinicDocumentsContent.tsx` le
  dados reais via `clinicDocumentsApi`, gera documentos por Edge Function,
  libera/oculta acesso paciente/guardian e mostra monitor de pendentes/falhas;
  `generate-document` grava `document.pdf` com variaveis protegidas
  server-side, `d4sign-send-document` exige PDF e cofre explicito ou
  auto-discovery sandbox opt-in, e nao expoe tokens,
  `document-signed-url` emite URL curta para staff autorizado ou vinculo
  paciente/guardian, e `test-documents-phase4-local-smoke.mjs` confirmou
  geracao, RLS propria, signed URL, cross-tenant fail-closed, webhook HMAC,
  idempotencia, auditoria e timeline; smoke sandbox real falhou com
  `provider_safe_not_found`, confirmando que falta criar/selecionar um cofre na
  conta D4Sign sandbox.
  Fase 6: `programsApi` centraliza lista, opcoes do builder, salvar/publicar,
  arquivar, clonar e enrollment; `ProgramsContent` deixou de importar
  `mockClinicPrograms`; `ProgramBuilderContent` deixou de importar
  `mockBuilderData` e persiste pelo RPC `upsert_program_from_builder`;
  `enroll_patient_in_program` cria enrollment, consulta inicial em agenda,
  cobranca local pendente, tarefa de documento obrigatorio e check-ins da
  jornada; `patient-360-summary` e `TabPacotes` exibem esses check-ins reais; e
  `test-programs-phase6-local-smoke.mjs` confirmou RPCs, permissoes
  `packages.read/write`, publish/archive/clone, enrollment, agenda, financeiro,
  documentos obrigatorios e Paciente 360.
  Fase 7 parcial: migration `20260531203000_150_platform_admin_audit_contracts.sql`
  adiciona RPCs sanitizados de admin plataforma (`list_platform_tenants`,
  `get_platform_tenant_detail`, `list_platform_webhook_events`) e mutators
  auditados de support/break-glass; `adminApi`, telas `/admin`, `/admin/tenants`,
  `/admin/tenants/[tenantId]` e `/admin/webhooks` consomem os contratos reais sem
  fixtures operacionais; e `test-platform-admin-phase7-local-smoke.mjs` cobre o
  fluxo local autorizado. A migration/smoke ainda nao foram aplicados nesta
  sessao.
- Proximos bloqueios: convites de equipe via Auth Admin auditado, alteracao real
  de roles/permissoes por RPC, settings por usuario, aplicar/validar a migration
  Fase 7 de admin plataforma, UI/contratos scoped do portal paciente antes de abrir `/patient`,
  executor/export real de relatorios, CRUD real de plano alimentar, smokes
  autenticados amplos de navegador para os novos modais da Fase 2, smoke sandbox
  Asaas, criacao/selecionamento de cofre D4Sign sandbox para obter
  `D4SIGN_SAFE_UUID`, submissao de check-in pelo paciente com RLS portal-scoped,
  cobranca Asaas a partir da invoice local de programa, e geracao D4Sign/PDF a
  partir das tarefas de documentos obrigatorios do enrollment.
  Contratos sandbox dependem de ambiente/credenciais autorizados.
- Docker local: Docker Engine respondeu (`29.2.1`); Docker Desktop foi ajustado
  via API local para expor `tcp://localhost:2375` (`ExposeDockerAPIOnTCP2375`
  em `settings-store.json`), com backup local do arquivo de configuracao;
  `supabase_vector_slimhiper_1308` estabilizou como `healthy`, Postgres local
  respondeu a `pg_isready` e Kong/Studio/Inbucket/Analytics responderam em suas
  portas sem imprimir secrets. Apos o restart do Docker Desktop, o container
  `supabase_edge_runtime_slimhiper_1308` precisou de `docker start` manual
  porque usa `restartPolicy=no`; depois disso ficou `Up` e rota de Edge Function
  sem sessao retornou `401`.
- Smoke local sem sessao incluiu `/clinic/patients/test-patient/encounter` e
  `/clinic/patients/test-patient?tab=relatorios` com redirect fail-closed para
  `/auth/login`; no lote do chat, `/clinic/patients/test-patient?tab=chat`
  tambem retornou 307 para `/auth/login`; no lote consultas/pacotes/prescricoes
  e nutricao, as quatro deep-links tambem retornaram 307 para `/auth/login`.
  Browser confirmou login renderizado, sem overlay e sem erros de console, com
  CSS carregado. No lote billing/Asaas, `/clinic/financeiro` e
  `/clinic/patients/test-patient?tab=financeiro` retornaram 307 para
  `/auth/login`; Browser confirmou formulario de login estilizado com campos
  `E-mail`/`Senha`, botao de submit, `nextjs-portal` vazio e console sem erros
  ou warnings. Com dev server apontado para Supabase local em variaveis de
  processo, Browser autenticado confirmou `/clinic/financeiro` com metricas e
  empty state sem erro de RPC, e Paciente 360 financeiro com Juliana Pereira,
  dados reais do seed e sem overlay/console.
  No lote 8/8, Browser anonimo revalidou `/auth/login`, `/clinic/dashboard`,
  `/clinic/settings`, `/admin` e `/patient`: todos os caminhos protegidos
  redirecionaram para `/auth/login`, o login permaneceu estilizado e nao houve
  erros de console. O input visual de credenciais segue blocked pelo clipboard
  virtual do Browser; a cobertura autenticada foi feita por HTTP/RPC local.

## Controle Por Fase

| Fase                               | Status atual             | Ultimo controle/checks                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fase 0 - Baseline, CI e higiene    | Fechada para MVP local   | `type-check`, `lint`, `build`, `git diff --check`, fixtures Patient360/D4Sign/Billing e baseline registrados.                                                                                                                                                                                                                                                                                                                  |
| Fase 1 - Auth/RBAC/guards/RLS      | Concluida para MVP local | Guard clinico server-side implementado; `profiles.is_active=false` derruba sessao do app; smoke HTTP local passou para anonimo, workspace valido, no-workspace, forbidden e perfil inativo; smoke RLS cross-tenant automatizado passou para paciente, documentos, financeiro, chat e relatorios; linkage paciente/guardian possui leitura propria do vinculo ativo e smoke cross-patient. Portal segue fail-closed ate Fase 8. |
| Fase 2 - Core clinico              | Concluida para MVP local | Pacientes CRUD/PII/paginacao/filtros, dashboard KPIs reais, agenda CRUD/status/cancelamento e Encounter/SOAP com medidas/bio/labs/timeline/auditoria implementados; `type-check`, `lint`, `build`, fixtures e `test-clinical-core-contract.mjs` passaram localmente. Smokes autenticados de navegador amplo seguem como gate de release.                                                                                       |
| Fase 3 - Paciente 360              | Concluida para MVP local | Contrato real local passou com staff, forbidden real sem `patients.read`, cross-tenant tenant A/B, tab contracts por Edge/RLS/RPC e mocks carregados somente sob `NEXT_PUBLIC_USE_MOCK_DATA=true`; smokes visuais autenticados amplos seguem como gate de release, nao como bloqueio do MVP local.                                                                                                                             |
| Fase 4 - Documentos/D4Sign         | Parcial MVP local        | Templates/UI, PDF local, variaveis permitidas, policy paciente/guardian, signed URL, monitor operacional e webhook/idempotencia/auditoria passaram em smoke local; envio D4Sign sandbox real foi tentado e segue blocked porque `GET /safes` nao retornou cofre disponivel na conta sandbox.                                                                                                                                   |
| Fase 5 - Financeiro/Asaas          | Concluida para MVP local | RPCs/Edge/webhook/fixtures locais, conciliacao/divergencias e Asaas sandbox estrito passaram; customer/invoice/subscription continuam gated por Edge Functions, JWT, `financial.write` e service-role backend apos autorizacao.                                                                                                                                                                                                |
| Fase 6 - Programas/pacotes         | Concluida para MVP local | `programsApi`, builder persistente, publish/archive/clone, enrollment, agenda inicial, invoice local, tarefas de documentos obrigatorios e `patient_program_checkins` reais passaram em smoke local; Patient 360 pacotes exibe check-ins gerados. Submissao portal de check-ins e chamadas provider derivadas da invoice/tarefas ficam pos-MVP.                                                                                |
| Fase 7 - Admin/settings/auditoria  | Parcial em implementacao | Settings tenant/unidade persistem por RPC auditada; migration `150` adiciona RPCs sanitizados para admin tenants/detalhe/webhooks e mutators auditados de support/break-glass; telas admin passam a consumir `adminApi` real e agora usam `AdminShell` compartilhado para overview, tenants, detalhe e webhooks. Pendentes: aplicar/validar migration, smoke Fase 7, equipe/roles Auth Admin e encerramento/revogacao operacional de suporte.                                                                     |
| Fase 8 - Relatorios/chat/portal    | Parcial                  | Bases de relatorios/chat no Paciente 360 existem; modulo clinico, notificacoes, moderacao e portal paciente seguem pendentes/fail-closed.                                                                                                                                                                                                                                                                                      |
| Fase 9 - CRM/estoque               | Pos-MVP                  | Mantido fora do MVP inicial por decisao registrada.                                                                                                                                                                                                                                                                                                                                                                            |
| Fase 10 - Producao/observabilidade | Pendente                 | CI/CD, monitoramento, backup/restore e revisao LGPD final ainda pendentes.                                                                                                                                                                                                                                                                                                                                                     |

## Fontes Internas

| Area                  | Fonte primaria                                | Como usar                                                           |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| Regras operacionais   | `AGENTS.md`                                   | Fonte de seguranca, Supabase, UI, migrations e checks obrigatorios. |
| Inventario de modulos | `docs/PROJECT_MODULE_CHECKLIST.md`            | Status por modulo, arquivos existentes, riscos e proximos passos.   |
| Sequencia de PRs      | `docs/NEXT_IMPLEMENTATION_SEQUENCE.md`        | Ordem preferencial de implementacao em PRs pequenos.                |
| Auth/RBAC             | `docs/auth/AUTH_RBAC_SESSION_CONTRACT.md`     | Contrato de sessao, tabelas esperadas, roles e permissoes.          |
| Supabase Auth/RBAC    | `docs/supabase/CORE_AUTH_RBAC_RUNBOOK.md`     | Bootstrap, validacao e operacao do core multi-tenant.               |
| Paciente 360          | `docs/supabase/PATIENT360_RUNBOOK.md`         | Payloads, Edge Functions, fixture e contrato real.                  |
| Document templates    | `docs/supabase/DOCUMENT_TEMPLATES_RUNBOOK.md` | Templates, variaveis, storage e bootstrap.                          |
| D4Sign                | `docs/integrations/D4SIGN_RUNBOOK.md`         | Webhook, signed URLs, fixtures e sandbox.                           |
| Asaas                 | `docs/integrations/ASAAS_BILLING_RUNBOOK.md`  | Billing, fixtures, sandbox e reconciliacao.                         |
| Env hygiene           | `docs/security/ENV_HYGIENE.md`                | Variaveis publicas, server-only e placeholders seguros.             |
| Testes                | `docs/testing/CONTRACT_TESTS.md`              | Matriz de testes locais, Supabase autorizado e providers.           |
| Browser smoke         | `docs/testing/BROWSER_SMOKE_CHECKLIST.md`     | Roteiro operacional para validar rotas criticas no navegador.       |
| Baseline              | `docs/testing/BASELINE_CHECKS.md`             | Snapshot de checks, pendencias e ambiente usado.                    |

## Benchmark De Mercado

Comparacao feita por leitura de paginas oficiais de concorrentes e guias de
seguranca. O objetivo nao e copiar features, mas entender o minimo competitivo
para uma plataforma clinica SaaS no Brasil.

| Referencia | Capacidades divulgadas                                                                                                                               | Implicacao para SlimHiper                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| iClinic    | Agenda, prontuario, teleconsulta, financeiro, TISS, repasse medico e lancamento financeiro a partir da agenda/prontuario.                            | O MVP precisa integrar agenda, atendimento e financeiro em fluxo unico, nao como telas isoladas.                |
| Feegow     | Agenda, prontuario, aplicativo, relatorios, API, LGPD, financeiro e gestao de convenios/TISS.                                                        | SlimHiper precisa de relatorios operacionais, permissao clara e API/contratos estaveis antes de escalar.        |
| Ninsaude   | Agenda multiunidade, confirmacao de consulta, check-in, sessoes/pacotes, prontuario, telemedicina, assinatura digital, arquivos, estoque e insights. | Pacotes, fila, atendimento, documentos e estoque devem compartilhar contexto de paciente/unidade/profissional.  |
| Clinicorp  | Agenda, financeiro, relatorios, dashboard analitico, CRM/relacionamento, estoque, metas e faturamento.                                               | O roadmap deve fechar dashboard, financeiro, CRM e estoque como operacao conectada, com indicadores confiaveis. |

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
- [x] Cross-tenant smoke cobre pelo menos tenant A e tenant B para paciente, documento, financeiro, chat e relatorios. Evidencia local: `node scripts/supabase/test-rls-cross-tenant-contract.mjs` passou com tenants/users demo A/B e bloqueou leituras/writes cross-tenant nas familias criticas.
- [ ] Webhooks D4Sign/Asaas sao fail-closed, idempotentes e nao logam payload sensivel.
- [ ] Documentos privados usam signed URL curta gerada server-side ou Edge Function, nunca URL publica direta.
- [ ] Dados de saude e financeiros possuem minimizacao, retencao, auditoria e base de acesso documentadas.
- [x] `git diff --check`, `npm run type-check`, `npm run lint` e `npm run build` passam no branch antes de merge.
- [x] Contratos locais passam: Patient360 fixture, D4Sign fixtures e Billing fixtures.
- [ ] Contratos reais/sandbox so rodam com autorizacao explicita e ambiente segregado. Parcial: contrato real local Patient360 e documentos foram executados com token staff local; Asaas/D4Sign provider sandbox seguem bloqueados ate secrets/base URLs sandbox estarem carregados em ambiente segregado.
- [x] O ultimo baseline verde esta registrado em `docs/testing/BASELINE_CHECKS.md` com data, branch, commit, caminhos tocados, skips, riscos e limitacoes.

## Gates De Seguranca E LGPD

- [ ] Classificar dados por tipo: publico, operacional, pessoal, sensivel de saude, financeiro e provider payload.
- [ ] Revisar bases de tratamento e finalidade para dados clinicos, billing, assinatura, notificacoes e portal paciente.
- [ ] Garantir menor privilegio por role: `clinic_admin`, `receptionist`, `physician`, `nutritionist`, `fitness_professional`, `financial_user`, `patient`, `guardian`, `external_professional` e `platform_admin`.
- [x] Separar escopo staff tenant-wide de escopo paciente/guardian por `patient_accounts` e `guardian_links`. Evidencia local: migration `110` adiciona policies `patient_accounts_select_self` e `guardian_links_select_self`.
- [x] Bloquear portal paciente ate existir linkage paciente-conta com RLS propria e smoke cross-patient. Evidencia local: `/patient` continua fail-closed, e `test-patient-linkage-contract.mjs` confirmou linkage proprio sem abrir `patients`.
- [ ] Remover permissao direta client-writable em tabelas provider-owned, ou trocar por RPC/Edge Function validada.
- [ ] Cobrir auditoria para login sensivel, troca de tenant, documentos, billing, webhooks, admin, break-glass e exportacoes.
- [ ] Definir retencao e redaction para `billing_webhook_events.payload`; preferir resumo operacional ao payload bruto.
- [ ] Garantir que erros 500 nao exponham detalhes internos, SQL, tokens, headers, secrets ou payload provider.
- [ ] Fixar configuracao de deploy das Edge Functions de webhook para aceitar provider sem JWT Supabase e validar segredo proprio.
- [ ] Revisar CSP/security headers sem quebrar Rocket, Supabase, D4Sign, Asaas, imagens e assets Next.
- [ ] Documentar incidente, backup, restore, rotacao de chaves e revogacao de acessos.

## Estado Atual Resumido

| Modulo                 | Nivel atual | Foco de conclusao                                                                           |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Auth/RBAC/multi-tenant | N3          | Fechar guards, roles, RLS e portal fail-closed.                                             |
| Dashboard              | N3/N4       | KPIs/fila/alertas/unread reais no MVP local; quick actions navegam ou seguem gated.         |
| Pacientes              | N4 MVP      | CRUD real, PII protegida por RLS, filtros/paginacao e UI de novo/editar paciente.           |
| Paciente 360           | N3          | Smoke autenticado, acoes mutantes reais e contratos reais/cross-tenant.                     |
| Agenda/fila            | N4 MVP      | Criar/editar/cancelar, transicoes de fila e smoke local mutavel implementados.              |
| Encounter/SOAP         | N4 MVP      | Rascunho/finalizacao com validacao, medidas/bio/labs, timeline e auditoria.                 |
| Medidas/labs           | N4 MVP      | `clinicalRecordsApi` conectado a formularios reais com audit log e timeline.                |
| Document templates     | N3          | Variaveis permitidas, geracao pela UI e policy paciente.                                    |
| Documentos/D4Sign      | N2/N3       | Sandbox autorizado, signer real, reconciliacao e monitor.                                   |
| Financeiro/Asaas       | N2/N3       | Corrigir RPCs, reconciliar webhooks e impedir writes provider-owned no client.              |
| Programas/pacotes      | N1/N2       | Criar `programsApi`, persistir builder e enrollment.                                        |
| CRM/leads              | N0/N1       | Criar rota/service e funil lead -> paciente.                                                |
| Estoque                | N0/N1       | Criar rota/service e fluxos lote/movimentacao.                                              |
| Relatorios             | N2          | Executor/export seguro, filtros salvos e rota clinica completa.                             |
| Chat/notificacoes      | N1/N2       | Modelo real de conversa, unread count, envio e retencao.                                    |
| App paciente           | N2          | Linkage seguro e RLS propria do vinculo prontos; UX minima e dados scoped seguem pendentes. |
| Settings/admin         | N1/N2       | Persistencia real, admin shell, erros, break-glass e support.                               |
| Seguranca/auditoria    | N2/N3       | Eventos auditaveis, retencao, monitoramento e incident response.                            |
| Testes/CI              | N2/N3       | CI completo, fixtures em PR e contracts reais gated.                                        |

## Checkpoints Por UI Existente

### Shell, Login E Navegacao

- [x] `src/app/layout.tsx`: remover dependencia de overlay global para logout quando `DashboardShell`/admin shell assumirem sessao.
- [x] `src/components/auth/AuthStateButton.tsx`: mover logout para menu de usuario e evitar botao fixo competindo com topbars.
- [x] `src/components/DashboardShell.tsx`: trocar badges hardcoded por contadores reais ou ocultar quando indisponiveis.
- [x] `src/components/DashboardShell.tsx`: implementar busca global ou transformar input em busca escopada documentada.
- [x] `src/app/auth/login/page.tsx` e `src/components/auth/AuthForm.tsx`: loading de submit, erro amigavel, foco/acessibilidade e redirecionamento por role validado.
- [x] `src/app/no-workspace/page.tsx`: estado acionavel para usuario sem tenant, com logout e suporte.
- [x] `src/app/patient/page.tsx`: manter fail-closed ate `patient_accounts`/`guardian_links` estarem prontos. Evidencia local: linkage/RLS propria passou, mas `/patient` continua bloqueado ate existir UI e contrato de dados scoped.

### Dashboard Clinico

- [x] `src/app/components/DashboardContent.tsx`: exibir erro inline quando stats falham, nao retornar `null`.
- [x] `src/app/components/DashboardContent.tsx`: tratar empty state para agenda/fila/alertas/pacientes em revisao.
- [x] `src/app/components/DashboardContent.tsx`: ligar quick actions a rotas/modais reais ou desabilitar com motivo.
- [x] `src/services/dashboardApi.ts`: producao deve falhar visivelmente sem mock; mock somente com `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [x] Validar KPIs com dados reais de `appointments`, `patient_alerts`, `patient_invoices` e documentos pendentes. Evidencia local: `dashboardApi` tambem conta `patient_program_enrollments` ativos e unread de `patient_chat_threads`.

### Pacientes

- [x] `src/app/patient-list/components/PatientListContent.tsx`: adicionar erro persistente e retry quando `patientsApi` falhar.
- [x] `src/app/patient-list/components/PatientListContent.tsx`: implementar "Novo paciente" com service real e validacao de PII.
- [x] `src/app/patient-list/components/PatientListContent.tsx`: evitar divisao por zero em progresso/semanas.
- [x] `src/services/patientsApi.ts`: adicionar criar/editar paciente, paginacao server-side e filtros por tenant/unidade/status.
- [x] Garantir que PII so aparece para roles com permissao adequada. Evidencia: leitura/escrita de `patient_pii` permanece sob RLS `patients.read/write`; UI lista telefone mascarado e snapshot completo so e carregado no modal de edicao por sessao autorizada.

### Paciente 360

- [x] `src/services/patient360Api.ts`: manter contrato real e remover fallback silencioso em producao. Evidencia local: mock so roda com `NEXT_PUBLIC_USE_MOCK_DATA=true`; producao chama Edge Functions `patient-360-summary`/`patient-timeline`; sucesso sem `profile.id`, timeline sem array/`events` ou evento malformado retorna erro seguro em vez de resumo/lista vazia silenciosa.
- [x] `src/app/paciente-360/components`: deep-link de abas, loading/error por aba e forbidden por permissao. Evidencia local: deep-link `?tab=...` implementado; badge de chat vem do payload; `Patient360Tabs` renderiza forbidden local para abas sensiveis sem permissao (`agenda`, `nutrition`, `prescriptions`, `documents`, `financial`, `packages`, `chat`, `reports`) antes de montar componentes restritos; tabs com fetch proprio (`Timeline`, `Documentos`, `Relatorios`, `Financeiro`, `Consultas`, `Nutricao`, `Chat`) possuem loading, erro visivel e retry; tabs derivadas do resumo dependem do loading/error principal de `Patient360Content`.
- [x] `TabDocumentos`: remover email hardcoded `paciente@example.com` e resolver signatario real. Evidencia local: `TabDocumentos` chama `sendDocumentForSignature(doc.id, patientId)` sem montar e-mail/signatario no browser; `src/services/documentsApi.ts` invoca apenas `d4sign-send-document`; `supabase/functions/d4sign-send-document` valida tenant/permissao, deriva signatario real de `patient_pii` quando necessario, retorna `missing_patient_signer` antes de provider se faltar nome + email/telefone, rejeita prescricoes e bloqueia assinatura pendente duplicada; `supabase/functions/patient-documents` retorna somente `canRequestSignature`/`signatureDisabledReason` para a UI, sem storage path, signed URL, raw payload ou PII de signatario; `scripts/supabase/test-documents-contract.mjs` deixou de usar `paciente@example.com`.
- [x] `TabFinanceiro`: validar valores, loading de criacao e tratamento claro de falha Edge Function. Evidencia local: `src/app/paciente-360/components/tabs/TabFinanceiro.tsx` valida valor/data/descricao antes da chamada, mantem modal aberto em erro, exibe `role="alert"` para falha da Edge Function, mostra loading em cobranca/assinatura e deixa acoes sem contrato local desabilitadas.
- [x] `TabRelatorios`: substituir `mockReportDefinitions` por `reportsApi`. Evidencia local: `reportsApi` usa mock somente com `NEXT_PUBLIC_USE_MOCK_DATA=true`; em producao chama Edge Function `patient-reports`, que valida JWT, membership, `patients.read` e `reports.read` antes de retornar `report_definitions`; UI exibe loading/error/retry e mantem execucao/export desabilitados ate existir executor backend.
- [x] Tab chat: criar service real de threads/mensagens/unread. Evidencia local: `src/services/chatApi.ts` consulta `patient_chat_threads`/`patient_chat_messages` com client Supabase session-scoped, mock somente com `NEXT_PUBLIC_USE_MOCK_DATA=true`; `TabChat` carrega com loading/error/retry, remove historico hardcoded, envia mensagem real, abre/reabre thread e marca unread como respondido por update RLS; `patient-360-summary` consulta `chat.read` e retorna `unreadCount`/ultima mensagem do backend quando permitido.
- [x] Tabs consultas/nutricao/pacotes/prescricoes: substituir derivacoes mock por tabelas ou Edge Functions. Evidencia local: `TabConsultas` usa `getPatientAppointments` em `agendaApi` contra `appointments` com RLS e retry; `patient-360-summary` consulta `packages.read` e monta pacote a partir de `patient_program_enrollments`, `programs`, `program_services` e `program_entitlements`; prescricoes usam campos reais de `prescriptions_placeholder`; `patient360Api` preserva `serviceUsage`/`packageEntitlements` e arrays nutricionais; `TabNutricao` usa `nutritionApi`, que chama Edge Function `patient-nutrition-plan` em producao, e a migration `20260531112000_080_patient360_nutrition_contracts.sql` versiona `nutrition_plans`/`nutrition_plan_notes` com RLS `nutrition.read/write`; acoes mutantes sem contrato real de escrita ficaram desabilitadas.

### Agenda E Fila

- [x] `src/app/clinic/agenda/components/AgendaContent.tsx`: usar `updateAppointmentStatus` nas transicoes visiveis.
- [x] Implementar criar/editar/cancelar consulta com permissao e validacao. Evidencia: `agendaApi` valida paciente/tenant, data/duracao e usa RLS `patients.write`; UI expõe modal e cancelamento.
- [x] Definir timezone por tenant/unidade/profissional para o MVP local. Evidencia: a UI persiste `scheduled_at` a partir do timezone local do operador; suporte por tenant/unidade/profissional dedicado fica para schema de settings/calendario pos-MVP.
- [x] Trocar tokens Tailwind indefinidos como `destructive` por classes existentes ou criar token global justificado. Evidencia: `rg` nao encontrou `destructive` na agenda; a UI usa classes existentes (`red-*`, `primary`, `border`).
- [x] Exibir estados loading, empty, error e forbidden. Evidencia: tela tem loading, empty, erro/retry, e forbidden vem do guard clinico server-side.
- [x] Criar smoke: agendado -> chegou -> triagem -> atendimento -> checkout -> concluido. Evidencia local: `test-clinical-core-contract.mjs` cobre criacao e transicoes `chegou`, `triagem`, `medidas`, `bioimpedancia`, `aguardando_medico`, `em_consulta`, `checkout` e `concluido`.

### Atendimento, SOAP, Medidas E Labs

- [x] `src/app/clinic/patients/[patientId]/encounter/page.tsx`: remover `onClick={() => {}}` das acoes auxiliares.
- [x] Usar `encounterApi` para rascunho, finalizacao, timeline e audit log.
- [x] Conectar `clinicalRecordsApi` para bioimpedancia, medidas, exames, sintomas e pendencias. Evidencia: medidas, bioimpedancia e lab orders/results possuem formularios reais; pendencias continuam lidas de `patient_tasks` no contexto do paciente.
- [x] Validar finalizacao de SOAP por role e por tenant. Evidencia: `encounterApi` exige campos SOAP obrigatorios e as tabelas seguem RLS por tenant/permissao (`soap.write`/`patients.write`).
- [x] Gerar eventos de timeline auditaveis para medico/nutricao/fitness quando aplicavel. Evidencia: SOAP final, medidas, bioimpedancia e exames geram timeline clinica/audit log; especializacao medico/nutricao/fitness por role fica para enriquecimento de ator.
- [x] Smoke: abrir atendimento, salvar rascunho, finalizar SOAP, ver timeline no Paciente 360. Evidencia local: `test-clinical-core-contract.mjs` cria encounter/SOAP final, registros clinicos, timeline e audit; Browser autenticado amplo segue como gate de release.

### Documentos E D4Sign

- [ ] `src/app/clinic/documents/page.tsx`: substituir painel hardcoded por service real de templates/documentos/eventos. Parcial: acoes placeholder de criar template, gerar documento, enviar/reenvio e baixar assinado ficam desabilitadas no MVP local com motivo visivel; painel segue hardcoded e nao deve ser marcado como concluido ate existir service real.
- [x] `src/services/documentsApi.ts`: manter D4Sign apenas via Edge Function, sem segredo no browser.
- [x] `document-signed-url`: validar tenant, paciente, documento e permissao antes de signed URL. Evidencia local: Edge Function exige JWT, busca documento por `generated_document_id` + `patient_id`, valida bucket allow-list, formato canonico `tenant/patient/document/file`, membership ativa e `documents.read` antes de gerar signed URL com service role por 300s; contrato real local `test-documents-contract.mjs` passou apos `generate-document` validar usuario e escrever storage/metadados/timeline com service role.
- [ ] Aplicar policy paciente/guardian antes de liberar portal para documentos.
- [x] Confirmar assinatura com signatario real e resumo de payload seguro para MVP local. Evidencia local: `d4sign-send-document` deriva signatario de `patient_pii`, nao recebe token provider do browser, omite payload bruto de erro provider, registra apenas resumo operacional na timeline (`generated_document_id`, `signature_request_id`, `provider`, `signer_count`, `signer_source`) e o runbook D4Sign documenta o fluxo gated; smoke sandbox real segue bloqueado abaixo.
- [x] Smoke local: fixtures D4Sign valid/invalid e idempotencia.
- [ ] Smoke sandbox autorizado: envio, webhook, reconciliacao e auditoria.

### Financeiro E Asaas

- [x] `src/services/billingApi.ts`: validar contratos das RPCs e Edge Functions com schema atual. Evidencia local: `getPatientFinancialSummary` e `getClinicFinanceOverview` chamam RPCs existentes; customer/invoice/subscription usam somente Edge Functions Asaas; invoice/subscription chamam customer antes para reuso/criacao idempotente; payload local valida paciente, valor e data antes da chamada; response invalida da Edge Function vira erro visivel.
- [x] Corrigir `get_clinic_finance_overview()` se ainda usar assinatura/colunas divergentes do schema. Evidencia local: migration `20260531090000_070_billing_webhook_security_hardening.sql` substitui `is_active` por `status = 'active'` em memberships; migration `20260531120000_090_finance_overview_patient_name_contract.sql` corrige `pii.preferred_name` para `patients.preferred_name`; `ClinicFinanceiroContent` consome o contrato `metrics`/`recentCharges`; Browser autenticado local confirmou `/clinic/financeiro` sem erro de coluna.
- [x] Bloquear writes diretos client-side em tabelas provider-owned; usar Edge Function/RPC com checks. Evidencia local: migration 070 remove policies de insert/update em `tenant_billing_accounts`, `asaas_subaccounts`, `patient_customers`, `patient_invoices`, `patient_subscriptions`, `payment_links`, `payments` e `splits`; o browser usa `billingApi` -> Edge Functions/RPCs, nao `supabase.from(...).insert/update` nessas tabelas.
- [x] `webhook-asaas`: atualizar invoices/payments de forma idempotente e auditavel. Evidencia local: `webhook-asaas` valida `asaas-access-token`, grava `billing_webhook_events` por hash, resolve tenant/paciente por `patient_invoices.asaas_invoice_id`, atualiza invoice, upserta payment e cria timeline financeira; fixtures locais cobrem confirmado, vencido, cancelado, duplicado e token invalido.
- [x] Reduzir armazenamento de payload bruto ou criar retencao/redaction formal. Evidencia local: `webhook-asaas` persiste payload minimizado com evento, ids, status, billing type, valor, vencimento e hash; runbook documenta ausencia de payload provider bruto na UI/admin.
- [x] UI do paciente e clinica: loading/error/forbidden e reconciliacao visual. Evidencia local: `TabFinanceiro` possui forbidden por permissao, loading, erro com retry, validacao de criacao, CPF/CNPJ opcional para novo customer Asaas e aviso de link; `/clinic/financeiro` possui loading, erro com retry, empty state para cobrancas recentes, resumo de conciliacao, divergencias e eventos Asaas recentes.
- [x] Smoke local: pagamento confirmado, vencido, cancelado, duplicado e token invalido.
- [x] Smoke sandbox autorizado: customer, invoice, subscription e reconciliacao. Evidencia local/sandbox: Asaas sandbox classificado em `.env`/`supabase/functions/.env`, Edge Runtime reiniciado com env redigido, `REQUIRE_ASAAS_PROVIDER_SUCCESS=true node scripts/supabase/test-billing-contract.mjs` passou com paciente local novo e CPF dummy; `test-billing-reconciliation-local-smoke.mjs` validou divergencias e fail-closed sem sessao. Webhook real provider continua dependente de callback externo, mas fixtures locais validam idempotencia/token/mapping.

### Programas E Pacotes

- [x] `src/app/clinic/programs/components/ProgramsContent.tsx`: substituir `mockClinicPrograms` por `programsApi`. Evidencia local: lista, resumo, filtros e acoes chamam `get_clinic_programs`, `update_program_status` e `clone_program`; mock so existe no service sob `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [x] `src/app/clinic/programs/builder`: substituir `mockBuilderData` por dados reais de fases, servicos, checkins e equipe. Evidencia local: `ProgramBuilderContent` usa `programsApi`, carrega equipe e templates por `get_program_builder_options`, edita programa por `?programId=...` e salva/publica por `upsert_program_from_builder`.
- [x] Persistir rascunho, publicar, arquivar e clonar programa. Evidencia local: RPCs `upsert_program_from_builder`, `update_program_status` e `clone_program` passaram em `test-programs-phase6-local-smoke.mjs`.
- [x] Enrollment de paciente deve refletir no Paciente 360, agenda e financeiro. Evidencia local: migration `20260531182000_142_program_enrollment_operational_reflections.sql` substitui `enroll_patient_in_program` para criar enrollment, consulta inicial em `appointments`, cobranca local pendente em `patient_invoices` quando ha preco, tarefas em `patient_tasks` para documentos obrigatorios, `patient_program_checkins` e timeline; `test-programs-phase6-local-smoke.mjs` confirmou appointment, invoice, task, check-ins e Paciente 360 pacotes.
- [x] Validar permissoes para criar/publicar programas. Evidencia local: RPCs exigem `packages.read`/`packages.write`, bootstrap core inclui `packages.read/write` para `clinic_admin`, e smoke local autenticado confirmou publicar/arquivar/clonar/enrollar por usuario permitido.

### Configuracoes Clinicas

- [ ] `src/app/clinic/settings/components/ClinicSettingsContent.tsx`: persistir unidades, equipe, roles, integracoes e programas padrao. Parcial: UI sem mocks locais, snapshot real por RPC, unidade persiste via `upsert_clinic_unit`, perfil/branding/portal/financeiro/integracoes/programas padrao persistem em tenant settings; equipe e roles sao leitura real e acoes mutantes ficam bloqueadas ate RPC/Auth Admin auditados.
- [ ] Separar settings de tenant, unidade e usuario. Parcial: tenant settings e unidade ja estao separados; settings por usuario ainda nao existem.
- [x] Validar campos sensiveis e nunca exibir secrets de integracao. Evidencia local: `get_clinic_settings_snapshot` retorna integracoes sanitizadas apenas com `enabled/status`; `update_clinic_settings` aceita somente chaves permitidas e reduz integracoes a `enabled/status`; UI nao renderiza nem recebe tokens provider.
- [ ] Implementar optimistic UI somente com rollback claro.
- [ ] Smoke: editar unidade, convidar equipe, alterar role e revisar auditoria. Parcial: `upsert_clinic_unit` salvou unidade local e gravou `clinic_unit.upserted`; convite e roles seguem bloqueados; Browser autenticado ficou blocked por clipboard virtual, com smoke HTTP autenticado de `/clinic/settings` como substituto parcial.

### Admin Plataforma

- [ ] Usar `PlatformAdminGuard` de forma consistente ou remover duplicidade apenas em task dedicada.
- [x] Criar shell admin compartilhado para evitar sidebars/topbars repetidas. Evidencia local: `AdminShell` centraliza sidebar/header/refresh e foi aplicado em `/admin`, `/admin/tenants`, `/admin/tenants/[tenantId]` e `/admin/webhooks`.
- [ ] `src/app/admin/components/AdminContent.tsx`: substituir tenants mockados por dados reais.
- [ ] `src/app/admin/tenants/[tenantId]`: substituir usuarios/unidades/audit/support/break-glass mockados.
- [ ] `src/app/admin/webhooks`: usar `admin_webhook_events.external_id` e permissao de plataforma apropriada.
- [ ] Break-glass precisa de justificativa, duracao, aprovacao/auditoria e revogacao.

### CRM, Estoque, Relatorios, Chat E Portal Paciente

- [ ] CRM: criar rota, service, funil, origem, eventos e conversao lead -> paciente. Pos-MVP por decisao do lote MVP clinico.
- [ ] Estoque: criar rota, service, itens, lotes, validade, unidade, entrada/saida/ajuste e auditoria. Pos-MVP por decisao do lote MVP clinico.
- [ ] Relatorios: criar `/clinic/reports`, filtros salvos, permissao `reports.read` e export seguro. Parcial MVP 360: `patient-reports` lista `report_definitions` ativas com `reports.read`; execucao/export seguem bloqueados ate contrato de `report_runs`.
- [ ] Chat/notificacoes: criar envio real, unread count, retencao, moderacao e permissao por paciente/tenant.
- [ ] App paciente: liberar somente apos linkage, RLS propria, documentos/financeiro/chat limitados ao proprio paciente. Parcial: linkage/RLS propria do vinculo ativo esta pronto; UI e contratos de dados scoped seguem pendentes.

## Matriz De Mocks A Eliminar

- [ ] `src/services/mockApi.ts`: manter apenas para desenvolvimento explicito e fixtures, nunca fallback de producao.
- [ ] `src/services/mockSession.ts`: remover do fluxo real apos session/guards fechados.
- [ ] `src/data/mockData.ts`: separar fixtures de desenvolvimento de dados operacionais.
- [ ] `src/data/mockBuilderData.ts`: manter apenas como fixture/dev sob `NEXT_PUBLIC_USE_MOCK_DATA=true`; caminho real ja usa `programsApi`.
- [ ] `src/services/adminApi.ts`: nao retornar mock quando backend falha em producao.
- [ ] `src/services/patientsApi.ts`: mock so com `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [ ] `src/services/dashboardApi.ts`: provider mock somente com `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [ ] `src/services/agendaApi.ts`: provider mock somente com `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [ ] `src/services/billingApi.ts`: mock financeiro so em dev e sem mascarar Edge Function real.
- [ ] `src/services/documentsApi.ts`: remover dependencia de `getPatientDocuments360` mock para producao.
- [ ] `src/app/admin/components/AdminContent.tsx`: remover tenants hardcoded.
- [ ] `src/app/admin/tenants/[tenantId]/components/TenantDetailContent.tsx`: remover dados internos mockados.
- [ ] `src/app/admin/webhooks/components/WebhookMonitorContent.tsx`: remover eventos mockados como fallback de producao.
- [x] `src/app/clinic/settings/components/ClinicSettingsContent.tsx`: remover settings locais/mock. Evidencia local: tela reescrita para `clinicSettingsApi`, snapshot RPC real, loading/error/retry, equipe/RBAC/unidades reais e sem arrays `mock*`.
- [x] `src/app/clinic/programs/components/ProgramsContent.tsx`: remover `mockClinicPrograms`. Evidencia local: import direto removido; mock fica somente no branch explicito de `programsApi`.
- [x] `src/app/clinic/programs/builder`: remover `mockBuilderData`. Evidencia local: builder importa `BUILDER_STEPS`, draft inicial e persistencia de `programsApi`; checkins/equipe chegam por RPC.
- [x] `src/app/paciente-360/components/tabs/TabRelatorios.tsx`: remover `mockReportDefinitions`.
- [ ] `src/app/clinic/patients/[patientId]/encounter/page.tsx`: substituir mocks laterais por dados reais. Parcial: arrays `mock*` removidos da UI; sintomas ainda ficam como empty state ate existir contrato real.

## Ordem Recomendada De Finalizacao

### Fase 0 - Baseline, CI E Higiene

- [x] Atualizar `docs/testing/BASELINE_CHECKS.md` com commit/branch atual.
- [x] Garantir `git diff --check`, `npm run type-check`, `npm run lint` e `npm run build` verdes.
- [x] Rodar fixtures locais em CI de PR: Patient360, D4Sign e Billing.
- [x] Registrar ambiente Supabase local green sem secrets.
- [x] Adicionar checklist de browser smoke para rotas criticas.

### Fase 1 - Auth, RBAC, Guards E RLS

- [x] Fechar `role_code`, `profiles.is_active`, `active_tenant_id` e permissao por tenant. Evidencia local: `profiles.is_active=false` retorna sessao app nula/fail-closed; `active_tenant_id` e aceito somente com membership ativa; smoke RLS cross-tenant local passou para familias criticas; linkage paciente/guardian passou com leitura propria do vinculo ativo e `patients` fechado.
- [x] Criar guard clinico server-side com estados `forbidden`, `no_workspace`, `session_error`. Evidencia local: `clinicAccessGuard`, `/clinic/layout.tsx` e middleware alinhados; smoke HTTP local validou anonimo -> login, clinic admin -> 200, usuario demo sem workspace -> `/no-workspace` e role `patient` com membership ativa -> tela `Acesso clinico negado`.
- [x] Fechar patient/guardian linkage antes do portal. Evidencia local: migration `110` e `test-patient-linkage-contract.mjs` passaram localmente; `/patient` permanece fail-closed.
- [x] Criar smoke RLS cross-tenant para paciente, documentos, financeiro, chat e relatorios. Evidencia local: `node scripts/supabase/test-rls-cross-tenant-contract.mjs` passou contra Supabase local com users/seeds demo A/B; tenant A nao leu tenant B em `patients`, `patient_pii`, `generated_documents`, `patient_invoices`, `patient_chat_threads`, `patient_chat_messages` e `report_definitions`, e update cross-tenant afetou 0 linhas.
- [x] Remover fallback permissivo de mock/session para o portal paciente.

### Fase 2 - Core Clinico Com Dados Reais

- [x] Finalizar `patientsApi` com CRUD, PII, paginacao e filtros. Evidencia:
      `src/services/patientsApi.ts` implementa `getPatientListPage`,
      `getPatientFormSnapshot`, `createPatient` e `updatePatient`; a UI
      `/clinic/patients` habilita novo/editar paciente e mantem PII em
      `patient_pii` protegida por RLS.
- [x] Finalizar Dashboard real com KPIs, fila, alertas e quick actions.
      Evidencia: `src/services/dashboardApi.ts` calcula programas ativos por
      `patient_program_enrollments`, unread por `patient_chat_threads`, alertas,
      documentos e inadimplencia por tabelas reais; mocks seguem apenas sob
      `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [x] Finalizar `agendaApi` e UI de fila/transicoes. Evidencia:
      `src/services/agendaApi.ts` cria/edita/cancela consulta, corrige
      `queue_events.status` para valor valido e mantem transicoes visiveis; UI de
      `/clinic/agenda` expoe modal de consulta, edicao, cancelamento e fluxo de
      status.
- [x] Finalizar Encounter/SOAP com medidas/labs/timeline/auditoria. Evidencia:
      `src/services/encounterApi.ts` valida SOAP final; `clinicalRecordsApi`
      grava medidas, bioimpedancia, lab orders/results, audit logs e eventos de
      timeline; `/clinic/patients/[patientId]/encounter` expoe formularios reais.
- [x] Garantir loading/empty/error/forbidden em todas as rotas clinicas do MVP
      desta fase. Evidencia: dashboard, pacientes, agenda e encounter possuem
      loading/error/empty, guard clinico server-side segue aplicado no layout, e
      smoke anonimo retornou fail-closed para login nas rotas protegidas.
- [x] Rodar smoke local mutavel do core clinico. Evidencia:
      `node scripts/supabase/test-clinical-core-contract.mjs` passou contra
      Supabase local, criando e limpando tenant/paciente/agenda/fila/SOAP/medidas/
      bio/labs/timeline/audit.

### Fase 3 - Paciente 360 Completo

- [x] Rodar contrato real autorizado com token de staff. Evidencia local:
      `node scripts/supabase/test-patient360-local-real-smoke.mjs` passou e
      executou internamente `test-patient360-contract.mjs --mode=real` contra
      Supabase local com token staff real.
- [x] Rodar forbidden real com usuario sem `patients.read`. Evidencia local:
      `test-patient360-local-real-smoke.mjs` autenticou
      `patient360.forbidden.local@example.com` com role `patient` e confirmou
      403 no contrato real.
- [x] Rodar cross-tenant real tenant A/B. Evidencia local:
      `test-patient360-local-real-smoke.mjs` semeou `demo-clinic-b`, usou
      `PATIENT_ID_TENANT_B=9b5c6d6a-1f7e-4dbb-8eab-3d55a8a1f042` e confirmou
      bloqueio cross-tenant com status 404.
- [x] Completar tabs: resumo, timeline, consultas, documentos, financeiro,
      nutricao, pacotes, prescricoes, relatorios e chat. Evidencia local:
      smoke local-real validou summary/timeline por Edge Function,
      `patient-documents`, `patient-nutrition-plan`, `patient-reports`,
      consultas via `appointments`, financeiro via
      `get_patient_financial_summary`, pacotes via
      `patient_program_enrollments`, prescricoes via
      `prescriptions_placeholder`, chat via
      `patient_chat_threads`/`patient_chat_messages`, e tipos de timeline
      `exame_solicitado`/`exame_resultado_recebido`.
- [x] Remover mocks diretos apos fallback controlado. Evidencia local:
      `patient360Api`, `documentsApi`, `nutritionApi`, `chatApi`, `agendaApi` e
      `billingApi` usam import dinamico de mock apenas dentro do branch
      `NEXT_PUBLIC_USE_MOCK_DATA=true`; producao segue Edge/RLS/RPC sem fallback
      silencioso para mock.

### Fase 4 - Documentos E Assinatura

- [x] Finalizar templates, variaveis permitidas e geracao pela UI. Evidencia
      local: `/clinic/documents` usa `clinicDocumentsApi` para templates ativos,
      pacientes e documentos reais; `generate-document` exige `documents.write`,
      aceita somente template `active`, bloqueia override de variaveis protegidas
      e grava `document.pdf` em storage privado.
- [x] Implementar policy de leitura propria do paciente/guardian. Evidencia
      local: migration `20260531152000_120_patient_document_read_scope.sql`
      adiciona `can_read_own_patient_document`, policies para
      `generated_documents`, `signature_requests` e `signature_signers` somente
      quando `released_to_patient=true`; `test-documents-phase4-local-smoke.mjs`
      confirmou paciente e guardian lendo documento proprio liberado e bloqueio
      cross-tenant.
- [ ] Finalizar D4Sign sandbox com envio, webhook, idempotencia e auditoria.
      Parcial MVP local: `d4sign-send-document` agora exige arquivo suportado,
      service role server-side para baixar PDF privado, envs D4Sign server-side
      e cofre explicito (`D4SIGN_SAFE_UUID`) ou auto-discovery sandbox opt-in
      (`D4SIGN_AUTO_DISCOVER_SAFE=true`) antes de provider; `webhook-d4sign`
      passou localmente com HMAC, idempotencia, auditoria, status assinado e
      timeline. Envio sandbox real foi tentado com
      `RUN_D4SIGN_SANDBOX_SEND=true` e falhou em `provider_safe_not_found`,
      porque `GET /safes` nao retornou cofre disponivel na conta sandbox.
- [x] Criar monitor operacional de documentos pendentes/falhados. Evidencia
      local: `/clinic/documents` exibe metricas, pendencias/falhas de documentos
      e eventos recentes de `d4sign_events` por dados reais; provider errors em
      `d4sign-send-document` marcam documento como `failed` sem expor payload
      bruto.

### Fase 5 - Financeiro E Asaas

- [x] Corrigir e validar RPCs financeiras contra schema real. Evidencia local: migrations `070` e `090` aplicadas localmente; Browser autenticado confirmou `/clinic/financeiro` sem `pii.preferred_name` e com contrato `metrics`/`recentCharges`.
- [x] Criar fluxo seguro de customer, invoice, subscription e payment link. Evidencia local: Edge Functions Asaas exigem JWT + membership ativa + `financial.write`, validam payload, nao retornam IDs provider e `billingApi` chama customer antes de invoice/subscription; writes provider-owned usam service-role somente no backend apos autorizacao; customer aceita CPF/CNPJ no body, envia ao Asaas e persiste apenas `cpf_cnpj_last4`; sandbox estrito criou customer, invoice e subscription com status 200.
- [x] Endurecer webhook para atualizar invoices/payments e registrar eventos de timeline. Evidencia local: `webhook-asaas` fail-closed por token, hash idempotente, payload minimizado, update de invoices, upsert de payments e timeline financeira.
- [x] Rodar fixtures locais e sandbox autorizado. Evidencia local/sandbox: `node scripts/supabase/test-billing-fixtures.mjs`, `node scripts/supabase/test-billing-reconciliation-local-smoke.mjs` e `REQUIRE_ASAAS_PROVIDER_SUCCESS=true node scripts/supabase/test-billing-contract.mjs` passaram; o contrato estrito usou paciente local novo e `TEST_PATIENT_CPF_CNPJ` dummy, com Asaas sandbox classificado antes da chamada e sem IDs provider no browser.
- [x] Implementar conciliacao e tela de divergencias. Evidencia local: migration `20260531165000_130_billing_reconciliation_contract.sql` cria `get_clinic_finance_reconciliation()` com divergencias de valor/status/pagamento orfao/webhook e sem IDs provider; `ClinicFinanceiroContent` exibe resumo, divergencias e eventos recentes com loading/error/empty; smoke local autenticado validou summary/divergences/recentEvents e fail-closed sem sessao.

### Fase 6 - Programas, Pacotes E Jornadas

- [x] Criar `programsApi` e persistir builder. Evidencia local: `src/services/programsApi.ts` chama RPCs reais, `ProgramBuilderContent` salva/publica via `upsert_program_from_builder`, e `test-programs-phase6-local-smoke.mjs` confirmou draft/publicacao.
- [x] Ligar enrollment a paciente, agenda, financeiro e documentos obrigatorios. Evidencia local: `enroll_patient_in_program` exige `packages.write`, `agenda.write`, `financial.write` quando ha cobranca e `patients.write` para tarefas de documentos; smoke Fase 6 confirmou enrollment, agenda inicial, invoice local, tarefa obrigatoria, check-ins e Paciente 360.
- [x] Criar check-ins reais e visiveis no Paciente 360. Evidencia local: tabela `patient_program_checkins`, geracao por enrollment, `patient-360-summary` e `TabPacotes`; smokes `test-programs-phase6-local-smoke.mjs` e `test-patient360-local-real-smoke.mjs` passaram.
- [x] Validar permissao para publicacao/arquivamento. Evidencia local: RPCs exigem `packages.write`, lista/opcoes exigem `packages.read`, bootstrap core inclui `packages.read/write` para `clinic_admin`, e smoke local autenticado validou publicar/arquivar/clonar/enrollar.

### Fase 7 - Admin, Settings E Auditoria

- [ ] Persistir settings clinicas e admin tenants/users/units. Parcial: settings clinicas de tenant/unidade persistem localmente por RPC auditada; admin tenants/users/units agora leem contratos reais por `list_platform_tenants` e `get_platform_tenant_detail`; mutators de equipe/roles seguem pendentes.
- [ ] Fechar admin shell e guards de plataforma. Parcial: `AdminShell` compartilhado removeu sidebars/topbars duplicadas em admin overview, tenants, detalhe e webhooks; rotas seguem sob guard server-side de plataforma existente; falta validar em Browser depois de aplicar a migration Fase 7 no Supabase local.
- [ ] Implementar support/break-glass com auditoria forte. Parcial: `request_platform_support_session`, `request_platform_break_glass` e `decide_platform_break_glass` exigem platform admin/support, justificativa, duracao limitada, bloqueio de autoaprovacao e audit log; falta aplicar migration e validar smoke local.
- [ ] Criar eventos auditaveis para fluxos sensiveis. Parcial: support/break-glass registram `audit_logs`; webhooks/admin exibem resumos sanitizados; falta ampliar cobertura para login sensivel, troca de tenant, exportacoes e revogacao/encerramento operacional.

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
- [x] `feat/programs-builder-persistence`
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

- [x] Confirmar se o portal paciente entra no MVP ou fica explicitamente bloqueado ate depois do core clinico. Decisao: bloqueado/fail-closed no MVP clinico.
- [x] Confirmar se D4Sign e Asaas devem ser requisitos do MVP ou entram como fase sandbox antes da producao. Decisao: fixtures locais e fluxo gated, sem provider real neste lote.
- [ ] Definir politica de retencao para raw payloads de Asaas e logs de webhooks.
- [ ] Definir se teleconsulta/prescricao digital/TISS entram no roadmap curto ou ficam fora do escopo inicial.
- [ ] Definir o nivel de certificacao/compliance desejado para prontuario, assinatura digital e guarda documental.
- [x] Definir escopo inicial de CRM e estoque: minimo operacional ou paridade com concorrentes. Decisao: CRM e estoque ficam pos-MVP.
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
