# Plano Automatizado de Implementação e Validação

## Escopo e segurança

Este plano trata persistência/RLS, prontuário, continuidade, integrações e LGPD usando apenas dados sintéticos.

- Mutações somente em Supabase local ou staging isolado; staging sempre sem mock.
- Seeds usam prefixo `qa_` e cleanup idempotente em `finally`.
- Usar somente e-mails `@example.test`, telefones de teste e identificadores fictícios.
- Nunca usar produção, pacientes reais ou credenciais de produção.
- Provedores ficam em fixture até existir sandbox segregado autorizado.
- Evidências são sanitizadas: sem tokens, URLs assinadas, payload bruto ou PII.

## Matriz de identidades sintéticas

| Alias | Tenant | Papel | Cenário |
| --- | --- | --- | --- |
| `qa_owner_a` | Clínica Aurora | owner/admin | operação e auditoria |
| `qa_physician_a` | Clínica Aurora | médico | SOAP, prescrição e documentos |
| `qa_nutrition_a` | Clínica Aurora | nutricionista | plano alimentar e medidas |
| `qa_reception_a` | Clínica Aurora | recepção | cadastro, agenda e fila |
| `qa_finance_a` | Clínica Aurora | financeiro | cobrança e reconciliação |
| `qa_patient_a` | Clínica Aurora | paciente | portal, agenda e chat próprios |
| `qa_guardian_a` | Clínica Aurora | responsável | somente vínculo autorizado |
| `qa_owner_b` / `qa_patient_b` | Clínica Boreal | admin/paciente | testes cross-tenant |
| `qa_revoked_a` | Clínica Aurora | revogado | bloqueio de sessão e dados |
| `qa_support_pending` / `qa_support_active` | plataforma | suporte | break-glass negado/aprovado |

## Pirâmide de testes

1. Fixture: contratos, payloads inválidos, permissões e webhooks sem banco.
2. Supabase local: migrations, RLS, RPCs, Edge Functions e seeds `qa_`.
3. Browser local: jornada por papel, erro/forbidden, refresh e acessibilidade.
4. Staging isolado: smoke sem mock, restore, observabilidade e sandbox.

Nenhum nível posterior substitui o anterior.

## Lote A — Harness de QA e isolamento

Criar `scripts/qa/create-test-fixtures.mjs`, `cleanup-test-fixtures.mjs` e `run-scenario.mjs`.

- O seed cria Aurora/Boreal, aliases, pacientes, portal/responsável e massa clínica mínima.
- O runner gera `request_id`, executa assertions sanitizadas e sempre chama cleanup.
- Criar manifests em `tests/scenarios/` para acesso permitido, cross-tenant negado, portal limitado, usuário revogado e break-glass.
- Scripts recusam host remoto, salvo flag explícita para staging isolado.

Aceite: execução repetível, sem resíduos e com relatório de cenário, schema e IDs redigidos.

## Lote B — Fluxos clínicos e prontuário

Automatizar `cadastro → agenda → chegada → triagem → medidas → atendimento → SOAP final → prescrição/documento → checkout`.

- Cobrir conflito de agenda, etapa inválida, duplicidade, queda de conexão e concorrência.
- Todo registro final precisa de autoria, data, versão, imutabilidade e adendo.
- Correções não podem sobrescrever silenciosamente a versão final.
- Cobrir exportação autorizada e negação por permissão.
- Cada passo deve refletir no Paciente 360, timeline e auditoria com paciente/tenant corretos.

Aceite: jornada persistida ponta a ponta; registro final somente aceita adendo; exportação obedece RBAC.

## Lote C — Backup, restore e continuidade

Automatizar exercício local com tenant `qa_`, prontuário, anexos de teste e financeiro local.

- Fazer backup/restauração em projeto isolado e comparar contagens, hashes, relações e RLS.
- Medir RPO/RTO para clínico, PII, documentos, financeiro e RBAC.
- Simular banco/storage indisponível, webhook atrasado e provedor fora.
- Validar mensagem segura, recuperação e fila de reconciliação.
- Executar dois restores bem-sucedidos antes do go-live.

Aceite: dados sintéticos e relações recuperados no RPO/RTO aprovado, sem cruzamento entre tenants.

## Lote D — Integrações operacionais

- Criar adaptadores internos para comunicação, fiscal e pagamento; UI não conhece payloads externos.
- Adicionar outbox, idempotência, retry exponencial, dead-letter queue e reconciliação.
- Cobrir timeout, 400/401/429/500, assinatura inválida, duplicidade, evento fora de ordem e retorno ambíguo.
- Sandbox usa somente contas segregadas e identidades fictícias.
- Decidir se há dispensação/administração de medicamentos; se houver, criar lote próprio para lote, validade, recall e rastreabilidade.

Aceite: falha é visível/recuperável, replay não duplica efeito e divergências aparecem na conciliação.

## Lote E — LGPD e governança

- Versionar inventário: finalidade, base legal, controlador, operador, retenção, compartilhamento e perfil de acesso.
- Automatizar consentimento/opt-out para marketing, comunidade, fotos e comunicações opcionais.
- Criar fluxos auditáveis para acesso, correção, exportação, revogação e exclusão/anônimização permitida.
- Nunca apagar registros sujeitos à guarda clínica.
- Automatizar revisão de privilégios, suporte/break-glass e exportações incomuns.
- Fazer tabletop trimestral de incidente com cenário sintético.

Aceite: pedido do titular tem estado, responsável, prazo e evidência; auditoria não expõe conteúdo clínico.

## Prompts reutilizáveis

### Prompt mestre

> Implemente somente o próximo lote pendente de `docs/AUTOMATED_REMEDIATION_EXECUTION_PLAN.md`. Use Supabase local, dados `qa_` sintéticos e não leia `.env` nem imprima segredos. Não chame provedores externos. Mapeie contratos antes de editar. Implemente scripts/testes idempotentes e a menor migration nova necessária. Execute `git diff --check`, `npm run type-check`, `npm run lint`, `npm run build` e os testes novos. Informe arquivos, cenários, evidências e bloqueios.

### Segurança/RLS

> Implemente o Lote A: seed/cleanup idempotentes para aliases `qa_`, negativos cross-tenant e portal/responsável. Recuse alvo remoto exceto staging isolado explicitamente confirmado. Não use dados reais, tokens fixos ou provedores externos.

### Prontuário

> Implemente o Lote B: audite SOAP, evolução, medida, prescrição e documento final. Garanta autoria, versão imutável e adendo. Automatize agenda-atendimento-prontuário e falhas transacionais. Não edite migrations históricas.

### Continuidade

> Implemente o Lote C em ambiente local isolado: seed, backup/restore de dados `qa_`, integridade e relatório agregado de RPO/RTO. Não acione produção. Documente todo passo manual inevitável.

### Integrações

> Implemente o Lote D sem chamar provedores: outbox, idempotência, retry, dead-letter e reconciliação; cubra timeout, assinatura inválida, duplicidade e eventos fora de ordem. Nunca registre payload sensível.

### LGPD

> Implemente o Lote E: inventário de tratamento, direitos do titular e consentimento/opt-out. Diferencie exclusão permitida de retenção clínica obrigatória. Não grave conteúdo clínico em `audit_logs`; testes usam dados `qa_`.

## Ordem e gates

1. Lote A precede todos os outros.
2. B e E podem avançar juntos após A; C começa com massa B estável.
3. D ativa sandbox somente após fixture, local e staging isolado aprovado.
4. Cada lote atualiza seu runbook e executa diff, type-check, lint, build e testes específicos.
5. Go/no-go exige aceites, dois restores, staging sem mock e aprovações clínica, técnica, operacional e LGPD.
