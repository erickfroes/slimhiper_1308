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

| ID  | Frente                   | Escopo                                                                   | Status inicial                                                                                                                                                               | Status alvo                    | Evidência obrigatória                                                                                                                | Bloqueios esperados                                     |
| --- | ------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| F00 | Baseline técnica         | TypeScript, lint, build e diff check                                     | Executado localmente em 2026-06-02                                                                                                                                           | Aprovado                       | `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check` passaram; lint/build mantêm 11 warnings conhecidos         | Sem bloqueio local                                      |
| F01 | Auth e guardas           | `/`, `/auth/login`, `/no-workspace`, middleware, `/api/auth/app-session` | Blindado por código em 2026-06-02 para evitar self-redirect e tratar `/no-workspace` sem sessão                                                                              | Aprovado em browser e contrato | Matriz de redirecionamento por perfil; validação estática confirmou alvo canônico e ausência de redirect para a própria rota         | Sessões sintéticas e vínculos de usuário                |
| F02 | Correção portal paciente | `canAccessPatientPortal` no endpoint de sessão                           | Corrigido por código em 2026-06-02                                                                                                                                           | Corrigido e testado            | Endpoint reutiliza helper canônico de destino; validação real por perfis segue pendente sem usuários sintéticos/Supabase homologação | Usuários sintéticos e ambiente Supabase homologação     |
| F03 | Shell clínico            | `DashboardShell`, polling, busca, logout, menus                          | Blindado por código em 2026-06-02                                                                                                                                            | Resiliente a falhas            | Polling e ações de leitura tratam exceções localmente; browser smoke segue pendente                                                  | Ambiente/browser autenticado para smoke                 |
| F04 | Dashboard clínico        | `/clinic/dashboard`, `dashboardApi`                                      | Mock/real misto                                                                                                                                                              | Real validado                  | Smoke sem mock com métricas, fila e alertas                                                                                          | Contratos de métricas e insights                        |
| F05 | Pacientes                | `/clinic/patients`, `patientsApi`                                        | Avanço de contrato real em 2026-06-02: busca sanitizada em PII, filtro real por status, refresh concorrente protegido e ações acessíveis                                     | CRUD real validado             | Criar, editar, listar, filtrar e abrir 360; `npm run type-check` passou após avanço de código                                        | RLS em PII, paginação real >100 e smoke autenticado     |
| F06 | Paciente 360             | `/clinic/patients/[patientId]` e abas                                    | Correção de gráfico aplicada em 2026-06-02; demais abas mock/real misto                                                                                                      | Real validado por aba          | `WeightEvolutionChart` trata vazio/nulo/inválido sem `NaN`; smoke por paciente sintético segue pendente                              | Edge Functions, permissões por aba e paciente sintético |
| F07 | Atendimento SOAP         | `/clinic/patients/[patientId]/encounter`, `encounterApi`                 | Avanço de imutabilidade em 2026-06-02: rascunho/finalização reais já usam `encounters`, `soap_notes`, timeline e audit log; edição pós-finalização bloqueada no serviço e UI | Escrita real validada          | Salvar rascunho, recarregar, finalizar atendimento, timeline/audit e bloqueio pós-finalização                                        | Browser autenticado, usuários sintéticos e RLS real     |
| F08 | Agenda                   | `/clinic/agenda`, `agendaApi`                                            | Avanço de contrato real em 2026-06-02: leitura diária/mensal, criação, edição, status, cancelamento com motivo, eventos de fila e conflito de horário blindados por código   | Real validado                  | Criar, editar, cancelar e mudar status                                                                                               | Queue events e conflitos de horário                     |
| F09 | Programas                | `/clinic/programs`, builder, `programsApi`                               | Avanço de matrícula em 2026-06-02: UI de programas aciona `enroll_patient_in_program`, seleciona paciente ativo e mostra reflexos de check-ins/documentos/agenda/invoice     | Real validado                  | Criar draft, publicar, clonar e matricular paciente                                                                                  | Smoke autenticado, RLS multi-tenant e efeitos derivados |
| F10 | Documentos clínica       | `/clinic/documents`, `clinicDocumentsApi`                                | Avanço de contrato real em 2026-06-02: UI e Edge Function bloqueiam envio D4Sign quando o template não está habilitado/ativo; status fica visível na lista                   | Fluxo completo validado        | Gerar, assinar, liberar e consultar URL                                                                                              | D4Sign sandbox, storage, webhook e permissões reais     |
| F11 | Financeiro clínica       | `/clinic/financeiro`, `billingApi`                                       | Mock/real misto                                                                                                                                                              | Real validado                  | Overview, reconciliação e ações sandbox                                                                                              | Asaas, idempotência e webhooks                          |
| F12 | Relatórios clínica       | `/clinic/reports`, `clinicReportsApi`                                    | Contrato dependente                                                                                                                                                          | Execução/exportação validada   | Executar relatório e baixar exportação                                                                                               | Edge Function `clinic-reports`                          |
| F13 | Configurações            | `/clinic/settings`, `clinicSettingsApi`                                  | Integrado por leitura                                                                                                                                                        | Real validado                  | Ler, atualizar clínica e unidade                                                                                                     | RPCs de settings e permissões                           |
| F14 | Inbox                    | `/clinic/inbox`, `notificationsApi`, `chatApi`                           | Mock/real misto                                                                                                                                                              | Real validado                  | Marcar lido, arquivar, atribuir e responder                                                                                          | RPCs de comunicações e RLS                              |
| F15 | CRM                      | `/clinic/crm`, `crmApi`                                                  | Mock/real misto                                                                                                                                                              | Real validado                  | Criar lead, mover etapa e converter paciente                                                                                         | RPCs CRM e duplicidade de PII                           |
| F16 | Inventário               | `/clinic/inventory`, `inventoryApi`                                      | Mock/real misto                                                                                                                                                              | Real validado                  | Criar item/lote/movimento/transferência                                                                                              | Estoque negativo e auditoria                            |
| F17 | Portal paciente          | `/patient`, `patientPortalApi`                                           | Integrado por leitura                                                                                                                                                        | Real validado                  | Snapshot, mensagem, check-in e notificação                                                                                           | Vínculo paciente, RLS e liberação                       |
| F18 | Admin overview           | `/admin` e seções derivadas                                              | Integrado por leitura                                                                                                                                                        | Real validado                  | Snapshot admin e navegação de seções                                                                                                 | Permissão platform admin                                |
| F19 | Admin tenants            | `/admin/tenants`, `/admin/tenants/[tenantId]`                            | Detalhe contrato dependente                                                                                                                                                  | Real validado                  | Convite, membership, suporte, break-glass e audit log                                                                                | Service role server-side e justificativas               |
| F20 | Webhooks admin           | `/admin/webhooks`                                                        | Integrado por leitura                                                                                                                                                        | Real validado                  | Listar eventos Asaas/D4Sign e filtros                                                                                                | Dados sintéticos de webhooks                            |
| F21 | Observability            | `/admin/observability`                                                   | Estático                                                                                                                                                                     | Útil operacionalmente          | Checklist de monitores e links reais                                                                                                 | Fonte de sinais ainda estática                          |
| F22 | Segurança e privacidade  | Logs, env, service role, storage, URLs                                   | Não consolidado                                                                                                                                                              | Aprovado                       | Checklist de ausência de vazamentos                                                                                                  | Variáveis e logs de provider                            |
| F23 | Produção                 | Build, healthcheck, env, rollback                                        | Não validado                                                                                                                                                                 | Go-live aprovado               | Runbook de release e rollback                                                                                                        | Secrets, DNS, Supabase e providers                      |

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

- [ ] Lista pipeline real.
- [ ] Cria lead.
- [ ] Edita lead.
- [ ] Move etapa.
- [ ] Registra atividade.
- [ ] Cria tarefa.
- [ ] Converte lead em paciente.
- [ ] Evita duplicidade de paciente/PII.
- [ ] Notificações operacionais são geradas.

### 8.3 Inventário

**Checklist:**

- [ ] Lista snapshot real.
- [ ] Cria item.
- [ ] Edita item.
- [ ] Cria lote.
- [ ] Cria movimentação de entrada.
- [ ] Cria movimentação de saída.
- [ ] Transfere estoque entre unidades.
- [ ] Bloqueia estoque negativo quando aplicável.
- [ ] Gera alerta de estoque baixo.
- [ ] Gera alerta de vencimento.
- [ ] Registra auditoria de movimentações.

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

- [ ] Lista definições de relatórios clínicos.
- [ ] Executa relatório autorizado.
- [ ] Consulta status de processamento.
- [ ] Exporta arquivo.
- [ ] Trata relatório sem dados.
- [ ] Bloqueia perfil sem permissão.

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
- [ ] Customer paciente idempotente.
- [ ] Invoice idempotente.
- [ ] Subscription idempotente.
- [ ] Webhook valida autenticação.
- [ ] Webhook valida tenant mapping.
- [ ] Webhook trata reentrega.
- [ ] Payload bruto não é armazenado sem necessidade explícita.
- [ ] Status financeiro e reconciliação ficam coerentes.
- [ ] Erros do provider são mostrados sem vazar detalhes sensíveis.

## 10. Fase 6 — Portal paciente completo

### 10.1 Snapshot e acesso

- [ ] `/patient` valida sessão server-side.
- [ ] RPC `get_patient_portal_snapshot` nega acesso quando paciente não está liberado.
- [ ] Paciente autorizado recebe snapshot completo.
- [ ] Paciente não consegue acessar dados de outro paciente alterando URL ou payload.
- [ ] Primeira chamada de validação e chamada do conteúdo são consistentes.

### 10.2 Funcionalidades

- [ ] Documentos liberados aparecem.
- [ ] Documentos não liberados ficam ocultos.
- [ ] Faturas/status financeiro aparecem corretamente.
- [ ] Check-in é enviado e associado ao paciente correto.
- [ ] Mensagem é enviada para a clínica correta.
- [ ] Notificação marcada como lida afeta somente o paciente correto.
- [ ] Estados vazio/erro/loading são claros.

## 11. Fase 7 — Admin e operações de plataforma

### 11.1 Admin overview e seções

- [ ] `/admin` carrega snapshot real.
- [ ] Seção financeira mostra dados agregados corretos.
- [ ] Seção integrações mostra status de providers.
- [ ] Seção segurança mostra alertas reais ou estado estático identificado.
- [ ] Seção suporte mostra solicitações reais.
- [ ] Seção auditoria mostra eventos reais.

### 11.2 Tenants

- [ ] Lista tenants.
- [ ] Filtra tenants.
- [ ] Abre detalhe.
- [ ] Exibe usuários/memberships.
- [ ] Convida usuário com service-role somente server-side.
- [ ] Atualiza membership com validação de role.
- [ ] Solicita suporte.
- [ ] Encerra suporte.
- [ ] Inicia break-glass com justificativa obrigatória.
- [ ] Encerra break-glass.
- [ ] Registra audit log para todas as ações sensíveis.

### 11.3 Webhooks e observabilidade

- [ ] Lista eventos Asaas.
- [ ] Lista eventos D4Sign.
- [ ] Filtra por status/provider.
- [ ] Mostra detalhes sanitizados.
- [ ] Reprocessamento, se existir, é protegido e auditado.
- [ ] `/admin/observability` aponta para sinais reais ou deixa claro o que é estático.

## 12. Fase 8 — Segurança, privacidade e RLS

### 12.1 Checklist de secrets

- [ ] `.env` não está versionado.
- [ ] `.env.local` não está versionado.
- [ ] `.env.example` contém apenas nomes e placeholders seguros.
- [ ] Nenhum `SUPABASE_SERVICE_ROLE_KEY` aparece em client component.
- [ ] Nenhum segredo aparece em `NEXT_PUBLIC_*`.
- [ ] Logs não imprimem tokens, cookies, webhook secrets ou provider IDs sensíveis.

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

### 13.3 Rotas públicas e portal

| Rota            | Carrega | Sem console crítico | Interação validada | Resultado |
| --------------- | ------- | ------------------- | ------------------ | --------- |
| `/`             | [ ]     | [ ]                 | Redirecionamento   | [ ]       |
| `/auth/login`   | [ ]     | [ ]                 | Login/logout       | [ ]       |
| `/no-workspace` | [ ]     | [ ]                 | Logout/retorno     | [ ]       |
| `/patient`      | [ ]     | [ ]                 | Mensagem/check-in  | [ ]       |

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

| Data       | Frente | Pendência                                       | Severidade | Responsável | Próxima ação                                                                               | Status                 |
| ---------- | ------ | ----------------------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------ | ---------------------- |
| 2026-06-02 | F02    | Revisar divergência de `canAccessPatientPortal` | Alta       | Codex       | Endpoint e middleware agora usam helper canônico; validar perfis sintéticos em homologação | Parcialmente resolvido |
| 2026-06-02 | F10    | Validar contratos D4Sign/documentos             | Alta       | A definir   | Preparar ambiente sandbox autorizado                                                       | Aberto                 |
| 2026-06-02 | F11    | Validar Asaas/billing com sandbox               | Alta       | A definir   | Preparar dados sintéticos e webhooks                                                       | Aberto                 |
| 2026-06-02 | F12    | Fechar contrato de `clinic-reports`             | Média      | A definir   | Validar Edge Function e exportação                                                         | Aberto                 |
| 2026-06-02 | F19    | Testar admin tenant detail com audit log        | Alta       | A definir   | Criar cenários admin sintéticos                                                            | Aberto                 |
| 2026-06-02 | F06    | Blindar gráfico de peso com dados vazios        | Média      | Codex       | Componente corrigido; validar visualmente no Paciente 360 com paciente sem histórico       | Parcialmente resolvido |

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
