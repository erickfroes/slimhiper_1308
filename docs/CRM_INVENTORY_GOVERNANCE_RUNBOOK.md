# Runbook LGPD e operacional — CRM e estoque

Este runbook complementa a Fase 9 (CRM/estoque) e define controles mínimos para
retenção, opt-out, anonimização/exportação, inventário físico, ajuste, perda,
recall por lote e auditoria. Ele se aplica aos contratos criados nas migrations
`190` a `195`, aos serviços `crmApi`/`inventoryApi` e às rotas clínicas
`/clinic/crm`, `/clinic/inventory`, `/clinic/dashboard` e `/clinic/reports`.

## Princípios de segurança

- **Sem dados reais em smokes ou fixtures**: usar apenas domínios `example.test`,
  telefones fictícios e nomes dummy.
- **Sem writes amplos no browser**: criação, conversão, ajustes e transferências
  devem passar por RPCs auditadas com RBAC/RLS.
- **PII mínima em relatórios**: relatórios de CRM e estoque devem ser agregados;
  exports rechecam RBAC e não incluem telefone/e-mail de leads.
- **Custo restrito**: custo/margem de estoque exige `inventory.cost.read`.
- **Provider externo fora do escopo**: CRM/estoque não chama WhatsApp, e-mail,
  SMS, ERP, fornecedor, fiscal ou gateways sem tarefa/autorização explícita.

## Retenção de leads e opt-out

| Situação | Prazo operacional | Ação |
| --- | --- | --- |
| Lead convertido em paciente | Segue retenção clínica do prontuário/paciente | Manter vínculo auditado `converted_patient_id`; não expor histórico comercial sensível no Paciente 360. |
| Lead aberto com consentimento válido | Até a data de `retention_expires_at` ou revisão comercial documentada | Manter somente campos necessários para contato e funil. |
| Lead perdido/arquivado ou sem consentimento | Redigir ao vencer `retention_expires_at` | Rodar `expire_crm_leads_for_retention(false, limit)` primeiro e executar somente em janela aprovada. |
| Opt-out/revogação | Imediato para novo contato ativo | Gravar `opt_out_at`, `contact_consent=false` e registrar atividade/audit log; manter apenas evidência mínima da revogação. |

### Execução de retenção

1. Confirmar ambiente aprovado e service role local/sandbox; nunca usar produção
   sem autorização formal.
2. Rodar dry-run agregado:
   `node scripts/supabase/test-crm-inventory-phase9-local-smoke.mjs` ou chamar
   `expire_crm_leads_for_retention(false, 100)` em console controlado.
3. Revisar `candidateLeads` e `attachmentReferencesRequiringDeletion`.
4. Se aprovado, executar `expire_crm_leads_for_retention(true, 100)` em lotes.
5. Tratar anexos marcados com `metadata.retentionDeleteRequired=true` no storage
   operacional, registrando evidência de descarte fora do banco.
6. Conferir `audit_logs.action = 'crm_lead.retention_redacted'`.

A anonimização substitui nome por marcador genérico, troca e-mail por endereço
local não roteável `@retention.local`, remove telefone e próximo follow-up,
marca opt-out e arquiva o lead. Atividades têm descrições removidas; anexos são
marcados para descarte porque a exclusão física depende do bucket/storage.

## Exportação e minimização

- Exports de relatórios devem usar `create_clinic_report_run` e
  `get_clinic_report_export`, que revalidam `reports.read` e permissões
  específicas (`crm.read`, `inventory.read`, `inventory.cost.read`).
- Exportações de CRM são agregadas por origem, etapa, SLA, responsável ou
  campanha, sem e-mail/telefone do lead.
- Solicitações LGPD individuais devem preferir o prontuário/paciente após
  conversão. Para leads não convertidos, exportar apenas campos necessários para
  atender a solicitação e registrar audit log operacional.

## Inventário físico, ajustes, perdas e transferências

- Saldo é **ledger-based**: nunca ajustar `inventory_stock_snapshots` direto pelo
  cliente.
- Recebimento, consumo, perda, ajuste e transferência usam
  `create_inventory_movement`/`transfer_inventory_stock` com `reasonNote`
  obrigatório.
- Saldo negativo é bloqueado por padrão (`negative_stock_blocked`). Exceções
  exigiriam nova permissão, justificativa e migration dedicada.
- Usuários sem `inventory.adjust` não podem registrar ajuste/perda/consumo
  sensível; usuários sem `inventory.transfer` não podem transferir entre locais.
- Custo unitário só é gravado/exibido quando o usuário possui
  `inventory.cost.read`.

### Inventário físico

1. Congelar janela operacional do local/unidade.
2. Exportar relatório `inventory-saldo-unidade` sem custo, salvo necessidade
   explícita de custo restrito.
3. Contar fisicamente por item/lote/validade/local.
4. Lançar diferenças como `adjustment` com `reasonNote` descrevendo contagem,
   responsável e evidência interna.
5. Revisar `audit_logs` e notificações de ajustes sensíveis.

### Perdas

- Usar motivo `loss` com `reasonNote` específico e, quando aplicável, anexar a
  evidência em repositório seguro fora do CRM/estoque até existir contrato de
  storage próprio.
- Não registrar dados de paciente no `reasonNote`; se houver vínculo clínico,
  usar `related_patient_id` somente quando a finalidade clínica estiver clara.

### Recall por lote

1. Localizar lote no relatório `inventory-lotes-vencer` ou pela tela
   `/clinic/inventory`.
2. Consultar movimentações do lote e unidades afetadas.
3. Bloquear uso operacional removendo saldo por `adjustment`/`loss` ou movendo
   para local de quarentena quando disponível.
4. Registrar `reasonNote` com código do recall, lote, data e responsável.
5. Se houver pacientes impactados, abrir tarefa clínica separada no Paciente 360;
   não expor histórico comercial do lead.

## Smokes e regressão

O smoke local de PR 9.5 é:

```bash
node scripts/supabase/test-crm-inventory-phase9-local-smoke.mjs
```

Ele cobre tenants A/B, usuário full, usuário sem `crm.write`, usuário sem
`inventory.adjust`, deduplicação de lead, conversão idempotente, ledger de
estoque, bloqueio de saldo negativo, auditoria, notificações, allowlist de
relatórios e snapshot de governança. O script recusa Supabase remoto por padrão;
para sandbox aprovada use `ALLOW_REMOTE_CRM_INVENTORY_SMOKE=true`.

## Evidências esperadas antes de release

- `npm run type-check`, `npm run lint`, `npm run build` e `git diff --check` sem
  erros.
- Migration local aplicada com Supabase/Postgres disponível.
- Smoke local acima executado em ambiente local/sandbox com variáveis Supabase.
- Browser smoke autenticado para `/clinic/crm`, detalhe/conversão,
  `/clinic/inventory`, dashboard e relatórios, verificando tela em branco,
  overlay, console e uma interação relevante por superfície.
