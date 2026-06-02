# Plano de fechamento funcional 100% - SlimHiper

Data do plano: 2026-06-02.

Este documento transforma a auditoria funcional tela a tela em um checklist de
execucao para fechar o SlimHiper como produto funcional, validado e operavel.
Ele nao substitui `docs/PROJECT_COMPLETION_CHECKPOINTS.md`; funciona como a
fila priorizada de trabalho, aceite e evidencias para sair de "funcional no
codigo" para "funcional com contrato real validado".

Base usada:

- `docs/PROJECT_SCREEN_COMPONENT_AUDIT.md`
- `docs/PROJECT_COMPLETION_CHECKPOINTS.md`
- `docs/testing/CONTRACT_TESTS.md`
- `docs/testing/BROWSER_SMOKE_CHECKLIST.md`
- `docs/operations/RELEASE_PROCESS.md`
- Analises de subagents: `repo_explorer`, `frontend_reviewer`,
  `supabase_reviewer`, `security_reviewer` e `docs_reviewer`.

## Como usar este checklist

Status permitidos:

- `[ ]` Nao iniciado.
- `[~]` Em andamento.
- `[B]` Bloqueado por decisao, bug, ambiente ou dependencia externa.
- `[R]` Requer autorizacao explicita, credenciais, ambiente real ou janela
  operacional.
- `[V]` Validado com evidencia, aguardando incorporacao/merge/release.
- `[x]` Fechado com evidencia suficiente.

Um item so pode virar `[x]` quando todos os criterios abaixo estiverem
atendidos:

- Criterios de aceite completos.
- Evidencia registrada em PR, baseline, runbook ou nota interna redigida.
- Comandos executados registrados com resultado.
- Comandos pulados registrados com justificativa e proximo passo.
- Mocks desabilitados ou explicitamente classificados como smoke mock.
- Runbook/checklist afetado atualizado ou marcado como nao aplicavel.
- Nenhum segredo, dado real de paciente, payload bruto de provider ou signed URL
  sensivel apareceu em logs, screenshots ou evidencias.

## Comandos e limites

Permitidos por padrao para itens deste checklist:

- `git status --short`
- `git diff --check`
- `npm run type-check`
- `npm run lint`
- `npm run build`
- `npm run dev`
- `node scripts/supabase/test-patient360-contract.mjs --mode=fixture`
- `node scripts/supabase/test-d4sign-fixtures.mjs`
- `node scripts/supabase/test-billing-fixtures.mjs`

Requerem autorizacao explicita e nominal:

- Leitura de `.env*` com valores reais.
- `supabase db push`.
- `npx supabase migration up --local --include-all`.
- `npm run supabase:bootstrap:core-auth`.
- `node scripts/supabase/bootstrap-*.mjs`.
- `node scripts/supabase/test-*-local-smoke.mjs`.
- `node scripts/supabase/test-*-contract.mjs` em modo real/sandbox.
- Qualquer chamada real ou sandbox a D4Sign.
- Qualquer chamada real ou sandbox a Asaas.
- Replay de webhooks.
- Seeds com service role.
- Restore, rollback, migracoes ou provider workflows em ambiente compartilhado.

Checks minimos por tipo de mudanca:

- Docs-only: `git diff --check`.
- Codigo frontend/TypeScript: `git diff --check`, `npm run type-check`,
  `npm run lint`, `npm run build`.
- UI: checks de codigo mais browser smoke da rota afetada quando praticavel.
- Supabase: checks dependem de autorizacao; nunca rodar migrations, push,
  bootstraps ou smokes mutantes sem aprovacao explicita.

## P0 - Gates globais

- [ ] Confirmar `git diff --check`, `npm run type-check`, `npm run lint` e
  `npm run build` verdes antes de qualquer release candidate.
- [ ] Confirmar que `package.json` nao foi alterado sem justificativa e que
  `rocketCritical` permanece intacto.
- [ ] Confirmar que `NEXT_PUBLIC_USE_MOCK_DATA=false` ou ausente em staging e
  producao.
- [ ] Confirmar que nenhuma tela de producao cai em mock silencioso quando
  backend, RLS, RPC ou Edge Function falham.
- [ ] Registrar baseline atualizado em `docs/testing/BASELINE_CHECKS.md` para
  cada marco funcional relevante.
- [ ] Validar `/api/health` em ambiente production-like e confirmar que o status
  nao e `fail`.
- [ ] Confirmar que os runbooks afetados foram atualizados ou marcados como nao
  aplicaveis.

Criterios de aceite:

- CI/local baseline verde por exit code.
- Evidencia registra branch, commit, ambiente, flags de mock, comandos e skips.
- Nenhum comando Supabase/provider foi executado sem autorizacao explicita.

## P0 - Auth, sessao e RBAC

- [V] Corrigir o drift de `canAccessPatientPortal`: `/api/auth/app-session`
  deve usar o mesmo calculo de `session.canAccessPatientPortal()` usado por
  `getCurrentAppSession` e pelo middleware.
- [ ] Revisar o comportamento fail-open do middleware em erro de sessao clinica
  e decidir se producao deve ficar fail-closed.
- [ ] Validar redirects de `/auth/login` por perfil: platform admin, suporte,
  usuario clinico, paciente/responsavel vinculado e usuario sem workspace.
- [ ] Validar bloqueio de `/admin`, `/clinic` e `/patient` para usuarios sem
  sessao, revogados, sem permissao e cross-tenant.
- [V] Atualizar `docs/auth/AUTH_RBAC_SESSION_CONTRACT.md` e
  `docs/supabase/CORE_AUTH_RBAC_RUNBOOK.md` para o estado real do portal
  paciente.
- [ ] Validar que `src/services/mockSession.ts` nao participa do fluxo real de
  producao.

Criterios de aceite:

- `/api/auth/app-session`, middleware, login server-side e guards cliente
  concordam sobre o destino do usuario.
- Patient/guardian so acessam `/patient` com vinculo ativo e permissao
  `patient_portal.access`.
- Acesso sem permissao retorna redirect/forbidden consistente, sem dados
  clinicos expostos.

Evidencia em andamento:

- 2026-06-02: `/api/auth/app-session` passou a usar
  `session.canAccessPatientPortal()` e a registrar
  `can_access_patient_portal` na observabilidade sanitizada. Os runbooks de
  Auth/RBAC e Core Auth foram alinhados ao portal minimo. Smokes reais por
  perfil permanecem pendentes ate ambiente Supabase autorizado.

## P1 - Supabase, RLS e contratos reais

- [ ] Cruzar todos os `supabase.rpc(...)` em `src/services` com migrations,
  grants, policies e runbooks.
- [ ] Cruzar todos os `functions.invoke(...)` em `src/services` com Edge
  Functions, envelopes esperados, status HTTP e estados de erro.
- [ ] Validar RLS cross-tenant para `patients`, `patient_pii`,
  `generated_documents`, `patient_chat_threads`, `patient_chat_messages`,
  billing, CRM, inventory e portal.
- [ ] Corrigir `asaas-create-tenant-subaccount` para gravar tabelas
  provider-owned via service role controlado ou RPC `security definer` auditada,
  mantendo precheck de `financial.write`, idempotencia e resposta sem IDs
  provider sensiveis.
- [ ] Adicionar seed/validacao explicita de `patient_accounts` e
  `guardian_links` quando o objetivo for validar portal paciente.
- [ ] Validar Edge Functions com bearer ausente/invalido, tenant mismatch,
  permissao ausente, payload invalido, provider misconfigured e idempotencia.
- [ ] Criar ou expandir checks read-only de catalogo para `information_schema`,
  grants e policies antes de qualquer smoke mutante.
- [ ] Atualizar `docs/testing/CONTRACT_TESTS.md` com comandos permitidos,
  requisitos, modo fixture, modo local e modo provider.

Criterios de aceite:

- Todos os contratos reais usados pela UI existem, respeitam RLS/RBAC e retornam
  envelopes compativeis.
- Falhas de contrato aparecem como error/forbidden visivel, nao como mock
  silencioso.
- Smokes mutantes ou provider so aparecem como `[R]` ate existir autorizacao.

## P1 - Fluxos clinicos

- [ ] Validar `/clinic/dashboard`: KPIs, fila, agenda, alertas, charts vazios,
  erro com retry, refresh e falha isolada de `notificationsApi`.
- [ ] Validar `/clinic/patients`: lista, busca, filtros, ordenacao, paginacao,
  selecao em massa, criar/editar paciente, quick actions e navegacao para 360.
- [ ] Validar `/clinic/patients/[patientId]`: todas as tabs do Paciente 360,
  permissoes por aba, loading/error por aba, documentos, financeiro, chat,
  timeline e relatorios.
- [ ] Validar `/clinic/patients/[patientId]/encounter`: contexto do paciente,
  rascunho, finalizacao SOAP, timeline, auditoria e responsividade.
- [ ] Validar `/clinic/agenda`: criar, editar, cancelar, avancar status,
  timezone, fila e estados vazios.
- [ ] Validar `/clinic/financeiro`: overview, cobrancas, conciliacao,
  inadimplencia, erros parciais e permissao `financial.read`.
- [ ] Validar `/clinic/inbox`: threads, notificacoes, marcar lido, arquivar,
  atribuir e alterar status.
- [ ] Validar `/clinic/crm`: criar lead, abrir detalhe, mover etapa, tarefas,
  atividades, converter em paciente e estados forbidden/empty.
- [ ] Validar `/clinic/inventory`: itens, lotes, movimentos, transferencias,
  alertas, campos obrigatorios e forbidden.
- [ ] Validar `/clinic/programs` e `/clinic/programs/builder`: listar, filtrar,
  clonar, publicar, arquivar, matricular paciente e fluxo multi-etapas.
- [ ] Validar `/clinic/documents`: pacientes/templates vazios, gerar documento,
  envio assinatura, signed URL, liberar/ocultar no portal e falhas D4Sign.
- [ ] Validar `/clinic/reports`: catalogo vazio, permissao insuficiente,
  execucao/export e falha de download.

Criterios de aceite:

- Cada rota tem loading, empty, error e forbidden quando aplicavel.
- Operacao principal usa contrato real com `NEXT_PUBLIC_USE_MOCK_DATA=false`.
- Browser smoke cobre pelo menos a rota, uma interacao principal e console sem
  erro relevante.

## P1 - Paciente 360 e portal paciente

- [ ] Validar `Patient360Content` e `Patient360Tabs` com paciente real de tenant
  autorizado e paciente cross-tenant negado.
- [ ] Validar `TabResumo`, `TabTimeline`, `TabConsultas`, `TabDocumentos`,
  `TabFinanceiro`, `TabNutricao`, `TabPrescricoes`, `TabPacotes`,
  `TabRelatorios` e `TabChat`.
- [ ] Validar `/patient` com paciente vinculado, responsavel vinculado, usuario
  sem vinculo, vinculo inativo e tentativa cross-patient.
- [ ] Validar mensagens, check-ins, notificacoes, documentos liberados e
  financeiro do portal com dados limitados ao proprio paciente.
- [ ] Atualizar `docs/supabase/PATIENT360_RUNBOOK.md` quando contrato, seed,
  permissao ou UI mudar.

Criterios de aceite:

- Portal paciente nao depende de fallback permissivo.
- Patient/guardian nao leem `patients` diretamente fora do contrato portal.
- Dados financeiros, documentos e chat ficam escopados por vinculo ativo.

## P1 - Documentos, D4Sign, Asaas e signed URLs

- [ ] Validar `generate-document`, `document-signed-url`,
  `d4sign-send-document`, `webhook-d4sign` e `patient-documents` em fixtures e
  ambiente autorizado.
- [ ] Garantir que signed URLs sejam curtas, permissionadas e auditaveis.
- [ ] Adicionar auditoria de abertura/criacao de signed URL se o contrato final
  exigir rastreabilidade de acesso.
- [ ] Trocar update direto de liberacao de documento no browser por RPC ou Edge
  Function auditada com motivo, se mantido como acao sensivel.
- [ ] Minimizar `providerDocumentId` e outros IDs provider no frontend.
- [ ] Validar webhook D4Sign fail-closed com token/HMAC ausente, invalido e
  valido.
- [ ] Validar `billingApi`, funcoes `asaas-*`, `/clinic/financeiro`,
  `/admin/billing` e `webhook-asaas`.
- [ ] Validar webhook Asaas com token ausente/invalido/valido, deduplicacao por
  hash, tenant mapping, reconciliacao e payload minimizado.
- [ ] Manter fixtures offline separadas de qualquer chamada provider sandbox ou
  real.

Criterios de aceite:

- Nenhum payload bruto, token, crypt key, signed URL sensivel, payment link ou
  provider ID sensivel aparece em logs/evidencias.
- Provider sandbox/real so e executado com autorizacao explicita.
- Falhas provider aparecem na UI como erro operacional sem vazar dados.

## P1 - Admin, observabilidade e operacao sensivel

- [ ] Validar `/admin` com platform admin autorizado e usuarios negados.
- [ ] Validar `/admin/tenants`: listagem, filtros, detalhe e estados de erro.
- [ ] Validar `/admin/tenants/[tenantId]`: overview, usuarios, unidades,
  integracoes, suporte, break-glass, auditoria e convites.
- [ ] Validar que convites usam service role apenas server-side, permissao
  correta e motivo auditavel.
- [ ] Validar `/admin/webhooks`: filtros, eventos redigidos, payload minimizado
  e triagem sem dados sensiveis.
- [ ] Validar `/admin/observability`: status operacional sem consulta indevida
  a dados sensiveis.
- [ ] Atualizar runbooks de billing, D4Sign, incidentes e release quando acoes
  admin/provider mudarem.

Criterios de aceite:

- Acoes de suporte, break-glass, convite e membership tem permissao, trilha de
  auditoria e resposta segura.
- Platform admin surfaces nao mostram dados de tenant sem permissao.
- Evidencias admin ficam redigidas.

## P2 - UI, acessibilidade e responsividade

- [V] Proteger `WeightEvolutionChart` contra `data=[]` e dominios invalidos de
  Recharts.
- [ ] Remover dependencia de hover-only nas acoes de pacientes; botoes precisam
  funcionar por teclado e touch.
- [ ] Validar eventos aninhados na linha da lista de pacientes para evitar
  navegacao acidental.
- [ ] Adicionar ou revisar `role="dialog"`, `aria-modal`, Escape e foco em
  modais/drawers de CRM, agenda, webhooks e fluxos equivalentes.
- [ ] Melhorar semantica de tabs do portal paciente com `role="tab"` e
  `aria-selected`, se adotado localmente.
- [ ] Corrigir responsividade do builder de programas em mobile/tablet.
- [ ] Validar `AdminShell` em mobile e adicionar alternativa de navegacao quando
  necessario.
- [ ] Fortalecer acessibilidade do `DashboardShell`: `aria-label` em botoes
  icon-only, menus responsivos e estados de mensagens/notificacoes.
- [ ] Trocar placeholders por labels ou `aria-label` em formularios criticos de
  estoque.
- [ ] Browser smoke com viewports `390x844`, `768x1024`, `1366x768` e
  `1440x900` para rotas criticas.

Criterios de aceite:

- Sem tela branca, overlay de framework ou erro relevante de console.
- Textos e controles nao se sobrepoem nos viewports obrigatorios.
- Fluxos principais funcionam por mouse, teclado e touch quando aplicavel.

Evidencia em andamento:

- 2026-06-02: `WeightEvolutionChart` passou a filtrar pontos invalidos,
  renderizar estado vazio estavel quando `data=[]` e calcular dominio do eixo
  incluindo a meta. Browser smoke do Paciente 360 permanece pendente.

## P2 - Seguranca, Rocket, CSP e go-live

- [ ] Confirmar via busca/CI que `SUPABASE_SERVICE_ROLE_KEY` nao aparece em
  client components, browser services ou variaveis `NEXT_PUBLIC_*`.
- [ ] Confirmar que clientes browser/SSR usam apenas anon/session-scoped
  clients.
- [ ] Revisar logs de Edge Functions para garantir que excecoes nao imprimem
  payloads, paths, URLs sensiveis ou dados de paciente.
- [ ] Decidir governanca Rocket em superficies autenticadas antes de dados
  reais: isolar/desabilitar em rotas clinicas/paciente ou formalizar DPA,
  escopo de coleta, consentimento e CSP deliberada.
- [ ] Planejar CSP sem `'unsafe-inline'` com nonce/hash quando Rocket e scripts
  externos permitirem.
- [ ] Validar `docs/operations/ENVIRONMENT_MATRIX.md`,
  `docs/security/ENV_HYGIENE.md`, `docs/operations/RELEASE_PROCESS.md` e
  `docs/operations/LGPD_SECURITY_READINESS_REVIEW.md` antes de producao.
- [ ] Registrar riscos residuais aceitos com owner e prazo.

Criterios de aceite:

- Producao com dados reais permanece NO-GO ate mocks, RLS, providers, Rocket,
  CSP, restore, incidentes e LGPD terem evidencia suficiente.
- Nenhum segredo ou dado sensivel e exposto em repo, logs, browser ou release
  notes.

## Template de evidencia por item

Use este bloco ao fechar qualquer item relevante:

```text
Item:
Status:
Data:
Branch:
Commit:
Ambiente:
Flag NEXT_PUBLIC_USE_MOCK_DATA:
Perfil/usuario de teste:
Rotas/servicos validados:
Comandos executados:
Resultados:
Comandos pulados:
Justificativa dos skips:
Screenshots/logs redigidos:
Runbooks atualizados:
Riscos residuais:
Owner/proximo passo:
```

## Ordem recomendada de execucao

1. Fechar P0 de auth/sessao/RBAC e gates globais.
2. Fechar contrato Supabase real sem fallback mock silencioso.
3. Validar fluxos clinicos core com dados reais de teste.
4. Validar Paciente 360 e portal paciente com linkage real.
5. Validar documentos, signed URLs, D4Sign e Asaas em camadas: fixture, local
   autorizado, sandbox autorizado.
6. Validar admin sensivel e observabilidade.
7. Fechar UI/accessibilidade/responsividade por rota.
8. Rodar release readiness, security/LGPD, browser smoke amplo e baseline final.
