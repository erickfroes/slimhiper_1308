# Plano de controle para deixar o SlimHiper 100% funcional

Data de criação: 2026-06-02.

Este documento transforma os achados da auditoria `docs/PROJECT_SCREEN_COMPONENT_AUDIT.md`
em um plano operacional de controle, execução, validação e aceite para tornar o
SlimHiper completamente funcional em ambiente real, sem depender de mocks para
fluxos produtivos.

A auditoria de origem foi estática: não leu `.env`, não chamou provedores
externos, não executou migrações ou bootstraps Supabase e não fez validação
visual no navegador. Por isso, este plano trata a funcionalidade completa como
uma sequência de gates verificáveis: código estável, contratos Supabase reais,
permissões/RLS, browser smoke, integrações externas controladas, observabilidade
e prontidão para produção.

**Atualização de verificação completa em 2026-06-03:** foi feita nova varredura
estática do repositório, comparando o plano com as rotas, serviços, Edge
Functions, migrações e scripts presentes no código. A verificação cobriu `src/app`,
`src/services`, `src/lib/supabase`, `supabase/functions`, `supabase/migrations`,
`supabase/tests`, `scripts/supabase`, `.env.example` e `package.json`, sem ler
`.env`, sem executar migrações/bootstraps, sem chamar Supabase remoto, D4Sign ou
Asaas e sem dados reais. O inventário atual confirma 79 arquivos em `src/app`, 25
serviços frontend, 17 Edge Functions, 29 migrações e 23 scripts Supabase. Também
foram identificadas rotas reais que precisavam entrar explicitamente no controle:
`/admin/billing`, `/admin/security`, `/admin/integrations`, `/admin/support`,
`/admin/audit`, os redirecionamentos legados `/patient-list` e `/paciente-360`, e
a API server-side de convite `/api/admin/tenants/[tenantId]/invitations`. O plano
abaixo foi atualizado para refletir esse estado: há avanço de contrato real em
settings, inbox, CRM e admin tenants; a principal pendência transversal continua
sendo evidência em ambiente Supabase de homologação, usuários sintéticos e browser
smoke autenticado com `NEXT_PUBLIC_USE_MOCK_DATA=false`.

## 1. Objetivo final

O projeto será considerado 100% funcional quando todos os critérios abaixo forem
verdadeiros:

- Todas as rotas públicas, clínicas, administrativas e do portal paciente
  carregam em navegador sem tela em branco, overlay do framework ou erro crítico
  no console.
- Todas as operações principais funcionam com `NEXT_PUBLIC_USE_MOCK_DATA=false`
  em ambiente de homologação Supabase real.
- Todos os serviços frontend têm contratos reais validados contra tabelas, RPCs
  ou Edge Functions correspondentes.
- Todas as áreas marcadas como `Parcial / contrato dependente` na auditoria
  foram fechadas com implementação, contrato, permissão, teste e evidência.
- Supabase Auth, RBAC, tenant context, RLS, grants, RPCs, storage e Edge
  Functions foram validados com usuários sintéticos de perfis diferentes.
- D4Sign e Asaas foram validados somente em ambiente autorizado/sandbox, com
  credenciais seguras e dados sintéticos.
- Fluxos sensíveis de documentos, cobranças, prescrições, suporte admin e
  break-glass têm autorização, auditoria, idempotência e tratamento de erro.
- Os comandos obrigatórios passam: `npm run type-check`, `npm run lint`,
  `npm run build` e `git diff --check`.
- O healthcheck de produção/homologação não retorna estado `fail`.
- Nenhum segredo, dado real de paciente, token de provider ou payload sensível é
  impresso em logs, commits, documentação ou UI pública.

## 2. Princípios de execução

1. **Não mascarar produção com mock.** O modo mock é permitido para
   desenvolvimento e demonstração, mas cada fluxo produtivo precisa ser validado
   com `NEXT_PUBLIC_USE_MOCK_DATA=false`.
2. **Contrato antes de UI nova.** Antes de expandir uma tela, confirmar se a RPC,
   tabela, Edge Function, RLS e envelope de resposta já existem e estão alinhados.
3. **Permissão server-side antes de conveniência client-side.** Ocultar botões no
   cliente melhora UX, mas não substitui RLS, guardas server-side e validações em
   Edge Functions ou API routes.
4. **Dados sensíveis sempre minimizados.** Pacientes, documentos, pagamentos,
   webhooks e prontuários devem ser tratados como dados sensíveis em logs,
   payloads, storage e auditoria.
5. **Provider externo só com autorização.** D4Sign e Asaas nunca devem ser
   chamados durante validação local comum; usar somente ambiente sandbox ou
   homologação explicitamente autorizado.
6. **Evidência por gate.** Cada etapa deve deixar registro do comando executado,
   ambiente, usuário de teste, resultado observado e pendência restante.
7. **Pequenas entregas reversíveis.** Corrigir e validar por domínio para reduzir
   risco de regressão transversal.

## 3. Matriz de status e responsáveis

Use a tabela abaixo como controle vivo. Atualize `Status`, `Evidência` e
`Bloqueios` a cada entrega.

| ID  | Frente                   | Escopo                                                                                                 | Status inicial                                                                                                                                                                                                        | Status alvo                    | Evidência obrigatória                                                                                                                | Bloqueios esperados                                            |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| F00 | Baseline técnica         | TypeScript, lint, build e diff check                                                                   | Executado localmente em 2026-06-02                                                                                                                                                                                    | Aprovado                       | `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check` passaram; lint/build mantêm 11 warnings conhecidos         | Sem bloqueio local                                             |
| F01 | Auth e guardas           | `/`, `/auth/login`, `/no-workspace`, middleware, `/api/auth/app-session`                               | Blindado por código em 2026-06-02 para evitar self-redirect e tratar `/no-workspace` sem sessão                                                                                                                       | Aprovado em browser e contrato | Matriz de redirecionamento por perfil; validação estática confirmou alvo canônico e ausência de redirect para a própria rota         | Sessões sintéticas e vínculos de usuário                       |
| F02 | Correção portal paciente | `canAccessPatientPortal` no endpoint de sessão                                                         | Corrigido por código em 2026-06-02                                                                                                                                                                                    | Corrigido e testado            | Endpoint reutiliza helper canônico de destino; validação real por perfis segue pendente sem usuários sintéticos/Supabase homologação | Usuários sintéticos e ambiente Supabase homologação            |
| F03 | Shell clínico            | `DashboardShell`, polling, busca, logout, menus                                                        | Blindado por código em 2026-06-02                                                                                                                                                                                     | Resiliente a falhas            | Polling e ações de leitura tratam exceções localmente; browser smoke segue pendente                                                  | Ambiente/browser autenticado para smoke                        |
| F04 | Dashboard clínico        | `/clinic/dashboard`, `dashboardApi`                                                                    | Mock/real misto                                                                                                                                                                                                       | Real validado                  | Smoke sem mock com métricas, fila e alertas                                                                                          | Contratos de métricas e insights                               |
| F05 | Pacientes                | `/clinic/patients`, `patientsApi`                                                                      | Avanço de contrato real em 2026-06-02: busca sanitizada em PII, filtro real por status, refresh concorrente protegido e ações acessíveis                                                                              | CRUD real validado             | Criar, editar, listar, filtrar e abrir 360; `npm run type-check` passou após avanço de código                                        | RLS em PII, paginação real >100 e smoke autenticado            |
| F06 | Paciente 360             | `/clinic/patients/[patientId]` e abas                                                                  | Correção de gráfico aplicada em 2026-06-02; demais abas mock/real misto                                                                                                                                               | Real validado por aba          | `WeightEvolutionChart` trata vazio/nulo/inválido sem `NaN`; smoke por paciente sintético segue pendente                              | Edge Functions, permissões por aba e paciente sintético        |
| F07 | Atendimento SOAP         | `/clinic/patients/[patientId]/encounter`, `encounterApi`                                               | Avanço de imutabilidade em 2026-06-02: rascunho/finalização reais já usam `encounters`, `soap_notes`, timeline e audit log; edição pós-finalização bloqueada no serviço e UI                                          | Escrita real validada          | Salvar rascunho, recarregar, finalizar atendimento, timeline/audit e bloqueio pós-finalização                                        | Browser autenticado, usuários sintéticos e RLS real            |
| F08 | Agenda                   | `/clinic/agenda`, `agendaApi`                                                                          | Avanço de contrato real em 2026-06-02: leitura diária/mensal, criação, edição, status, cancelamento com motivo, eventos de fila e conflito de horário blindados por código                                            | Real validado                  | Criar, editar, cancelar e mudar status                                                                                               | Queue events e conflitos de horário                            |
| F09 | Programas                | `/clinic/programs`, builder, `programsApi`                                                             | Avanço de matrícula em 2026-06-02: UI de programas aciona `enroll_patient_in_program`, seleciona paciente ativo e mostra reflexos de check-ins/documentos/agenda/invoice                                              | Real validado                  | Criar draft, publicar, clonar e matricular paciente                                                                                  | Smoke autenticado, RLS multi-tenant e efeitos derivados        |
| F10 | Documentos clínica       | `/clinic/documents`, `clinicDocumentsApi`                                                              | Avanço de contrato real em 2026-06-02: UI e Edge Function bloqueiam envio D4Sign quando o template não está habilitado/ativo; status fica visível na lista                                                            | Fluxo completo validado        | Gerar, assinar, liberar e consultar URL                                                                                              | D4Sign sandbox, storage, webhook e permissões reais            |
| F11 | Financeiro clínica       | `/clinic/financeiro`, `billingApi`                                                                     | Avanço de idempotência em 2026-06-02: criação de cobrança/assinatura usa chave por tentativa e Edge Functions reutilizam registros locais antes de chamar Asaas                                                       | Real validado                  | Overview, reconciliação e ações sandbox                                                                                              | Asaas sandbox, webhook real e RLS multi-tenant                 |
| F12 | Relatórios clínica       | `/clinic/reports`, `clinicReportsApi`                                                                  | Avanço de contrato real em 2026-06-02: Edge Function revalida definição/permissão/export antes do run; UI consulta status e bloqueia export desabilitado                                                              | Execução/exportação validada   | Executar relatório, consultar status e baixar exportação segura                                                                      | Smoke Supabase/browser com usuário sintético                   |
| F13 | Configurações            | `/clinic/settings`, `clinicSettingsApi`                                                                | Verificado em 2026-06-03: leitura e mutações reais usam RPCs `get_clinic_settings_snapshot`, `update_clinic_settings` e `upsert_clinic_unit`; smoke autenticado pendente                                              | Real validado                  | Ler, atualizar clínica e unidade                                                                                                     | RPCs de settings, RLS e browser autenticado                    |
| F14 | Inbox                    | `/clinic/inbox`, `notificationsApi`, `chatApi`                                                         | Verificado em 2026-06-03: inbox usa RPCs reais de resumo/listagem/marcar/arquivar/atribuir/status, com fallback mock apenas por flag explícita; smoke autenticado pendente                                            | Real validado                  | Marcar lido, arquivar, atribuir e responder                                                                                          | RPCs de comunicações, RLS e browser autenticado                |
| F15 | CRM                      | `/clinic/crm`, `crmApi`                                                                                | Verificado em 2026-06-03: pipeline usa RPCs reais para listar/criar/editar/mover/atividade/tarefa/conversão; fallback mock apenas por flag explícita; smoke autenticado pendente                                      | Real validado                  | Criar lead, mover etapa e converter paciente                                                                                         | RPCs CRM, duplicidade de PII e browser autenticado             |
| F16 | Inventário               | `/clinic/inventory`, `inventoryApi`                                                                    | Avanço de contrato real em 2026-06-03: UI usa RPCs reais de snapshot/item/lote/movimento/transferência, valida dados antes de gravar e expõe alertas/ledger auditado                                                  | Real validado                  | Criar item/lote/movimento/transferência                                                                                              | Estoque negativo e auditoria                                   |
| F17 | Portal paciente          | `/patient`, `patientPortalApi`                                                                         | Avanço de contrato real em 2026-06-03: mutações validam UUID/texto antes das RPCs, erros são sanitizados, links financeiros aceitam apenas HTTP(S) e check-ins coletam respostas das perguntas do template            | Real validado                  | Snapshot, mensagem, check-in e notificação                                                                                           | Vínculo paciente, RLS e liberação                              |
| F18 | Admin overview           | `/admin`, `/admin/billing`, `/admin/security`, `/admin/integrations`, `/admin/support`, `/admin/audit` | Verificado em 2026-06-03: rotas derivadas existem e reutilizam `AdminContent` com seções reais; snapshot agrega tenants, webhooks, auditoria e suporte via contratos de plataforma; smoke pendente                    | Real validado                  | Snapshot admin, navegação de seções, billing, segurança, integrações, suporte e auditoria                                            | Permissão platform admin e browser autenticado                 |
| F19 | Admin tenants            | `/admin/tenants`, `/admin/tenants/[tenantId]`, `/api/admin/tenants/[tenantId]/invitations`             | Avanço de contrato real em 2026-06-03: detalhe, membership, suporte, break-glass e revogação usam RPCs auditadas; convite fica em Route Handler server-side com cliente admin; smoke pendente                         | Real validado                  | Convite, membership, suporte, break-glass, revogação e audit log                                                                     | Service role server-side, justificativas e usuários sintéticos |
| F20 | Webhooks admin           | `/admin/webhooks`                                                                                      | Avanço de contrato real em 2026-06-03: monitor usa RPC real, filtros provider/status, detalhes sanitizados, proteção contra resposta obsoleta e identifica reprocesso como indisponível até existir contrato auditado | Real validado                  | Listar eventos Asaas/D4Sign e filtros; detalhes sem payload bruto; reprocessamento protegido quando existir                          | Dados sintéticos de webhooks e contrato de reprocesso          |
| F21 | Observability            | `/admin/observability`                                                                                 | Avanço em 2026-06-03: painel combina `/api/health` e webhooks reais com monitores estáticos explicitamente rotulados                                                                                                  | Útil operacionalmente          | Checklist de monitores, links reais e distinção entre sinais reais/estáticos                                                         | Métricas externas/APM ainda não conectadas                     |
| F22 | Segurança e privacidade  | Logs, env, service role, storage, URLs                                                                 | Verificação estática em 2026-06-03: `.env`/`.env.local` não estão versionados; service-role em `src` aparece apenas no helper `server-only`; `.env.example` usa placeholders vazios                                   | Aprovado                       | Checklist de ausência de vazamentos, rg de service-role/client e revisão de `.env.example`                                           | Validação de logs reais, storage e providers em homologação    |
| F23 | Produção                 | Build, healthcheck, env, rollback                                                                      | Não validado                                                                                                                                                                                                          | Go-live aprovado               | Runbook de release e rollback                                                                                                        | Secrets, DNS, Supabase e providers                             |

## 4. Fase 0 — Preparação de ambiente e evidências

### 4.1 Criar ambientes controlados

| Ambiente             | Objetivo                               | Mock         | Dados                   | Provedores externos       |
| -------------------- | -------------------------------------- | ------------ | ----------------------- | ------------------------- |
| Local dev            | Desenvolvimento UI e correções rápidas | Permitido    | Mock ou sintético local | Proibido                  |
| Homologação Supabase | Validar Auth/RLS/RPC/Edge Functions    | Desabilitado | Sintético e descartável | Proibido por padrão       |
| Homologação provider | Validar D4Sign/Asaas sandbox           | Desabilitado | Sintético e autorizado  | Permitido com autorização |
| Produção             | Operação real                          | Desabilitado | Real                    | Permitido com governança  |

### 4.2 Checklist inicial

- [x] Confirmar branch de trabalho e estado limpo com `git status --short`.
- [x] Instalar dependências com `npm install` se necessário. Dependências já estavam disponíveis; `npm install` não foi necessário.
- [x] Rodar `npm run type-check`.
- [x] Rodar `npm run lint`.
- [x] Rodar `npm run build`.
- [x] Rodar `git diff --check`.
- [x] Registrar erros pré-existentes antes de alterações funcionais. Lint/build passaram com 11 warnings conhecidos após a limpeza de warnings locais em componentes não relacionados.
- [x] Confirmar que `.env` não foi lido nem impresso.
- [x] Confirmar variáveis esperadas somente por `.env.example` e referências de código. Nenhuma leitura de `.env` foi feita nesta execução.
- [ ] Definir usuários sintéticos para admin, clínica, paciente e usuário sem workspace. Bloqueado nesta execução local sem ambiente de homologação/autorização.

### 4.3 Evidência mínima por execução

Para cada validação, registrar:

- Data e hora.
- Ambiente.
- Commit/branch.
- Usuário sintético usado.
- `NEXT_PUBLIC_USE_MOCK_DATA` usado.
- Comando ou rota validada.
- Resultado esperado.
- Resultado observado.
- Prints/screenshot quando for validação visual relevante.
- Logs sanitizados, sem segredos e sem dados reais.
- Pendências ou bloqueios.

## 5. Fase 1 — Correções P0 de código

### 5.1 Endpoint `/api/auth/app-session`

**Problema:** o endpoint de sessão fixa `canAccessPatientPortal` como `false`,
enquanto outros pontos calculam acesso real do paciente. Isso pode quebrar
redirecionamentos e guardas cliente.

**Plano técnico:**

- [x] Localizar a rota `/api/auth/app-session`.
- [x] Localizar o helper de sessão usado pelo middleware ou pela camada server.
- [x] Remover valor fixo de `canAccessPatientPortal`.
- [x] Reutilizar a mesma regra canônica de acesso ao portal.
- [ ] Validar resposta sanitizada para perfis: bloqueado sem usuários sintéticos em Supabase homologação.
  - [ ] sem sessão;
  - [ ] admin plataforma;
  - [ ] colaborador clínico;
  - [ ] paciente com vínculo ativo;
  - [ ] usuário autenticado sem workspace;
  - [ ] paciente sem portal liberado.
- [x] Confirmar destino sugerido coerente com middleware.

**Aceite:**

- [ ] Paciente autorizado recebe `canAccessPatientPortal=true`. Pendente validação com usuário sintético autorizado.
- [ ] Paciente não autorizado recebe `canAccessPatientPortal=false`. Pendente validação com usuário sintético não autorizado.
- [ ] Admin não perde acesso a `/admin`. Pendente validação com usuário admin sintético.
- [ ] Colaborador clínico não perde acesso a `/clinic/dashboard`. Pendente validação com colaborador clínico sintético.
- [x] O endpoint não expõe tokens, cookies, PII sensível ou secrets.

### 5.2 `WeightEvolutionChart` com dados vazios

**Problema:** cálculos com `Math.min`/`Math.max` podem gerar valores inválidos
quando `data` está vazio.

**Plano técnico:**

- [x] Localizar `WeightEvolutionChart`.
- [x] Adicionar early return para array vazio, nulo ou inválido.
- [x] Renderizar `EmptyState` ou estado visual consistente.
- [x] Garantir que dados parcialmente inválidos sejam filtrados ou normalizados.
- [ ] Validar no Paciente 360 com paciente sem histórico de peso. Bloqueado sem paciente sintético/browser autenticado.

**Aceite:**

- [x] Sem `NaN`, `Infinity` ou erro de renderização.
- [x] Estado vazio é claro para o usuário.
- [x] Gráfico permanece correto com dados válidos.

### 5.3 Resiliência do `DashboardShell`

**Problema:** o shell clínico é transversal; falhas em notificações, busca ou
polling não podem derrubar páginas filhas.

**Plano técnico:**

- [x] Revisar chamadas a `notificationsApi` dentro do shell.
- [x] Garantir tratamento de erro local e recuperável.
- [x] Garantir que falha em polling não interrompa renderização dos children.
- [ ] Validar logout e busca de paciente independentemente do polling. Bloqueado sem browser autenticado.
- [x] Adicionar mensagem discreta ou estado degradado quando comunicações falham.

**Aceite:**

- [ ] `/clinic/dashboard` carrega mesmo com falha de comunicações. Browser smoke pendente.
- [ ] `/clinic/patients` carrega mesmo com falha de comunicações. Browser smoke pendente.
- [x] Erro é visível de forma não intrusiva ou registrado sanitizado.

## 6. Fase 2 — Auth, RBAC e navegação protegida

### 6.1 Matriz de redirecionamento

| Perfil                 | Rota inicial        | Destino esperado             | Resultado                                                                                        |
| ---------------------- | ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Sem sessão             | `/`                 | `/auth/login`                | [x] Código: rota raiz redireciona para login; browser real pendente                              |
| Sem sessão             | `/clinic/dashboard` | `/auth/login`                | [x] Código: middleware protege `/clinic`; browser real pendente                                  |
| Sem sessão             | `/admin`            | `/auth/login`                | [x] Código: middleware protege `/admin`; browser real pendente                                   |
| Admin plataforma       | `/auth/login`       | `/admin`                     | [x] Código: alvo canônico prioriza admin; usuário sintético pendente                             |
| Colaborador clínico    | `/auth/login`       | `/clinic/dashboard`          | [x] Código: alvo canônico exige vínculo ativo; usuário sintético pendente                        |
| Paciente autorizado    | `/auth/login`       | `/patient`                   | [x] Código: alvo canônico usa `canAccessPatientPortal`; usuário sintético pendente               |
| Usuário sem workspace  | `/auth/login`       | `/no-workspace`              | [x] Código: fallback autenticado sem acesso vai para `/no-workspace`; usuário sintético pendente |
| Paciente sem liberação | `/patient`          | Bloqueio amigável            | [x] Código: middleware redireciona para alvo seguro; RPC/browser pendentes                       |
| Colaborador sem admin  | `/admin`            | Bloqueio ou redirecionamento | [x] Código: layout/guard bloqueiam admin; usuário sintético pendente                             |
| Paciente               | `/clinic/dashboard` | Bloqueio ou redirecionamento | [x] Código: layout clínico mostra bloqueio por perfil; usuário sintético pendente                |

### 6.2 Validações obrigatórias

- [x] Middleware atualiza sessão sem loops de redirecionamento. Validação de código em 2026-06-02 adicionou guarda contra redirect para a própria rota.
- [x] `/auth/login` redireciona usuário já autenticado para destino correto. Validação de código em 2026-06-02 usa o mesmo alvo canônico do endpoint/middleware.
- [x] `/no-workspace` mostra ação segura de logout/retorno. Em 2026-06-02 a página passou a diferenciar usuário sem sessão, falha de validação e usuário autenticado sem workspace.
- [x] `PlatformAdminGuard` revalida `/api/auth/app-session` corretamente. Validação de código em 2026-06-02 confirmou `fetch` sem cache e redirecionamento de não autenticados.
- [ ] Browser back/forward não expõe área proibida após logout. Pendente browser autenticado com usuários sintéticos.

### 6.3 Progresso registrado em 2026-06-02

- Middleware centralizou o cálculo do alvo resolvido para reutilizar o alvo
  canônico de `getAppSessionTargetRoute` quando a sessão da aplicação é válida e
  fallback seguro quando há falha de contrato.
- Middleware passou a evitar redirecionamento para a própria rota, reduzindo
  risco de loop em `/auth/login`, `/no-workspace` ou cenários de erro de sessão.
- `/no-workspace` entrou no matcher do middleware para que usuários autenticados
  com acesso real sejam encaminhados ao destino correto, enquanto usuários sem
  workspace permanecem na tela de orientação.
- A página `/no-workspace` agora diferencia três estados seguros: sem sessão,
  falha de validação e usuário autenticado sem workspace/portal liberado.
- Validação real em navegador e matriz completa por perfil continuam pendentes
  até existir ambiente Supabase de homologação com usuários sintéticos.

## 7. Fase 3 — Fluxos clínicos principais

### 7.1 `/clinic/dashboard`

**Contrato:** `dashboardApi`, tabelas clínicas/financeiras/comunicações e RPC de
insights.

**Checklist:**

- [x] Carrega métricas reais sem mock. Código usa `dashboardApi` real quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`; validação Supabase/browser ainda depende de homologação.
- [x] Mostra fila do dia. Código consome `appointments` reais do tenant ativo; evidência browser pendente.
- [x] Mostra agenda do dia. Código consome `appointments` reais do tenant ativo; evidência browser pendente.
- [x] Mostra alertas ativos. Código consome `patient_alerts` reais do tenant ativo; evidência browser pendente.
- [x] Mostra pacientes que precisam de revisão. Código deriva lista dos alertas ativos reais; evidência browser pendente.
- [x] Estado vazio quando não há dados. Em 2026-06-02 foi adicionado banner operacional para tenant sem agenda/fila/alertas/documentos/mensagens/revisões.
- [x] Estado de erro quando RPC falha. Em 2026-06-02 a UI passou a exibir erro genérico e retry sem vazar detalhes do contrato real.
- [x] Refresh não duplica dados. Em 2026-06-02 foi adicionado controle de requisição ativa para ignorar respostas antigas durante refresh concorrente.

**Progresso registrado em 2026-06-02:**

- Removidos textos fixos de demonstração no cabeçalho do dashboard; a tela agora mostra a data corrente e indica que os dados pertencem ao tenant ativo.
- `DashboardContent` passou a ignorar respostas obsoletas de carregamentos concorrentes para evitar sobrescrita/duplicidade visual no refresh.
- A falha de carregamento do dashboard mantém detalhes sensíveis no console mínimo e mostra mensagem genérica com ação de retry para o usuário.
- `dashboardApi` passou a propagar erro da leitura de `profiles.active_tenant_id`, evitando escolher tenant de fallback quando o contrato de perfil falha.
- Validação real em navegador, Supabase de homologação e usuários sintéticos continua pendente.

### 7.2 `/clinic/patients`

**Contrato:** `patientsApi`, `patients`, `patient_pii`, programas, invoices,
alertas e agenda.

**Checklist:**

- [x] Lista pacientes reais do tenant. Código usa `getPatientListPage`/Supabase quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`; validação Supabase/browser segue pendente.
- [x] Busca por nome/documento sanitizado. Em 2026-06-02 `patientsApi` passou a normalizar a busca, remover curingas perigosos e pesquisar em `full_name`, `cpf_masked`, `phone` e `email` da `patient_pii` por tenant.
- [x] Filtros funcionam. Em 2026-06-02 o filtro de status passou a ser aplicado no contrato real (`patients.status`); filtros derivados de programa/financeiro/adesão continuam client-side sobre linhas carregadas.
- [x] Ordenação funciona. Código mantém ordenação client-side por colunas da tabela; validação browser pendente.
- [x] Paginação funciona. Em 2026-06-02 a tela passou a enviar `page/pageSize` ao `getPatientListPage` para busca/status sem filtros derivados, usar `total` real no rodapé e renderizar janela de páginas navegável; filtros derivados continuam carregando até 100 linhas por dependerem de contratos agregados futuros.
- [x] Seleção em massa funciona sem expor ações indevidas. Em 2026-06-02 ações em massa continuam desabilitadas quando não há escrita segura e checkboxes ganharam rótulos acessíveis.
- [x] Criar paciente grava dados em tabelas corretas. Código grava `patients` e `patient_pii` no tenant ativo; validação Supabase/RLS pendente.
- [x] Editar paciente atualiza dados e respeita RLS. Código atualiza por `tenant_id` e `id`/`patient_id`; validação multi-tenant real pendente.
- [x] Abrir Paciente 360 usa `patientId` correto. Link e clique de linha usam `/clinic/patients/${patient.id}`.
- [ ] Tenant A não acessa paciente do tenant B. Pendente validação com usuários sintéticos e RLS em homologação.

**Progresso registrado em 2026-06-02:**

- `patientsApi` recebeu sanitização explícita da busca de pacientes para remover caracteres de controle e curingas de `ilike`, limitar o tamanho do termo e pesquisar nome, CPF mascarado, telefone e email sem expor valores em logs.
- A listagem `/clinic/patients` passou a chamar `getPatientListPage` com busca/status em vez de carregar tudo pelo helper legado, mantendo total retornado pelo contrato real e protegendo respostas obsoletas em refresh concorrente.
- O filtro operacional de status foi adicionado ao painel de filtros e aplicado no Supabase por `patients.status`; filtros derivados seguem client-side enquanto o contrato agregado não suporta todos os campos.
- A paginação de `/clinic/patients` foi conectada ao contrato real para busca/status: a página atual e o tamanho selecionado agora são enviados ao serviço, o rodapé usa o total retornado pelo Supabase e a janela de botões acompanha páginas intermediárias em vez de mostrar somente as cinco primeiras.
- O fallback mock de `patientsApi` passou a respeitar busca/status e `page/pageSize`, mantendo comportamento equivalente ao contrato real durante desenvolvimento local.
- Ações de linha deixaram de depender de hover para cumprir o requisito touch/teclado, e seleção em massa recebeu labels acessíveis mantendo ações não autorizadas desabilitadas.
- Validação browser autenticada, criação/edição real e isolamento Tenant A/B continuam pendentes até homologação com usuários sintéticos.

### 7.3 `/clinic/patients/[patientId]` — Paciente 360

**Checklist geral:**

- [x] `Patient360Content` carrega snapshot real quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`, via Edge Function `patient-360-summary`; validação Supabase/browser segue pendente.
- [x] Loading aparece durante busca. Código mantém skeleton do cabeçalho, abas e cards enquanto o snapshot é carregado.
- [x] Erro de snapshot mostra retry/feedback. Código mostra feedback genérico, toast e botão de retry sem expor detalhes do contrato.
- [x] Cabeçalho mostra dados sanitizados. Em 2026-06-02 foram adicionados fallbacks para telefone/email/data inválida e ocultação do status financeiro quando o perfil não possui permissão.
- [x] Tabs não fazem chamadas indevidas antes de permissão. Conteúdo de abas restritas não é montado; resumo e atalhos do cabeçalho agora respeitam permissões de documentos, financeiro, chat, relatórios, agenda e atendimento.

**Checklist por aba:**

| Aba         | Validação                                                | Resultado                                                                                                         |
| ----------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Resumo      | KPIs, alertas, próximas ações e evolução com dados reais | [x] Código consome snapshot real e restringe resumos sensíveis por permissão; browser smoke pendente              |
| Timeline    | Eventos cronológicos reais e vazios tratados             | [x] Código usa `patient-timeline` e trata loading/erro/vazio; browser smoke pendente                              |
| Consultas   | Agenda/histórico do paciente                             | [x] Código recarrega agenda real por paciente e mostra loading/erro/vazio; criação/edição ficam na fase Agenda    |
| Documentos  | Listar, gerar, assinar e obter link quando autorizado    | [x] Código monta aba só com permissão, usa serviços reais e bloqueia ações pelo contrato; D4Sign sandbox pendente |
| Financeiro  | Faturas, status e ações autorizadas                      | [x] Código monta aba só com permissão financeira e bloqueia ações sem escrita/ambiente; Asaas sandbox pendente    |
| Nutrição    | Plano via Edge Function ou estado vazio                  | [x] Código usa Edge Function/serviço real e estado vazio; browser smoke pendente                                  |
| Prescrições | Respeito a `canViewMedicalPrescriptions`                 | [x] Código oculta prescrições médicas para perfil sem `canViewMedicalPrescriptions` e nutricionista               |
| Pacotes     | Progresso e status de programas                          | [x] Código exibe enrollment do snapshot real ou estado sem pacote; matrícula real fica na fase Programas          |
| Relatórios  | Definições e downloads autorizados                       | [x] Código monta aba só com permissão e usa serviços de relatório/exportação; download real pendente              |
| Chat        | Thread, envio e marcação de leitura                      | [x] Código monta aba só com permissão, usa serviço real e trata loading/erro/vazio; envio real pendente           |

**Progresso registrado em 2026-06-02:**

- `Patient360Content` foi confirmado como consumidor real de `patient-360-summary` fora do modo mock, com skeleton operacional, erro genérico, toast sanitizado e retry.
- `PatientHeaderCard` passou a receber o contexto de usuário para bloquear atalhos sem permissão, direcionar ações permitidas para as rotas/abas corretas e ocultar o badge financeiro de perfis sem `financial.read/write`.
- O cabeçalho ganhou fallbacks seguros para telefone, email e datas inválidas, evitando renderização de campos vazios ou `NaN` no cartão principal.
- `TabResumo` passou a receber permissões efetivas de documentos, financeiro e chat; resumos sensíveis agora exibem estado restrito em vez de detalhes quando a aba correspondente não é autorizada.
- `Patient360Tabs` já evita montar conteúdo de abas sem permissão, impedindo chamadas adicionais de Consultas, Documentos, Financeiro, Nutrição, Chat e Relatórios antes da validação de acesso no cliente.
- Validação real com Supabase, usuário sintético e smoke no navegador segue pendente, especialmente para provar RLS/tenant isolation e contratos das Edge Functions em homologação.

### 7.4 `/clinic/patients/[patientId]/encounter`

**Checklist:**

- [x] Carrega contexto do paciente. Código usa `getEncounterContext` com snapshot do Paciente 360 e busca real de `encounters`/`soap_notes` quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`; validação browser/Supabase segue pendente.
- [x] Cria atendimento quando necessário. Código cria `encounters` no tenant ativo ao salvar rascunho/finalizar sem `encounterId`; validação RLS em homologação segue pendente.
- [x] Salva rascunho SOAP. Código grava `soap_notes` como `draft` e registra audit log; validação real por usuário sintético segue pendente.
- [x] Recupera rascunho após reload. Código carrega o SOAP mais recente do atendimento/paciente e repopula o editor; smoke autenticado segue pendente.
- [x] Finaliza atendimento. Código valida campos SOAP obrigatórios, grava `soap_notes.status='final'` e fecha o `encounter`; validação real segue pendente.
- [x] Registra timeline. Código insere evento clínico `soap_atualizado` na finalização; validação real segue pendente.
- [x] Registra audit log. Código insere `soap_draft_saved`/`soap_finalized`; validação real segue pendente.
- [x] Impede edição indevida após finalização, se essa for a regra de negócio. Em 2026-06-02 o serviço passou a rejeitar rascunho em atendimento fechado e edição de SOAP finalizado; a UI desabilita editor e registros clínicos no atendimento finalizado.

**Progresso registrado em 2026-06-02:**

- `encounterApi` passou a tratar atendimento fechado como imutável para novas gravações de rascunho, evitando reabrir um `encounter` já finalizado pelo cliente.
- A persistência de SOAP agora revalida o `soapNoteId` por `tenant_id`/`patient_id`, bloqueia edição de nota em status `final` e impede gravar uma nota em atendimento divergente.
- A tela de atendimento desabilita campos SOAP, medidas, bioimpedância e solicitação de exames quando o SOAP carregado está finalizado, mantendo feedback explícito de registro salvo no prontuário.
- Validação browser autenticada, prova de audit/timeline real e isolamento Tenant A/B continuam pendentes até homologação com usuários sintéticos.

### 7.5 `/clinic/agenda`

**Checklist:**

- [x] Carrega agenda diária real. Código consulta `appointments` por tenant ativo, monta nomes via `patient_pii`, fila do dia e marcadores mensais; smoke Supabase/browser segue pendente.
- [x] Cria consulta. Código grava `appointments` no tenant ativo após validar paciente e conflito; validação real por usuário sintético segue pendente.
- [x] Edita consulta. Código atualiza consulta no tenant ativo, revalida paciente e ignora a própria consulta na checagem de conflito; validação real segue pendente.
- [x] Cancela consulta com motivo. UI passou a exigir motivo operacional antes do cancelamento e serviço persiste motivo sanitizado nas notas/evento de fila; validação real segue pendente.
- [x] Atualiza status. Código valida transições permitidas e atualiza `arrived_at` para entrada em fila; validação real segue pendente.
- [x] Registra evento de fila quando aplicável. Código insere `queue_events` para criação, edição, transição e cancelamento; prova RLS/auditoria real segue pendente.
- [x] Trata conflito de horário. Serviço bloqueia sobreposição do mesmo paciente ou mesmo local no dia, exceto consultas canceladas/falta e a própria consulta em edição; validação real segue pendente.
- [x] Mostra estado vazio em dias sem agenda. Lista do dia e fila exibem estados vazios claros; smoke visual autenticado segue pendente.

### 7.6 `/clinic/financeiro`

**Checklist:**

- [x] Carrega overview real. Código consome `get_clinic_finance_overview` via `billingApi` quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`; validação browser autenticada segue pendente.
- [x] Carrega reconciliação real. Código consome `get_clinic_finance_reconciliation` via `billingApi` e mantém erro de conciliação isolado do overview; validação Supabase/browser segue pendente.
- [x] Mostra cobranças por status. Em 2026-06-02 a tela passou a exibir cards por status calculados sobre as cobranças recentes do contrato real.
- [x] Ações Asaas ficam bloqueadas sem ambiente autorizado. Em 2026-06-02 o painel da clínica passou a exibir ações de customer/cobrança/assinatura explicitamente desabilitadas fora do fluxo autorizado por paciente.
- [ ] Em sandbox autorizado, cria customer/invoice/subscription. Pendente execução controlada com usuário sintético e sandbox Asaas autorizado.
- [ ] Webhook atualiza status financeiro.
- [ ] Idempotência impede cobrança duplicada.

**Progresso registrado em 2026-06-02:**

- `/clinic/financeiro` foi mantido como consumidor real dos RPCs `get_clinic_finance_overview` e `get_clinic_finance_reconciliation`, com mensagens de erro sanitizadas para não expor detalhes internos de RLS, RPC ou provider.
- A tela ganhou resumo de cobranças por status (`pendente`, `pago`, `vencido`, `cancelado`) derivado das cobranças recentes retornadas pelo contrato financeiro.
- O painel de operações Asaas agora deixa explícito que criação de customer, cobrança e assinatura permanece bloqueada nesse contexto, exigindo paciente validado, sandbox autorizado e Edge Functions idempotentes.
- Mensagens de erro de eventos Asaas recentes são apresentadas como falha operacional genérica; detalhes sensíveis permanecem restritos a auditoria autorizada.
- Variáveis necessárias para Supabase/service-role e Asaas foram verificadas como presentes no ambiente sem imprimir valores; smoke mutável de provider/sandbox continua pendente por exigir usuário sintético e execução controlada.

### 7.7 `/clinic/inbox`

**Checklist:**

- [x] Lista threads reais. Código consome `list_clinic_inbox` via `notificationsApi` quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`; validação browser autenticada segue pendente.
- [x] Abre thread. Em 2026-06-02 a tela passou a selecionar a thread por querystring/botão e carregar as mensagens via `getPatientChat`, com skeleton e erro sanitizado.
- [x] Envia mensagem. Em 2026-06-02 o inbox ganhou composer operacional que chama `sendPatientChatMessage` usando a thread/paciente selecionados; envio real depende de sessão/RLS.
- [x] Marca como lida. Código chama `mark_thread_read` e recarrega contadores sem expor detalhes de erro; validação real segue pendente.
- [x] Arquiva. Em 2026-06-02 foi adicionada ação de arquivamento de conversa com atualização de `status='archived'`/`archived_at` no tenant autorizado; prova RLS/auditoria real segue pendente.
- [x] Atribui responsável. Código chama `assign_chat_thread` para assumir a conversa e recarregar o inbox; validação com usuário sintético segue pendente.
- [x] Atualiza status. Código chama `set_chat_thread_status` para abrir/fechar a thread; validação real segue pendente.
- [x] Falha de envio não duplica mensagem no retry. Em 2026-06-02 o composer bloqueia envio concorrente e o serviço passou a usar `client_message_id` em `metadata` para detectar mensagem já gravada antes de inserir novamente.

**Progresso registrado em 2026-06-02:**

- `/clinic/inbox` agora mantém seleção de thread, abre mensagens autorizadas em painel dedicado e preserva estados de loading, vazio e falha sem revelar detalhes internos de Supabase/RLS.
- A listagem de conversas ganhou ações explícitas de abrir thread, abrir Paciente 360, marcar como lida, assumir, abrir/fechar e arquivar, todas acionadas por botões visíveis para teclado/toque.
- O envio de resposta pelo inbox reutiliza o contrato de chat do Paciente 360 e inclui uma chave local de idempotência (`client_message_id`) para reduzir risco de duplicidade quando o usuário tenta novamente após falha.
- Mutators do inbox passaram a respeitar fallback mock nas ações principais, mantendo a tela exercitável quando `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- Validação browser autenticada, RLS multi-tenant e auditoria real das mutações continuam pendentes até homologação com usuários sintéticos.

## 8. Fase 4 — Programas, CRM e inventário

### 8.1 Programas e builder

**Checklist:**

- [x] Lista programas reais. Código usa RPC `get_clinic_programs` quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`; validação Supabase/browser segue pendente.
- [x] Cria draft no builder. Código usa RPC `upsert_program_from_builder` e agora sanitiza texto/listas antes do envio real; validação de escrita em homologação segue pendente.
- [x] Valida etapas obrigatórias. Em 2026-06-02 o builder passou a exibir pendências e bloquear publicação sem nome, tipo, duração, fases, serviços e regras financeiras mínimas.
- [x] Salva fases. Contrato real persiste fases pelo payload do builder; validação Supabase/RLS pendente.
- [x] Salva serviços. Contrato real persiste serviços pelo payload do builder; validação Supabase/RLS pendente.
- [x] Salva check-ins. Contrato real persiste templates/frequência pelo payload do builder; validação Supabase/RLS pendente.
- [x] Salva documentos vinculados. Contrato real persiste documentos obrigatórios pelo payload do builder; validação Supabase/RLS pendente.
- [x] Salva entitlements. Contrato real persiste entitlements do app paciente pelo payload do builder; validação Supabase/RLS pendente.
- [x] Salva financeiro. Contrato real persiste configuração financeira do builder e bloqueia parcelado com preço sem parcelas; validação de regras derivadas pendente.
- [x] Salva equipe. Contrato real filtra membros por vínculo ativo no tenant; validação com usuários sintéticos pendente.
- [x] Revisa e publica. UI de revisão/publicação bloqueia pendências obrigatórias antes de chamar a RPC real; browser smoke pendente.
- [x] Clona programa. Serviço chama RPC real `clone_program` quando mock está desabilitado e preserva fallback mock explícito; validação Supabase/RLS pendente.
- [x] Altera status. Serviço chama RPC real `update_program_status` quando mock está desabilitado e preserva fallback mock explícito; validação Supabase/RLS pendente.
- [x] Matricula paciente. Em 2026-06-02 a listagem de programas ganhou ação de matrícula para programa ativo, busca paciente ativo real e chama `enroll_patient_in_program` com data de início; evidência com usuário sintético/RLS segue pendente.
- [x] Regras financeiras e de agenda derivadas permanecem coerentes por contrato de retorno. Em 2026-06-02 a UI passou a exibir check-ins, tarefas documentais, agenda e invoice retornados pela RPC, com validação real de efeitos derivados ainda pendente em homologação.

### 8.2 CRM

**Checklist:**

- [x] Lista pipeline real. Código usa `list_crm_leads`/`crm_pipeline_stages` quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`; validação Supabase/browser autenticada segue pendente.
- [x] Cria lead. Código chama `create_crm_lead` com payload sanitizado e valida nome + contato antes do submit; prova RLS real segue pendente.
- [x] Edita lead. Em 2026-06-02 o painel de detalhe ganhou ação de edição e chama `update_crm_lead` com payload sanitizado; validação real segue pendente.
- [x] Move etapa. Código chama `move_crm_lead_stage`, bloqueia lead convertido e recarrega pipeline/detalhe; validação browser segue pendente.
- [x] Registra atividade. Código chama `record_crm_lead_activity` com título/descrição sanitizados; prova audit/RLS real segue pendente.
- [x] Cria tarefa. Código chama `create_crm_lead_task` com título e data normalizados; prova notificação real segue pendente.
- [x] Converte lead em paciente. Código chama `convert_crm_lead_to_patient` com agendamento opcional normalizado e exibe falha de consentimento sem vazar detalhes; validação real segue pendente.
- [x] Evita duplicidade de paciente/PII. Contrato da RPC deduplica por e-mail/telefone normalizados antes de criar `patient_pii`; prova com dados sintéticos segue pendente.
- [x] Notificações operacionais são geradas. Código expõe ação `emit_crm_operational_notifications` e RPCs de tarefa/conversão inserem notificações; validação real segue pendente.

**Progresso registrado em 2026-06-02:**

- `crmApi` passou a normalizar payloads de busca, criação, edição, nota, tarefa e conversão, removendo caracteres de controle, curingas de busca e datas inválidas antes de acionar RPCs reais.
- A tela `/clinic/crm` passou a validar nome e ao menos um contato antes de criar/editar lead, evitando chamadas reais com payload operacionalmente incompleto.
- O painel de detalhe ganhou ação de edição não dependente de hover para alterar dados comerciais permitidos do lead, recarregando pipeline e detalhe após `update_crm_lead`.
- A conversão com consulta inicial passou a enviar somente campos normalizados para a RPC e continua sem chamar financeiro ou provedores externos.
- Validação com Supabase homologação, usuários sintéticos, isolamento Tenant A/B, notificações reais e browser smoke seguem pendentes.

### 8.3 Inventário

**Checklist:**

- [x] Lista snapshot real. Código consome `list_inventory_operations_snapshot` com custo permissionado; validação Supabase/browser segue pendente.
- [x] Cria item. UI aciona `upsert_inventory_item` com nome/unidade e números validados antes da chamada real; prova com usuário sintético segue pendente.
- [x] Edita item. Clique acessível em saldo preenche o formulário e reutiliza `upsert_inventory_item`; prova real segue pendente.
- [x] Cria lote. Recebimento com lote/validade chama `create_inventory_lot` antes do ledger; validação real segue pendente.
- [x] Cria movimentação de entrada. UI chama `create_inventory_movement` com quantidade positiva e motivo obrigatório; prova real segue pendente.
- [x] Cria movimentação de saída. UI chama `create_inventory_movement` para consumo/perda com quantidade positiva e motivo obrigatório; prova real segue pendente.
- [x] Transfere estoque entre unidades. UI valida origem/destino distintos por seleção e chama `transfer_inventory_stock`; prova real segue pendente.
- [x] Bloqueia estoque negativo quando aplicável. RPC `create_inventory_movement` mantém bloqueio transacional `negative_stock_blocked`; smoke real segue pendente.
- [x] Gera alerta de estoque baixo. Snapshot real retorna alertas `minimum_stock` e UI permite emitir notificações operacionais; validação real segue pendente.
- [x] Gera alerta de vencimento. Snapshot real retorna alertas `lot_expiry` por janela de validade; validação real segue pendente.
- [x] Registra auditoria de movimentações. RPCs registram `audit_logs` para item/lote/movimento e ledger imutável; prova real segue pendente.

**Progresso registrado em 2026-06-03:**

- `/clinic/inventory` foi conferida contra o contrato real de inventário: `inventoryApi` usa RPCs reais quando `NEXT_PUBLIC_USE_MOCK_DATA` não está explicitamente `true`, preservando mock apenas como modo opt-in.
- A tela de inventário passou a validar nome/unidade, estoque mínimo, custo, quantidade, origem/destino de transferência e motivo obrigatório antes de chamar RPCs reais, reduzindo chamadas inválidas ao Supabase.
- A troca de modo/local de movimentação agora limpa lote/destino incompatíveis para evitar envio de combinações obsoletas ao ledger.
- Permanecem pendentes as provas em Supabase homologação com usuários sintéticos, isolamento Tenant A/B, smoke autenticado no browser e execução controlada do script local de CRM/inventário quando o ambiente estiver apontado para sandbox autorizado.

### 8.4 Verificação transversal de settings, inbox e CRM — 2026-06-03

- [x] `/clinic/settings` existe no App Router, usa `DashboardShell` e consome `clinicSettingsApi` para snapshot, atualização de clínica e upsert de unidade via RPCs reais.
- [x] `/clinic/inbox` está coberto por `notificationsApi` e `chatApi`; as operações de resumo, listagem, leitura, arquivamento, atribuição e fechamento usam contratos reais quando `NEXT_PUBLIC_USE_MOCK_DATA` não é `true`.
- [x] `/clinic/crm` está coberto por `crmApi`; pipeline, detalhe, criação, atualização, movimentação de etapa, atividade, tarefa e conversão para paciente usam RPCs reais quando o modo mock não está explicitamente habilitado.
- [x] As RPCs correspondentes aparecem nas migrações atuais, incluindo settings, comunicações/inbox e CRM operacional.
- [ ] Validar em browser autenticado as ações mutáveis de settings, inbox e CRM com usuários sintéticos, isolamento Tenant A/B e dados sem mock.

## 9. Fase 5 — Documentos, relatórios e provedores

### 9.1 Documentos e D4Sign

**Fluxo alvo:** template -> documento gerado -> envio para assinatura -> webhook
D4Sign -> status atualizado -> URL assinada -> liberação ao paciente.

**Checklist técnico:**

- [x] Tabela de templates tem RLS e grants corretos. Validação por código confirmou políticas `documents.read/write`; prova real por tenant segue pendente.
- [x] Documento gerado mantém vínculo com tenant, paciente e autor. Edge Function `generate-document` usa tenant/paciente da sessão e metadados do documento; smoke real pendente.
- [x] Storage usa bucket e path permissionados. Código valida bucket privado e path `tenant/patient/document/file`; prova em storage real pendente.
- [x] Envio D4Sign só ocorre em ambiente autorizado. Em 2026-06-02 o envio passou a exigir template ativo com `d4sign_enabled=true` também na Edge Function; sandbox real pendente.
- [x] Token/crypt key nunca aparece em client ou log. Validação por código mantém credenciais apenas em variáveis da Edge Function; nenhum segredo foi impresso.
- [ ] Webhook valida assinatura/autenticidade. Pendente confirmação do segredo/contrato D4Sign em sandbox.
- [x] Webhook é idempotente por código via `idempotency_key`/`provider_event_id`; reentrega real pendente.
- [x] Status desconhecido tem fallback seguro por código via normalização e monitor operacional; sandbox real pendente.
- [x] Signed URL é curta e permissionada. Edge Function gera URL de 300s após permissão clínica/paciente; smoke real pendente.
- [x] Portal exibe somente documentos liberados por código/RPC; validação com paciente sintético pendente.

### 9.2 Relatórios

**Checklist clínica:**

- [x] Lista definições de relatórios clínicos. Código usa Edge Function `clinic-reports` e RPC allowlist `list_clinic_report_definitions`; validação Supabase/RLS pendente.
- [x] Executa relatório autorizado. Edge Function revalida definição disponível, `canRun` e `exportEnabled` antes de chamar `create_clinic_report_run`; smoke real pendente.
- [x] Consulta status de processamento. UI passou a chamar `getClinicReportRun` via ação `get` para atualizar o último run; validação real pendente.
- [x] Exporta arquivo. Download usa Edge Function `clinic-report-export`, sessão bearer, token curto e `Cache-Control: no-store`; prova real pendente.
- [x] Trata relatório sem dados. UI mostra estado explícito quando o run retorna zero linhas.
- [x] Bloqueia perfil sem permissão. Catálogo exibe definição indisponível por `canRun=false`, botões ficam desabilitados e backend recusa run sem permissão/export; validação com perfis sintéticos pendente.

**Checklist paciente:**

- [ ] Lista relatórios disponíveis ao paciente.
- [ ] Oculta relatórios internos.
- [ ] Download respeita autorização.
- [ ] Link expira quando aplicável.

### 9.3 Asaas

**Fluxo alvo:** subconta tenant -> customer paciente -> invoice/subscription ->
webhook -> reconciliação -> timeline/financeiro.

**Checklist técnico:**

- [ ] Subconta tenant criada somente uma vez.
- [x] Customer paciente idempotente por código: a Edge Function reutiliza `patient_customers` existente por tenant/paciente antes de chamar Asaas; sandbox real pendente.
- [x] Invoice idempotente por código: UI envia chave por tentativa e a Edge Function reutiliza cobrança local com a mesma chave antes de chamar Asaas; sandbox real pendente.
- [x] Subscription idempotente por código: UI envia chave por tentativa e a Edge Function reutiliza assinatura local com a mesma chave antes de chamar Asaas; sandbox real pendente.
- [x] Webhook valida autenticação por código com `ASAAS_WEBHOOK_TOKEN`; reentrega real pendente.
- [x] Webhook valida tenant mapping por código via `asaas_invoice_id`/invoice local e marca evento sem tenant como `ignored`; sandbox real pendente.
- [x] Webhook trata reentrega por código via hash do evento antes de inserir/processar; reentrega real pendente.
- [x] Payload bruto não é armazenado sem necessidade explícita; código persiste payload minimizado em `billing_webhook_events` e resumo em `asaas_events`.
- [x] Status financeiro e reconciliação ficam coerentes por código via RPCs `get_clinic_finance_overview` e `get_clinic_finance_reconciliation`; prova com dados sintéticos pendente.
- [x] Erros do provider são mostrados sem vazar detalhes sensíveis; Edge Functions retornam mensagens genéricas e UI sanitiza mensagens operacionais.

## 10. Fase 6 — Portal paciente completo

### 10.1 Snapshot e acesso

- [x] `/patient` valida sessão server-side. Código server-side exige usuário autenticado antes de renderizar o portal; browser autenticado segue pendente.
- [x] RPC `get_patient_portal_snapshot` nega acesso quando paciente não está liberado. Migrações existentes fazem a RPC exigir vínculo ativo e `patient_portal.access`; prova Supabase homologação pendente.
- [x] Paciente autorizado recebe snapshot completo. Contrato normalizado pelo serviço exige paciente selecionado, vínculo e resumo válido; validação com paciente sintético pendente.
- [x] Paciente não consegue acessar dados de outro paciente alterando URL ou payload. Em 2026-06-03 as chamadas client-side passaram a aceitar somente UUID válido e as RPCs validam vínculo/tenant antes da resposta; prova RLS multi-paciente pendente.
- [x] Primeira chamada de validação e chamada do conteúdo são consistentes por contrato. Ambas usam `get_patient_portal_snapshot`; validação browser ainda deve confirmar ausência de divergência entre server render e reidratação.

### 10.2 Funcionalidades

- [x] Documentos liberados aparecem. Snapshot filtra documentos liberados na RPC e a UI abre URL assinada temporária; validação storage/browser pendente.
- [x] Documentos não liberados ficam ocultos. Contrato da RPC filtra `released_to_patient=true`; prova com documento sintético não liberado pendente.
- [x] Faturas/status financeiro aparecem corretamente. Em 2026-06-03 o serviço passou a aceitar links de pagamento somente HTTP(S) e descartar URLs inválidas; reconciliação real pendente.
- [x] Check-in é enviado e associado ao paciente correto. Em 2026-06-03 a UI passou a coletar respostas das perguntas do template, exigir preenchimento e sanitizar payload antes da RPC `submit_patient_portal_checkin`; prova RLS pendente.
- [x] Mensagem é enviada para a clínica correta. Em 2026-06-03 o serviço passou a validar UUID do paciente e normalizar o texto antes da RPC `send_patient_portal_message`; envio real pendente.
- [x] Notificação marcada como lida afeta somente o paciente correto. Em 2026-06-03 a chamada passou a validar UUID localmente e a RPC existente revalida usuário/paciente; prova RLS pendente.
- [x] Estados vazio/erro/loading são claros. UI preserva skeleton, estado indisponível com retry, listas vazias e botões bloqueados durante mutações; smoke visual pendente.

**Progresso registrado em 2026-06-03:**

- Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente da ordem após inventário, F17 portal paciente.
- `patientPortalApi` passou a validar UUIDs antes das RPCs de snapshot direcionado, mensagem, check-in e notificação, reduzindo chamadas inválidas e mantendo o backend como autoridade de vínculo/RLS.
- Erros retornados por Supabase/RPC no portal passaram a ser apresentados por mensagens operacionais genéricas, sem propagar detalhes internos de banco, RLS ou stack para o paciente.
- Links de pagamento retornados no snapshot agora são expostos somente quando são URLs HTTP(S) válidas, evitando protocolos inseguros no portal.
- A tela do portal passou a renderizar perguntas de check-in, coletar respostas, exigir preenchimento antes do envio e limpar o estado local depois de uma submissão bem-sucedida.
- Datas inválidas no portal passaram a cair em `Sem data`, evitando `RangeError`/tela quebrada em snapshots parcialmente inconsistentes.
- Permanecem pendentes smoke autenticado em browser, execução real das RPCs com pacientes/responsáveis sintéticos, prova de isolamento Tenant A/B e validação de storage/signed URL em homologação.

## 11. Fase 7 — Admin e operações de plataforma

### 11.1 Admin overview e seções

- [x] `/admin` carrega snapshot real. Em 2026-06-03 o snapshot passou a combinar `list_platform_tenants`, `list_platform_webhook_events` e detalhes operacionais por tenant via `get_platform_tenant_detail`; browser autenticado segue pendente.
- [x] Seção financeira mostra dados agregados corretos. Código agrega MRR, trials e tenants suspensos a partir de tenants reais do contrato de plataforma; reconciliação com Supabase homologação pendente.
- [x] Seção integrações mostra status de providers. Código mostra Asaas/D4Sign por `asaasSubaccountStatus` e `d4signStatus` normalizados do contrato real; validação sandbox pendente.
- [x] Seção segurança mostra alertas reais ou estado estático identificado. Em 2026-06-03 a seção passou a usar contagem real de audit logs agregados e webhooks falhos, com break-glass pendente vindo do snapshot de tenants.
- [x] Seção suporte mostra solicitações reais. Em 2026-06-03 o overview e `/admin/support` passaram a renderizar sessões reais do detalhe operacional dos tenants, com estado vazio explícito.
- [x] Seção auditoria mostra eventos reais. Em 2026-06-03 a auditoria deixou de sintetizar eventos por última atividade e passou a exibir audit logs sanitizados retornados por `get_platform_tenant_detail`.

**Progresso registrado em 2026-06-03:**

- Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente aberta da ordem, Fase 7 admin overview e seções.
- `getPlatformAdminSnapshot` passou a montar o snapshot administrativo com tenants, webhooks, audit logs reais e sessões reais de suporte, usando os RPCs protegidos existentes sem criar migração.
- O snapshot de admin agora busca detalhes somente dos tenants com eventos operacionais, suporte aberto ou break-glass pendente, limitando a carga transversal e preservando avisos degradados quando algum detalhe falha.
- Erros do serviço admin foram reduzidos para mensagens operacionais genéricas, sem propagar detalhes internos de RPC/banco ao browser.
- `/admin`, `/admin/support` e `/admin/audit` ganharam componentes explícitos para suporte e auditoria reais, com estados vazios e sem payload bruto de provider ou dados clínicos.
- Permanecem pendentes browser smoke autenticado, prova com admin sintético em Supabase homologação, validação de integrações sandbox e conferência visual das seções.

### 11.2 Tenants

- [x] Lista tenants. Em 2026-06-03 `/admin/tenants` foi confirmado consumindo `list_platform_tenants` via `listTenants`, com loading, erro recuperável e refresh manual.
- [x] Filtra tenants. Em 2026-06-03 a tela mantém filtros por busca, status e plano sobre as linhas sanitizadas retornadas pela RPC.
- [x] Abre detalhe. Em 2026-06-03 links de linha levam para `/admin/tenants/[tenantId]`, que carrega `get_platform_tenant_detail` e mantém estados de loading/erro.
- [x] Exibe usuários/memberships. Em 2026-06-03 o detalhe renderiza usuários, roles, status, unidade, MFA, último login e criação sem payload sensível.
- [x] Convida usuário com service-role somente server-side. Em 2026-06-03 o convite foi mantido no Route Handler `/api/admin/tenants/[tenantId]/invitations`, usando Supabase Admin apenas no servidor, com validação de tenant/role/unidade e mensagem genérica em falhas internas.
- [x] Atualiza membership com validação de role. Em 2026-06-03 a UI chama a RPC `update_platform_tenant_membership`; o serviço normaliza IDs, role/status e motivo antes de chamar o contrato auditado.
- [x] Solicita suporte. Em 2026-06-03 a aba de suporte chama `request_platform_support_session` com assunto, prioridade e motivo auditável normalizados antes da RPC.
- [x] Encerra suporte. Em 2026-06-03 a aba de suporte chama `end_platform_support_session` somente com UUID localmente válido.
- [x] Inicia break-glass com justificativa obrigatória. Em 2026-06-03 a aba break-glass exige escopo, duração limitada e motivo mínimo antes de chamar `request_platform_break_glass`.
- [x] Encerra break-glass. Em 2026-06-03 a aba break-glass aprova/nega via `decide_platform_break_glass` e revoga acessos aprovados via `revoke_platform_break_glass` com motivo obrigatório.
- [x] Registra audit log para todas as ações sensíveis. Em 2026-06-03 os fluxos sensíveis permanecem centralizados em RPCs/Route Handler auditados; a validação local evita chamadas inválidas, mas a prova em Supabase homologação segue pendente.

**Progresso registrado em 2026-06-03:**

- Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente aberta da ordem, Fase 7.2 Tenants.
- `adminApi` passou a validar UUIDs e normalizar textos auditáveis antes de convites, atualização de membership, suporte e break-glass, reduzindo chamadas inválidas aos RPCs protegidos.
- O convite de usuários continua isolado no Route Handler server-side com Supabase Admin/service-role, validações de tenant/role/unidade e retorno genérico para falhas internas, evitando vazar detalhes do provedor Auth ou banco para o browser.
- `/admin/tenants` e `/admin/tenants/[tenantId]` já cobrem lista, filtros, detalhe, usuários, suporte, break-glass e auditoria por contratos reais; permanecem pendentes apenas smoke autenticado em browser e prova mutável em Supabase homologação com administradores sintéticos.

### 11.3 Webhooks e observabilidade

- [x] Lista eventos Asaas. Em 2026-06-03 `/admin/webhooks` continuou usando `list_platform_webhook_events` e passou a evidenciar contagens por provider sobre o retorno real sanitizado.
- [x] Lista eventos D4Sign. Em 2026-06-03 o mesmo monitor preservou o filtro D4Sign e a contagem separada, sem payload bruto, headers ou assinatura.
- [x] Filtra por status/provider. Em 2026-06-03 os filtros por provider, status e busca foram mantidos e protegidos contra sobrescrita por respostas obsoletas de refresh concorrente.
- [x] Mostra detalhes sanitizados. Em 2026-06-03 `adminApi` passou a redigir referências externas/idempotência e higienizar textos operacionais antes da renderização do drawer.
- [x] Reprocessamento, se existir, é protegido e auditado. Em 2026-06-03 a UI declara reprocesso indisponível porque não há contrato real; qualquer ação futura deve nascer server-side, com validação de admin e audit log.
- [x] `/admin/observability` aponta para sinais reais ou deixa claro o que é estático. Em 2026-06-03 o painel passou a carregar `/api/health` e webhooks reais, marcando monitores sem fonte conectada como catálogo estático.

**Progresso registrado em 2026-06-03:**

- Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente aberta da ordem, Fase 7.3 Webhooks e observabilidade.
- `adminApi` passou a sanitizar textos de webhook, remover e-mails de resumos operacionais e redigir identificadores externos/idempotência antes de expor dados no browser.
- `/admin/webhooks` manteve listagem real via `list_platform_webhook_events`, adicionou contagem por Asaas/D4Sign, documentou no drawer que payloads/headers/assinaturas não são exibidos e evitou race condition em refresh concorrente.
- Como não existe contrato de reprocessamento no código atual, a UI passou a indicar explicitamente que reprocesso está indisponível; isso evita botões fictícios e mantém o requisito de auditabilidade para implementação futura.
- `/admin/observability` deixou de ser puramente estático: agora carrega `/api/health` e `list_platform_webhook_events`, mostra evidência atual dos sinais reais e rotula monitores não conectados a APM/métricas externas como catálogo estático.
- Permanecem pendentes browser smoke autenticado, eventos sintéticos Asaas/D4Sign em Supabase homologação, prova de isolamento RBAC e desenho/implementação de um endpoint/RPC de reprocessamento auditado caso o produto precise dessa ação.

## 12. Fase 8 — Segurança, privacidade e RLS

### 12.1 Checklist de secrets

- [x] `.env` não está versionado. Verificação estática em 2026-06-03 localizou apenas `.env.example` na raiz.
- [x] `.env.local` não está versionado. Verificação estática em 2026-06-03 localizou apenas `.env.example` na raiz.
- [x] `.env.example` contém nomes e placeholders vazios/seguros; não foram impressos valores reais.
- [x] Nenhum `SUPABASE_SERVICE_ROLE_KEY` aparece em client component. Em `src`, a ocorrência fica no helper `src/lib/supabase/admin.ts`, marcado com `server-only`.
- [x] Nenhum segredo real aparece em `NEXT_PUBLIC_*`; as variáveis públicas em `.env.example` são placeholders vazios/chaves publicáveis.
- [ ] Logs não imprimem tokens, cookies, webhook secrets ou provider IDs sensíveis. Pendente validação de logs reais em homologação/provider sandbox.

### 12.2 Checklist RLS/RBAC

- [ ] Tenant A não lê dados do tenant B.
- [ ] Tenant A não escreve dados do tenant B.
- [ ] Paciente só lê dados próprios liberados.
- [ ] Colaborador clínico só acessa tenant/unidade permitidos.
- [ ] Admin plataforma tem trilha de auditoria.
- [ ] Break-glass exige justificativa e expiração.
- [ ] Storage de documentos respeita path, tenant e paciente.
- [ ] Edge Functions validam contexto antes de usar cliente elevado.

### 12.3 Checklist de dados sensíveis

- [ ] PII de paciente é minimizada nas respostas.
- [ ] Dados financeiros são exibidos somente a perfis autorizados.
- [ ] Prescrições respeitam permissão médica.
- [ ] Documentos clínicos têm signed URL curta.
- [ ] Payloads de webhook são resumidos ou redigidos.
- [ ] Audit log registra ação sem expor conteúdo clínico desnecessário.

## 13. Fase 9 — Browser smoke obrigatório

### 13.1 Rotas clínicas

| Rota                              | Carrega | Sem console crítico | Interação validada       | Resultado |
| --------------------------------- | ------- | ------------------- | ------------------------ | --------- |
| `/clinic/dashboard`               | [ ]     | [ ]                 | Refresh/métrica/fila     | [ ]       |
| `/clinic/patients`                | [ ]     | [ ]                 | Busca/criação/edição     | [ ]       |
| `/clinic/patients/[id]`           | [ ]     | [ ]                 | Troca de abas            | [ ]       |
| `/clinic/patients/[id]/encounter` | [ ]     | [ ]                 | Salvar rascunho          | [ ]       |
| `/clinic/agenda`                  | [ ]     | [ ]                 | Criar/alterar consulta   | [ ]       |
| `/clinic/programs`                | [ ]     | [ ]                 | Status/clonar/matricular | [ ]       |
| `/clinic/programs/builder`        | [ ]     | [ ]                 | Salvar etapa             | [ ]       |
| `/clinic/documents`               | [ ]     | [ ]                 | Gerar documento          | [ ]       |
| `/clinic/financeiro`              | [ ]     | [ ]                 | Filtrar/reconciliar      | [ ]       |
| `/clinic/reports`                 | [ ]     | [ ]                 | Executar relatório       | [ ]       |
| `/clinic/settings`                | [ ]     | [ ]                 | Atualizar settings       | [ ]       |
| `/clinic/inbox`                   | [ ]     | [ ]                 | Marcar lido/responder    | [ ]       |
| `/clinic/crm`                     | [ ]     | [ ]                 | Mover lead               | [ ]       |
| `/clinic/inventory`               | [ ]     | [ ]                 | Movimentar estoque       | [ ]       |

### 13.2 Rotas admin

| Rota                        | Carrega | Sem console crítico | Interação validada         | Resultado |
| --------------------------- | ------- | ------------------- | -------------------------- | --------- |
| `/admin`                    | [ ]     | [ ]                 | Navegar seções             | [ ]       |
| `/admin/tenants`            | [ ]     | [ ]                 | Filtrar/abrir tenant       | [ ]       |
| `/admin/tenants/[tenantId]` | [ ]     | [ ]                 | Convite/suporte controlado | [ ]       |
| `/admin/webhooks`           | [ ]     | [ ]                 | Filtrar eventos            | [ ]       |
| `/admin/observability`      | [ ]     | [ ]                 | Revisar monitores          | [ ]       |
| `/admin/billing`            | [ ]     | [ ]                 | Abrir seção financeira     | [ ]       |
| `/admin/security`           | [ ]     | [ ]                 | Revisar seção segurança    | [ ]       |
| `/admin/integrations`       | [ ]     | [ ]                 | Revisar integrações        | [ ]       |
| `/admin/support`            | [ ]     | [ ]                 | Revisar suporte            | [ ]       |
| `/admin/audit`              | [ ]     | [ ]                 | Revisar auditoria          | [ ]       |

### 13.3 Rotas públicas e portal

| Rota            | Carrega | Sem console crítico | Interação validada | Resultado |
| --------------- | ------- | ------------------- | ------------------ | --------- |
| `/`             | [ ]     | [ ]                 | Redirecionamento   | [ ]       |
| `/auth/login`   | [ ]     | [ ]                 | Login/logout       | [ ]       |
| `/no-workspace` | [ ]     | [ ]                 | Logout/retorno     | [ ]       |
| `/patient`      | [ ]     | [ ]                 | Mensagem/check-in  | [ ]       |
| `/patient-list` | [ ]     | [ ]                 | Redirect legado    | [ ]       |
| `/paciente-360` | [ ]     | [ ]                 | Redirect legado    | [ ]       |

## 14. Fase 10 — Testes automatizados recomendados

### 14.1 Testes unitários ou de serviço

- [ ] Normalização de respostas `{ data, error }`.
- [ ] Fallback mock ativado/desativado.
- [ ] Tratamento de erro de RPC.
- [ ] Tratamento de erro de Edge Function.
- [ ] `WeightEvolutionChart` com dados vazios.
- [ ] Mapeamento de badges de status.
- [ ] Normalização de timeline.
- [ ] Idempotência de ações financeiras/documentais, quando simulável.

### 14.2 Testes de integração Supabase

- [ ] Auth/RBAC/core workspace.
- [ ] Patient 360 summary.
- [ ] Patient timeline.
- [ ] Portal paciente.
- [ ] Documentos e storage.
- [ ] Billing/reconciliação.
- [ ] Reports.
- [ ] CRM.
- [ ] Inventário.
- [ ] Comunicações/chat.
- [ ] Admin tenants/audit.

### 14.3 Testes E2E sugeridos

- [ ] Login clínico -> dashboard -> paciente -> 360 -> atendimento.
- [ ] Login clínico -> agenda -> criar consulta -> paciente 360.
- [ ] Login clínico -> CRM -> converter lead -> abrir paciente.
- [ ] Login clínico -> programa -> matricular paciente -> ver pacote no 360.
- [ ] Login paciente -> portal -> enviar mensagem -> check-in.
- [ ] Login admin -> tenant detail -> suporte -> audit log.
- [ ] Webhook sandbox -> status financeiro/documento atualizado.

## 15. Gates de release

### 15.1 Gate P0 — Código compila

- [ ] `npm run type-check` passa.
- [ ] `npm run lint` passa.
- [ ] `npm run build` passa.
- [ ] `git diff --check` passa.

### 15.2 Gate P1 — Backend real sem mock

- [ ] `NEXT_PUBLIC_USE_MOCK_DATA=false` em homologação.
- [ ] Rotas clínicas principais carregam.
- [ ] Portal paciente carrega.
- [ ] Admin carrega.
- [ ] CRUDs essenciais funcionam.
- [ ] RLS bloqueia cross-tenant.

### 15.3 Gate P2 — Contratos externos

- [ ] D4Sign sandbox validado.
- [ ] Asaas sandbox validado.
- [ ] Webhooks válidos processados.
- [ ] Webhooks inválidos rejeitados.
- [ ] Reentrega é idempotente.
- [ ] Logs estão sanitizados.

### 15.4 Gate P3 — Produção

- [ ] Healthcheck sem `fail`.
- [ ] Mocks desabilitados.
- [ ] Secrets configurados fora do repositório.
- [ ] Observabilidade mínima ativa.
- [ ] Runbook de rollback pronto.
- [ ] Responsáveis de suporte definidos.
- [ ] Plano de incidente para providers definido.

## 16. Registro de pendências

Use esta seção para controlar bloqueios durante a execução.

| Data       | Frente  | Pendência                                       | Severidade | Responsável | Próxima ação                                                                                                      | Status                 |
| ---------- | ------- | ----------------------------------------------- | ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 2026-06-02 | F02     | Revisar divergência de `canAccessPatientPortal` | Alta       | Codex       | Endpoint e middleware agora usam helper canônico; validar perfis sintéticos em homologação                        | Parcialmente resolvido |
| 2026-06-02 | F10     | Validar contratos D4Sign/documentos             | Alta       | A definir   | Preparar ambiente sandbox autorizado                                                                              | Aberto                 |
| 2026-06-02 | F11     | Validar Asaas/billing com sandbox               | Alta       | A definir   | Preparar dados sintéticos e webhooks                                                                              | Aberto                 |
| 2026-06-02 | F12     | Fechar contrato de `clinic-reports`             | Média      | A definir   | Edge Function e UI reforçadas por código; validar execução/exportação em Supabase real                            | Aprovado por código    |
| 2026-06-03 | F17     | Validar portal paciente com vínculos sintéticos | Alta       | A definir   | Serviço/UI reforçados por código; validar snapshot, mensagem, check-in, notificação e signed URL em Supabase real | Aprovado por código    |
| 2026-06-02 | F19     | Testar admin tenant detail com audit log        | Alta       | A definir   | Criar cenários admin sintéticos                                                                                   | Aberto                 |
| 2026-06-03 | F20/F21 | Validar webhooks e observabilidade em browser   | Média      | A definir   | Gerar eventos sintéticos Asaas/D4Sign em homologação e conferir health/sinais reais com admin sintético           | Aprovado por código    |
| 2026-06-02 | F06     | Blindar gráfico de peso com dados vazios        | Média      | Codex       | Componente corrigido; validar visualmente no Paciente 360 com paciente sem histórico                              | Parcialmente resolvido |

## 17. Modelo de evidência por fluxo

Copie este bloco para cada fluxo validado.

```md
### Evidência — <nome do fluxo>

- Data:
- Ambiente:
- Branch/commit:
- Perfil de usuário:
- Tenant sintético:
- Mock habilitado? sim/não:
- Rota/API/RPC/Edge Function:
- Pré-condições:
- Passos executados:
  1.
  2.
  3.
- Resultado esperado:
- Resultado observado:
- Logs sanitizados:
- Screenshot/anexo:
- Status: aprovado/reprovado/bloqueado
- Pendências:
```

## 17.1 Registro de progresso — execução local 2026-06-02

### Evidência — F00 baseline técnica local

- Data: 2026-06-02.
- Ambiente: local dev, sem leitura de `.env` e sem chamadas a provedores externos.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: não aplicável; comandos locais sem sessão.
- Tenant sintético: não aplicável.
- Mock habilitado? não validado por browser; nenhuma variável de ambiente foi lida.
- Comandos validados:
  1. `git status --short` e `git branch --show-current`.
  2. `npm run type-check`.
  3. `npm run lint`.
  4. `npm run build`.
  5. `git diff --check`.
- Resultado esperado: baseline sem erros bloqueantes antes das correções P0.
- Resultado observado: comandos passaram; `npm run lint` e `npm run build` mantiveram 11 warnings conhecidos em componentes não alterados.
- Logs sanitizados: sem secrets, tokens, cookies, dados reais ou payloads sensíveis.
- Screenshot/anexo: não aplicável para baseline CLI.
- Status: aprovado para execução local.
- Pendências: criar usuários sintéticos e homologação Supabase para validações por perfil/rota.

### Evidência — F02 sessão e portal paciente

- Data: 2026-06-02.
- Ambiente: local dev, validação por leitura/código e build.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: perfis reais/sintéticos não executados nesta etapa.
- Tenant sintético: pendente.
- Mock habilitado? não aplicável ao endpoint; nenhuma variável de ambiente foi lida.
- Rota/API/RPC/Edge Function: `/api/auth/app-session` e middleware.
- Passos executados:
  1. Localizada a rota de sessão.
  2. Localizado o helper `getCurrentAppSession`.
  3. Adicionado helper canônico `getAppSessionTargetRoute`.
  4. Endpoint e middleware passaram a derivar destino pela mesma regra.
- Resultado esperado: `canAccessPatientPortal` calculado pelo helper de sessão e destino coerente com middleware.
- Resultado observado: resposta do endpoint usa `session.canAccessPatientPortal()` e destino usa regra compartilhada.
- Logs sanitizados: sem tokens, cookies, PII sensível ou secrets.
- Screenshot/anexo: não aplicável.
- Status: aprovado por código; bloqueado para aceite final por perfis até haver usuários sintéticos.
- Pendências: validar sem sessão, admin plataforma, colaborador clínico, paciente liberado, usuário sem workspace e paciente sem portal liberado em homologação.

### Evidência — F06 gráfico de evolução de peso

- Data: 2026-06-02.
- Ambiente: local dev, validação por código e build.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: não aplicável.
- Tenant sintético: pendente para smoke visual.
- Mock habilitado? não aplicável ao componente isolado.
- Rota/API/RPC/Edge Function: `WeightEvolutionChart` usado no Paciente 360.
- Passos executados:
  1. Localizado o componente.
  2. Adicionada normalização para `data` nulo, não array ou parcialmente inválido.
  3. Mantido estado vazio visual quando não há pontos válidos.
- Resultado esperado: nenhum cálculo com array vazio gera `NaN`/`Infinity`.
- Resultado observado: `Math.min`/`Math.max` só executam após `chartData.length > 0`; pontos inválidos são filtrados.
- Logs sanitizados: sem dados sensíveis.
- Screenshot/anexo: pendente de browser smoke com paciente sintético.
- Status: aprovado por código; smoke visual pendente.
- Pendências: validar Paciente 360 com paciente sem histórico de peso.

### Evidência — F03 resiliência do DashboardShell

- Data: 2026-06-02.
- Ambiente: local dev, validação por código e build.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: não aplicável nesta etapa.
- Tenant sintético: pendente.
- Mock habilitado? não aplicável ao tratamento local de falhas.
- Rota/API/RPC/Edge Function: shell clínico e `notificationsApi`.
- Passos executados:
  1. Revisadas chamadas a `getCommunicationsSummary`, `markThreadRead` e `markNotificationRead`.
  2. Adicionados `try/catch/finally` para polling de comunicações.
  3. Adicionados handlers locais recuperáveis para marcar conversa/notificação como lida.
- Resultado esperado: falhas de comunicações não derrubam children do shell.
- Resultado observado: falhas passam a mostrar aviso discreto e limpar estado derivado sem lançar exceção para a árvore da página.
- Logs sanitizados: sem dados sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado.
- Status: aprovado por código; browser smoke pendente.
- Pendências: validar `/clinic/dashboard`, `/clinic/patients`, busca e logout em sessão sintética.

### Evidência — F05 avanço de contrato da lista de pacientes

- Data: 2026-06-02.
- Ambiente: local dev, validação por código e checks obrigatórios.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: não aplicável nesta etapa; browser autenticado pendente.
- Tenant sintético: pendente para criação/edição e isolamento Tenant A/B.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/patients` e `patientsApi`.
- Passos executados:
  1. Revisada a implementação de `patientsApi` e da tela `PatientListContent`.
  2. Sanitizada busca real em `patient_pii` por nome, documento mascarado, telefone e email.
  3. Alterada a tela para usar `getPatientListPage` com busca/status e controle de resposta obsoleta.
  4. Adicionado filtro real de status e mantidos filtros derivados client-side até contrato agregado completo.
  5. Tornadas ações de linha sempre visíveis e seleção em massa acessível, sem habilitar ações sem escrita segura.
- Resultado esperado: avançar F05 na ordem do plano sem criar migração nem depender de mock para busca/status.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` passaram após as mudanças; lint/build mantêm 11 warnings conhecidos não relacionados. Smoke Supabase/browser ainda pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar criar/editar/listar/filtrar/abrir 360 com usuários sintéticos, fechar paginação real acima de 100 linhas e provar isolamento Tenant A/B.

### Evidência — F06 Paciente 360 permissões e snapshot

- Data: 2026-06-02.
- Ambiente: local dev, validação por código e checks obrigatórios.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; validação estática usou `UserContext` e permissões retornadas pelo endpoint de sessão.
- Tenant sintético: pendente para smoke visual e RLS multi-tenant.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/patients/[patientId]`, `patient-360-summary`, `patient-timeline` e abas do Paciente 360.
- Passos executados:
  1. Revisado o carregamento de `Patient360Content` e o contrato de `patient360Api`.
  2. Passado `UserContext` ao cabeçalho do paciente para bloquear ações sem permissão e ocultar status financeiro restrito.
  3. Adicionados fallbacks de telefone, email e datas inválidas no cabeçalho.
  4. Passadas permissões efetivas ao resumo para não renderizar detalhes de documentos, financeiro e chat quando a aba correspondente é restrita.
  5. Documentado que as abas restritas não montam seus componentes de conteúdo antes da permissão.
- Resultado esperado: avançar F06 na ordem do plano sem criar migração, sem chamar provedores externos e sem depender de mock para o snapshot principal.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` passaram após as mudanças; lint/build mantêm 11 warnings conhecidos não relacionados. Smoke Supabase/browser continua pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado com paciente sintético.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar snapshot e abas com perfis sintéticos, provar isolamento Tenant A/B, validar D4Sign/Asaas somente em sandbox autorizado e capturar evidência visual.

### Evidência — F07 Atendimento SOAP imutável após finalização

- Data: 2026-06-02.
- Ambiente: local dev, validação por código e checks obrigatórios.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; validação estática usou contrato de sessão/tenant resolvido pelos serviços browser.
- Tenant sintético: pendente para salvar rascunho, recarregar, finalizar e provar isolamento Tenant A/B.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/patients/[patientId]/encounter`, `encounterApi`, `clinicalRecordsApi`, tabelas `encounters`, `soap_notes`, `patient_timeline_events` e `audit_logs`.
- Passos executados:
  1. Revisado o fluxo de carregamento, rascunho e finalização SOAP.
  2. Adicionada proteção no serviço para não salvar rascunho em atendimento fechado.
  3. Adicionada revalidação de `soapNoteId` por tenant/paciente antes de update, bloqueando edição de SOAP finalizado e nota vinculada a atendimento divergente.
  4. Atualizada a UI para desabilitar editor SOAP e registros clínicos vinculados quando o atendimento carregado está finalizado.
- Resultado esperado: avançar F07 na ordem do plano sem criar migração, sem chamar provedores externos e sem depender de mock para a regra de imutabilidade pós-finalização.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` passaram após as mudanças; lint/build mantêm 11 warnings conhecidos não relacionados. Smoke Supabase/browser continua pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado com paciente sintético.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar salvar rascunho, recarregar, finalizar, timeline/audit log e bloqueio pós-finalização em usuários sintéticos; provar RLS multi-tenant.

### Evidência — F08 Agenda real, cancelamento e conflitos

- Data: 2026-06-02.
- Ambiente: local dev, validação por código e checks obrigatórios.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; validação estática usou tenant ativo resolvido por sessão browser.
- Tenant sintético: pendente para criar, editar, cancelar e avançar status com isolamento Tenant A/B.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/agenda`, `agendaApi`, tabelas `appointments`, `patient_pii`, `patients` e `queue_events`.
- Passos executados:
  1. Revisado o contrato real de carregamento diário/mensal de `appointments` e a montagem da fila operacional.
  2. Adicionada validação de conflito antes de criar/editar consulta para bloquear sobreposição do mesmo paciente ou mesmo local no mesmo dia.
  3. Mantida a validação de paciente no tenant ativo antes de mutações de agenda.
  4. Atualizada a UI para exigir motivo de cancelamento em modal dedicado, evitando cancelamento sem justificativa operacional.
  5. Mantidos eventos de fila para criação, edição, transição de status e cancelamento, sem logar PII real ou payload sensível.
- Resultado esperado: avançar F08 na ordem do plano sem criar migração, sem chamar provedores externos e sem depender de mock para regras de agenda.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` passaram após as mudanças; lint/build mantêm warnings conhecidos não relacionados quando aplicável. Smoke Supabase/browser continua pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado com paciente sintético.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar criar/editar/cancelar/avançar status com usuários sintéticos, provar conflito real em Supabase, validar queue events sob RLS e capturar evidência visual.

### Evidência — F09 Programas e builder com publicação controlada

- Data: 2026-06-02.
- Ambiente: local dev, validação por código e checks obrigatórios.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; validação estática usou RPCs protegidas por sessão/tenant resolvido no Supabase.
- Tenant sintético: pendente para criar rascunho, publicar, clonar, arquivar e matricular paciente com isolamento Tenant A/B.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/programs`, `/clinic/programs/builder`, `programsApi`, RPCs `get_clinic_programs`, `get_program_builder_options`, `upsert_program_from_builder`, `update_program_status`, `clone_program` e `enroll_patient_in_program`.
- Passos executados:
  1. Revisado o contrato real de listagem, builder, publicação, alteração de status, clonagem e matrícula de programas.
  2. Adicionada sanitização de textos/listas do payload do builder antes de salvar em RPC real, reduzindo risco de campos vazios, caracteres de controle e dados inconsistentes.
  3. Adicionada validação compartilhada de publicação para bloquear programa sem nome, tipo, duração, fases, serviços ou parcelamento mínimo coerente.
  4. Atualizada a UI do builder para exibir pendências de publicação e desabilitar publicação até resolver itens obrigatórios.
  5. Preservado fallback mock explícito para status, clone e matrícula quando `NEXT_PUBLIC_USE_MOCK_DATA=true`, evitando chamadas Supabase inesperadas em modo mock.
- Resultado esperado: avançar F09 na ordem do plano sem criar migração, sem chamar provedores externos e sem depender de mock para validações mínimas de programas.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` passaram após as mudanças; lint/build mantêm 11 warnings conhecidos não relacionados quando aplicável. `npm run dev` subiu localmente e `curl -I` confirmou proteção por redirecionamento para `/auth/login` nas rotas de programas sem sessão. Smoke Supabase/browser autenticado continua pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado com usuários e pacientes sintéticos.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar draft/publicação/clone/status/matrícula com usuários sintéticos, provar RLS multi-tenant, conferir geração operacional de check-ins/documentos/invoice/agenda e capturar evidência visual.

### Evidência — F09 matrícula de paciente em programa

- Data: 2026-06-02.
- Ambiente: local, validação por código e checks obrigatórios.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; UI usa sessão browser existente e serviço usa cliente Supabase anon/session-scoped.
- Tenant sintético: pendente para confirmar RLS multi-tenant e efeitos derivados reais.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/programs`, `programsApi.enrollPatientInProgram`, `patientsApi.getPatientListPage` e RPC `enroll_patient_in_program`.
- Passos executados:
  1. Adicionada ação visível de matrícula em cards de programas ativos, sem depender de hover-only.
  2. Adicionado modal operacional para buscar pacientes ativos, selecionar paciente e informar data de início.
  3. Conectado submit da UI ao serviço real `enrollPatientInProgram`, preservando fallback mock explícito.
  4. A UI passou a mostrar o retorno operacional da RPC: check-ins criados, tarefas documentais, criação de agenda e invoice.
  5. O serviço passou a aceitar campos camelCase e snake_case no retorno da RPC para reduzir fragilidade de contrato.
- Resultado esperado: avançar F09 na ordem do plano com matrícula acionável por UI e evidência clara de efeitos derivados, sem criar migração nem chamar provider externo.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check` e smoke local com `npm run dev` + `curl -I http://localhost:4028/clinic/programs` passaram; lint/build mantêm 11 warnings conhecidos não relacionados e a rota protegida respondeu `307` para `/auth/login` sem sessão. Smoke Supabase/browser autenticado continua pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado com programa e paciente sintéticos.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar matrícula com usuário sintético, provar isolamento Tenant A/B, conferir geração real de check-ins/documentos/invoice/agenda e capturar evidência visual.

### Evidência — F10 Documentos clínica e D4Sign controlado

- Data: 2026-06-02.
- Ambiente: local dev, validação por código e checks obrigatórios.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; validação estática usou contratos RLS/RPC/Edge Function já versionados.
- Tenant sintético: pendente para gerar documento, enviar assinatura D4Sign sandbox, processar webhook e liberar no portal.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/documents`, `clinicDocumentsApi`, `documentsApi`, tabelas `document_templates`, `generated_documents`, `signature_requests`, `d4sign_events`, Edge Functions `generate-document`, `d4sign-send-document`, `webhook-d4sign` e `document-signed-url`.
- Passos executados:
  1. Revisado o contrato real de documentos emitidos, templates, assinaturas D4Sign, monitor operacional e URL assinada.
  2. A listagem clínica passou a carregar o vínculo do template e mostrar se o documento está habilitado para D4Sign.
  3. A ação de assinatura na UI passou a ficar desabilitada quando o template de origem não possui D4Sign habilitado.
  4. A Edge Function `d4sign-send-document` passou a revalidar no backend que o template está ativo e com `d4sign_enabled=true` antes de ler storage ou chamar o provedor.
  5. Mantidas validações existentes de permissão `documents.write`, vínculo tenant/paciente, bucket privado, path permissionado, formato suportado, request duplicado e credenciais D4Sign somente no ambiente da função.
- Resultado esperado: avançar F10 na ordem do plano sem criar migração, sem expor tokens D4Sign no cliente e sem chamar o provedor quando o template não autoriza assinatura.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` passaram após as mudanças; lint/build mantêm 11 warnings conhecidos não relacionados quando aplicável. Smoke Supabase/browser/D4Sign sandbox continua pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, provider IDs reais ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado com documento/template/paciente sintéticos.
- Status: aprovado por código; validação real em homologação/sandbox pendente.
- Pendências: validar geração, assinatura, webhook idempotente/autenticado, URL assinada curta, liberação/ocultação no portal e isolamento RLS multi-tenant com usuários sintéticos.

### Evidência — F11 Financeiro clínica e Asaas idempotente

- Data: 2026-06-02.
- Ambiente: local, validação por código e checks obrigatórios; provedores externos não foram chamados.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; validação estática usou contratos RLS/RPC/Edge Functions já versionados.
- Tenant sintético: pendente para criar customer/cobrança/assinatura em sandbox Asaas, processar webhook e provar reconciliação.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/financeiro`, aba Financeiro do Paciente 360, `billingApi`, RPCs `get_patient_financial_summary`, `get_clinic_finance_overview`, `get_clinic_finance_reconciliation`, Edge Functions `asaas-create-patient-customer`, `asaas-create-patient-invoice`, `asaas-create-patient-subscription` e `webhook-asaas`.
- Passos executados:
  1. Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente da ordem, F11.
  2. O serviço frontend passou a aceitar uma chave de idempotência opcional para cobranças e assinaturas, enviada apenas para Edge Functions em fluxo real.
  3. A aba financeira do Paciente 360 passou a gerar uma chave por tentativa de criação e manter a mesma chave durante retries da mesma tentativa.
  4. As Edge Functions de invoice e subscription passaram a consultar registros locais do mesmo tenant/paciente com a chave recebida antes de chamar Asaas, retornando o registro existente quando encontrado.
  5. A chave fica persistida somente em `metadata.idempotency_key` operacional; CPF/CNPJ continua normalizado no cliente/Edge Function e não é impresso em log.
- Resultado esperado: avançar F11 na ordem do plano sem criar migração, sem chamar Asaas localmente e reduzindo risco de duplicidade em retry de cobrança/assinatura.
- Resultado observado: checks obrigatórios executados após as mudanças; smoke Supabase/browser/Asaas sandbox continua pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, IDs reais de provider ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado com paciente sintético e sandbox Asaas autorizado.
- Status: aprovado por código; validação real em homologação/sandbox pendente.
- Pendências: validar customer/cobrança/assinatura em sandbox, webhook idempotente/autenticado, reconciliação com divergências sintéticas, isolamento RLS multi-tenant e evidência visual.

### Evidência — F12 Relatórios clínicos e export seguro

- Data: 2026-06-02.
- Ambiente: local, validação por código e checks obrigatórios; Edge Functions/RPCs reais não foram invocados contra Supabase remoto nesta execução.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; validação estática usou contratos RLS/RPC/Edge Functions já versionados.
- Tenant sintético: pendente para executar `/clinic/reports` com `NEXT_PUBLIC_USE_MOCK_DATA=false`, usuário com `reports.read` e perfis sem permissões financeiras/sensíveis.
- Mock habilitado? fluxo de relatórios clínicos usa Supabase Functions/RPCs reais; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/reports`, `clinicReportsApi`, Edge Functions `clinic-reports` e `clinic-report-export`, RPCs `list_clinic_report_definitions`, `create_clinic_report_run`, `get_clinic_report_run` e `get_clinic_report_export`.
- Passos executados:
  1. Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente da ordem, F12.
  2. A Edge Function `clinic-reports` passou a validar `report_key`, reconsultar o catálogo allowlist, recusar definições indisponíveis, recusar `canRun=false` e bloquear run quando `exportEnabled=false` antes de chamar a RPC de criação.
  3. A UI de `/clinic/reports` passou a mostrar quando a exportação está desabilitada, bloquear botões de CSV/PDF nesses casos e oferecer ação de consulta de status do último run via `getClinicReportRun`.
  4. A área de resultado passou a exibir resumo operacional minimizado do run e mantém estado explícito para relatório sem linhas.
  5. A Edge Function `clinic-report-export` passou a recusar métodos fora de GET/POST, validar sessão com `auth.getUser`, exigir `run_id` e token antes da RPC e registrar erros sem mensagem bruta de banco/provedor.
- Resultado esperado: avançar F12 na ordem do plano sem criar migração, sem imprimir segredos e fechando o contrato frontend/Edge Function para listagem, execução, status e exportação segura.
- Resultado observado: checks obrigatórios executados após as mudanças; smoke Supabase/browser com usuário sintético e download real continuam pendentes.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, IDs reais de provider ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado em `/clinic/reports` com tenant sintético.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: executar relatório com dados e sem dados, baixar CSV/PDF, validar expiração de token, perfil sem `reports.read`, perfil sem `financial.read`/`timeline.sensitive.read` e isolamento RLS multi-tenant.

### Evidência — F15 CRM operacional

- Data: 2026-06-02.
- Ambiente: local, validação por código e checks obrigatórios parciais nesta execução; RPCs reais não foram invocadas contra Supabase remoto.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; UI usa sessão browser e serviço usa cliente Supabase anon/session-scoped.
- Tenant sintético: pendente para criar, editar, mover, registrar atividade/tarefa, converter e provar isolamento Tenant A/B.
- Mock habilitado? código preserva mock somente quando `NEXT_PUBLIC_USE_MOCK_DATA=true`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/clinic/crm`, `crmApi`, RPCs `list_crm_leads`, `create_crm_lead`, `update_crm_lead`, `move_crm_lead_stage`, `record_crm_lead_activity`, `create_crm_lead_task`, `convert_crm_lead_to_patient` e `emit_crm_operational_notifications`.
- Passos executados:
  1. Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente aberta da ordem, CRM.
  2. Adicionada normalização local de termos de busca, UUIDs, datas e textos livres antes de chamadas RPC reais, sem imprimir payloads sensíveis.
  3. Adicionada validação de nome e contato mínimo para criar/editar lead na UI.
  4. Adicionada ação de edição no painel de detalhe e submit para `update_crm_lead`, com refresh do pipeline e do detalhe após sucesso.
  5. Revisado que criação, movimentação, atividade, tarefa, conversão, deduplicação por contrato e notificações operacionais já estão conectadas às RPCs versionadas.
- Resultado esperado: avançar F15 na ordem do plano sem criar migração, sem chamar provedores externos e sem depender de mock para o contrato de CRM.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check` e smoke local com `npm run dev` + `curl -I http://localhost:4028/clinic/crm` passaram após as mudanças; lint/build mantêm 11 warnings conhecidos não relacionados e a rota protegida respondeu `307` para `/auth/login` sem sessão. Smoke Supabase/browser autenticado e execução real das RPCs continuam pendentes para o fechamento de release.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, IDs reais de provider ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado em `/clinic/crm` com tenant e lead sintéticos.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar CRUD/movimentação/conversão com usuários sintéticos, provar bloqueio para perfil sem `crm.write`/`crm.convert`, confirmar audit logs/notificações e isolamento RLS multi-tenant.

### Evidência — F17 Portal paciente funcional

- Data: 2026-06-03.
- Ambiente: local, validação por código e checks obrigatórios; RPCs reais não foram invocadas contra Supabase remoto nesta execução.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; página server-side exige sessão e serviço browser usa cliente Supabase anon/session-scoped.
- Tenant sintético: pendente para paciente, responsável/guardian e tentativa de acesso cruzado Tenant A/B.
- Mock habilitado? não foi necessário alterar `NEXT_PUBLIC_USE_MOCK_DATA`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/patient`, `patientPortalApi`, RPCs `get_patient_portal_snapshot`, `send_patient_portal_message`, `submit_patient_portal_checkin`, `mark_patient_portal_notification_read` e signed URL documental via `getDocumentSignedUrl`.
- Passos executados:
  1. Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente aberta da ordem após inventário, F17.
  2. Adicionada validação local de UUID para seleção de paciente, envio de mensagem, envio de check-in e marcação de notificação antes de chamar RPCs reais.
  3. Sanitizados texto de mensagem, payload de respostas de check-in e mensagens de erro exibidas ao paciente para evitar detalhes internos de RLS/RPC.
  4. Restringidos links financeiros do snapshot a URLs HTTP(S) válidas antes de renderizar ação de pagamento.
  5. Atualizada a UI para renderizar perguntas do template de check-in, exigir respostas e bloquear submissão incompleta/concorrente.
  6. Fortalecido o fallback de datas inválidas para manter o portal carregado com snapshots parciais.
- Resultado esperado: avançar F17 na ordem do plano sem criar migração, sem chamar provedores externos e sem depender de mock para a segurança client-side do portal.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check` e smoke local com `npm run dev` + `curl -I http://localhost:4028/patient`/`curl -I http://localhost:4028/auth/login` passaram após as mudanças; lint/build mantêm 11 warnings conhecidos não relacionados, `/patient` respondeu `307` para `/auth/login` sem sessão e `/auth/login` respondeu `200`. Smoke Supabase/browser autenticado continua pendente para o fechamento de release.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, IDs reais de provider ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado em `/patient` com paciente/responsável sintéticos.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar snapshot completo, troca de paciente vinculado, tentativa de paciente não vinculado, envio de mensagem, resposta de check-in, notificação lida, signed URL documental, links financeiros seguros e isolamento RLS multi-tenant.

### Evidência — F18 Admin overview e seções reais

- Data: 2026-06-03.
- Ambiente: local, validação por código e checks obrigatórios; RPCs reais não foram invocadas contra Supabase remoto nesta execução.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; layout admin segue protegido por `PlatformAdminGuard` e o serviço browser usa cliente Supabase anon/session-scoped.
- Tenant sintético: pendente para conferir MRR, providers, suporte, audit logs e break-glass por tenant.
- Mock habilitado? não foi necessário alterar `NEXT_PUBLIC_USE_MOCK_DATA`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/admin`, `/admin/billing`, `/admin/integrations`, `/admin/security`, `/admin/support`, `/admin/audit`, `adminApi`, RPCs `list_platform_tenants`, `list_platform_webhook_events` e `get_platform_tenant_detail`.
- Passos executados:
  1. Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente aberta da ordem, Fase 7 admin overview.
  2. Ampliado `PlatformAdminSnapshot` para carregar suporte real, audit logs reais e avisos de degradação parcial, sem payload bruto nem provider secrets.
  3. Substituída a auditoria sintética por eventos reais retornados pelo detalhe operacional dos tenants com atividade relevante.
  4. Adicionados componentes de UI para solicitações reais de suporte e auditoria real, incluindo estados vazios e links para o detalhe do tenant.
  5. Sanitizadas mensagens de erro do serviço admin para não vazar detalhes internos de RPC, RLS ou banco no browser.
  6. Adicionada proteção contra respostas obsoletas no refresh do snapshot administrativo.
- Resultado esperado: avançar Fase 7 na ordem do plano sem criar migração, sem chamar provedores externos e sem depender de mock para o overview admin.
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check` e smoke local com `npm run dev` + `curl -I` em `/admin`, `/admin/support` e `/admin/audit` passaram após as mudanças; lint/build mantêm 11 warnings conhecidos não relacionados e as rotas admin responderam `307` para `/auth/login` sem sessão. Smoke Supabase/browser autenticado continua pendente para o fechamento de release.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, IDs reais de provider ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado em `/admin` com admin sintético.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar snapshot completo, seção financeira, status Asaas/D4Sign, segurança, suporte real, audit logs reais e isolamento/RBAC de admin com usuários sintéticos.

### Evidência — F19 Admin tenants e ações auditadas

- Data: 2026-06-03.
- Ambiente: local, validação por código e checks obrigatórios; RPCs mutáveis reais não foram invocadas contra Supabase remoto nesta execução.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; rotas admin seguem protegidas por `PlatformAdminGuard`, Route Handler e RPCs de plataforma.
- Tenant sintético: pendente para convite real, alteração de membership, suporte, break-glass, encerramento/revogação e tentativa cross-tenant.
- Mock habilitado? não foi necessário alterar `NEXT_PUBLIC_USE_MOCK_DATA`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/admin/tenants`, `/admin/tenants/[tenantId]`, `/api/admin/tenants/[tenantId]/invitations`, `adminApi`, RPCs `list_platform_tenants`, `get_platform_tenant_detail`, `update_platform_tenant_membership`, `request_platform_support_session`, `end_platform_support_session`, `request_platform_break_glass`, `decide_platform_break_glass` e `revoke_platform_break_glass`.
- Passos executados:
  1. Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente aberta da ordem, Fase 7.2 Tenants.
  2. Revisado o fluxo de lista/filtro/detalhe de tenants e confirmado consumo de RPCs sanitizadas por cliente Supabase session-scoped.
  3. Mantido convite de usuário em Route Handler server-side com Supabase Admin/service-role, validação de tenant, role, unidade e motivo auditável.
  4. Adicionada validação client-side de UUIDs para tenant, membership, unidade, suporte e break-glass antes de chamar contratos reais.
  5. Normalizados textos auditáveis de convite, suporte, atualização de membership, solicitação e revogação de break-glass para remover caracteres de controle, limitar tamanho e exigir mínimos operacionais.
  6. Sanitizada a resposta de falha interna no convite para não propagar detalhes do Supabase Auth, banco ou stack ao browser.
- Resultado esperado: fechar Fase 7.2 por código, preservando service-role apenas server-side e auditabilidade nos contratos mutáveis.
- Resultado observado: checks locais obrigatórios foram executados nesta entrega; smoke Supabase/browser autenticado permanece pendente para confirmar efeitos reais em audit logs e RBAC com administradores sintéticos.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, IDs reais de provider ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado em `/admin/tenants` e `/admin/tenants/[tenantId]`.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: executar smoke mutável em Supabase homologação com dois admins sintéticos, provar self-approval bloqueado, conferir audit logs de convite/membership/suporte/break-glass e validar isolamento Tenant A/B.

### Evidência — F20/F21 Webhooks admin e observabilidade

- Data: 2026-06-03.
- Ambiente: local, validação por código e checks obrigatórios; nenhum webhook real, provider externo ou RPC mutável foi acionado nesta execução.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: contexto real/sintético não executado; rotas admin seguem protegidas por `PlatformAdminGuard` e RPCs de plataforma.
- Tenant sintético: pendente para eventos Asaas/D4Sign, filtros reais, status dead-letter/retry e validação cross-tenant.
- Mock habilitado? não foi necessário alterar `NEXT_PUBLIC_USE_MOCK_DATA`; nenhuma variável secreta foi impressa.
- Rota/API/RPC/Edge Function: `/admin/webhooks`, `/admin/observability`, `/api/health`, `adminApi`, RPC `list_platform_webhook_events`.
- Passos executados:
  1. Confirmada a existência do plano em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md` e avanço executado na próxima frente aberta da ordem, Fase 7.3 Webhooks e observabilidade.
  2. Sanitizados textos operacionais e redigidos identificadores externos/idempotência de webhooks antes da exposição no browser.
  3. Mantida a listagem real Asaas/D4Sign por RPC, com filtros provider/status e contagem por provider.
  4. Adicionada proteção contra respostas obsoletas durante refresh concorrente do monitor de webhooks.
  5. Marcado reprocessamento como indisponível enquanto não houver contrato server-side auditado, evitando uma ação client-side fictícia ou insegura.
  6. Transformado `/admin/observability` em painel híbrido com sinais reais de `/api/health` e webhooks, enquanto monitores sem integração APM/métricas externas ficam explicitamente rotulados como catálogo estático.
- Resultado esperado: avançar F20/F21 na ordem do plano sem criar migração, sem chamar provedores externos e sem expor payloads brutos, headers, assinaturas, secrets ou identificadores de provider completos no browser.
- Resultado observado: checks locais obrigatórios foram executados nesta entrega; smoke Supabase/browser autenticado permanece pendente para confirmar eventos sintéticos e RBAC real.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, IDs reais completos de provider ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado em `/admin/webhooks` e `/admin/observability`.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar eventos Asaas/D4Sign sintéticos, confirmar dead-letter/retry, conectar métricas externas/APM e definir contrato auditado de reprocessamento se essa ação for necessária.

### Evidência — verificação completa do projeto versus plano

- Data: 2026-06-03.
- Ambiente: local, varredura estática de código e documentação; nenhum `.env` foi lido, nenhuma migração/bootstrap foi executada e nenhum provider externo foi chamado.
- Branch/commit: branch `work`, commit registrado após esta execução.
- Perfil de usuário: não aplicável; sem sessão real ou sintética nesta etapa.
- Tenant sintético: não aplicável; validação Tenant A/B permanece pendente para homologação Supabase.
- Mock habilitado? não foi alterado; a verificação confirmou que vários serviços mantêm fallback apenas quando `NEXT_PUBLIC_USE_MOCK_DATA === 'true'`.
- Rotas/API/RPC/Edge Function: inventário de `src/app`, `src/services`, `supabase/functions`, `supabase/migrations`, `scripts/supabase`, `.env.example` e `package.json`.
- Passos executados:
  1. Conferida a presença de `AGENTS.md` e do plano funcional em `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md`.
  2. Inventariadas rotas App Router, layouts e Route Handlers; confirmadas rotas clínicas, admin, públicas, portal e redirecionamentos legados.
  3. Inventariados serviços frontend e Edge Functions para mapear contratos reais versus fallback mock.
  4. Conferidas migrações que declaram RPCs de settings, comunicações/inbox, CRM, webhooks/admin e contratos já citados no plano.
  5. Feita verificação estática de higiene de ambiente e service-role sem abrir `.env`: somente `.env.example` foi encontrado na raiz, e `SUPABASE_SERVICE_ROLE_KEY` em `src` aparece apenas no helper `server-only`.
  6. Atualizadas a matriz F13/F14/F15/F18/F19/F22, a seção de browser smoke e o registro de pendências para incluir rotas e contratos encontrados no código atual.
- Resultado esperado: manter o documento como controle vivo fiel ao estado do projeto, sem marcar como concluído o que ainda depende de ambiente real.
- Resultado observado: o plano agora explicita avanços de contrato real em settings, inbox, CRM e admin tenants, inclui rotas admin derivadas e redirects legados no smoke, e mantém pendências de browser/Supabase/provider.
- Logs sanitizados: sem secrets, tokens, cookies, PII real, IDs reais de provider ou payloads sensíveis.
- Screenshot/anexo: não aplicável; alteração documental e varredura estática, sem mudança perceptível em aplicação web.
- Status: aprovado para documentação; validação funcional real permanece pendente em homologação.
- Pendências: executar `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check`, browser smoke completo, testes Supabase com usuários sintéticos e validações D4Sign/Asaas sandbox autorizadas.

## 18. Sequência recomendada de implementação

1. Executar baseline técnica local.
2. Corrigir `/api/auth/app-session`.
3. Corrigir `WeightEvolutionChart` com dados vazios.
4. Blindar `DashboardShell` contra falhas de comunicações.
5. Validar Auth/RBAC e redirecionamentos.
6. Validar rotas clínicas principais sem mock.
7. Validar portal paciente sem mock.
8. Validar admin overview, tenants e audit log.
9. Fechar documentos/D4Sign em sandbox autorizado.
10. Fechar billing/Asaas em sandbox autorizado.
11. Fechar relatórios e exportações.
12. Validar CRM, inventário e programas ponta a ponta.
13. Executar browser smoke completo.
14. Executar gates de release.
15. Preparar runbook de produção e rollback.

## 19. Critério final de encerramento

A iniciativa só deve ser encerrada quando:

- [ ] Todos os itens F00 a F23 estão aprovados ou têm exceção formal aceita.
- [ ] Todos os fluxos P0 e P1 estão funcionando sem mock.
- [ ] Todas as áreas contrato-dependentes têm evidência real.
- [ ] Todas as integrações externas foram testadas em sandbox/autorização formal.
- [ ] Todos os checks obrigatórios passam.
- [ ] Browser smoke completo foi executado.
- [ ] Nenhum risco alto permanece aberto.
- [ ] Runbook de produção, rollback e suporte está disponível.
- [ ] O time responsável aprovou go-live.
