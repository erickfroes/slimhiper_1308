# Rastreador De Readiness De Producao

Use este arquivo para acompanhar a execucao do plano de producao por etapa e
por componente. Evidencias detalhadas devem ficar no PR, no baseline ou no
runbook especifico; aqui fica o quadro operacional curto.

Status permitidos:

- `[ ]` Nao iniciado.
- `[~]` Em andamento.
- `[B]` Bloqueado.
- `[R]` Requer autorizacao explicita.
- `[V]` Validado com evidencia, aguardando promocao/assinatura.
- `[x]` Fechado.

## Etapas

| Status | Etapa | Evidencia esperada | Observacao atual |
| --- | --- | --- | --- |
| [~] | 0 - Baseline local | `git diff --check`, `npm run type-check`, `npm run lint`, `npm run build`. | Gates locais passam; revalidar a cada PR. |
| [V] | 1 - Readiness estatica | `node scripts/operations/check-production-readiness.mjs`. | Auditor integrado ao CI; flag de mock centralizada em `src/lib/mockMode.ts`; sem imports estaticos de mock fora dos modulos mock; staging ainda precisa rodar sem mocks. |
| [V] | 2 - Contratos locais | Fixtures e smokes locais autorizados por componente. | Fixtures, smokes Supabase locais e providers sandbox autorizados passaram; repetir em staging antes de N4. |
| [V] | 3 - Browser smoke | Checklist de rotas criticas com console/overlay/interacao. | Browser/Playwright smoke local autenticado passou para staff clinico, admin plataforma e portal paciente; desktop/mobile sem overlay, console issue ou overflow horizontal. Repetir em staging. |
| [B] | 4 - Staging | Deploy staging com mocks desligados e dados dummy/anonimizados. | Tooling pronto para smoke HTTP por cookie curto e browser smoke por login dummy; depende de `SLIMHIPER_SMOKE_BASE_URL`, usuarios dummy clinic/admin/patient e owners humanos. |
| [V] | 5 - Providers sandbox | D4Sign/Asaas sandbox com cofre/chaves segregados e autorizacao nominal. | D4Sign sandbox send e Asaas provider strict passaram em janela autorizada local/sandbox; repetir callbacks externos em staging. |
| [V] | 6 - Operacao | Restore, alerta, incidente/tabletop e rollback ensaiados. | Restore schema-only local, alerta controlado local e rollback/tabletop read-only passaram; ainda falta sink/ack real em staging. |
| [B] | 7 - Go/no-go | LGPD/security/juridico/operacao aprovados. | NO-GO e o default ate assinatura humana. |

## Componentes

| Status | Componente | Nivel alvo atual | Proximo gate |
| --- | --- | --- | --- |
| [~] | CI, release e ambientes | N3 | CI com auditor de readiness, staging sem mocks, smoke HTTP e smoke browser autenticado. |
| [V] | Auth, sessao, RBAC e multi-tenant | N3 | Local Auth/RBAC, linkage e RLS cross-tenant passaram; falta matriz staging. |
| [V] | Supabase schema, RLS e storage | N3 | Auditor estatico RPC/Edge e smokes locais passaram; falta staging com storage/provider segregado. |
| [V] | Shell/UI clinica | N3 | Browser/Playwright smoke local autenticado passou em desktop e mobile; falta repetir em staging. |
| [V] | Core clinico | N3 | Clinical core local smoke passou; falta staging. |
| [V] | Paciente 360 e prontuario | N3 | Smoke real local passou com forbidden e cross-tenant; falta staging. |
| [V] | Portal paciente, diario e jornada | N3 | Linkage, governanca diario e portal paciente mobile autenticado passaram local; falta staging. |
| [V] | Documentos e D4Sign | N3 | Documents local e D4Sign sandbox send passaram em janela autorizada; falta webhook externo/staging. |
| [V] | Financeiro e Asaas | N3 | Billing local e Asaas sandbox customer/invoice/subscription passaram com paciente fresco; falta staging/webhook externo. |
| [V] | Programas, catalogo e comercial | N3 | Programs local smoke passou; falta staging. |
| [V] | CRM e estoque | N3 pos-MVP | CRM/inventory local smoke passou; falta staging/feature flag de rollout. |
| [~] | Chat, inbox e comunidade | N3 | Retencao local e rota `/clinic/inbox` incluidas nos smokes; falta anexos, SLA e moderacao em staging. |
| [V] | Relatorios e exports | N3 | Reports local smoke passou; falta staging e exports persistentes. |
| [V] | Admin plataforma | N3 | Platform admin local smoke e browser autenticado passaram; falta staging e auditoria operacional assinada. |
| [~] | Seguranca, LGPD e operacao | N4 | Restore/alerta/rollback locais passaram; falta staging sink/ack, restore snapshot/PITR e aprovacao humana. |

## Registro Curto

Adicione uma linha a cada avanco relevante:

```text
Data:
Etapa/componente:
Status anterior -> novo:
Ambiente:
Comandos/checks:
Evidencia:
Bloqueios/riscos:
Owner/proximo passo:
```

```text
Data: 2026-06-11
Etapa/componente: Readiness estatica / politica de mock
Status anterior -> novo: [~] -> [~]
Ambiente: local
Comandos/checks: node scripts/operations/check-production-readiness.mjs; NEXT_PUBLIC_APP_ENV=staging + NEXT_PUBLIC_USE_MOCK_DATA=true node scripts/operations/check-production-readiness.mjs; npm run type-check; npm run lint; npm run build; node scripts/observability/post-deploy-smoke.mjs --base-url http://localhost:4028
Evidencia: leitura direta de NEXT_PUBLIC_USE_MOCK_DATA centralizada em src/lib/mockMode.ts; auditor passou com 21 pass/2 warn; teste negativo confirmou fail quando staging solicita mock; smoke anonimo ampliado passou.
Bloqueios/riscos: 13 imports mock permanecem como branches explicitos de desenvolvimento; staging/authenticated browser smoke ainda depende de ambiente autorizado.
Owner/proximo passo: Platform/Release owner deve classificar imports mock restantes antes de staging.
```

```text
Data: 2026-06-11
Etapa/componente: Readiness estatica / imports mock
Status anterior -> novo: [~] -> [V]
Ambiente: local
Comandos/checks: node scripts/operations/check-production-readiness.mjs; NEXT_PUBLIC_APP_ENV=staging + NEXT_PUBLIC_USE_MOCK_DATA=false node scripts/operations/check-production-readiness.mjs; rg -n "import .*from '@/services/mockApi'|import .*from '@/data/mock|NEXT_PUBLIC_USE_MOCK_DATA" src; node scripts/observability/post-deploy-smoke.mjs --base-url http://localhost:4028
Evidencia: import estatico de mock removido de src/services/patientsApi.ts; auditor local passou com 22 pass/1 warn/0 fail; auditor production-like com mock false passou com 23 pass/0 warn/0 fail; smoke anonimo local passou.
Bloqueios/riscos: staging/authenticated browser smoke ainda depende de ambiente autorizado; mocks dinamicos continuam permitidos somente em branch protegida por isMockDataEnabled().
Owner/proximo passo: Release owner deve rodar auditor em staging com NEXT_PUBLIC_USE_MOCK_DATA ausente/false e anexar evidencia.
```

```text
Data: 2026-06-12
Etapa/componente: Contratos locais / Supabase RPC e Edge Functions
Status anterior -> novo: [ ] -> [~]
Ambiente: local
Comandos/checks: node scripts/operations/check-supabase-contracts.mjs; node scripts/operations/check-supabase-contracts.mjs --strict; node scripts/operations/check-production-readiness.mjs; NEXT_PUBLIC_APP_ENV=staging + NEXT_PUBLIC_USE_MOCK_DATA=false node scripts/operations/check-production-readiness.mjs; npm run type-check; npm run lint; npm run build; git diff --check; node scripts/observability/post-deploy-smoke.mjs --base-url http://localhost:4028
Evidencia: auditor estatico leu 203 arquivos TypeScript, 55 migrations e 22 Edge Functions; detectou 147 RPCs unicas com definicao em migrations e 18 referencias literais de Edge Functions com diretorio correspondente; strict passou com 9 pass/0 warn/0 fail.
Bloqueios/riscos: auditor nao prova RLS/RBAC/storage em runtime; scripts Supabase mutantes seguem bloqueados sem autorizacao explicita.
Owner/proximo passo: Supabase/Release owner deve rodar fixtures e smokes locais autorizados por componente antes de promover para N3.
```

```text
Data: 2026-06-12
Etapa/componente: Contratos locais / smokes Supabase e providers sandbox
Status anterior -> novo: [~] -> [V]
Ambiente: local Supabase + Edge Runtime local + providers sandbox autorizados
Comandos/checks: supabase start; supabase migration up --local --include-all; docker start supabase_edge_runtime_slimhiper_1308; test-clinical-core-contract.mjs; test-patient360-local-real-smoke.mjs; test-documents-phase4-local-smoke.mjs; test-billing-reconciliation-local-smoke.mjs; test-programs-phase6-local-smoke.mjs; test-platform-admin-phase7-local-smoke.mjs; test-reports-phase8-local-smoke.mjs; test-crm-inventory-phase9-local-smoke.mjs; check-auth-rbac-contract.mjs; test-rls-cross-tenant-contract.mjs; test-patient-linkage-contract.mjs; check-communications-retention.mjs; check-patient-daily-governance.mjs; REQUIRE_ASAAS_PROVIDER_SUCCESS=true test-billing-contract.mjs
Evidencia: fixtures offline, contratos Auth/RBAC/RLS/linkage, clinical core, Paciente 360, documentos, billing, programs, platform admin, reports, CRM/inventory, retention/governance e providers D4Sign/Asaas sandbox passaram sem imprimir segredos.
Bloqueios/riscos: staging/browser autenticado, webhooks externos reais e go/no-go LGPD/security continuam pendentes; Asaas exigiu limpar customer sandbox stale do paciente sintetico antes do contrato provider.
Owner/proximo passo: Release owner deve repetir a matriz em staging com dados dummy/anonimizados, mocks desligados e evidencias redigidas.
```

```text
Data: 2026-06-12
Etapa/componente: Browser smoke / Shell UI clinica e sessao
Status anterior -> novo: [~] -> [V]
Ambiente: local Next dev em http://localhost:4028 + Supabase local
Comandos/checks: Browser in-app; npm run type-check; npm run lint; npm run build; git diff --check; node scripts/operations/check-production-readiness.mjs; NEXT_PUBLIC_APP_ENV=staging + NEXT_PUBLIC_USE_MOCK_DATA=false node scripts/operations/check-production-readiness.mjs; node scripts/operations/check-supabase-contracts.mjs --strict; node scripts/observability/post-deploy-smoke.mjs --base-url http://localhost:4028
Evidencia: `/no-workspace` agora faz logout por POST server-side e redireciona para `/auth/login`; login staff local chegou em `/clinic/dashboard`; rotas clinicas dashboard, pacientes, Paciente 360, agenda, documentos, financeiro, programas, relatorios, settings e inbox renderizaram sem overlay/console issue; Settings saiu de loading para conteudo; busca de pacientes tem botao acessivel e filtrou `Juliana` em `/clinic/patients?search=Juliana`.
Bloqueios/riscos: senha sintetica local foi rotacionada apos aparecer em snapshot de automacao; evidencias de staging, mobile, admin/paciente autenticados e owners LGPD/security ainda pendentes antes de N4.
Owner/proximo passo: Release owner deve repetir browser smoke autenticado em staging com dados dummy/anonimizados, mocks desligados e screenshots redigidas.
```

```text
Data: 2026-06-12
Etapa/componente: Browser smoke / mobile, admin plataforma e portal paciente
Status anterior -> novo: [~] -> [V]
Ambiente: local Next dev em http://localhost:4028 + Supabase local
Comandos/checks: Playwright fallback local apos bloqueio do Browser por clipboard virtual; viewports 390x844 e 1280x720; usuarios sinteticos rotacionados; rotas `/clinic/patients?search=Juliana`, `/clinic/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, `/clinic/settings`, `/admin`, `/admin/tenants`, `/admin/webhooks`, `/patient` e aba mobile de documentos do portal.
Evidencia: staff clinico mobile renderizou menu, lista filtrada, Paciente 360 e Settings sem overlay, console issue ou overflow horizontal; admin plataforma renderizou overview, tenants e webhooks sem console issue; portal paciente mobile renderizou home e documentos liberados sem console issue ou overflow horizontal; screenshots temporarias geradas fora do repo.
Bloqueios/riscos: Browser in-app ficou bloqueado para digitacao por erro de clipboard virtual, por isso foi usado Playwright local como fallback; staging URL/secrets/usuarios dummy nao estao versionados e go/no-go humano segue NO-GO.
Owner/proximo passo: Release owner deve fornecer `SLIMHIPER_SMOKE_BASE_URL` de staging, confirmar `NEXT_PUBLIC_USE_MOCK_DATA=false` e repetir os mesmos smokes com evidencias redigidas.
```

```text
Data: 2026-06-12
Etapa/componente: Staging / smoke autenticado por perfil
Status anterior -> novo: [B] -> [B]
Ambiente: local tooling, pronto para staging
Comandos/checks: node --check scripts/observability/post-deploy-smoke.mjs; node scripts/observability/post-deploy-smoke.mjs --base-url http://localhost:4028
Evidencia: `post-deploy-smoke.mjs` agora sempre valida health/login/redirect anonimo e aceita cookies dummy segregados por perfil (`SLIMHIPER_CLINIC_SMOKE_COOKIE`, `SLIMHIPER_ADMIN_SMOKE_COOKIE`, `SLIMHIPER_PATIENT_SMOKE_COOKIE`) com `SLIMHIPER_REQUIRE_AUTHENTICATED_SMOKE=true` para falhar staging quando faltar perfil.
Bloqueios/riscos: sem URL/cookies dummy de staging versionados; cookies devem ser curtos, redigidos e gerados em ambiente aprovado, nunca em logs.
Owner/proximo passo: Release owner deve executar o comando documentado no runbook de observabilidade com mocks desligados e anexar request ids/screenshot redigidos.
```

```text
Data: 2026-06-12
Etapa/componente: Staging / browser smoke autenticado por login dummy
Status anterior -> novo: [B] -> [B]
Ambiente: local tooling, pronto para staging
Comandos/checks: node --check scripts/observability/staging-authenticated-browser-smoke.mjs; smoke local com senhas sinteticas rotacionadas em memoria para clinic/admin/patient
Evidencia: `staging-authenticated-browser-smoke.mjs` cria sessoes isoladas via `/auth/login` para clinic/admin/patient, valida rotas criticas, busca de paciente, aba documentos do portal, tela nao vazia, overlay, console errors e overflow horizontal sem imprimir credenciais; execucao local passou em `http://localhost:4028`.
Bloqueios/riscos: execucao staging ainda precisa de URL real, usuarios dummy, Playwright/Chromium no runner, screenshots redigidas e owners humanos; producao segue NO-GO ate template de evidencia preenchido.
Owner/proximo passo: Release owner deve executar `docs/operations/STAGING_GO_LIVE_EVIDENCE_TEMPLATE.md` em release candidate com mocks desligados.
```

```text
Data: 2026-06-12
Etapa/componente: Providers sandbox / D4Sign e Asaas
Status anterior -> novo: [R] -> [V]
Ambiente: local Supabase + Edge Runtime local + providers sandbox autorizados
Comandos/checks: RUN_D4SIGN_SANDBOX_SEND=true D4SIGN_AUTO_DISCOVER_SAFE=true node scripts/supabase/test-documents-phase4-local-smoke.mjs; REQUIRE_ASAAS_PROVIDER_SUCCESS=true com TEST_ACCESS_TOKEN/TEST_PATIENT_ID/TEST_PATIENT_CPF_CNPJ sinteticos em memoria node scripts/supabase/test-billing-contract.mjs
Evidencia: D4Sign sandbox send passou apos HMAC/idempotencia/signed URL/storage; Asaas provider strict passou com paciente local novo, CPF sintetico valido, customer/invoice/subscription 200 e sem expor IDs provider ao browser.
Bloqueios/riscos: callbacks externos reais de webhook e producao seguem dependentes de staging/owner; nao foram impressos tokens, cookies, payloads ou provider secrets.
Owner/proximo passo: Integrations owner deve repetir em staging sandbox com callbacks externos monitorados e evidencia redigida.
```

```text
Data: 2026-06-12
Etapa/componente: Operacao / restore, alerta e rollback
Status anterior -> novo: [B] -> [V]
Ambiente: local isolado
Comandos/checks: node scripts/operations/run-local-restore-drill.mjs; node scripts/operations/run-local-alert-rollback-drill.mjs --base-url http://localhost:4028
Evidencia: restore schema-only criou banco temporario no container Supabase, restaurou schemas auth/public/security/storage, validou 170 tabelas, 278 policies e 311 funcoes, e removeu o banco; alerta/rollback chamou `/api/health` com request/correlation id controlado, obteve health ok e registrou tabletop read-only sem mutacao Git/deploy.
Bloqueios/riscos: teste de sink/ack real, restore de snapshot/PITR e assinatura LGPD/security/juridico/operacao ainda exigem staging ou sistema interno.
Owner/proximo passo: Operations/Security owners devem preencher template go/no-go com evidencias staging e aprovar ou manter NO-GO.
```
