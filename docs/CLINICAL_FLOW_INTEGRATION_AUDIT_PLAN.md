# Clinical Flow Integration Audit Plan

Data do plano: 2026-06-14.

Este documento consolida o plano auditavel para fechar os fluxos de planos,
SOAP, Paciente 360, agenda, financeiro, prescricoes, exames, tarefas, salas,
perfis e portal do paciente.

O objetivo e transformar os pontos levantados em uma sequencia de implementacao
com contratos claros, evidencia de auditoria e checklist de aceite. Este plano
nao autoriza executar migrations, bootstraps, chamadas Asaas/D4Sign ou smokes
mutantes. Esses passos continuam exigindo autorizacao explicita e nominal.

## Escopo

- Integrar planos/programas/pacotes/servicos com agenda, encounter, financeiro e
  Paciente 360.
- Expor solicitacao de exames, prescricao, atualizacao de plano e atribuicao de
  tarefas como acoes operacionais consistentes dentro e fora do encounter.
- Dar fluxo proprio para triagem, medidas e bioimpedancia fora da tela de SOAP.
- Substituir sala/local textual por cadastro de salas e alocacao por
  profissional/dia.
- Corrigir a origem de profissionais no builder de planos.
- Permitir agenda com profissional, pagamento e programa/pacote/servico, com
  persistencia e reflexo nos modulos downstream.
- Expandir dados pessoais de pacientes e usuarios, incluindo endereco e foto de
  perfil com regras de privacidade.
- Documentar o estado do portal do paciente e o fluxo que falta para ativacao
  operacional.

## Baseline Auditado

### Planos, programas e pacotes

- O builder existe em `src/app/clinic/programs/builder`.
- O facade `src/services/programsApi.ts` usa `get_clinic_programs`,
  `get_program_builder_options`, `upsert_program_from_builder`,
  `enroll_patient_in_program` e outros RPCs.
- O runbook `docs/supabase/PROGRAMS_PACKAGES_RUNBOOK.md` informa que a
  matricula em programa gera reflexos locais de agenda, financeiro e tarefas de
  documentos.
- O catalogo comercial ja tem servicos, pacotes, links com programas e upgrade
  em `src/services/commercialApi.ts` e migration
  `supabase/migrations/20260607090000_330_commercial_catalog_m12.sql`.
- Lacuna: o agendamento ainda nao seleciona programa, pacote ou servico
  comercial.
- Lacuna: o builder lista profissionais a partir de `tenant_memberships.role_code`
  em `get_program_builder_options()`, enquanto o modelo mais novo separa perfil
  profissional em `tenant_professionals`.

### SOAP, encounter e Paciente 360

- O encounter existe em `src/app/clinic/patients/[patientId]/encounter/page.tsx`
  com rascunho/finalizacao SOAP.
- Bioimpedancia e solicitacao de exames existem no encounter por
  `record_patient_bioimpedance` e `create_patient_lab_order`.
- Paciente 360 consolida resumo e timeline via `src/services/patient360Api.ts`,
  tabs em `src/app/paciente-360/components/tabs`, e contratos de Edge/RPC
  documentados em `docs/supabase/PATIENT360_RUNBOOK.md`.
- Prescricoes ja possuem modulo rico em
  `src/app/paciente-360/components/tabs/TabPrescricoes.tsx` e facade
  `src/services/prescriptionsApi.ts`.
- Lacuna: no encounter, os botoes de criar prescricao, atualizar plano e atribuir
  tarefa estao desabilitados.
- Lacuna: tarefas aparecem como leitura no Paciente 360/encounter, mas nao ha
  fluxo clinico unificado de criacao/atribuicao/conclusao.

### Agenda, triagem, bioimpedancia e salas

- A agenda existe em `src/app/clinic/agenda/components/AgendaContent.tsx`.
- O schema de `appointments` ja tem `practitioner_id`, `location`, status de
  triagem, medidas e bioimpedancia.
- A fila `attendance_queue` ja possui `assigned_to` e `room`.
- O snapshot `get_agenda_day_snapshot()` retorna profissional e sala quando
  existem.
- Lacuna: `AppointmentMutationInput` recebe apenas paciente, tipo, horario,
  duracao, local textual e observacoes.
- Lacuna: `create_agenda_appointment()` e `update_agenda_appointment()` nao
  recebem `practitioner_id`, sala estruturada, servico, pacote, programa,
  cobranca ou pagamento.
- Lacuna: nao existe cadastro operacional de salas nem agenda diaria de
  profissionais para associar sala/profissional ao dia.
- Lacuna: triagem, medidas e bioimpedancia existem como status, mas a interface
  operacional fora do encounter ainda nao cobre coleta, roteamento e conclusao.

### Pacientes, usuarios e portal

- O cadastro de paciente em `src/app/patient-list/components/PatientListContent.tsx`
  cobre nome, apelido, email, telefone, CPF mascarado, nascimento, sexo/genero,
  status, tags, queixa, objetivo, origem, contato de emergencia e notas internas.
- `patient_pii` ja possui `address jsonb`, mas o facade/formulario nao
  persiste endereco.
- `profiles` guarda apenas email, nome, papel de plataforma, tenant ativo e
  status.
- `tenant_professionals` guarda tipo profissional, registro, UF, especialidade e
  ativo, mas nao endereco/foto.
- O portal do paciente existe em `/patient`, usa
  `get_patient_portal_snapshot`, `get_patient_journey_snapshot`,
  `patient_accounts`, `guardian_links` e `patient_portal.access`.
- Lacuna: falta fluxo operacional claro para ativar acesso do paciente ou
  responsavel a partir do cadastro, convite ou relacionamento paciente/guardian.
- Lacuna: foto de perfil de paciente/usuario exige storage privado, signed URL e
  politica de visibilidade.

## Decisoes De Modelo Propostas

1. Usar `tenant_professionals` como fonte canonica de profissionais clinicos.
   `tenant_memberships` continua definindo RBAC/permissoes, nao identidade
   profissional.
2. Criar um conceito estruturado de sala/recurso de agenda, separado de
   `location text`, com unidade, status, capacidade, tipo e metadados.
3. Criar disponibilidade/alocacao diaria de profissional, opcionalmente
   associada a sala, unidade e janela de atendimento.
4. Estender agendamento para carregar:
   - profissional responsavel;
   - sala/recurso;
   - servico comercial;
   - pacote;
   - programa;
   - contexto financeiro local;
   - origem do agendamento;
   - necessidade de triagem, medidas ou bioimpedancia.
5. Manter chamadas Asaas/D4Sign fora do fluxo automatico de agenda ate haver
   autorizacao explicita. O agendamento pode criar invoice/contrato local, mas
   provider externo deve continuar gated.
6. Usar Paciente 360 como read-model longitudinal. Toda acao clinica/financeira
   relevante deve escrever timeline/evento auditavel.
7. Usar encounter como uma das portas de entrada clinica, mas nao a unica. Exame,
   prescricao, tarefa, triagem, medidas e bioimpedancia devem poder nascer de
   fila/agenda/Paciente 360 quando fizer sentido.

## Plano De Implementacao

### P0 - Contratos e gaps antes de UI

Contrato fechado em `docs/CLINICAL_FLOW_CONTRACTS_P0.md`. Este P0 foi tratado
como entrega documental/auditavel: nenhuma migration, bootstrap, provider call
ou smoke mutante foi executado.

- [x] Mapear tabelas/RPCs atuais de agenda, programas, financeiro, Paciente 360,
      prescricoes, labs, bioimpedancia, tarefas, patient portal e perfis.
- [x] Confirmar se `patient_tasks` deve continuar como tabela canonica para
      tarefas clinicas ou se precisa de nova tabela/estado.
- [x] Confirmar se `lab_orders` cobre pedidos avulsos fora do encounter ou se
      precisa aceitar `encounter_id` nulo com origem auditavel.
- [x] Confirmar se prescricoes podem ser criadas diretamente do encounter usando
      `upsert_patient_prescription` com `encounter_id`.
- [x] Definir contrato de salas: `clinic_rooms` ou nome equivalente, unidade,
      tipo, status, capacidade, equipamentos e metadados.
- [x] Definir contrato de alocacao diaria: profissional, sala, unidade, data,
      inicio/fim, status e observacoes.
- [x] Definir contrato de agenda estendida: appointment com profissional, sala,
      servico, pacote, programa, invoice/payment local e metadata de origem.
- [x] Definir payload unico de auditoria para mutacoes: actor, tenant, patient,
      source module, target module, entity ids e motivo quando aplicavel.
- [x] Atualizar runbooks afetados antes ou junto da implementacao:
      `PATIENT360_RUNBOOK.md`, `PROGRAMS_PACKAGES_RUNBOOK.md`,
      `ASAAS_BILLING_RUNBOOK.md`, `CORE_AUTH_RBAC_RUNBOOK.md` e checklists de
      teste.

### P0 - Corrigir profissionais no builder

- [x] Atualizar `get_program_builder_options()` para ler
      `tenant_professionals` ativos e juntar `profiles`/`tenant_memberships` apenas
      para nome, email, unidade e permissao.
- [x] Preservar fallback para roles profissionais em tenants antigos quando nao
      houver `tenant_professionals`.
- [x] Mostrar no builder o tipo profissional, especialidade, unidade e status.
- [x] Garantir que profissional sem `packages.read` nao quebre o builder do
      usuario autorizado.
- [x] Validar owner/admin com perfil medico: RBAC continua owner/admin, perfil
      clinico vem de `tenant_professionals`.
- [x] Atualizar teste/fixture do builder para cobrir profissional retornado.

Criterios de aceite:

- Um usuario configurado como profissional ativo aparece no builder.
- O builder nao depende somente de `tenant_memberships.role_code`.
- A selecao salva em `program_team_members` e reaparece ao editar o programa.

### P1 - Salas e escala profissional

- [x] Criar modelo de salas/recurso por tenant e unidade.
- [x] Criar RPCs de CRUD auditado para salas.
- [x] Criar modelo de disponibilidade/alocacao profissional por dia.
- [x] Criar RPC para listar profissionais disponiveis por data, unidade e tipo.
- [x] Criar RPC para associar sala a profissional no dia.
- [x] Atualizar Settings ou Agenda para gerenciar salas e escala diaria.
- [x] Atualizar conflitos de agenda para considerar sala estruturada e
      profissional, nao apenas `location text`.
- [x] Manter `location` como campo de compatibilidade ate migracao completa.

Criterios de aceite:

- Recepcao consegue criar sala, marcar ativa/inativa e associar ao profissional
  no dia.
- Agenda impede conflito de sala e conflito de profissional na mesma janela.
- Agenda exibe sala e profissional vindos de IDs persistidos.

Implementacao P1 registrada:

- Migration `20260614120000_460_agenda_rooms_professional_schedule.sql` cria
  `clinic_rooms`, `professional_day_allocations`, novos IDs em `appointments`,
  `attendance_queue` e `blocked_slots`, RLS/grants e RPCs auditadas.
- `get_agenda_day_snapshot()` passa a devolver `professionalProfileId`,
  `professionalUserId`, `roomId`, `roomCode`, `unitId` e labels derivados dos
  IDs persistidos.
- `create_agenda_appointment()` e `update_agenda_appointment()` aceitam sala,
  profissional e unidade estruturados, validam escala do profissional no horario
  e bloqueiam conflito por paciente, sala, profissional e bloqueio operacional.
- A Agenda ganhou painel lateral de salas/escala e o modal de consulta usa a
  escala do dia para preencher profissional, sala e unidade.

### P1 - Agendamento comercial, financeiro e clinico

- [x] Estender formulario de agenda com profissional obrigatorio quando houver
      escala disponivel.
- [x] Estender formulario com sala/recurso.
- [x] Estender formulario com programa, pacote ou servico do catalogo.
- [x] Permitir agendamento sem cobranca, com cobranca local pendente ou com
      pagamento manual local.
- [x] Gerar invoice local quando houver valor a cobrar, sem chamar Asaas por
      padrao.
- [x] Registrar pagamento manual local quando informado pela recepcao.
- [x] Vincular appointment ao enrollment/pacote/servico/invoice/payment via
      colunas dedicadas ou metadata documentada.
- [x] Refletir o contexto financeiro no Paciente 360 e em `/clinic/financeiro`.
- [x] Refletir o contexto do programa/pacote no encounter aberto pela agenda.
- [x] Refletir o evento na timeline do paciente.

Criterios de aceite:

- Um agendamento de servico pago aparece na agenda, financeiro e Paciente 360.
- Um agendamento vinculado a programa/pacote abre encounter com esse contexto.
- Um pagamento local registrado no agendamento impacta o resumo financeiro.
- Falha financeira nao apaga a consulta; estado parcial fica visivel e
  auditavel.

Implementacao P1 registrada:

- Migration `20260614143000_470_agenda_commercial_financial_clinical_context.sql`
  adiciona IDs comerciais/financeiros dedicados em `appointments`, metadata de
  origem e status financeiro local (`not_required`, `pending_local_invoice`,
  `manual_paid`, `failed`).
- `create_agenda_appointment()` e `update_agenda_appointment()` passam a aceitar
  `p_commercial_context` e `p_billing_context`, vinculam programa, pacote,
  servico e enrollment, criam `patient_invoices` locais e registram pagamento
  manual em `payments`/`patient_receipts` sem chamar Asaas.
- Falhas financeiras ficam isoladas em bloco transacional interno: a consulta
  permanece salva com `financial_status = 'failed'`, `financial_error`, timeline
  e `audit_logs`.
- `get_agenda_day_snapshot()` passa a devolver programa, pacote, servico,
  invoice, payment e status financeiro para agenda/fila.
- `src/services/agendaApi.ts` e `AgendaContent.tsx` enviam/normalizam o novo
  contrato, carregam catalogo comercial, exigem profissional quando ha escala e
  mostram contexto comercial/financeiro nos cards e drawer.
- `src/services/encounterApi.ts` e o encounter SOAP carregam `appointmentId` da
  URL e exibem o contexto da consulta vinculada para desktop e mobile.

### P1 - Triagem, medidas e bioimpedancia fora do encounter

- [x] Criar painel operacional na agenda/fila para pacientes em `triagem`,
      `medidas` e `bioimpedancia`.
- [x] Permitir iniciar e concluir triagem com responsavel, sala e timestamps.
- [x] Permitir registrar medidas sem precisar abrir SOAP.
- [x] Permitir registrar bioimpedancia sem precisar abrir SOAP.
- [x] Permitir anexar os registros a appointment/encounter quando houver.
- [x] Permitir que registros avulsos aparecam no prontuario, evolucao e timeline.
- [x] Criar transicoes claras da fila: chegou -> triagem -> medidas ->
      bioimpedancia -> aguardando medico.
- [x] Criar empty/error/forbidden states para cada painel.

Criterios de aceite:

- Recepcao/equipe consegue tratar triagem/bioimpedancia a partir da agenda.
- O medico ve os registros no encounter e no Paciente 360.
- Registros fora do encounter aparecem com origem auditavel.

Implementacao P1 registrada:

- Migration `20260614170000_480_agenda_operational_triage_measurements.sql`
  adiciona origem operacional em `measurements` e `bioimpedance_results`
  (`appointment_id`, `queue_id`, `source_module`, sala, profissional e
  metadata), mantendo `encounter_id` opcional.
- `record_patient_measurement()` e `record_patient_bioimpedance()` aceitam
  payload de agenda/fila, validam paciente, appointment, encounter, sala e
  profissional, escrevem `audit_logs` e timeline com origem auditavel.
- RPC `record_operational_clinical_stage()` registra inicio/conclusao de
  `triagem`, `medidas` e `bioimpedancia` em `attendance_queue.metadata`, com
  actor, sala, profissional e timestamps, e aplica a transicao da consulta.
- RPC `get_agenda_operational_queue()` expõe o workflow operacional para a UI
  da agenda sem alterar o snapshot principal.
- `src/services/agendaApi.ts` e `src/services/clinicalRecordsApi.ts` enviam e
  normalizam o novo contrato.
- A aba Fila de `AgendaContent.tsx` ganhou painel operacional para iniciar
  etapa, concluir triagem, registrar medidas e registrar bioimpedancia fora do
  SOAP, com empty/error states e avancos para `medidas`, `bioimpedancia` e
  `aguardando_medico`.

### P1 - Exames, prescricoes e tarefas como acoes unificadas

- [x] Reaproveitar `createLabOrder` em uma interface fora do encounter:
      Paciente 360 e/ou agenda/fila.
- [x] Habilitar criacao de prescricoes no encounter usando
      `savePatientPrescription` com `encounterId`.
- [x] Decidir se o editor completo de prescricoes sera modal compartilhado ou
      deep-link para aba Prescricoes com contexto de encounter.
- [x] Criar fluxo de atribuicao de tarefa clinica com paciente, responsavel,
      prioridade, vencimento, categoria, origem e status.
- [x] Criar acoes de concluir/reabrir tarefa com auditoria.
- [x] Mostrar tarefas criadas no resumo do Paciente 360, encounter e inbox quando
      aplicavel.
- [x] Registrar timeline para exame solicitado, prescricao emitida/atualizada e
      tarefa atribuida/concluida.

Criterios de aceite:

- Exame pode ser solicitado do encounter e do Paciente 360.
- Prescricao pode nascer do encounter e aparecer na aba Prescricoes.
- Tarefa criada aparece imediatamente no Paciente 360 e respeita permissao.
- Todas as acoes retornam erro visivel e nao caem em mock silencioso.

Implementacao P1 registrada:

- Migration `20260614200000_490_unified_clinical_actions.sql` adiciona origem,
  categoria, prioridade, vinculos opcionais e status auditavel em
  `patient_tasks`, alem de RPCs `upsert_patient_clinical_task()` e
  `set_patient_clinical_task_status()` com `audit_logs` e timeline.
- `create_patient_lab_order()` passa a aceitar `sourceModule` e
  `appointmentId`, preservando exames avulsos fora do encounter com origem
  auditavel.
- `src/components/UnifiedClinicalActions.tsx` centraliza solicitacao de exames,
  emissao simples de prescricoes e atribuicao de tarefas para uso compartilhado.
- O encounter habilita botoes de prescricao e tarefa e usa o componente
  compartilhado com `encounterId`; o Resumo do Paciente 360 expoe as mesmas
  acoes sem mock silencioso.

### P1 - Dados pessoais de pacientes

- [x] Expandir `PatientMutationInput` e o formulario para endereco estruturado:
      CEP, logradouro, numero, complemento, bairro, cidade, UF e pais.
- [x] Persistir endereco em `patient_pii.address` ou em tabela dedicada se
      houver necessidade de historico.
- [x] Adicionar campos opcionais: documento secundario, contato alternativo,
      profissao, observacoes de preferencia, consentimentos e responsavel principal,
      conforme decisao de produto.
- [x] Criar storage privado para foto de perfil do paciente.
- [x] Criar RPC/Edge ou facade para preparar upload, concluir upload e obter URL
      assinada curta.
- [x] Exibir foto no cadastro, lista, Paciente 360, agenda e encounter.
- [x] Garantir que portal do paciente veja somente imagem permitida.

Criterios de aceite:

- Endereco salvo reaparece ao editar paciente.
- Foto nao usa URL publica irrestrita quando contem dado sensivel.
- Lista e Paciente 360 renderizam fallback quando nao ha foto.

Implementacao P1 registrada:

- Migration `20260614220000_500_patient_personal_data_profile_photo.sql` cria o
  bucket privado `patient-profile-photos`, politicas de storage por permissao e
  vinculo de portal, campos complementares em `patient_pii`, validacao de path e
  atualiza `upsert_patient_with_pii()` para endereco, consentimentos e foto.
- `src/services/patientsApi.ts` expande `PatientMutationInput`, normaliza
  endereco/consentimentos, faz upload privado da foto, conclui o vinculo via RPC
  e obtem signed URL curta para edicao/lista.
- `PatientListContent.tsx` adiciona foto privada, endereco estruturado,
  documento secundario, telefone alternativo, profissao, responsavel principal,
  preferencias e consentimentos no cadastro/edicao, com fallback visual quando
  nao ha foto.
- Lista de pacientes passa a carregar foto por signed URL curta e renderiza
  fallback por iniciais quando a imagem nao existe ou nao esta autorizada.

### P1 - Dados pessoais de usuarios e profissionais

- [ ] Definir se dados de usuario ficam em `profiles`, `tenant_memberships`
      metadata, tabela nova de user profile ou `tenant_professionals`.
- [ ] Adicionar telefone, foto, endereco profissional, conselho/registro,
      especialidade, unidades de atendimento e assinatura/rodape profissional quando
      aplicavel.
- [ ] Separar dados de identidade profissional de dados pessoais privados.
- [ ] Criar upload privado/controlado para avatar do usuario.
- [ ] Atualizar Settings/Equipe para editar esses campos.
- [ ] Garantir que prescricoes/documentos usem nome/registro profissional
      correto.

Criterios de aceite:

- Usuario/profissional tem perfil editavel sem alterar indevidamente RBAC.
- Profissional ativo aparece em builder, agenda e prescricoes com os mesmos
  dados.
- Dados pessoais privados nao aparecem para pacientes sem regra explicita.

### P1 - Portal do paciente e ativacao de acesso

- [ ] Documentar fluxo operacional: criar paciente -> criar usuario/convite ->
      criar `tenant_membership` patient/guardian -> criar `patient_accounts` ou
      `guardian_links` -> liberar `patient_portal.access`.
- [ ] Criar UI de ativacao/desativacao de portal no cadastro do paciente ou
      Paciente 360.
- [ ] Permitir convite de paciente e responsavel com email/telefone validado.
- [ ] Mostrar status do portal: sem acesso, convite pendente, ativo, suspenso,
      revogado.
- [ ] Permitir revogar acesso e manter historico de auditoria.
- [ ] Expor checklist de dados minimos antes de liberar portal.
- [ ] Validar que `/patient` continua fail-closed quando o vinculo nao existe.

Criterios de aceite:

- Um paciente/responsavel convidado consegue aceitar acesso e cair em `/patient`.
- Usuario sem vinculo ativo recebe estado negado sem dados clinicos.
- Revogacao bloqueia acesso imediatamente.

### P2 - Read models, timeline e auditoria

- [ ] Atualizar Patient 360 summary para refletir novos vinculos de agenda,
      sala, profissional, servico, programa, invoice e pagamento.
- [ ] Atualizar timeline para eventos de sala/profissional, cobranca local,
      pagamento manual, triagem, bioimpedancia, exame, prescricao e tarefa.
- [ ] Atualizar financeiro para reconhecer origem do agendamento e do pacote.
- [ ] Atualizar encounter para carregar contexto comercial/financeiro do
      appointment.
- [ ] Adicionar testes fixture para contratos de Patient 360 e agenda.
- [ ] Adicionar smokes locais somente apos autorizacao para ambiente Supabase.

Criterios de aceite:

- Cada modulo consegue explicar de onde veio o dado.
- Auditoria contem actor, tenant, paciente, origem e IDs de entidades ligadas.
- Falhas parciais aparecem como warnings e nao como sucesso falso.

## Checklist De Auditoria

### Dados e seguranca

- [ ] Nenhum segredo, `.env`, token, cookie, payload bruto de provider ou signed
      URL sensivel foi impresso.
- [ ] Nenhuma chamada Asaas ou D4Sign foi feita sem autorizacao explicita.
- [ ] Nenhuma migration antiga foi editada.
- [ ] Novas tabelas com dados clinicos/financeiros/documentos tem RLS, grants,
      indices e analise de tenant.
- [x] Campos de foto usam storage privado ou URL assinada curta quando aplicavel.
- [ ] Dados do portal continuam escopados por `patient_accounts` e
      `guardian_links`.

### Contratos

- [x] Services frontend continuam retornando `{ data, error }`.
- [x] RPCs novas validam tenant, permissao e ownership.
- [x] Mutacoes escrevem `audit_logs` ou evento equivalente.
- [x] Read-models do Paciente 360 aceitam estados vazios.
- [ ] Agenda nao depende de texto livre para sala/profissional quando IDs estao
      disponiveis.

### UX operacional

- [ ] Agenda tem loading, empty, error e forbidden.
- [ ] Builder de planos mostra estado vazio acionavel quando nao ha profissional.
- [ ] Triagem/bioimpedancia tem fluxo touch/keyboard, nao hover-only.
- [x] Formularios de paciente/usuario validam campos obrigatorios e opcionais.
- [ ] Portal mostra status de acesso de forma clara para equipe.

### Checks minimos por entrega

- [ ] Docs-only: `git diff --check`.
- [ ] Codigo TypeScript/frontend: `git diff --check`, `npm run type-check`,
      `npm run lint`, `npm run build`.
- [ ] UI: alem dos checks de codigo, `npm run dev` e browser smoke na rota
      afetada quando praticavel.
- [ ] Supabase: migrations/smokes apenas com autorizacao explicita e comando
      nominal.
- [ ] Evidencia registrada no PR ou runbook com comandos executados, comandos
      pulados e motivo.

## Sequencia Recomendada

1. Fechar contrato de profissionais: alinhar builder, settings, agenda e
   prescriptions em `tenant_professionals`.
2. Criar salas e escala diaria, pois isso destrava agenda com profissional real.
3. Estender agendamento com profissional/sala/programa/pacote/servico e
   financeiro local.
4. Implementar triagem/bioimpedancia fora do encounter usando os contratos
   clinicos existentes.
5. Habilitar prescricoes e tarefas como acoes compartilhadas no encounter e
   Paciente 360.
6. Expandir dados pessoais e fotos de paciente/usuario com storage e RLS.
7. Implementar ativacao/revogacao do portal do paciente.
8. Atualizar read-models, timeline, runbooks e testes de contrato.

## Riscos E Dependencias

- O builder pode continuar vazio se o tenant tiver membros ativos, mas nenhum
  `tenant_professionals` ativo e nenhum fallback por role habilitado.
- Agenda com pagamento precisa tratar falha parcial entre appointment e invoice.
- Salas estruturadas exigem compatibilidade com `appointments.location` ate que
  dados antigos sejam migrados ou normalizados.
- Foto de perfil exige decisao de bucket, path, signed URL, caching e quem pode
  ver.
- Portal do paciente depende de convite/auth/linkage; sem isso, `/patient`
  corretamente permanece fail-closed.
- Smokes reais de Supabase, provider ou bootstraps dependem de autorizacao
  explicita por ambiente.
