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

| ID  | Frente                   | Escopo                                                                   | Status inicial                                                                                  | Status alvo                    | Evidência obrigatória                                                                                                                | Bloqueios esperados                                     |
| --- | ------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| F00 | Baseline técnica         | TypeScript, lint, build e diff check                                     | Executado localmente em 2026-06-02                                                              | Aprovado                       | `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check` passaram; lint/build mantêm 13 warnings conhecidos         | Sem bloqueio local                                      |
| F01 | Auth e guardas           | `/`, `/auth/login`, `/no-workspace`, middleware, `/api/auth/app-session` | Blindado por código em 2026-06-02 para evitar self-redirect e tratar `/no-workspace` sem sessão | Aprovado em browser e contrato | Matriz de redirecionamento por perfil; validação estática confirmou alvo canônico e ausência de redirect para a própria rota         | Sessões sintéticas e vínculos de usuário                |
| F02 | Correção portal paciente | `canAccessPatientPortal` no endpoint de sessão                           | Corrigido por código em 2026-06-02                                                              | Corrigido e testado            | Endpoint reutiliza helper canônico de destino; validação real por perfis segue pendente sem usuários sintéticos/Supabase homologação | Usuários sintéticos e ambiente Supabase homologação     |
| F03 | Shell clínico            | `DashboardShell`, polling, busca, logout, menus                          | Blindado por código em 2026-06-02                                                               | Resiliente a falhas            | Polling e ações de leitura tratam exceções localmente; browser smoke segue pendente                                                  | Ambiente/browser autenticado para smoke                 |
| F04 | Dashboard clínico        | `/clinic/dashboard`, `dashboardApi`                                      | Mock/real misto                                                                                 | Real validado                  | Smoke sem mock com métricas, fila e alertas                                                                                          | Contratos de métricas e insights                        |
| F05 | Pacientes                | `/clinic/patients`, `patientsApi`                                        | Avanço de contrato real em 2026-06-02: busca sanitizada em PII, filtro real por status, refresh concorrente protegido e ações acessíveis | CRUD real validado             | Criar, editar, listar, filtrar e abrir 360; `npm run type-check` passou após avanço de código                                         | RLS em PII, paginação real >100 e smoke autenticado     |
| F06 | Paciente 360             | `/clinic/patients/[patientId]` e abas                                    | Correção de gráfico aplicada em 2026-06-02; demais abas mock/real misto                         | Real validado por aba          | `WeightEvolutionChart` trata vazio/nulo/inválido sem `NaN`; smoke por paciente sintético segue pendente                              | Edge Functions, permissões por aba e paciente sintético |
| F07 | Atendimento SOAP         | `/clinic/patients/[patientId]/encounter`, `encounterApi`                 | Mock/real misto                                                                                 | Escrita real validada          | Salvar rascunho e finalizar atendimento                                                                                              | Timeline e audit log                                    |
| F08 | Agenda                   | `/clinic/agenda`, `agendaApi`                                            | Mock/real misto                                                                                 | Real validado                  | Criar, editar, cancelar e mudar status                                                                                               | Queue events e conflitos de horário                     |
| F09 | Programas                | `/clinic/programs`, builder, `programsApi`                               | Mock/real misto                                                                                 | Real validado                  | Criar draft, publicar, clonar e matricular paciente                                                                                  | RPCs de builder e matrícula                             |
| F10 | Documentos clínica       | `/clinic/documents`, `clinicDocumentsApi`                                | Contrato dependente                                                                             | Fluxo completo validado        | Gerar, assinar, liberar e consultar URL                                                                                              | D4Sign, storage, webhook e permissões                   |
| F11 | Financeiro clínica       | `/clinic/financeiro`, `billingApi`                                       | Mock/real misto                                                                                 | Real validado                  | Overview, reconciliação e ações sandbox                                                                                              | Asaas, idempotência e webhooks                          |
| F12 | Relatórios clínica       | `/clinic/reports`, `clinicReportsApi`                                    | Contrato dependente                                                                             | Execução/exportação validada   | Executar relatório e baixar exportação                                                                                               | Edge Function `clinic-reports`                          |
| F13 | Configurações            | `/clinic/settings`, `clinicSettingsApi`                                  | Integrado por leitura                                                                           | Real validado                  | Ler, atualizar clínica e unidade                                                                                                     | RPCs de settings e permissões                           |
| F14 | Inbox                    | `/clinic/inbox`, `notificationsApi`, `chatApi`                           | Mock/real misto                                                                                 | Real validado                  | Marcar lido, arquivar, atribuir e responder                                                                                          | RPCs de comunicações e RLS                              |
| F15 | CRM                      | `/clinic/crm`, `crmApi`                                                  | Mock/real misto                                                                                 | Real validado                  | Criar lead, mover etapa e converter paciente                                                                                         | RPCs CRM e duplicidade de PII                           |
| F16 | Inventário               | `/clinic/inventory`, `inventoryApi`                                      | Mock/real misto                                                                                 | Real validado                  | Criar item/lote/movimento/transferência                                                                                              | Estoque negativo e auditoria                            |
| F17 | Portal paciente          | `/patient`, `patientPortalApi`                                           | Integrado por leitura                                                                           | Real validado                  | Snapshot, mensagem, check-in e notificação                                                                                           | Vínculo paciente, RLS e liberação                       |
| F18 | Admin overview           | `/admin` e seções derivadas                                              | Integrado por leitura                                                                           | Real validado                  | Snapshot admin e navegação de seções                                                                                                 | Permissão platform admin                                |
| F19 | Admin tenants            | `/admin/tenants`, `/admin/tenants/[tenantId]`                            | Detalhe contrato dependente                                                                     | Real validado                  | Convite, membership, suporte, break-glass e audit log                                                                                | Service role server-side e justificativas               |
| F20 | Webhooks admin           | `/admin/webhooks`                                                        | Integrado por leitura                                                                           | Real validado                  | Listar eventos Asaas/D4Sign e filtros                                                                                                | Dados sintéticos de webhooks                            |
| F21 | Observability            | `/admin/observability`                                                   | Estático                                                                                        | Útil operacionalmente          | Checklist de monitores e links reais                                                                                                 | Fonte de sinais ainda estática                          |
| F22 | Segurança e privacidade  | Logs, env, service role, storage, URLs                                   | Não consolidado                                                                                 | Aprovado                       | Checklist de ausência de vazamentos                                                                                                  | Variáveis e logs de provider                            |
| F23 | Produção                 | Build, healthcheck, env, rollback                                        | Não validado                                                                                    | Go-live aprovado               | Runbook de release e rollback                                                                                                        | Secrets, DNS, Supabase e providers                      |

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
- [x] Registrar erros pré-existentes antes de alterações funcionais. Lint/build passaram com 13 warnings já presentes em componentes não relacionados.
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
- [ ] Paginação funciona. Parcial: UI pagina os resultados carregados e o serviço aceita `page/pageSize`; a tela ainda carrega até 100 linhas para preservar filtros derivados client-side até contrato de filtros agregados.
- [x] Seleção em massa funciona sem expor ações indevidas. Em 2026-06-02 ações em massa continuam desabilitadas quando não há escrita segura e checkboxes ganharam rótulos acessíveis.
- [x] Criar paciente grava dados em tabelas corretas. Código grava `patients` e `patient_pii` no tenant ativo; validação Supabase/RLS pendente.
- [x] Editar paciente atualiza dados e respeita RLS. Código atualiza por `tenant_id` e `id`/`patient_id`; validação multi-tenant real pendente.
- [x] Abrir Paciente 360 usa `patientId` correto. Link e clique de linha usam `/clinic/patients/${patient.id}`.
- [ ] Tenant A não acessa paciente do tenant B. Pendente validação com usuários sintéticos e RLS em homologação.

**Progresso registrado em 2026-06-02:**

- `patientsApi` recebeu sanitização explícita da busca de pacientes para remover caracteres de controle e curingas de `ilike`, limitar o tamanho do termo e pesquisar nome, CPF mascarado, telefone e email sem expor valores em logs.
- A listagem `/clinic/patients` passou a chamar `getPatientListPage` com busca/status em vez de carregar tudo pelo helper legado, mantendo total retornado pelo contrato real e protegendo respostas obsoletas em refresh concorrente.
- O filtro operacional de status foi adicionado ao painel de filtros e aplicado no Supabase por `patients.status`; filtros derivados seguem client-side enquanto o contrato agregado não suporta todos os campos.
- Ações de linha deixaram de depender de hover para cumprir o requisito touch/teclado, e seleção em massa recebeu labels acessíveis mantendo ações não autorizadas desabilitadas.
- Validação browser autenticada, criação/edição real e isolamento Tenant A/B continuam pendentes até homologação com usuários sintéticos.

### 7.3 `/clinic/patients/[patientId]` — Paciente 360

**Checklist geral:**

- [ ] `Patient360Content` carrega snapshot real.
- [ ] Loading aparece durante busca.
- [ ] Erro de snapshot mostra retry/feedback.
- [ ] Cabeçalho mostra dados sanitizados.
- [ ] Tabs não fazem chamadas indevidas antes de permissão.

**Checklist por aba:**

| Aba         | Validação                                                | Resultado |
| ----------- | -------------------------------------------------------- | --------- |
| Resumo      | KPIs, alertas, próximas ações e evolução com dados reais | [ ]       |
| Timeline    | Eventos cronológicos reais e vazios tratados             | [ ]       |
| Consultas   | Agenda/histórico do paciente                             | [ ]       |
| Documentos  | Listar, gerar, assinar e obter link quando autorizado    | [ ]       |
| Financeiro  | Faturas, status e ações autorizadas                      | [ ]       |
| Nutrição    | Plano via Edge Function ou estado vazio                  | [ ]       |
| Prescrições | Respeito a `canViewMedicalPrescriptions`                 | [ ]       |
| Pacotes     | Progresso e status de programas                          | [ ]       |
| Relatórios  | Definições e downloads autorizados                       | [ ]       |
| Chat        | Thread, envio e marcação de leitura                      | [ ]       |

### 7.4 `/clinic/patients/[patientId]/encounter`

**Checklist:**

- [ ] Carrega contexto do paciente.
- [ ] Cria atendimento quando necessário.
- [ ] Salva rascunho SOAP.
- [ ] Recupera rascunho após reload.
- [ ] Finaliza atendimento.
- [ ] Registra timeline.
- [ ] Registra audit log.
- [ ] Impede edição indevida após finalização, se essa for a regra de negócio.

### 7.5 `/clinic/agenda`

**Checklist:**

- [ ] Carrega agenda diária real.
- [ ] Cria consulta.
- [ ] Edita consulta.
- [ ] Cancela consulta com motivo.
- [ ] Atualiza status.
- [ ] Registra evento de fila quando aplicável.
- [ ] Trata conflito de horário.
- [ ] Mostra estado vazio em dias sem agenda.

### 7.6 `/clinic/financeiro`

**Checklist:**

- [ ] Carrega overview real.
- [ ] Carrega reconciliação real.
- [ ] Mostra cobranças por status.
- [ ] Ações Asaas ficam bloqueadas sem ambiente autorizado.
- [ ] Em sandbox autorizado, cria customer/invoice/subscription.
- [ ] Webhook atualiza status financeiro.
- [ ] Idempotência impede cobrança duplicada.

### 7.7 `/clinic/inbox`

**Checklist:**

- [ ] Lista threads reais.
- [ ] Abre thread.
- [ ] Envia mensagem.
- [ ] Marca como lida.
- [ ] Arquiva.
- [ ] Atribui responsável.
- [ ] Atualiza status.
- [ ] Falha de envio não duplica mensagem no retry.

## 8. Fase 4 — Programas, CRM e inventário

### 8.1 Programas e builder

**Checklist:**

- [ ] Lista programas reais.
- [ ] Cria draft no builder.
- [ ] Valida etapas obrigatórias.
- [ ] Salva fases.
- [ ] Salva serviços.
- [ ] Salva check-ins.
- [ ] Salva documentos vinculados.
- [ ] Salva entitlements.
- [ ] Salva financeiro.
- [ ] Salva equipe.
- [ ] Revisa e publica.
- [ ] Clona programa.
- [ ] Altera status.
- [ ] Matricula paciente.
- [ ] Regras financeiras e de agenda derivadas permanecem coerentes.

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

- [ ] Tabela de templates tem RLS e grants corretos.
- [ ] Documento gerado mantém vínculo com tenant, paciente e autor.
- [ ] Storage usa bucket e path permissionados.
- [ ] Envio D4Sign só ocorre em ambiente autorizado.
- [ ] Token/crypt key nunca aparece em client ou log.
- [ ] Webhook valida assinatura/autenticidade.
- [ ] Webhook é idempotente.
- [ ] Status desconhecido tem fallback seguro.
- [ ] Signed URL é curta e permissionada.
- [ ] Portal exibe somente documentos liberados.

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
- Resultado observado: comandos passaram; `npm run lint` e `npm run build` mantiveram 13 warnings conhecidos em componentes não alterados.
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
- Resultado observado: `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` passaram após as mudanças; lint/build mantêm 13 warnings conhecidos não relacionados. Smoke Supabase/browser ainda pendente.
- Logs sanitizados: sem secrets, tokens, cookies, PII real ou payloads sensíveis.
- Screenshot/anexo: pendente de browser smoke autenticado.
- Status: aprovado por código; validação real em homologação pendente.
- Pendências: validar criar/editar/listar/filtrar/abrir 360 com usuários sintéticos, fechar paginação real acima de 100 linhas e provar isolamento Tenant A/B.

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
