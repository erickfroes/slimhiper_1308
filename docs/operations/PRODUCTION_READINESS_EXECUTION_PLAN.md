# Plano De Execucao Para Producao

Este documento transforma o plano de producao do SlimHiper em uma esteira
aplicavel. Ele deve ser usado junto com `RELEASE_PROCESS.md`,
`ENVIRONMENT_MATRIX.md`, `LGPD_SECURITY_READINESS_REVIEW.md`,
`OBSERVABILITY_ALERTING_RUNBOOK.md` e os runbooks de Supabase/providers.

Data de criacao: 2026-06-11.

## Estado Atual Verificado

- Stack: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3 e
  Supabase.
- Superficie atual: 33 paginas `page.tsx`, 35 rotas no build, 27 services
  frontend, 55 migrations Supabase e 22 Edge Functions.
- Gates locais verificados antes deste plano: `git diff --check`,
  `npm run type-check`, `npm run lint` e `npm run build`.
- Worktree base estava limpo antes da implementacao deste runbook.
- CI existente bloqueia type-check, lint, build, env hygiene e fixtures de
  Patient 360, D4Sign e Billing.
- Go-live segue **NO-GO** ate existir evidencia de staging/production-like,
  mocks desligados, smokes autenticados, restore/alerta testados e aprovacao
  humana LGPD/security/juridica.

## Modelo De Maturidade

| Nivel | Definicao | Evidencia minima |
| --- | --- | --- |
| N1 | Codigo existe, compila e esta mapeado. | Arquivos, rotas, services, migrations e runbooks identificados. |
| N2 | Contrato real validado localmente. | `NEXT_PUBLIC_USE_MOCK_DATA=false`, loading/empty/error/forbidden e smoke local aplicavel. |
| N3 | Ambiente staging validado com dados dummy/anonimizados. | RLS/RBAC, smokes autenticados, provider sandbox quando autorizado e logs redigidos. |
| N4 | Producao MVP candidata. | CI verde, browser smoke critico, observabilidade, backup/restore, rollback e go/no-go assinados. |
| N5 | Producao plena operada continuamente. | Alertas, auditoria, evidencias recorrentes, treinamento, suporte e performance acompanhados. |

## Componentes E Objetivos

| Componente | Estado atual | Objetivo inicial | Objetivo medio | Objetivo final | Criterio de producao |
| --- | --- | --- | --- | --- | --- |
| CI, release e ambientes | CI roda type/lint/build/fixtures; smokes Supabase sao opcionais. | Manter CI bloqueante e registrar baseline atual. | Rodar staging sem mocks e com envs segregados. | Release tagueado com changelog, rollback e go/no-go. | CI verde, smoke pos-deploy e `NEXT_PUBLIC_USE_MOCK_DATA` ausente/false. |
| Auth, sessao, RBAC e multi-tenant | Guards, app-session, roles e RLS existem. | Validar matriz de perfis: admin, clinica, paciente, sem workspace e revogado. | Testar staging com usuarios dummy por perfil. | Fail-closed para todo acesso indevido. | 401/403/404 corretos, sem leitura cross-tenant e logs redigidos. |
| Supabase schema, RLS e storage | Migrations e contratos RPC/Storage existem. | Conferir RPCs usadas pelos services contra migrations/grants. | Aplicar migrations em staging autorizado. | Producao com RLS auditada e storage permissionado. | RLS cross-tenant passa para pacientes, PII, docs, financeiro, chat e relatorios. |
| Shell/UI clinica | `DashboardShell` e componentes compartilhados em uso. | Validar loading/empty/error/forbidden por rota critica. | Browser smoke desktop/mobile. | UX operacional densa, acessivel e sem sobreposicao. | Sem tela branca, overlay, erro console ou acao hover-only critica. |
| Core clinico | Pacientes, dashboard, agenda e encounter usam services reais. | Smoke real local/staging com CRUD paciente, agenda e SOAP. | Auditar timezone, auditoria e permissoes por funcao. | Operacao clinica diaria pronta. | Criar/editar paciente, agenda, fila, SOAP e timeline com rollback seguro. |
| Paciente 360 e prontuario | Tabs amplas via Edge/RPC; rota compila. | Validar todas as tabs sem mock. | Testar permissoes por aba sensivel e cross-patient. | Historico clinico auditavel e performatico. | Resumo, timeline, documentos, financeiro, nutricao, prescricoes, relatorios e chat passam. |
| Portal paciente, diario e jornada | `/patient` exige vinculo/permissao. | Validar paciente/responsavel com vinculo ativo e usuario sem vinculo. | Testar diario, onboarding, chat, check-ins e docs liberados. | Portal aberto para dados proprios com RLS scoped. | Paciente/responsavel ve apenas o proprio escopo; sem leitura direta indevida. |
| Documentos e D4Sign | Geracao, signed URL, webhook e envio D4Sign existem. | Fixtures e smoke local sem provider. | Sandbox D4Sign com cofre/pasta reais autorizados. | Producao com assinatura, webhook e auditoria. | Signed URLs curtas, HMAC fail-closed, idempotencia e sem payload bruto. |
| Financeiro e Asaas | Billing, recibos, conciliacao e funcoes Asaas existem. | Fixtures e acoes locais sem provider. | Sandbox Asaas autorizado para customer/invoice/subscription/refund/sync. | Producao com conciliacao e webhooks monitorados. | Webhook autenticado/idempotente, divergencia rastreada e links seguros. |
| Programas, catalogo e comercial | Builder, enrollment e catalogo existem. | Validar rascunho/publicacao/enrollment sem provider. | Conectar reflexos em agenda, financeiro, documentos e portal. | Pacotes operacionais com governanca comercial. | Enrollment cria obrigacoes corretas e nao chama provider sem gate. |
| CRM e estoque | Rotas, services e migrations existem. | Smoke local de leads, tarefas, conversao e estoque. | Validar permissoes, auditoria e notificacoes. | Pos-MVP pronto para operacao comercial. | Conversao lead-paciente e estoque nao quebram PII, billing ou tenant. |
| Chat, inbox e comunidade | Chat/inbox/comunidade tem services e UI. | Validar mensagens, anexos e notificacoes. | Testar SLA, horario, retencao e moderacao. | Comunicacao operacional auditada. | Sem vazamento em anexos, unread/status consistentes e moderacao registrada. |
| Relatorios e exports | Relatorios clinicos/paciente e export functions existem. | Validar definicoes, execucao e download curto. | Testar mascaras por permissao e exports persistentes. | BI operacional seguro. | Export nao vaza PII/financeiro sem permissao e expira corretamente. |
| Admin plataforma | Admin, tenants, webhooks, observability e support existem. | Validar guard platform admin e usuarios negados. | Testar convites, roles, support/break-glass auditados. | Operacao multi-tenant administravel. | Toda acao sensivel exige permissao, motivo, audit log e expiracao. |
| Seguranca, LGPD e operacao | CSP, health, runbooks, backup/DR e incidentes existem. | Revisar secrets/envs sem imprimir valores. | Testar restore, alerta controlado e resposta a incidente em staging. | Go-live assinado por owner humano. | LGPD/security go/no-go aprovado, backups restauraveis e alertas acionaveis. |

## Ordem De Aplicacao

1. Fechar gates globais: CI, env hygiene, health, mock policy e baseline.
2. Validar Auth/RBAC/RLS em local e staging com usuarios dummy.
3. Validar core clinico, Paciente 360 e portal paciente com dados sinteticos.
4. Validar documentos, financeiro e providers em camadas: fixture, local
   autorizado, sandbox autorizado e producao somente apos go/no-go.
5. Validar admin, observabilidade, incidentes, backup/restore, rollback e LGPD.
6. Promover MVP clinico apenas quando todos os componentes MVP estiverem em N4.
7. Levar CRM, estoque, comunidade e automacoes avancadas para N4/N5 em ondas
   separadas, sem expor dados reais quando ainda estiverem N3.

## Etapas Operacionais

| Etapa | Objetivo | Execucao | Gate para avancar |
| --- | --- | --- | --- |
| 0 - Baseline local | Confirmar que o repositorio esta saudavel antes de qualquer promocao. | `git status --short`, `git diff --check`, `npm run type-check`, `npm run lint`, `npm run build`. | Sem falhas e sem mudancas inesperadas. |
| 1 - Readiness estatica | Garantir que docs, CI, env template, health e service-role placement estao alinhados. | `node scripts/operations/check-production-readiness.mjs`. | Sem `FAIL`; avisos registrados com owner. |
| 2 - Contratos locais | Validar contratos reais sem provider externo e com dados sinteticos. | `node scripts/operations/check-supabase-contracts.mjs --strict` e fixtures/smokes locais autorizados em `scripts/supabase`. | RLS/RBAC, Edge Functions e RPCs criticos passam. |
| 3 - Browser smoke | Verificar rotas criticas e interacoes principais. | `npm run dev` e checklist em `docs/testing/BROWSER_SMOKE_CHECKLIST.md`. | Sem tela branca, overlay, erro console ou estado inseguro. |
| 4 - Staging | Repetir gates com mocks desligados, env segregado e dados dummy/anonimizados. | Deploy staging, `/api/health`, `node scripts/observability/post-deploy-smoke.mjs --base-url <url>` e smokes autenticados. | Health sem `fail`, auth/RLS fail-closed e evidencias redigidas. |
| 5 - Providers sandbox | Validar D4Sign/Asaas em sandbox com autorizacao explicita. | Fixtures antes de sandbox; sandbox apenas em janela aprovada. | HMAC/idempotencia/conciliacao sem payload bruto ou segredo em evidencia. |
| 6 - Operacao | Ensaiar restore, alerta, incidente, rollback e suporte. | Runbooks de backup, observabilidade, incidentes e rollback. | Evidencia redigida com owner e risco residual aceito. |
| 7 - Go/no-go | Obter aprovacao humana para producao com dados reais. | Revisao LGPD/security/juridica e release notes. | Decisao go/no-go assinada; NO-GO e o default sem evidencia completa. |

## Auditoria Local Read-Only

Execute o auditor antes de abrir uma release candidate:

```bash
node scripts/operations/check-production-readiness.mjs
node scripts/operations/check-supabase-contracts.mjs --strict
```

Use `--strict` quando quiser que qualquer aviso tambem quebre o comando:

```bash
node scripts/operations/check-production-readiness.mjs --strict
```

O auditor nao le `.env`, nao chama Supabase remoto, nao executa migrations, nao
chama D4Sign/Asaas e nao escreve em banco. Ele verifica estrutura, scripts,
workflows, runbooks, env template, politica de mock e ocorrencias de
service-role em caminhos nao permitidos.

O auditor Supabase estatico tambem e read-only. Ele cruza chamadas `.rpc(...)` e
`functions.invoke(...)` detectadas em `src` e `supabase/functions` contra
migrations SQL e diretorios de Edge Functions. Ele nao aplica migration, nao
chama projeto remoto e nao prova RLS em runtime; esse ponto continua dependente
de smokes autorizados.

## Politica De Mock

- A leitura de `NEXT_PUBLIC_USE_MOCK_DATA` deve ficar centralizada em
  `src/lib/mockMode.ts`.
- Services e componentes devem usar `isMockDataEnabled()` em vez de ler a
  variavel diretamente.
- Imports estaticos de providers mock sao proibidos fora de modulos mock
  dedicados; services devem carregar mocks com `await import(...)` apenas dentro
  de branch protegida por `isMockDataEnabled()`.
- `isMockDataEnabled()` retorna `false` em ambientes production-like
  (`production`, `prod`, `staging`), mesmo que a flag publica seja configurada
  como `true`.
- `/api/health` continua falhando em staging/producao quando a flag foi
  solicitada, para expor a configuracao incorreta antes do go-live.
- Mocks continuam permitidos apenas para local/preview descartavel, com dados
  dummy e evidencia marcada como smoke de UX, nao contrato de producao.

## Evidencia Obrigatoria Por Componente

Use este bloco ao promover qualquer componente de nivel:

```text
Componente:
Nivel anterior:
Nivel novo:
Data:
Branch:
Commit:
Ambiente:
Flag NEXT_PUBLIC_USE_MOCK_DATA:
Perfis/usuarios dummy:
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

## Gates De Finalizacao Para Producao

- `git diff --check`, `npm run type-check`, `npm run lint`, `npm run build` e
  CI verde.
- `/api/health` sem `fail` em staging/production-like.
- `NEXT_PUBLIC_USE_MOCK_DATA` ausente ou `false` em staging/producao.
- RLS cross-tenant aprovado para familias clinicas, PII, documentos,
  financeiro, chat, relatorios e portal paciente.
- Browser smoke critico aprovado para anonimo, staff clinico, admin plataforma e
  paciente/responsavel dummy.
- D4Sign e Asaas validados por fixture e sandbox autorizado, sem payload bruto,
  token, provider ID sensivel ou signed URL em evidencia.
- Backup/restore isolado, alerta controlado, rollback e incidente/tabletop
  testados com evidencia redigida.
- Revisao LGPD/security/juridica assinada por owner humano.

## Regras De Bloqueio

Producao deve ficar bloqueada se qualquer item ocorrer:

- Mock habilitado em staging/producao.
- Falha de Auth/RLS que retorna sucesso onde deveria ser 401/403/404.
- Secret, cookie, token, payload provider bruto, PII/PHI, storage path sensivel
  ou signed URL em log/evidencia.
- Provider real chamado sem autorizacao explicita e janela aprovada.
- Migration remota, restore, bootstrap, retry de webhook ou `supabase db push`
  executado sem autorizacao nominal.
- CI ou smoke pos-deploy falha sem rollback/roll-forward aprovado.
