# Slim Care -> SlimHiper Fusion Master Plan

Data: 2026-06-06
Status: plano detalhado de fusao funcional e upgrade de produto
Base: SlimHiper atual + Slim Care reference em `../slim-care-flow` e `Slim care.zip`

## 1. Objetivo

Este documento transforma tudo que o Slim Care tem a mais em um backlog
detalhado para elevar o SlimHiper como produto, UI, experiencia mobile,
contratos Supabase, seguranca e operacao.

O Slim Care deve ser usado como biblioteca de ideias de produto, fluxos e
decomposicao funcional. Ele nao deve ser copiado como runtime, dependencia ou
codigo Base44. O SlimHiper continua sendo o produto-alvo em Next.js 15, React
19, Tailwind 3, Supabase, Edge Functions, RLS/RBAC, Asaas e D4Sign.

O resultado esperado da fusao e:

- aumentar a qualidade percebida do app do paciente;
- deixar rotinas clinicas mais acionaveis e menos dispersas;
- aproximar agenda, fila, atendimento, prontuario, documentos e financeiro;
- incorporar sinais diarios de adesao ao Paciente 360 e ao dashboard clinico;
- preservar o hardening de producao ja feito no SlimHiper;
- criar checklists claros para executar tudo em uma leva controlada, com gates
  internos e evidencia.

## 2. Fontes consultadas

SlimHiper:

- `AGENTS.md`
- `docs/PROJECT_COMPLETION_CHECKPOINTS.md`
- `docs/PROJECT_FUNCTIONAL_COMPLETION_PLAN.md`
- `docs/PROJECT_FUNCTIONALITY_CONTROL_PLAN.md`
- `docs/PROJECT_SCREEN_COMPONENT_AUDIT.md`
- `src/app`
- `src/components`
- `src/services`
- `supabase/functions`
- `supabase/migrations`

Slim Care reference:

- `../slim-care-flow/Slim care.zip`
- `../slim-care-flow/src/App.jsx`
- `../slim-care-flow/src/pages`
- `../slim-care-flow/src/components`
- `../slim-care-flow/base44/entities`
- `../slim-care-flow/base44/functions`
- `../slim-care-flow/WHITEPAPER_SISTEMA_SLIMCARE.md`
- `../slim-care-flow/supabase/docs/PAGE_BY_PAGE_MIGRATION_MAP.md`
- `../slim-care-flow/supabase/docs/FUNCTION_MIGRATION_MAP.md`
- `../slim-care-flow/supabase/docs/DATA_MODEL_OVERVIEW.md`

Subagents usados:

- `repo_explorer`: inventario comparativo de modulos e rotas.
- `frontend_reviewer`: recomendacoes de UI, mobile, acessibilidade e UX.
- `supabase_reviewer`: contratos, RLS, Edge Functions, RPCs, triggers e cron.
- `docs_reviewer`: estrutura documental, status, criterios de aceite e gates.
- `security_reviewer`: solicitado para riscos de seguranca; nao retornou antes
  da primeira escrita do documento; retornou em seguida e os bloqueadores foram
  incorporados na secao "Bloqueadores de seguranca".

## 3. Regras de corte

- Nao portar Base44 para o runtime do SlimHiper.
- Nao criar dependencia nova grande apenas para replicar comportamento visual.
- Nao trocar Next, React, Tailwind ou Supabase como parte desta fusao.
- Nao criar nova superficie sensivel lendo dados direto no browser sem RLS,
  RPC, Route Handler ou Edge Function apropriada.
- Nao expor service role em client components, services browser, URLs, toasts ou
  localStorage.
- Nao expor provider IDs sensiveis, signed URLs, storage paths privados, PII,
  payload bruto de webhook ou segredos.
- Todo arquivo privado deve sair por URL assinada curta e permissionada.
- Todo modulo mobile deve caber em 390px sem sobreposicao, texto cortado ou CTA
  inacessivel.
- Todo dialog/drawer precisa foco inicial, Escape, retorno de foco, label
  acessivel e acao por teclado.
- Toda tabela desktop precisa fallback em cards no mobile.
- Toda tela protegida precisa loading, empty, error e forbidden quando aplicavel.
- Toda chamada a Asaas, D4Sign, migrations, bootstraps ou scripts mutantes exige
  autorizacao explicita e ambiente adequado.

## 4. Convencoes de status

### 4.1 Status executivo

- `[ ]` Nao iniciado.
- `[~]` Em andamento.
- `[B]` Bloqueado por decisao, ambiente, schema, credencial ou regra externa.
- `[R]` Requer autorizacao, credencial, provider, migration ou ambiente real.
- `[V]` Validado com evidencia, aguardando incorporacao, merge ou release.
- `[x]` Fechado com evidencia suficiente.

### 4.2 Maturidade funcional

- `N0 ausente`: sem rota, service, schema ou contrato.
- `N1 UI/mock`: existe UI ou mock, mas sem contrato real suficiente.
- `N2 contrato`: existe service, fixture, runbook ou tipo, mas integracao ainda
  incompleta.
- `N3 backend parcial`: existe Supabase/RPC/Edge Function, mas falta UI,
  hardening, evidencia ou testes.
- `N4 producao candidata`: dados reais, RLS, estados de UI, erros e contratos
  validados em ambiente controlado.
- `N5 pronto`: CI/checks, smoke/contract tests, auditoria, monitoramento,
  runbook e evidencias fechadas.

## 5. Visao executiva das lacunas Slim Care -> SlimHiper

| Modulo                   | Slim Care tem a mais                                                                | SlimHiper hoje                                                              | Maturidade alvo        |
| ------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| Portal paciente diario   | Home mobile, agua, refeicoes, treino, check-in, evolucao, streaks e timeline diaria | `/patient` consolidado com check-ins, docs, financeiro, chat e notificacoes | N5                     |
| Onboarding e perfil      | Onboarding assistencial, perfil editavel, metas, programa e upgrade                 | Perfil/vinculo parcial via portal e admin                                   | N4                     |
| Comunidade               | Feed paciente, comentarios, prompts semanais e moderacao                            | Ausente como modulo                                                         | N4 depois de hardening |
| Chat avancado            | Disponibilidade, respostas rapidas, anexos/imagens, SLA                             | Inbox/chat ja existe, mas mais operacional                                  | N5                     |
| Dashboard operacional    | Coortes, baixa adesao, mensagens recentes, renovacao, prioridade                    | Dashboard real/fallback ja existe                                           | N5                     |
| Carteira de pacientes    | Triagem, prioridade, drawer e mapa acionavel                                        | Lista robusta + 360                                                         | N5                     |
| Agenda e fila            | Agenda dia/semana/mes, retornos, bloqueios, fila dedicada                           | Agenda/fila integradas parcialmente                                         | N5                     |
| Prontuario longitudinal  | Medical record, anexos, auditoria, fotos, visitas                                   | 360 + encounter + clinicalRecords                                           | N5                     |
| Fotos e evolucao         | Fotos de progresso e evolucao corporal dedicada                                     | Dados nutricionais e medidas, sem modulo forte de fotos                     | N4                     |
| Prescricoes regulatorias | Itens, metadados regulatorios, assinatura legal, PDF                                | `prescriptions_placeholder` + RPCs MVP                                      | N5                     |
| Documentos/templates     | Biblioteca de templates, categorias, drawer e wizard                                | Documentos e D4Sign reais, template management menor                        | N5                     |
| Comercial                | Servicos, pacotes, programas, tiers, beneficios e upgrades                          | Programas/builder, sem catalogo separado completo                           | N5                     |
| Financeiro               | Comprovantes, recorrencia, upgrades, refund, sync gateway                           | Asaas real, overview/reconciliacao, faltam alguns fluxos                    | N5                     |
| Settings/equipe          | Chat hours, auto message, legal, compliance, permissoes                             | Settings clinico/admin fortes, faltam alguns blocos                         | N5                     |
| Jobs operacionais        | Automacoes, stuck attendance, reminders, seeds/backfills                            | Helpers existem, falta cron versionado                                      | N5                     |
| Relatorios persistentes  | Historico e artifacts exportados                                                    | Export blob atual                                                           | N4                     |

## 6. Plano por modulo

### M01 - Portal paciente diario mobile-first

Origem Slim Care:

- `/home`
- `/water`
- `/meals`
- `/workouts`
- `/checkin`
- `/evolution`
- componentes `HomeHeader`, `DailyProgress`, `QuickActions`, `StatsGrid`,
  `StreaksCard`, `WeekCalendar`, `WeeklyGoalCard`, `DailyTimeline`,
  `WaterProgressRing`, `WaterQuickButtons`, `MealForm`, `MealFeed`,
  `WorkoutForm`, `WorkoutHistory`, `CheckinForm`, `CheckinInsight`,
  `EvolutionChart`.

Estado SlimHiper:

- `/patient` ja e a rota principal.
- `PatientPortalContent` ja tem bottom navigation e snapshot do portal.
- Portal ja possui documentos, financeiro, check-ins, notificacoes e chat.
- Nutrição aparece no Paciente 360 e em `patient-nutrition-plan`, mas o paciente
  nao tem experiencia diaria completa de habitos.

Decisao de fusao:

- Manter uma rota principal `/patient`.
- Criar tabs/secoes internas mobile-first, em vez de copiar todas as rotas do
  Slim Care.
- Permitir deep links opcionais como `/patient?tab=diario&action=water`.
- Transformar agua, refeicao, treino e check-in em acoes rapidas do cockpit.
- Refletir os sinais no Paciente 360 e no dashboard clinico.

UI e UX alvo:

- Header compacto com saudacao, proxima acao e status do programa.
- Card "Hoje" com progresso de agua, refeicoes, treino e check-in.
- Acoes rapidas com icones: agua, refeicao, treino, check-in, mensagem.
- Timeline diaria em ordem cronologica.
- Streaks semanais e meta da semana sem gamificacao exagerada.
- Estados claros: sem plano ativo, sem check-in configurado, sem internet,
  envio pendente, envio falhou.
- Bottom nav apenas no portal paciente.

Status do corte 2026-06-06:

- [x] Corte frontend inicial implementado em `/patient`, com aba `Diario`,
      deep links `?tab=diario&action=water|meal|workout|checkin|message`, acoes
      rapidas, dialogs acessiveis, timeline diaria e estado otimista com rollback.
- [x] Service `patientDailyApi` conectado a RPCs Supabase para snapshot diario,
      agua, refeicao, treino e check-in, mantendo fallback local quando o contrato
      estiver indisponivel.
- [x] Migration `20260606153000_220_patient_daily_habits.sql` criada com
      tabelas de habitos diarios, RLS, bucket privado `meal-photos`, RPCs
      patient-scoped e timeline/alertas basicos.
- [x] Migrations M01 `20260606153000`, `20260606170000` e `20260606183000`
      aplicadas no Supabase local apos reparo do historico local divergente.
- [x] Dashboard clinico consome `get_clinic_daily_adherence_snapshot` para
      baixa adesao diaria sem retornar PII no RPC.
- [x] Paciente 360 recebe sinais via `patient_timeline_events` e resumo
      agregado dedicado de habitos diarios em `patient-360-summary`.
- [x] Foto de refeicao usa bucket privado, validacao de tipo/tamanho e
      visualizacao clinica por signed URL curta via Edge Function
      `meal-photo-signed-url`, sem expor caminho de storage no RPC agregado.
- [x] Retencao M01 definida em migration de governanca: dados diarios por 6
      anos, fotos de refeicao por 180 dias e helpers service-role em dry-run para
      expirar dados/marcar fotos para remocao.
- [x] Alertas operacionais M01 podem ser emitidos por helper service-role para
      baixa adesao, check-in ausente e foto de refeicao pendente de revisao.
- [x] Browser smoke mobile autenticado executado com paciente local de smoke em
      `/patient?tab=diario&action=water`, cobrindo 360px, 390px, 768px e desktop,
      sem redirect para login, sem erros de console/rede e sem overflow horizontal.
- [x] Checks do corte executados: `npm run type-check`, `npm run lint`,
      `npm run build`, `git diff --check` e smoke local autenticado apos
      modularizacao do portal.
- [x] Portal paciente modularizado: `PatientPortalContent` concentra estado,
      navegacao e handlers, enquanto as abas de resumo, documentos, financeiro,
      chat, notificacoes e check-ins ficam em secoes dedicadas com estados vazios
      reutilizando componentes compartilhados.

Checklist mobile:

- [x] Testar 360px, 390px, 768px e desktop.
- [x] Respeitar safe area inferior com bottom nav.
- [x] Todos os CTAs principais com area minima de 44px.
- [x] Nenhum FAB sobreposto ao input de chat ou bottom nav.
- [x] Agua em 1 toque e ajuste manual em dialog acessivel.
- [x] Refeicao com captura de camera quando mobile suporta.
- [x] Treino com repetir ultimo treino e formulario curto.
- [x] Check-in com escala que nao dependa apenas de cor.
- [x] Timeline diaria com empty state humano e direto.
- [x] Offline/erro temporario com retry e estado local reversivel.

Checklist produto:

- [x] Definir quais habitos entram no MVP: agua, refeicao, treino, check-in.
- [x] Definir se refeicao exige foto obrigatoria, opcional ou por programa.
- [x] Definir metas por programa, paciente ou default da clinica.
- [x] Definir visibilidade para clinica: resumo agregado para `patients.read`,
      metadados de fotos somente com `nutrition.read` e signed URL sob demanda.
- [x] Definir quando gerar alertas no M01: baixa adesao, ausencia de check-in,
      humor/energia/sintomas de risco e foto pendente de revisao.
- [x] Definir retencao de fotos e dados diarios.

Checklist backend:

- [x] Criar ou confirmar tabelas `water_entries`, `meal_entries`,
      `workout_entries`, `daily_checkins`.
- [x] Criar view/RPC `get_patient_daily_snapshot`.
- [x] Criar RPCs patient-scoped para inserir agua, refeicao, treino e check-in.
- [x] Criar policies para `patient_accounts` e `guardian_links`.
- [x] Criar trigger/timeline para sinais relevantes.
- [x] Criar bucket privado ou padronizar bucket para fotos de refeicao.
- [x] Criar signed URL curta para fotos.
- [x] Atualizar `patient-360-summary` para incluir sinais diarios agregados.
- [x] Atualizar dashboard clinico com baixa adesao derivada desses sinais.
- [x] Criar governanca de retencao e emissao dry-run/execute de alertas
      operacionais diarios.

Checklist frontend:

- [x] Criar componentes em `src/app/patient/components/daily`.
- [x] Separar `PatientPortalContent` em secoes menores.
- [x] Criar service `patientDailyApi` ou expandir `patientPortalApi`.
- [x] Usar `DataState`, `SectionPanel`, `MetricCard`, `Dialog`.
- [x] Evitar cards aninhados.
- [x] Usar lucide icons, nao emojis/texto quando houver icone familiar.
- [x] Implementar optimistic update somente com rollback.
- [x] Adicionar loading/empty/error por secao, sem derrubar a tela inteira.

Checklist seguranca:

- [x] Fotos de refeicao nunca em bucket publico.
- [x] Signed URLs nunca logadas.
- [x] Signed URLs bloqueadas para fotos vencidas ou marcadas para remocao por
      retencao.
- [x] Paciente nao pode escrever para outro paciente.
- [x] Guardian so acessa vinculo ativo.
- [x] Logs sanitizados sem texto livre sensivel de check-in.
- [x] Validar tamanho/tipo de arquivo antes de upload.

Aceite:

- [x] Paciente registra agua, refeicao, treino e check-in no celular em ate 3
      toques por fluxo comum.
- [x] Profissional ve resumo de adesao no Paciente 360.
- [x] Dashboard mostra baixa adesao sem leitura direta de PII no browser.
- [x] Sem mock silencioso com `NEXT_PUBLIC_USE_MOCK_DATA=false`.
- [x] Browser smoke mobile autenticado passa em `/patient`.

### M02 - Onboarding, perfil, metas e plano do paciente

Origem Slim Care:

- `/onboarding`
- `/profile`
- `/care-plan`
- componentes `ProfileHeader`, `ProfilePersonalBlock`,
  `ProfilePersonalBlockEditable`, `ProfileMetricsBlock`, `ProfileProgramBlock`,
  `ProfileFinancialBlock`, `ProfileDocumentsBlock`, `ProfileUpgradeBlock`,
  `ProfileOnboardingBlock`, `PlanTab`, `OrientacoesTab`, `MedicacoesTab`.

Estado SlimHiper:

- Portal paciente mostra snapshot, documentos, financeiro, check-ins, chat e
  notificacoes.
- Plano nutricional existe para Paciente 360.
- Prescricoes existem como aba clinica.
- Onboarding dedicado do paciente nao aparece como fluxo forte.

Decisao de fusao:

- Criar onboarding assistencial no portal paciente somente para dados que o
  paciente pode preencher com seguranca.
- Transformar perfil em "Minha jornada", com dados pessoais, programa, metas,
  plano, documentos e pendencias.
- Evitar expor prontuario clinico ou dados sensiveis que exigem profissional.

Checklist UI/mobile:

- [x] Onboarding em etapas curtas com progresso.
- [x] Salvar por etapa para evitar perda.
- [x] Inputs grandes, labels visiveis e validacao inline.
- [x] Tela de perfil com secoes colapsaveis no celular.
- [x] Plano do paciente com "o que fazer hoje" antes de historico.
- [x] Medicacoes/lembretes com horarios editaveis em UI simples.
- [x] Documentos e financeiro como cards acionaveis.

Checklist backend:

- [x] RPC `complete_patient_onboarding`.
- [x] Tabela ou campos para metas: agua, refeicao, treino, sono, programa.
- [x] Controle de quais campos sao editaveis pelo paciente.
- [x] Auditoria para alteracao de dados pessoais sensiveis.
- [x] Lembretes de medicacao: tabelas `medication_reminders` ou equivalente.
- [ ] Cron/job para lembretes, se notificação ativa entrar no escopo.

Checklist seguranca:

- [x] Paciente nao altera campos clinicos restritos.
- [x] Dados pessoais atualizados pelo paciente entram em fila de revisao quando
      necessario.
- [x] Lembretes nao expõem medicamento em notificacao externa sem consentimento.

Aceite:

- [x] Paciente novo conclui onboarding e cai no cockpit diario.
- [x] Perfil mostra apenas dados permitidos.
- [x] Plano do paciente e lembretes aparecem sem expor dados indevidos.

### M03 - Comunidade moderada por programa

Origem Slim Care:

- `/community`
- `/portal/community`
- componentes `CommunityHeader`, `WeeklyPromptBanner`, `PostComposer`,
  `PostCard`, `PostComments`, `CommunityPendingPost`,
  `CommunityGuidelines`, `CommunityModerationQueue`,
  `CommunityModerationFilters`, `RejectionFeedbackModal`.
- entidades `CommunityPost`, `CommunityComment`, `WeeklyPrompt`.

Estado SlimHiper:

- Nao ha modulo de comunidade ativo.
- Existe chat/inbox e comunicacoes, mas nao feed social.

Decisao de fusao:

- Nao criar feed global.
- Comecar por comunidade moderada por programa, cohort ou pacote.
- Posts de paciente entram como pendentes quando moderacao estiver ligada.
- Clinica tem fila de moderacao com aprovar, rejeitar, ocultar, comentar.

Checklist UI/mobile:

- [x] Portal paciente: tab "Comunidade" com feed simples.
- [x] Composer curto com guideline antes de publicar.
- [x] Estado "aguardando moderacao".
- [x] Comentarios em bottom sheet no mobile.
- [x] Moderacao clinica em cards, nao tabela no celular.
- [x] Filtros: pendentes, aprovados, rejeitados, denunciados.
- [x] Nenhum contador social viciante como prioridade do produto.

Checklist backend:

- [x] Criar `community_posts`, `community_comments`, `weekly_prompts`.
- [x] Vincular post a tenant, programa/cohort e paciente.
- [x] RLS: paciente le apenas comunidade permitida pelo programa.
- [x] RLS: paciente cria post/comment como pendente ou aprovado conforme regra.
- [x] Moderadores precisam permissao `community.moderate`.
- [x] Criar audit log para aprovacao/rejeicao/remocao.
- [ ] Opcional: storage privado para imagens de comunidade.

Checklist seguranca:

- [x] Moderacao fail-closed.
- [x] Remocao/ocultacao auditada.
- [x] Comentarios de saude com disclaimers e triagem quando houver risco.
- [x] Denuncia de conteudo sensivel.
- [x] Rate limit por paciente.
- [x] Evitar exposicao de nome completo se configuracao exigir privacidade.

Aceite:

- [x] Paciente de programa autorizado ve feed.
- [x] Paciente sem beneficio ve bloqueio claro, nao dados.
- [x] Moderador aprova/rejeita post com motivo.
- [x] Conteudo rejeitado nao aparece no portal.

Status do corte 2026-06-06:

- [x] Migration `20260606220000_240_program_community_moderation.sql` criada com
      tabelas, RLS, RPCs patient-scoped, RPCs de moderacao, denuncia, prompt semanal,
      rate limit, triagem de risco e RBAC `community.moderate`.
- [x] Service `communityApi` criado com mock somente sob
      `NEXT_PUBLIC_USE_MOCK_DATA=true` e chamadas reais por RPC.
- [x] Portal paciente recebeu aba `Comunidade` com feed por programa, composer,
      estados de moderacao, denuncia e comentarios em bottom sheet.
- [x] Clinica recebeu `/clinic/community` no `DashboardShell`, com cards de
      moderacao, filtros, acoes auditadas e prompt semanal.
- [x] Runbook `docs/COMMUNITY_MODERATION_RUNBOOK.md` documenta contratos,
      permissoes, seguranca e checks.
- [ ] Imagens de comunidade permanecem fora deste corte por serem opcionais; se
      entrarem depois, devem usar storage privado, validacao de arquivo e signed URL
      curta.

### M04 - Chat e inbox avancados

Origem Slim Care:

- Chat paciente com disponibilidade, respostas rapidas, upload/imagem e image
  viewer.
- Portal messages com lista de salas, mensagens, envio, anexos e realtime.
- Componentes `ChatAvailabilityStatus`, `ChatQuickReplies`, `ChatInput`,
  `ChatImageViewer`, `RoomListItem`.

Estado SlimHiper:

- [x] M04 implementado no corte `b745f26` com inbox/portal evoluidos,
      componentes compartilhados, anexos privados, respostas rapidas,
      disponibilidade e SLA operacional.
- [x] `ClinicInboxContent`, `PatientPortalContent`,
      `PatientPortalSections`, `chatApi`, `patientPortalApi` e
      `notificationsApi` atualizados.
- [x] Migration `20260606223000_250_chat_inbox_advanced.sql` criada para
      horarios, atalhos, SLA, anexos, bucket privado, signed URLs e helper de SLA.
- [x] Contratos ja existentes em
      `20260601133000_181_chat_notifications_inbox_foundation.sql` cobrem unread
      counts, atribuicao de thread e mudanca de status.
- [R] Aplicacao em banco real e agendamento recorrente de
  `notify_chat_sla_breaches` dependem de ambiente/operacao autorizada; nao foi
  executado `supabase db push`.

Decisao de fusao:

- Evoluir inbox atual, nao criar modulo paralelo.
- Adicionar configuracoes de horario, resposta automatica, respostas rapidas,
  anexos e SLA.

Checklist UI/mobile:

- [x] Chat full-height no paciente.
- [x] Input fixo com safe area.
- [x] Botao de anexos por menu.
- [x] Estado de envio: enviando, enviado, falhou, reenviar.
- [x] Badge de horario indisponivel.
- [x] Respostas rapidas no portal clinico.
- [x] Fila inbox com SLA e dono.
- [x] Mensagem automatica identificada como automatica.

Checklist backend:

- [x] Tabelas `chat_shortcuts`, `chat_service_hours`, `chat_sla_policies`.
- [x] Tabela ou storage de `chat_attachments`.
- [x] Signed URL para anexos.
- [x] Trigger para unread counts.
- [x] Job/helper service-role para SLA estourado.
- [x] RPC para atribuir thread e mudar status.

Checklist seguranca:

- [x] Anexos privados.
- [x] Validacao de tipo/tamanho.
- [x] Thread sempre tenant-scoped e patient-scoped.
- [x] Paciente nao lista threads de outro paciente.
- [x] Logs sem conteudo de mensagem.

Aceite:

- [x] Paciente envia texto e anexo no celular.
- [x] Clinica responde por inbox com resposta rapida.
- [x] SLA aparece e notifica atraso.
- [x] Falha de anexo nao derruba thread.

### M05 - Dashboard operacional com inteligencia acionavel

Origem Slim Care:

- `MacroCards`, `OperationalKPIs`, `PriorityQueue`, `LowAdherence`,
  `FinancialPendencies`, `RecentMessages`, `RenewalPipeline`,
  `CohortPanel`, `ProgramDistribution`, `ClinicalAlerts`,
  `CommercialInsights`.

Estado SlimHiper:

- `/clinic/dashboard` ja existe com snapshot e fallback controlado.
- Dashboard ja tem metricas, fila, agenda, alertas e revisoes.

Decisao de fusao:

- Manter o layout operacional do SlimHiper.
- Adicionar filas acionaveis inspiradas no Slim Care.
- Priorizar "quem precisa de acao hoje" sobre graficos decorativos.

Status do corte 2026-06-07:

- [x] RPC `get_clinic_dashboard_snapshot` criada em migration nova com secoes
      `{ canRead, error, data }`, agregados por permissao e sem leitura direta
      ampla de PII pelo browser.
- [x] `dashboardApi` passou a consumir o snapshot RPC no caminho real e manteve
      mock apenas quando `NEXT_PUBLIC_USE_MOCK_DATA=true`.
- [x] Dashboard operacional ganhou fila acionavel unificada com motivo, dono,
      SLA, prioridade, CTA e chips de filtro.
- [x] Baixa adesao diaria, pendencias financeiras, pendencias documentais,
      mensagens recentes, renovacoes e coortes entram como sinais separados.
- [x] Usuario sem `financial.read` recebe valor restrito e secao financeira com
      `canRead=false`, sem expor contagens/valores.
- [~] Browser smoke autenticado local ficou limitado por ausencia de sessao
      clinica no navegador; smoke anonimo confirmou redirect fail-closed para
      `/auth/login`. Checks de codigo passaram.

Checklist UI/mobile:

- [x] KPIs em 2 colunas no mobile.
- [x] Filas em cards empilhados.
- [x] Filtros em drawer ou chips.
- [x] Cada item com motivo, dono, SLA e CTA.
- [x] Erro parcial por secao.
- [x] Skeleton sem layout shift.

Checklist backend:

- [x] Criar ou expandir `get_clinic_dashboard_snapshot`.
- [x] Retornar secoes `{ data, error, canRead }`.
- [x] Adicionar baixa adesao derivada dos habitos diarios.
- [x] Adicionar pendencias financeiras e documentais.
- [x] Adicionar renovacoes/upgrades quando modulo comercial estiver pronto.
- [x] Evitar leituras diretas de PII no browser.

Aceite:

- [x] Dashboard carrega com erro parcial sem tela branca.
- [x] Usuario sem permissao financeira nao ve valores.
- [x] Mobile mostra filas acionaveis sem tabela horizontal.

### M06 - Carteira de pacientes, triagem e prioridade

Origem Slim Care:

- `PatientTable`, `PatientDrawer`, `PatientFilters`, `PriorityMap`,
  `ClinicalTriage`, `WalletSummary`, `PatientCommercialCard`.

Estado SlimHiper:

- `/clinic/patients` ja tem lista, filtros, cards mobile, formulario e links
  para 360.
- CRM e programas ja existem.

Decisao de fusao:

- Adicionar camada de carteira/triagem acima da lista.
- Nao duplicar Paciente 360.
- Score de prioridade deve explicar o motivo e a acao sugerida.

Checklist UI/mobile:

- [ ] Cards mobile com risco, proxima acao, chat e abrir 360.
- [ ] Chips de filtro removiveis.
- [ ] Drawer de contexto no desktop; tela/drawer full-screen no mobile.
- [ ] Score com explicacao textual.
- [ ] Selecao em massa apenas desktop ou modo explicito.

Checklist backend:

- [ ] View/RPC de carteira por tenant.
- [ ] Campos agregados: adesao, financeiro, documentos, ultima mensagem,
      proxima consulta, programa ativo.
- [ ] Permissoes por secao: clinical, financial, documents, chat.
- [ ] Audit log para abertura de dados sensiveis se politica exigir.

Aceite:

- [ ] Lista continua performatica.
- [ ] Profissional entende por que paciente esta em prioridade alta.
- [ ] Cross-tenant negado em todos os agregados.

### M07 - Agenda, retornos e fila de atendimento

Origem Slim Care:

- `/portal/schedule`
- `/portal/attendance`
- componentes `AgendaCalendarView`, `AgendaDayView`, `AgendaWeekView`,
  `AgendaOperationalList`, `ReturnDrawer`, `ReturnFormModal`,
  `ReturnActionModals`, `AttendanceQueueView`, `AttendanceSummaryCards`,
  `AttendanceStartModal`, `AttendanceCheckInModal`, `AttendanceCallModal`,
  `AttendanceCompleteModal`, `AttendancePatientDrawer`.
- funcoes `agendaAutomations`, `agendaOnCreate`,
  `attendanceCreateFromSchedule`, `detectStuckAttendance`,
  `syncConfirmedAppointmentToQueue`, `confirmPatientReturn`.

Estado SlimHiper:

- `/clinic/agenda` existe.
- `agendaApi` cria, edita, cancela e muda status.
- Fila existe como painel, mas nao como modulo dedicado completo.
- Encounter/SOAP existe em rota de paciente.

Decisao de fusao:

- Transformar agenda/fila em fluxo unico: agendamento -> confirmacao ->
  chegada/check-in -> fila -> atendimento -> checkout/follow-up.
- Manter uma rota `/clinic/agenda` com tabs internas: agenda, fila, retornos.
- Criar deep links para iniciar atendimento.

Checklist UI/mobile:

- [ ] Mobile abre primeiro a agenda do dia.
- [ ] Semana/mes como visualizacao secundaria.
- [ ] Fila com status claros: aguardando, chamado, em atendimento, checkout,
      falta, cancelado.
- [ ] Retornos com proxima acao e contato.
- [ ] Cancelamento/falta exigem motivo.
- [ ] Drawer do paciente com contato, pendencias, pacote e alerta.
- [ ] Botao "Iniciar atendimento" leva ao SOAP correto.

Checklist backend:

- [ ] Revisar `appointments` e `queue_events` para suportar todos os estados.
- [ ] Criar tabela `attendance_queue` ou formalizar `queue_events` como fila.
- [ ] Criar `attendance_status_history`.
- [ ] Criar `blocked_slots`.
- [ ] Criar `patient_returns` ou mapear em `appointments` com tipo/status.
- [ ] RPC `start_attendance_encounter`.
- [ ] RPC `complete_attendance_encounter`.
- [ ] Trigger para criar fila a partir de consulta confirmada.
- [ ] Cron/RPC para detectar atendimento preso.
- [ ] Timezone por tenant/unidade.

Checklist seguranca:

- [ ] Usuario sem `agenda.write` nao muda status.
- [ ] Usuario sem `encounters.write` nao inicia atendimento.
- [ ] Motivos de cancelamento/falta podem conter PII: logs sanitizados.
- [ ] Attendance links precisam allowlist/https.

Aceite:

- [ ] Criar consulta, confirmar, colocar na fila, chamar, iniciar SOAP,
      finalizar e registrar timeline.
- [ ] Falta/cancelamento auditados.
- [ ] Mobile permite operar agenda do dia sem tabela horizontal.

### M08 - Atendimento, prontuario longitudinal e equipe assistencial

Origem Slim Care:

- `/portal/clinical/record`
- `/portal/clinical/encounter`
- `MedicalRecord`, `RecordTabs`, `RecordOverview`, `RecordHistory`,
  `RecordEvolutions`, `RecordMeasures`, `RecordPhotos`,
  `RecordAttachments`, `RecordPrescriptions`, `RecordCarePlan`,
  `RecordDocuments`, `RecordAudit`.
- funcoes `recordInitialize`, `recordAuditLog`,
  `recordCreateNoteFromEncounter`, `encounterAutosave`,
  `startAttendanceEncounter`, `completeAttendanceEncounter`.

Estado SlimHiper:

- Atendimento/SOAP existe.
- Medidas, bioimpedancia e labs existem em services.
- Paciente 360 concentra varias informacoes.
- `patient-360-summary` ainda pode retornar `careTeam: []`.

Decisao de fusao:

- Manter Paciente 360 como cockpit do caso.
- Criar fundacao de prontuario longitudinal dentro do 360, sem explodir rotas
  no primeiro corte.
- Criar equipe assistencial real por paciente.
- Fazer autosave visivel no SOAP.

Checklist UI/mobile:

- [ ] Patient360 com bloco "Prontuario" e tabs densas.
- [ ] SOAP mobile em accordion ou tabs, nao tres colunas.
- [ ] Sidebar vira drawer no mobile.
- [ ] Autosave com indicador discreto: salvo, salvando, erro.
- [ ] Finalizar atendimento com revisao e confirmacao.
- [ ] Auditoria visivel para admin/profissional autorizado.
- [ ] Equipe assistencial editavel por permissao.

Checklist backend:

- [ ] Criar `medical_records` se ainda nao existir como entidade oficial.
- [ ] Criar `clinical_notes`.
- [ ] Criar `record_attachments`.
- [ ] Criar `record_access_audit`.
- [ ] Criar `patient_care_team`.
- [ ] RPC `initialize_medical_record`.
- [ ] RPC `autosave_encounter`.
- [ ] RPC `create_note_from_encounter`.
- [ ] Trigger/audit para abertura e escrita de prontuario.

Checklist seguranca:

- [ ] Prontuario e PHI com RLS fail-closed.
- [ ] Leitura de prontuario auditada quando politica exigir.
- [ ] Service role somente em backend confiavel.
- [ ] Anexos via signed URL curta.
- [ ] Profissional ve apenas pacientes de tenant/unidade/equipe permitidos.

Aceite:

- [ ] Abrir paciente cria ou localiza prontuario unico.
- [ ] SOAP autosalva e finaliza em nota longitudinal.
- [ ] Auditoria registra acesso/escrita sem conteudo clinico bruto em logs.

### M09 - Medidas, fotos, bioimpedancia, labs e evolucao corporal

Origem Slim Care:

- `/evolution`
- `/portal/clinical/measurements`
- `/portal/clinical/photos`
- `/portal/clinical/visits`
- `BodyAssessmentDrawer`, `ClinicalContextDrawer`, `EvolutionChart`,
  `EvolutionMetricCards`, `EvolutionHistory`, `CaseClinicalPhotos`,
  `CaseBioimpedance`, `CaseTrends`.
- entidades `BodyMetric`, `ProgressPhoto`, `ClinicalVisit`.

Estado SlimHiper:

- Medidas, bioimpedancia e labs existem em `clinicalRecordsApi`.
- Paciente 360 mostra graficos e resumo.
- Fotos de progresso ainda nao aparecem como modulo forte.

Decisao de fusao:

- Criar "Evolucao" no Paciente 360 e resumo no portal paciente.
- Fotos de progresso devem ser privadas, categorizadas por angulo/data e
  liberadas ao paciente por regra.

Checklist UI/mobile:

- [ ] Upload mobile com camera.
- [ ] Comparacao antes/depois somente se houver consentimento e permissao.
- [ ] Galeria em grid responsivo.
- [ ] Lightbox acessivel.
- [ ] Inputs de medidas com unidade fixa e validacao.
- [ ] Bioimpedancia com campos agrupados e labels claros.
- [ ] Labs com status e anexos.

Checklist backend:

- [ ] Criar/validar `progress_photos`.
- [ ] Criar bucket privado `progress-photos` ou padronizar bucket existente.
- [ ] Signed URL para foto.
- [ ] Campos: angle, date, weight_at_photo, visibility_to_patient.
- [ ] Audit/timeline para upload e liberacao.
- [ ] Integrar medidas/fotos na view de evolucao.

Checklist seguranca:

- [ ] Fotos corporais sao altamente sensiveis.
- [ ] Nunca usar URL publica.
- [ ] Permissao separada para upload, visualizar e liberar ao paciente.
- [ ] Consentimento e retencao definidos.

Aceite:

- [ ] Profissional registra foto e medida.
- [ ] Paciente ve apenas fotos liberadas.
- [ ] Cross-tenant e cross-patient bloqueados.

### M10 - Prescricoes regulatorias e medicamentos

Origem Slim Care:

- `/portal/prescriptions`
- `PrescriptionEditorModal`, `PrescriptionDetailDrawer`,
  `PatientPrescriptionView`, `MedicacoesTab`.
- entidades `Prescription`, `PrescriptionItem`,
  `PrescriptionRegulatoryMetadata`, `LegalSignature`,
  `MedicationReminder`.
- funcoes `generatePrescriptionPDF`,
  `backfillPrescriptionRegulatoryClassification`,
  `receiveQualifiedSignature`,
  `receiveIcpBrasilSignature`,
  `registerQualifiedSignatureValidationResult`,
  `registerSignatureValidationResult`.

Estado SlimHiper:

- `prescriptionsApi` existe.
- `TabPrescricoes` existe.
- MVP usa `prescriptions_placeholder`.
- D4Sign bloqueia prescricao medica para evitar uso indevido.

Decisao de fusao:

- Elevar prescricoes de placeholder para modulo regulatorio.
- Separar prescricao medica, suplemento, orientacao e plano alimentar.
- Assinatura qualificada/ICP deve ser decisao de produto/legal antes de
  implementacao produtiva.

Checklist UI/mobile:

- [ ] Lista de prescricoes com status, validade e assinatura.
- [ ] Editor em etapas: dados, itens, posologia, orientacoes, revisao.
- [ ] Duplicar prescricao com revisao obrigatoria.
- [ ] Cancelar com motivo.
- [ ] Paciente ve medicamentos e lembretes em formato simples.
- [ ] Mobile do profissional prioriza leitura e acoes, nao edicao complexa.

Checklist backend:

- [ ] Criar `prescriptions` oficial.
- [ ] Criar `prescription_items`.
- [ ] Criar `prescription_versions`.
- [ ] Criar `prescription_regulatory_metadata`.
- [ ] Criar ou integrar `legal_signatures`.
- [ ] Criar `medication_reminders`.
- [ ] Edge/RPC para gerar PDF de prescricao.
- [ ] RPC para emitir, duplicar, cancelar e vincular documento.
- [ ] RLS por `prescriptions.read/write`.
- [ ] Audit/versioning imutavel.

Checklist seguranca/legal:

- [ ] Definir escopo legal de assinatura.
- [ ] Definir se D4Sign e suficiente para alguma categoria.
- [ ] Prescricao medica nao deve usar assinatura inadequada.
- [ ] Logs sem texto de prescricao.
- [ ] PDF privado e signed URL curta.
- [ ] Historico imutavel apos emissao.

Aceite:

- [ ] Profissional autorizado emite prescricao.
- [ ] Nutricionista nao emite prescricao medica se sem permissao.
- [ ] Paciente acessa PDF permitido.
- [ ] Cancelamento e duplicacao ficam auditados.

### M11 - Documentos, templates, D4Sign e biblioteca

Origem Slim Care:

- `/portal/documents`
- `/portal/documents/templates`
- `DocumentCreatorModal`, `DocumentDetailDrawer`,
  `DocumentListView`, `DocumentTemplateListView`,
  `DocumentTemplateModal`, `DocumentCategoryView`.
- entidades `Document`, `DocumentTemplate`, `DocumentVersion`,
  `DocumentAudit`, `DocumentSignature`.
- funcoes `generateDocumentPDF`, `linkDocumentToRecord`, `signDocument`,
  `receiveOfficialElectronicSignature`.

Estado SlimHiper:

- `/clinic/documents` existe.
- `generate-document`, `d4sign-send-document`, `document-signed-url`,
  `patient-documents`, `webhook-d4sign` existem.
- D4Sign sandbox passou.

Decisao de fusao:

- Manter contratos D4Sign atuais.
- Melhorar UX com biblioteca de templates, categorias e wizard.
- Unificar linguagem: "assinatura digital", sem expor provedor na UI comum.

Checklist UI/mobile:

- [ ] Wizard: paciente -> categoria -> template -> variaveis -> revisao ->
      gerar -> liberar/assinar.
- [ ] Biblioteca de templates com filtros, status e duplicar.
- [ ] Drawer de documento full-screen no mobile.
- [ ] Status visual com icone + texto + cor.
- [ ] Falhas de provider como erro operacional, sem payload bruto.
- [ ] Acao "liberar ao paciente" auditavel.

Checklist backend:

- [ ] Confirmar `document_templates` cobre categorias e variaveis.
- [ ] Adicionar versionamento de templates se necessario.
- [ ] Adicionar audit para gerar/liberar/ocultar/assinar.
- [ ] Trocar update sensivel direto por RPC/Edge auditada quando aplicavel.
- [ ] Minimizar provider IDs no frontend.
- [ ] Criar pacote de evidencia se exigido pelo produto.

Checklist seguranca:

- [ ] Signed URL curta.
- [ ] Storage path nunca enviado ao paciente.
- [ ] D4Sign webhook fail-closed.
- [ ] Provider payload minimizado.
- [ ] Documento so liberado para patient/guardian autorizado.

Aceite:

- [ ] Criar documento por template.
- [ ] Enviar assinatura D4Sign.
- [ ] Receber webhook/idempotencia.
- [ ] Paciente acessa somente documento liberado.

### M12 - Comercial: servicos, pacotes, programas, beneficios e upgrades

Origem Slim Care:

- `/portal/commercial`
- `/portal/commercial/services`
- `/portal/commercial/packages`
- `/portal/commercial/programs`
- `ServiceListView`, `ServiceModal`, `PackageListView`, `PackageModal`,
  `ProgramListView`, `ProgramModal`, `UpgradeRequestsList`,
  `NewUpgradeModal`.
- entidades `Service`, `Package`, `PackageService`, `Program`,
  `ProgramPackage`, `UpgradeRequest`, `PatientProgramEnrollment`.
- funcoes `processUpgradeQuote`, `resolvePatientCommercialContext`,
  `getPatientCommercialData`, `syncPackageEnrollment`.

Estado SlimHiper:

- `/clinic/programs` e builder existem.
- Matricula existe.
- CRM existe.
- Catalogo separado de servicos/pacotes e upgrades completos parecem menos
  explicitos.

Decisao de fusao:

- Nao destruir o builder atual.
- Adicionar catalogo operacional separado para servicos e pacotes.
- Builder continua para montar programas complexos.
- Upgrade entra como fluxo financeiro/comercial auditado.

Checklist UI/mobile:

- [ ] `Servicos`: lista, criar, editar, ativar/desativar, duplicar.
- [ ] `Pacotes`: composicao de servicos, beneficios, limites, comunidade,
      chat prioritario, renovacao.
- [ ] `Programas`: fases, documentos, check-ins, equipe, financeiro.
- [ ] `Upgrades`: solicitar, cotar, aprovar, rejeitar, gerar cobranca.
- [ ] Mobile com tabs simples e formularios em etapas.
- [ ] Comparacao de planos legivel no paciente.

Checklist backend:

- [ ] Confirmar ou criar tabelas `services`, `packages`, `package_services`,
      `programs`, `program_packages`.
- [ ] Criar `upgrade_requests`.
- [ ] RPC de contexto comercial do paciente.
- [ ] RPC de cotacao/aprovacao/rejeicao.
- [ ] Trigger para sincronizar enrollment apos pagamento/aprovacao.
- [ ] Integrar Asaas para cobranca de upgrade quando aplicavel.

Checklist seguranca:

- [ ] Precos e condicoes por tenant.
- [ ] Paciente nao altera valor/cotacao.
- [ ] Aprovacao exige permissao comercial/financeira.
- [ ] Historico de proposta auditado.

Aceite:

- [ ] Clinica cria servico, pacote e programa.
- [ ] Paciente matriculado recebe beneficios corretos.
- [ ] Upgrade gera pendencia/cobranca sem expor provider IDs.

### M13 - Financeiro: comprovantes, recorrencia, refund e reconciliacao

Origem Slim Care:

- `/financial`
- `/portal/financial`
- `FinancialSummary`, `PendingItemsList`, `ReceiptUploader`,
  `SmartActionQueue`, `UpgradeRequestsList`, `FinancialHealthCards`,
  `FinancialQueue`, `PendingReceipts`, `RecurrenceManagement`,
  `FinancialRiskIndicator`.
- entidades `FinancialItem`, `UpgradeRequest`.
- funcoes `createAsaasCharge`, `refundAsaasCharge`,
  `syncAsaasChargeStatus`, `syncAsaasReference`,
  `notifyReceiptStatusChange`, `checkPaymentGatewayConfig`.

Estado SlimHiper:

- Asaas customer/invoice/subscription/subaccount existem.
- Webhook Asaas existe.
- Financeiro clinico e Paciente 360 financeiro existem.
- Faltam comprovantes, refund e sync ativo completos.

Decisao de fusao:

- Manter Asaas Edge Functions atuais.
- Adicionar comprovante, recorrencia, refund e upgrades em camadas auditadas.
- Nao habilitar botao financeiro sem contrato real.

Checklist UI/mobile:

- [ ] Portal paciente: pendencias, pagar, enviar comprovante, status.
- [ ] Clinica: fila de comprovantes pendentes.
- [ ] Clinica: inadimplencia, recorrencia, divergencia, webhook pendente.
- [ ] Acao de refund com confirmacao e motivo.
- [ ] Valores destacados e datas legiveis.
- [ ] Permissao financeira bloqueia valores para perfis sem acesso.

Checklist backend:

- [ ] Tabela `payment_receipts` ou reaproveitar storage+metadata existente.
- [ ] Bucket privado para comprovantes.
- [ ] RPC para aprovar/rejeitar comprovante.
- [ ] Edge `asaas-refund-payment`.
- [ ] Edge/RPC para sync status sob demanda.
- [ ] Cron para conciliacao de cobranças pendentes.
- [ ] Eventos financeiros auditados.
- [ ] Notificacao apos status de comprovante.

Checklist seguranca:

- [ ] Comprovante pode conter dados bancarios: privado.
- [ ] Financeiro exige `financial.read/write`.
- [ ] Refund exige permissao elevada e motivo.
- [ ] Payload Asaas minimizado.
- [ ] Webhook com token/HMAC/idempotencia.

Aceite:

- [ ] Paciente envia comprovante no celular.
- [ ] Financeiro aprova/rejeita com motivo.
- [ ] Refund sandbox/homologacao validado quando autorizado.
- [ ] Reconciliacao nao duplica eventos.

### M14 - Settings, equipe, permissoes e compliance operacional

Origem Slim Care:

- `/portal/settings`
- `/portal/staff`
- `/portal/users`
- `/portal/users/permissions`
- `SettingsBranding`, `SettingsChatHours`, `SettingsAutoMessage`,
  `SettingsIntegration`, `SettingsLegal`, `SettingsComplianceGaps`,
  `ClinicianForm`, `UserModal`, `PermissionModal`, `RoleModal`.
- entidades `Clinician`, `User`, `UserRole`, `Permission`,
  `PlatformSettings`, `ComplianceGap`.

Estado SlimHiper:

- Admin plataforma forte.
- Settings clinica ja possui varias secoes.
- Faltam alguns controles especificos: horario chat, auto reply, compliance
  readiness/gaps operacional, profissionais como modulo separado se desejado.

Decisao de fusao:

- Integrar no `ClinicSettingsContent` quando for configuracao da clinica.
- Integrar no Admin quando for plataforma/tenant.
- Evitar tela de migration tasks para usuario comum.

Checklist UI/mobile:

- [ ] Settings com tabs horizontais no mobile.
- [ ] Salvar por secao.
- [ ] Feedback de status por secao.
- [ ] Campos avancados colapsados.
- [ ] Roles predefinidos antes de matriz granular.
- [ ] Compliance como lista de lacunas acionaveis.

Checklist backend:

- [ ] Confirmar RPCs de settings cobrem novos campos.
- [ ] Criar `chat_service_hours`.
- [ ] Criar `auto_message_templates`.
- [ ] Criar `compliance_gaps` se modulo entrar.
- [ ] Audit log para alteracao de integracoes e permissoes.

Checklist seguranca:

- [ ] Somente admin/owner altera integracoes.
- [ ] Alterar horario/chat nao deve quebrar inbox.
- [ ] Permissoes granulares com preview de impacto.
- [ ] Mudancas sensiveis auditadas.

Aceite:

- [ ] Clinica configura horario de chat e resposta automatica.
- [ ] Admin ve lacunas de compliance.
- [ ] Permissoes permanecem consistentes com RBAC/RLS.

### M15 - Relatorios e exports persistentes

Origem Slim Care:

- Relatorios e documentos exportaveis como artefatos do portal.
- Whitepaper recomenda Storage, signed URLs e auditabilidade.

Estado SlimHiper:

- `clinic-reports` e `clinic-report-export` existem.
- Export atual pode ser blob/download, sem historico persistente forte.

Decisao de fusao:

- Criar historico de execucoes/exportacoes quando o produto exigir auditoria.

Checklist UI/mobile:

- [ ] Lista de relatorios recentes.
- [ ] Status: pendente, executando, pronto, falhou, expirado.
- [ ] Download por signed URL.
- [ ] Filtros por periodo e tipo.
- [ ] Mobile com cards, nao tabela.

Checklist backend:

- [ ] Tabela `report_runs` revisada.
- [ ] Tabela `report_artifacts`.
- [ ] Bucket privado `report-exports`.
- [ ] Retencao e expiracao.
- [ ] Permissao por tipo de relatorio.

Checklist seguranca:

- [ ] Relatorios com PII/financeiro exigem permissao especifica.
- [ ] Signed URL curta.
- [ ] Logs sem conteudo de relatorio.

Aceite:

- [ ] Relatorio executa, gera artefato e expira.
- [ ] Usuario sem permissao nao baixa export.

### M16 - Jobs, automacoes, cron e observabilidade

Origem Slim Care:

- `agendaAutomations`
- `detectStuckAttendance`
- `generateMedicationReminders`
- `calculateOperationalIntelligence`
- `backfillComplianceReadiness`
- `auditLegacyComplianceData`
- `seedPermissions`
- `seedPlatformSettings`
- `healthCheck`.

Estado SlimHiper:

- Existem helpers e Edge Functions, mas `pg_cron`/cron versionado nao apareceu
  como contrato fechado.
- Admin observability existe.

Decisao de fusao:

- Criar plano explicito de jobs operacionais.
- Separar cron recorrente de script one-shot.
- Todo job service-role precisa dry-run, limite, auditoria e log sanitizado.

Checklist jobs:

- [ ] Job de lembrete de check-in.
- [ ] Job de lembrete de medicacao se modulo entrar.
- [ ] Job de atendimento preso.
- [ ] Job de expiracao de comunicacoes.
- [ ] Job de CRM expirado/retencao.
- [ ] Job de estoque/notificacoes.
- [ ] Job de conciliacao Asaas.
- [ ] Job de reprocesso de webhook com limite.
- [ ] Job de compliance readiness.
- [ ] Healthcheck provider admin-only.

Checklist seguranca:

- [ ] Jobs rodam com service role somente no backend.
- [ ] Cada job tem limite por execucao.
- [ ] Cada job registra contagem e resumo, nao payload bruto.
- [ ] Reprocesso exige idempotencia.
- [ ] Backfills one-shot nao ficam expostos para UI comum.

Aceite:

- [ ] Cron documentado e versionado.
- [ ] Observability mostra ultima execucao, status e falha.
- [ ] Falha de job nao derruba app.

## 7. Matriz pagina a pagina

| Slim Care                       | Funcao                         | SlimHiper alvo                                    | Status inicial | Maturidade alvo |
| ------------------------------- | ------------------------------ | ------------------------------------------------- | -------------- | --------------- |
| `/home`                         | Cockpit diario do paciente     | `/patient`, tab `Hoje`                            | [ ]            | N5              |
| `/onboarding`                   | Onboarding assistencial        | `/patient`, fluxo inicial                         | [ ]            | N4              |
| `/water`                        | Registro de agua               | `/patient`, acao rapida                           | [ ]            | N5              |
| `/meals`                        | Registro de refeicoes/fotos    | `/patient`, acao rapida + 360 nutricao            | [ ]            | N5              |
| `/workouts`                     | Registro de treino             | `/patient`, acao rapida + 360                     | [ ]            | N4              |
| `/checkin`                      | Check-in diario                | `/patient`, check-in                              | [~]            | N5              |
| `/evolution`                    | Evolucao corporal              | `/patient` + `/clinic/patients/[id]`              | [ ]            | N4              |
| `/chat`                         | Chat paciente                  | `/patient`, chat                                  | [x]            | N5              |
| `/community`                    | Comunidade paciente            | `/patient`, comunidade                            | [ ]            | N4              |
| `/profile`                      | Perfil e conta                 | `/patient`, minha jornada                         | [ ]            | N4              |
| `/documents`                    | Documentos paciente            | `/patient`, documentos                            | [~]            | N5              |
| `/financial`                    | Financeiro paciente            | `/patient`, financeiro                            | [~]            | N5              |
| `/care-plan`                    | Plano, orientacoes, medicacoes | `/patient`, plano                                 | [ ]            | N4              |
| `/portal/dashboard`             | Cockpit operacional            | `/clinic/dashboard`                               | [~]            | N5              |
| `/portal/schedule`              | Agenda                         | `/clinic/agenda`                                  | [~]            | N5              |
| `/portal/attendance`            | Fila de atendimento            | `/clinic/agenda?tab=fila` ou `/clinic/attendance` | [ ]            | N5              |
| `/portal/patients`              | Carteira/lista                 | `/clinic/patients`                                | [~]            | N5              |
| `/portal/patients/case`         | Caso 360                       | `/clinic/patients/[patientId]`                    | [~]            | N5              |
| `/portal/clinical/record`       | Prontuario                     | `/clinic/patients/[patientId]?tab=prontuario`     | [ ]            | N5              |
| `/portal/clinical/encounter`    | Atendimento ao vivo            | `/clinic/patients/[patientId]/encounter`          | [~]            | N5              |
| `/portal/clinical/measurements` | Medidas                        | 360/encounter clinical records                    | [~]            | N5              |
| `/portal/clinical/photos`       | Fotos progresso                | 360 evolucao/fotos                                | [ ]            | N4              |
| `/portal/clinical/visits`       | Visitas clinicas               | 360 timeline/prontuario                           | [ ]            | N4              |
| `/portal/prescriptions`         | Prescricoes                    | 360 prescricoes + modulo dedicado futuro          | [~]            | N5              |
| `/portal/documents`             | Documentos                     | `/clinic/documents`                               | [~]            | N5              |
| `/portal/documents/templates`   | Templates                      | `/clinic/documents?tab=templates`                 | [ ]            | N5              |
| `/portal/messages`              | Mensagens                      | `/clinic/inbox`                                   | [x]            | N5              |
| `/portal/community`             | Moderacao comunidade           | `/clinic/community` futuro                        | [ ]            | N4              |
| `/portal/commercial`            | Cockpit comercial              | `/clinic/programs` + comercial futuro             | [~]            | N5              |
| `/portal/commercial/services`   | Servicos                       | `/clinic/programs?tab=services` futuro            | [ ]            | N5              |
| `/portal/commercial/packages`   | Pacotes                        | `/clinic/programs?tab=packages` futuro            | [ ]            | N5              |
| `/portal/commercial/programs`   | Programas                      | `/clinic/programs`                                | [~]            | N5              |
| `/portal/financial`             | Financeiro                     | `/clinic/financeiro`                              | [~]            | N5              |
| `/portal/staff`                 | Profissionais                  | `/clinic/settings?tab=team` ou admin tenant       | [~]            | N5              |
| `/portal/users`                 | Usuarios                       | admin tenant/settings                             | [~]            | N5              |
| `/portal/users/permissions`     | Permissoes                     | admin/settings RBAC                               | [~]            | N5              |
| `/portal/settings`              | Configuracoes                  | `/clinic/settings`                                | [~]            | N5              |

## 8. Matriz functions Slim Care -> destino SlimHiper

| Function Slim Care                             | Destino recomendado    | SlimHiper/gap                                     |
| ---------------------------------------------- | ---------------------- | ------------------------------------------------- |
| `agendaAutomations`                            | Cron + RPC/Edge        | Criar jobs de agenda/lembrete                     |
| `agendaOnCreate`                               | Trigger                | Automatizar efeitos de consulta                   |
| `attendanceCreateFromSchedule`                 | Trigger/RPC            | Formalizar fila                                   |
| `detectStuckAttendance`                        | Cron + RPC             | Criar alerta de fila presa                        |
| `startAttendanceEncounter`                     | RPC                    | Ligar fila ao SOAP                                |
| `completeAttendanceEncounter`                  | RPC                    | Fechamento atomico                                |
| `encounterAutosave`                            | RPC                    | Autosave visivel                                  |
| `recordCreateNoteFromEncounter`                | RPC/Trigger            | Nota longitudinal                                 |
| `recordInitialize`                             | Trigger/RPC            | Prontuario unico                                  |
| `recordAuditLog`                               | Trigger/RPC            | Auditoria de prontuario                           |
| `confirmPatientReturn`                         | RPC                    | Retornos                                          |
| `syncConfirmedAppointmentToQueue`              | Trigger                | Consulta confirmada vira fila                     |
| `ReturnHook`                                   | Trigger                | Absorver em retornos                              |
| `processUpgradeQuote`                          | RPC + Edge opcional    | Upgrades                                          |
| `resolvePatientCommercialContext`              | View/RPC               | Contexto comercial                                |
| `getPatientCommercialData`                     | View/RPC               | Dados comerciais para UI                          |
| `syncPackageEnrollment`                        | Trigger                | Matricula/pacote                                  |
| `createAsaasCharge`                            | Edge                   | Ja ha invoice/subscription; avaliar charge avulsa |
| `refundAsaasCharge`                            | Edge                   | Falta refund                                      |
| `syncAsaasReference`                           | Edge/Cron              | Falta sync ativo                                  |
| `syncAsaasChargeStatus`                        | Edge/Cron              | Completar conciliacao                             |
| `asaasWebhook`                                 | Edge                   | Existe `webhook-asaas`                            |
| `asaasStatusMapper`                            | Helper/RPC             | Consolidar mapper                                 |
| `mapAsaasStatus`                               | Helper/RPC             | Consolidar mapper                                 |
| `notifyReceiptStatusChange`                    | Trigger/notification   | Falta comprovante                                 |
| `checkPaymentGatewayConfig`                    | Edge admin-only        | Health provider                                   |
| `generateDocumentPDF`                          | Edge                   | Existe `generate-document`                        |
| `generatePrescriptionPDF`                      | Edge                   | Falta prescricao regulatoria completa             |
| `linkDocumentToRecord`                         | RPC                    | Falta prontuario/document link forte              |
| `signDocument`                                 | Edge                   | Existe D4Sign para documentos nao-prescricao      |
| `receiveOfficialElectronicSignature`           | Edge                   | D4Sign/webhook parcial                            |
| `receiveQualifiedSignature`                    | Edge                   | Futuro legal                                      |
| `receiveIcpBrasilSignature`                    | Edge                   | Futuro legal                                      |
| `registerQualifiedSignatureValidationResult`   | RPC                    | Futuro legal                                      |
| `registerSignatureValidationResult`            | RPC                    | Futuro legal                                      |
| `evaluateComplianceReadiness`                  | RPC/View               | Falta compliance runtime                          |
| `backfillComplianceReadiness`                  | One-shot               | Futuro script                                     |
| `auditLegacyComplianceData`                    | One-shot/read-only     | Futuro script                                     |
| `backfillPrescriptionRegulatoryClassification` | One-shot               | Futuro script                                     |
| `migrateLegacySignatureAndRegulatoryStatus`    | One-shot               | Futuro script                                     |
| `seedDocumentTemplates`                        | One-shot               | Ja ha bootstrap; revisar                          |
| `calculateOperationalIntelligence`             | View materializada/RPC | Expandir dashboard                                |
| `generateMedicationReminders`                  | Cron/RPC               | Futuro medicacao                                  |
| `createClinicianProfile`                       | RPC/Trigger            | Admin/settings                                    |
| `checkPermission`                              | RPC/helper             | Ja ha RBAC; consolidar                            |
| `healthCheck`                                  | Route/Edge             | `/api/health` existe; provider health futuro      |
| `seedPermissions`                              | One-shot               | Ja ha bootstrap core; revisar                     |
| `seedPlatformSettings`                         | One-shot               | Revisar settings seed                             |
| `migrateLegacyClinicianReferences`             | One-shot               | So se houver migracao real                        |

## 9. Sequencia de execucao em uma leva

Uma "leva" nao deve significar um unico commit gigantesco sem gates. Deve ser
uma unica branch/epic com cortes internos seguros.

### Corte A - Fundacao de contratos e tokens

- [ ] Atualizar este plano com owner e decisao de escopo final.
- [ ] Criar migrations novas para tabelas necessarias.
- [ ] Criar RPCs/views base.
- [ ] Criar policies RLS.
- [ ] Atualizar `.env.example` apenas com nomes seguros, se necessario.
- [ ] Atualizar runbooks afetados.
- [ ] Rodar `git diff --check`.

### Corte B - Portal paciente mobile

- [ ] Refatorar `PatientPortalContent` em secoes.
- [ ] Adicionar cockpit diario.
- [ ] Adicionar habitos.
- [ ] Adicionar perfil/plano.
- [ ] Browser smoke mobile.
- [ ] Type-check/lint/build.

### Corte C - Clinica operacional

- [ ] Expandir dashboard.
- [ ] Expandir pacientes/carteira.
- [ ] Expandir agenda/fila/retornos.
- [ ] Integrar fila ao SOAP.
- [ ] Browser smoke desktop/tablet/mobile.

### Corte D - Prontuario, evolucao e prescricoes

- [ ] Criar prontuario longitudinal.
- [ ] Adicionar fotos/evolucao.
- [ ] Elevar prescricoes.
- [ ] Adicionar auditoria.
- [ ] Validar permissoes sensiveis.

### Corte E - Documentos, financeiro e comercial

- [ ] Wizard de documentos/templates.
- [ ] Comprovantes/upgrades/refund/sync Asaas.
- [ ] Catalogo servicos/pacotes.
- [ ] Matricula e beneficios.

### Corte F - Comunidade e jobs

- [ ] Comunidade moderada por programa.
- [ ] Jobs/cron/observability.
- [ ] Compliance readiness se aprovado.

## 10. Gates de qualidade

Checks obrigatorios em cada corte com codigo:

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `git diff --check`

Browser smoke minimo:

- [ ] `/auth/login`
- [ ] `/patient`
- [ ] `/clinic/dashboard`
- [ ] `/clinic/patients`
- [ ] `/clinic/agenda`
- [ ] `/clinic/patients/[patientId]`
- [ ] `/clinic/patients/[patientId]/encounter`
- [ ] `/clinic/documents`
- [ ] `/clinic/financeiro`
- [ ] `/clinic/inbox`
- [ ] `/clinic/programs`
- [ ] `/clinic/settings`
- [ ] `/admin`
- [ ] `/admin/tenants`
- [ ] `/admin/webhooks`

Responsivo:

- [ ] Desktop 1280px.
- [ ] Tablet 768px.
- [ ] Mobile 390px.
- [ ] Mobile estreito 360px para portal paciente.

Acessibilidade minima:

- [ ] Navegacao por teclado em menus.
- [ ] Tabs com `aria-selected` e bloqueio real quando disabled.
- [ ] Dialogs/drawers com foco preso e Escape.
- [ ] Tabelas com `scope`, header acionavel e fallback mobile.
- [ ] Botao principal visivel e nome acessivel.

Seguranca:

- [ ] Nenhum segredo em client bundle.
- [ ] Nenhum service role importado em client code.
- [ ] Nenhum provider ID sensivel em UI sem necessidade.
- [ ] Nenhuma signed URL em logs/toasts/localStorage.
- [ ] RLS cross-tenant testado.
- [ ] Patient/guardian limitado a vinculo ativo.
- [ ] Webhooks fail-closed e idempotentes.

## 11. Template de evidencia por item

```text
Item:
Modulo:
Status:
Maturidade:
Data:
Branch:
Commit:
Ambiente:
NEXT_PUBLIC_USE_MOCK_DATA:
Rota Slim Care origem:
Rota SlimHiper alvo:
Servicos/contratos validados:
Tabelas/RPC/Edge/Storage:
Perfis testados:
Comandos executados:
Resultado observado:
Comandos pulados:
Justificativa dos skips:
Evidencia visual:
Riscos residuais:
Proximo passo:
```

## 12. Definicao de pronto da fusao

A fusao Slim Care -> SlimHiper so deve ser considerada pronta quando:

- [ ] Todos os modulos escolhidos sairam de N0/N1/N2 para N4 ou N5.
- [ ] Mocks nao mascaram falhas em staging/producao.
- [ ] Paciente mobile consegue executar habitos diarios sem friccao.
- [ ] Clinica opera agenda -> fila -> atendimento -> prontuario -> financeiro.
- [ ] Paciente 360 mostra sinais diarios, risco, documentos, financeiro, chat,
      prescricoes e plano com permissoes corretas.
- [ ] Admin e settings controlam permissoes, equipe, webhooks, integracoes e
      observabilidade.
- [ ] Asaas e D4Sign permanecem testados em sandbox/homologacao quando o corte
      tocar provider.
- [ ] Nenhum dado sensivel, segredo ou payload bruto foi exposto.
- [ ] Runbooks e checklists foram atualizados.
- [ ] `type-check`, `lint`, `build` e `git diff --check` passaram.
- [ ] Browser smoke autenticado passou nas rotas principais e em mobile.

## 13. Bloqueadores de seguranca antes da fusao completa

Estes itens nao sao opcionais. Eles devem entrar como P0 antes de ativar em
producao qualquer modulo novo vindo do Slim Care que aumente exposicao de dados
de paciente, chat, comunidade, documentos, financeiro ou prontuario.

### 13.1 Chat deve redigir antes de sair do banco

Achado:

- O browser pode selecionar `body` de mensagens e so depois trocar por texto
  moderado no service.
- Isso significa que conteudo removido/moderado ainda pode trafegar na resposta
  Supabase.

Checklist:

- [ ] Criar RPC/view de chat que retorna somente texto ja redigido.
- [ ] Remover leitura direta de `body` sensivel do browser.
- [ ] Garantir que mensagens moderadas nao trafegam para client.
- [ ] Manter audit log sem conteudo bruto.
- [ ] Testar thread normal, mensagem moderada, usuario sem permissao e
      cross-patient.

Aceite:

- [ ] Conteudo moderado nao aparece no network payload do browser.
- [ ] UI continua mostrando placeholder/estado redigido.

### 13.2 Portal paciente deve evitar `patient_pii` amplo

Achado:

- `patient_pii` inclui campos amplos como nascimento, endereco e contato de
  emergencia.
- Mesmo com policy por vinculo, o portal deve receber apenas colunas minimas.

Checklist:

- [ ] Criar RPC/view minimalista para perfil do portal paciente.
- [ ] Revogar ou evitar grants diretos amplos quando RPC/view bastar.
- [ ] Separar dados editaveis pelo paciente de dados clinicos/administrativos.
- [ ] Validar patient e guardian com vinculos ativos/inativos.
- [ ] Confirmar que payload do portal nao contem PII fora do necessario.

Aceite:

- [ ] `/patient` usa contrato minimo, nao `select *`/PII amplo.
- [ ] Guardian ve somente dados permitidos.

### 13.3 Prescricoes medicas precisam contrato regulatorio real

Achado:

- O contrato atual de prescricoes e adequado para MVP/local/homologacao, mas nao
  para producao regulada.
- D4Sign simples ja e bloqueado para prescricoes medicas, o que e uma protecao
  correta.

Checklist:

- [ ] Definir regra legal por tipo de prescricao.
- [ ] Exigir prescritor habilitado, CRM/UF quando aplicavel e permissao correta.
- [ ] Criar versionamento imutavel apos emissao.
- [ ] Gerar hash do documento/PDF.
- [ ] Definir assinatura qualificada/ICP/Gov.br quando aplicavel.
- [ ] Registrar validacao de assinatura em `legal_signatures`.
- [ ] Impedir edicao silenciosa de prescricao emitida.

Aceite:

- [ ] Prescricao medica nao usa fluxo documental inadequado.
- [ ] Historico e assinatura resistem a auditoria.

### 13.4 Rocket e scripts externos em telas autenticadas

Achado:

- Scripts Rocket carregam globalmente e CSP permite Rocket/inline.
- Para telas clinicas e financeiras, isso precisa de governanca antes de
  go-live.

Checklist:

- [ ] Revisar escopo Rocket por ambiente.
- [ ] Definir consentimento, CSP e allowlist por rota.
- [ ] Confirmar que nenhum dado clinico/financeiro/paciente e capturado.
- [ ] Documentar decisao antes de producao.
- [ ] Nao remover Rocket sem tarefa especifica, mas bloquear go-live se
      governanca nao estiver clara.

Aceite:

- [ ] Documento de governanca Rocket/CSP atualizado.
- [ ] Evidencia de que telas sensiveis nao vazam dados para terceiros.

### 13.5 Logs devem usar sanitizacao central

Achado:

- Algumas Edge Functions usam `safeErrorMessage(error)` retornando
  `error.message` sem redaction central.

Checklist:

- [ ] Criar helper central para erro seguro em Edge Functions.
- [ ] Proibir log de payload provider bruto.
- [ ] Proibir log de SOAP, prescricao, mensagem, PII, signed URL e token.
- [ ] Revisar Asaas, D4Sign, documentos, patient-360 e reports.
- [ ] Testar erro de provider e erro Supabase com mensagem sensivel simulada.

Aceite:

- [ ] Logs mostram codigo/status/correlation id, nao dados sensiveis.

### 13.6 Asaas deve usar referencia financeira pseudonima

Achado:

- Algumas chamadas usam `externalReference: patientId`.
- UUID clinico nao deve ser identificador externo quando uma referencia
  financeira pseudonima for possivel.

Checklist:

- [ ] Criar `billing_external_reference` pseudonimo por paciente/tenant.
- [ ] Usar referencia financeira em customer/invoice/subscription.
- [ ] Manter mapa interno protegido.
- [ ] Atualizar webhooks para resolver referencia sem expor UUID clinico.
- [ ] Garantir idempotencia apos mudanca.

Aceite:

- [ ] Provider nao recebe UUID clinico como referencia principal.
- [ ] Webhook continua reconciliando corretamente.

### 13.7 Webhooks e storage

Estado:

- Webhooks Asaas/D4Sign usam `verify_jwt=false`, o que e esperado para provider.
- Devem falhar se secrets por ambiente estiverem ausentes.
- Storage documental esta em caminho melhor: signed URL curta e validacao de
  bucket/path.

Checklist:

- [ ] Confirmar fail-closed com secret ausente/invalido.
- [ ] Confirmar idempotencia.
- [ ] Confirmar payload minimizado.
- [ ] Confirmar signed URL de documento com expiracao curta.
- [ ] Confirmar que storage path privado nao vai para UI publica.

Aceite:

- [ ] Webhook valido processa.
- [ ] Webhook invalido falha.
- [ ] Replay nao duplica evento.
