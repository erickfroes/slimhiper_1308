# Clinical Flow Contracts P0

Data: 2026-06-14.

Status: P0 documental implementado. Este documento fecha os contratos e gaps que
devem estar claros antes de novas telas de agenda, encounter, Paciente 360,
financeiro, planos, exames, prescricoes, tarefas, salas e portal do paciente.

Este P0 nao autoriza migrations, `supabase db push`, bootstraps, smokes
mutantes ou chamadas Asaas/D4Sign. As proximas entregas que alterarem schema,
RLS, RPCs ou Edge Functions devem criar migration nova e executar checks somente
com autorizacao explicita para o ambiente.

## Contratos Existentes

| Dominio                | Contrato atual                                                                                                                                              | Evidencia                                                                                                                                                     | Decisao P0                                                                                                                                | Gap antes de UI                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Profissionais clinicos | `tenant_professionals` separa identidade profissional de RBAC.                                                                                              | `supabase/migrations/20260613153000_430_tenant_professionals_owner_physician.sql`                                                                             | Fonte canonica para medico, nutricionista, profissional fitness e externo. `tenant_memberships` continua sendo RBAC.                      | Builder, agenda e prescricoes devem consumir esta fonte com fallback legado quando necessario.                          |
| Agenda                 | `appointments` tem `practitioner_id`, `location`, status de triagem, medidas e bioimpedancia; P1 adiciona `professional_profile_id`, `room_id` e `unit_id`. | `supabase/migrations/20260530122000_020_clinical_patient360.sql`; `supabase/migrations/20260614120000_460_agenda_rooms_professional_schedule.sql`             | Manter compatibilidade com `location`, mas novos fluxos usam IDs estruturados para profissional e sala.                                   | Ainda falta servico, pacote, programa, invoice e payment no contrato comercial da agenda.                               |
| Fila/atendimento       | `attendance_queue` e snapshot de agenda retornam profissional/sala quando existem; P1 sincroniza IDs de sala/profissional a partir do appointment.          | `supabase/migrations/20260607013000_280_agenda_attendance_queue_returns.sql`; `supabase/migrations/20260614120000_460_agenda_rooms_professional_schedule.sql` | Usar fila como porta operacional para triagem, medidas e bioimpedancia fora do encounter.                                                 | Falta fluxo de coleta/conclusao fora da tela SOAP.                                                                      |
| Salas                  | `clinic_rooms` e RPC `upsert_clinic_room()` viram a fonte canonica de sala/recurso por tenant/unidade.                                                      | `supabase/migrations/20260614120000_460_agenda_rooms_professional_schedule.sql`                                                                               | `appointments.location` permanece como fallback legado; conflitos novos usam `room_id`.                                                   | Falta mover manutencao completa para Settings, se desejado.                                                             |
| Alocacao diaria        | `professional_day_allocations` associa profissional ativo, sala, unidade, data e janela de horario.                                                         | `supabase/migrations/20260614120000_460_agenda_rooms_professional_schedule.sql`                                                                               | Agenda lista profissionais/salas do dia por `get_agenda_schedule_options()` e exige escala para appointment com profissional estruturado. | Falta visualizacao mais ampla de escala semanal/mensal.                                                                 |
| Programas e pacotes    | `enroll_patient_in_program()` cria enrollment, appointment, invoice local, tasks e timeline.                                                                | `supabase/migrations/20260531182000_142_program_enrollment_operational_reflections.sql`                                                                       | Reusar o padrao de reflexos locais. Agenda com programa/pacote/servico deve escrever os mesmos IDs e metadata.                            | Agendamento ainda nao seleciona programa, pacote ou servico.                                                            |
| Financeiro             | `patient_invoices` e `payments` aceitam `metadata`; provider Asaas fica em Edge Functions.                                                                  | `supabase/migrations/20260530125000_050_billing_asaas.sql`; `docs/integrations/ASAAS_BILLING_RUNBOOK.md`                                                      | Agenda pode criar cobranca/pagamento local auditavel; chamada Asaas nao e automatica.                                                     | Falta contrato de idempotencia e vinculo appointment-invoice-payment em RPC de agenda.                                  |
| Paciente 360           | Edge Functions e facades retornam resumo/timeline com envelope seguro.                                                                                      | `docs/supabase/PATIENT360_RUNBOOK.md`; `src/services/patient360Api.ts`                                                                                        | Paciente 360 e read-model longitudinal, nao dono das mutacoes. Mutacoes devem refletir timeline e audit.                                  | Read-model precisa reconhecer novos IDs de sala, profissional, appointment, servico, pacote, invoice e payment.         |
| Tarefas                | `patient_tasks` existe com paciente, status, titulo, detalhes, vencimento e responsavel.                                                                    | `supabase/migrations/20260530122000_020_clinical_patient360.sql`                                                                                              | `patient_tasks` continua tabela canonica para tarefas clinicas/paciente no curto prazo.                                                   | Proxima migration deve adicionar origem/categoria/prioridade ou padronizar esses campos em `metadata` antes da UI rica. |
| Exames                 | `lab_orders.encounter_id` e nullable; RPC aceita payload sem encounter.                                                                                     | `supabase/migrations/20260530122000_020_clinical_patient360.sql`; `20260608093000_400_transactional_clinical_contracts.sql`                                   | `lab_orders` cobre pedidos avulsos fora do encounter.                                                                                     | Payload deve incluir origem auditavel quando nascer de agenda, Paciente 360 ou fila.                                    |
| Bioimpedancia          | `bioimpedance_results.encounter_id` e nullable; RPC aceita payload sem encounter.                                                                           | `supabase/migrations/20260608093000_400_transactional_clinical_contracts.sql`                                                                                 | Pode nascer fora do encounter, desde que tenha origem e actor auditados.                                                                  | UI operacional fora do SOAP e vinculo opcional a appointment ainda faltam.                                              |
| Prescricoes            | `prescriptions.encounter_id` e nullable; `upsert_patient_prescription()` recebe `p_encounter_id`.                                                           | `supabase/migrations/20260607053000_310_prescription_regulatory_medications.sql`                                                                              | Prescricao pode nascer do encounter e aparecer na aba Prescricoes.                                                                        | Encounter deve abrir editor compartilhado ou deep-link com contexto de encounter.                                       |
| Paciente/PII           | `patient_pii.address` existe; cadastro atual nao persiste endereco completo/foto.                                                                           | `supabase/migrations/20260530122000_020_clinical_patient360.sql`; `src/services/patientsApi.ts`                                                               | Endereco estruturado deve ir para `patient_pii.address` ate haver requisito de historico. Fotos exigem storage privado/signed URL.        | Falta facade/formulario para endereco e contrato de storage para foto.                                                  |
| Usuarios               | `profiles` tem dados minimos; `tenant_professionals` guarda registro/especialidade.                                                                         | `supabase/migrations/20260530121000_010_core_auth_rbac.sql`; `20260613153000_430_tenant_professionals_owner_physician.sql`                                    | Separar perfil de usuario, identidade profissional e RBAC.                                                                                | Falta contrato de avatar/endereco profissional/assinatura.                                                              |
| Portal do paciente     | `/patient` existe e fica fail-closed sem linkage/permissao.                                                                                                 | `src/app/patient/page.tsx`; `docs/supabase/CORE_AUTH_RBAC_RUNBOOK.md`                                                                                         | Ativacao exige membership patient/guardian ativo, `patient_accounts` ou `guardian_links`, e `patient_portal.access`.                      | Falta UI/operacao de convite, ativacao, suspensao e revogacao.                                                          |

## Contratos P0 Fechados

### Tarefas

`patient_tasks` permanece canonica para tarefas clinicas e de paciente. A UI
futura deve criar, atribuir, concluir e reabrir tarefas por RPC auditada, sem
write direto do browser. Enquanto nao houver migration de campos dedicados,
origem, categoria, prioridade e entidades relacionadas devem ser representadas
em metadata padronizada no payload de mutacao ou em uma migration propria.

Campos minimos para a proxima entrega:

- `patient_id`, `title`, `details`, `assigned_to`, `due_at`, `status`.
- `source_module`, `source_action`, `priority`, `category`.
- IDs opcionais: `appointment_id`, `encounter_id`, `program_id`,
  `enrollment_id`, `invoice_id`, `room_id`.

### Exames E Bioimpedancia Avulsos

`lab_orders` e `bioimpedance_results` ja aceitam `encounter_id` nulo. Portanto,
eles cobrem registros fora do SOAP desde que a mutacao envie origem auditavel.
O contrato recomendado e usar os RPCs clinicos existentes e acrescentar no
payload:

- `sourceModule`: `encounter`, `patient360`, `agenda`, `attendance_queue` ou
  `patient_portal`.
- `sourceAction`: acao humana ou automatica que iniciou o registro.
- `appointmentId`, `encounterId` e `queueEventId` quando existirem.
- `professionalUserId` ou `professionalProfileId` quando o responsavel for
  diferente do actor autenticado.

### Prescricoes

`upsert_patient_prescription(p_patient_id, p_prescription_id, p_encounter_id,
p_payload, p_finalize)` e o contrato para criar/atualizar prescricoes do
encounter ou do Paciente 360. A proxima UI nao deve criar outra tabela ou
facade paralela. O encounter deve abrir o editor completo compartilhado ou
enviar o usuario para a aba Prescricoes com `patientId` e `encounterId`.

### Salas

Contrato futuro recomendado:

| Campo                     | Regra                                                                    |
| ------------------------- | ------------------------------------------------------------------------ |
| `id`                      | UUID primario.                                                           |
| `tenant_id`               | Obrigatorio, escopo RLS.                                                 |
| `unit_id`                 | Opcional ou obrigatorio por tenant, FK para unidade quando existir.      |
| `code`                    | Codigo curto unico por tenant/unidade.                                   |
| `name`                    | Nome operacional exibido na agenda.                                      |
| `room_type`               | `consulting`, `triage`, `bioimpedance`, `procedure`, `admin` ou `other`. |
| `status`                  | `active`, `inactive`, `maintenance`.                                     |
| `capacity`                | Inteiro positivo, default 1.                                             |
| `equipment`               | JSONB para balanca, bioimpedancia, maca, etc.                            |
| `metadata`                | JSONB sem segredo ou payload bruto de provider.                          |
| `created_at`/`updated_at` | Timestamps auditaveis.                                                   |

Permissoes esperadas: `agenda.read` ou `settings.read` para leitura;
`agenda.write` ou `settings.write` para mutacoes por RPC auditada.

### Alocacao Diaria

Contrato futuro recomendado:

| Campo                     | Regra                                                           |
| ------------------------- | --------------------------------------------------------------- |
| `id`                      | UUID primario.                                                  |
| `tenant_id`               | Obrigatorio, escopo RLS.                                        |
| `unit_id`                 | Unidade da escala.                                              |
| `professional_profile_id` | FK para `tenant_professionals.id`.                              |
| `user_id`                 | Usuario/profissional para joins rapidos com `profiles`.         |
| `room_id`                 | FK opcional para `clinic_rooms.id`.                             |
| `work_date`               | Data local da escala.                                           |
| `starts_at`/`ends_at`     | Janela real, preferencialmente `timestamptz`.                   |
| `status`                  | `scheduled`, `available`, `blocked`, `cancelled`.               |
| `notes`                   | Texto curto operacional.                                        |
| `metadata`                | JSONB com origem da escala, sem dados sensiveis desnecessarios. |
| `created_by`              | Actor que criou a alocacao.                                     |

Indices/constraints esperados: evitar sobreposicao por profissional ativo e por
sala ativa na mesma janela, respeitando tenant/unidade.

### Agenda Estendida

O contrato de agenda v2 deve aceitar payload unico, em vez de expandir
assinaturas posicionais. Campos recomendados:

```json
{
  "patientId": "uuid",
  "appointmentId": "uuid opcional",
  "scheduledAt": "timestamp",
  "durationMinutes": 30,
  "type": "consulta_medica",
  "professionalProfileId": "uuid",
  "professionalUserId": "uuid",
  "roomId": "uuid",
  "legacyLocation": "texto opcional",
  "serviceId": "uuid",
  "packageId": "uuid",
  "programId": "uuid",
  "enrollmentId": "uuid",
  "invoiceId": "uuid",
  "paymentId": "uuid",
  "billingMode": "none|local_invoice|manual_payment",
  "requiresTriage": true,
  "requiresMeasurements": true,
  "requiresBioimpedance": false,
  "sourceModule": "agenda",
  "sourceAction": "create_appointment",
  "reason": "texto curto opcional",
  "idempotencyKey": "string opcional"
}
```

Persistencia esperada: colunas dedicadas para IDs com alto uso de join
(`professionalProfileId`, `roomId`, `serviceId`, `packageId`, `programId`,
`invoiceId`, `paymentId`) e metadata apenas para contexto flexivel.

### Auditoria E Timeline

Payload minimo para `audit_logs.metadata` e `patient_timeline_events.payload`:

```json
{
  "contractVersion": "clinical-flow-p0",
  "sourceModule": "agenda",
  "sourceAction": "create_appointment",
  "targetModule": "patient360",
  "patientId": "uuid",
  "appointmentId": "uuid",
  "encounterId": "uuid",
  "queueEventId": "uuid",
  "programId": "uuid",
  "enrollmentId": "uuid",
  "packageId": "uuid",
  "serviceId": "uuid",
  "invoiceId": "uuid",
  "paymentId": "uuid",
  "roomId": "uuid",
  "professionalProfileId": "uuid",
  "professionalUserId": "uuid",
  "reason": "texto curto quando aplicavel",
  "idempotencyKey": "string opcional"
}
```

Nao incluir tokens, cookies, signed URLs longas, chaves provider, payload bruto
de Asaas/D4Sign ou PII desnecessaria nesse payload.

## Checklist P0

- [x] Mapear tabelas/RPCs atuais de agenda, programas, financeiro, Paciente 360,
      prescricoes, labs, bioimpedancia, tarefas, patient portal e perfis.
- [x] Confirmar `patient_tasks` como tabela canonica de tarefas clinicas no
      curto prazo.
- [x] Confirmar `lab_orders` para pedidos avulsos fora do encounter com
      `encounter_id` nulo e origem auditavel.
- [x] Confirmar prescricoes criadas do encounter via
      `upsert_patient_prescription` com `p_encounter_id`.
- [x] Definir contrato de salas (`clinic_rooms`).
- [x] Definir contrato de alocacao diaria de profissional/sala.
- [x] Definir contrato de agenda estendida com profissional, sala, servico,
      pacote, programa, invoice/payment local e metadata.
- [x] Definir payload unico de auditoria/timeline.
- [x] Atualizar runbooks afetados para apontar o contrato P0.

## Proximas Entregas Bloqueadas Por Este P0

1. Migration nova para salas, alocacao diaria, agenda v2 e eventuais campos de
   metadata/IDs em tarefas e appointments.
2. RPCs auditadas de agenda v2, salas e escala diaria, com RLS/grants revisados.
3. Atualizacao do builder/agenda/prescricoes para consumir
   `tenant_professionals` como fonte canonica.
4. UI operacional de agenda, triagem, bioimpedancia, exames, prescricoes e
   tarefas usando os contratos acima.
5. Testes de contrato e smokes locais somente apos autorizacao para ambiente
   Supabase.
