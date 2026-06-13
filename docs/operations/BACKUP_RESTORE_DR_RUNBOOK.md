# Backup, restore, disaster recovery e retencao

Escopo da PR 10.3: estrategia operacional para backup, restore isolado,
continuidade, disaster recovery e retencao/descarte de dados. Este runbook nao
autoriza `supabase db push`, migrations, restores, provider APIs, retries de
webhook, rotacao de chaves ou acesso a dados reais fora de janela aprovada.

## Pre-requisitos e limites de seguranca

- PR 10.1 precisa estar aplicada: CI bloqueante, matriz de ambientes, templates
  de variaveis, isolamento de previews e processo de release/rollback.
- PR 10.2 precisa estar aplicada: `/api/health`, logs estruturados redigidos,
  dashboard de observabilidade, alertas e smoke pos-deploy read-only.
- Fases 1-9 continuam gates antes de go-live: `type-check`, `lint`, `build`,
  `git diff --check`, smokes Supabase locais, smoke browser autenticado e
  evidencias de RLS/RBAC em ambiente autorizado.
- Evidencias de backup/restore devem redigir secrets, tokens, cookies,
  `SUPABASE_SERVICE_ROLE_KEY`, signed URLs, storage paths sensiveis, payloads
  brutos, documentos, PII/PHI e identificadores de pacientes/responsaveis.
- Restore em ambiente compartilhado, producao ou staging com dados reais exige
  plano de janela, owner humano, rollback, freeze de providers quando aplicavel
  e autorizacao explicita registrada.
- Preview e local nao podem receber dados reais identificaveis; use dados dummy
  ou anonimizados aprovados.

## Escopo de backup por superficie

| Superficie | Itens cobertos | Frequencia minima | Owner primario | Evidencia segura |
| --- | --- | --- | --- | --- |
| Banco Supabase/Postgres | Schema, dados tenant-scoped, RLS/RBAC, audit logs, fila operacional, tabelas de webhooks e relatorios. | PITR/backup continuo quando disponivel; snapshot diario; snapshot pre-release. | Data/Platform on-call | Timestamp UTC, projeto/ambiente redigido, duracao, tamanho agregado, status e checksum/manifest sem paths sensiveis. |
| Storage de documentos | PDFs gerados/assinados, anexos, arquivos de templates e objetos de buckets clinicos. | Snapshot diario ou replica controlada; inventario semanal. | Documents/Data owner | Contagem por bucket/classe, bytes agregados, politica de versionamento e amostra de permissao sem nomes/paths reais. |
| Edge Functions/configuracao | Codigo versionado, variaveis esperadas, secrets por ambiente, webhooks e URLs publicas. | Codigo por Git; manifesto de secrets a cada release; snapshot antes de rotacao. | Platform/Integrations owner | Commit/tag, lista de nomes de variaveis sem valores, versao da function e estado de deploy. |
| Audit logs | Eventos de suporte, break-glass, admin plataforma, memberships, documentos, billing e retencao. | Mesmo SLA do banco; export agregado mensal para compliance se aprovado. | Security/LGPD owner | Contagens por tipo/severidade, periodo, hash/manifest e confirmacao de imutabilidade operacional. |
| Artefatos de release | Tag, changelog, build/deploy logs redigidos, workflow CI, manifest de migracoes. | A cada release e rollback. | Release owner | Tag, commit, workflow id, checks, decisao go/no-go e motivo. |

## RPO/RTO por familia de dados

| Familia de dados | RPO alvo | RTO alvo | Prioridade de restore | Observacoes de consistencia |
| --- | --- | --- | --- | --- |
| Prontuario, PII/PHI e agenda clinica | <= 15 min | <= 4 h | 1 | Validar RLS/RBAC, tenant isolation, timeline clinica e ausencia de mocks em staging/producao. |
| Documentos gerados/assinados | <= 1 h | <= 8 h | 2 | Validar metadados no banco antes de liberar signed URLs; D4Sign pode operar em modo consulta/manual ate reconcilio. |
| Financeiro/Asaas | <= 15 min | <= 4 h | 1 | Reconciliar cobranças, invoices, subcontas e webhooks por idempotencia; nao reexecutar provider sem autorizacao. |
| Webhooks D4Sign/Asaas | <= 15 min | <= 6 h | 2 | Restaurar eventos e idempotency keys antes de reprocessar; retries externos ficam pausados ate go/no-go. |
| CRM/leads | <= 24 h | <= 24 h | 4 | Respeitar opt-out, base legal e retencao de leads nao convertidos. |
| Estoque/ledger | <= 1 h | <= 8 h | 2 | Restaurar ledger antes de saldos agregados; validar bloqueio de saldo negativo. |
| Relatorios/exports | <= 24 h | <= 24 h | 5 | Preferir recomputar exports; signed URLs e arquivos temporarios podem expirar conforme politica. |
| Logs operacionais/observabilidade | <= 24 h | <= 24 h | 5 | Manter contagens e alertas; nao restaurar logs com payload bruto indevido. |
| Audit logs e compliance | <= 15 min | <= 8 h | 1 | Preservar trilha de suporte/break-glass/admin; evidencias devem ser redigidas. |

## Roteiro de restore isolado

Use este roteiro para teste periodico ou restore emergencial em projeto limpo. Em
producao, execute apenas apos autorizacao explicita e janela aprovada.

Para exercicio local schema-only, sem dados reais e sem persistir dump, use:

```bash
node scripts/operations/run-local-restore-drill.mjs
```

O drill cria um banco temporario dentro do container Supabase local, restaura
schemas `auth`, `public`, `security` e `storage`, valida contagens agregadas de
tabelas, policies e funcoes, e remove o banco temporario ao final. Ele nao
substitui restore de snapshot/PITR em staging/ambiente isolado com owner humano,
mas prova que o schema versionado restaura sem depender de dados reais.

1. **Abrir controle de mudanca**
   - Definir ambiente alvo isolado, owner, janela, criterio de abortar, RPO/RTO
     esperado e plano de comunicacao.
   - Congelar providers quando aplicavel: webhooks D4Sign/Asaas em modo
     pausado/sandbox/dummy, sem retries mutantes.
2. **Preparar projeto limpo**
   - Criar Supabase project/banco/buckets isolados e sem dados reais em preview.
   - Aplicar variaveis dummy ou segregadas pelo gerenciador de secrets; registrar
     somente nomes das variaveis.
   - Confirmar `NEXT_PUBLIC_USE_MOCK_DATA=false` em staging/restore real e que
     nenhuma service role de producao esta em preview/local.
3. **Restaurar schema e dados**
   - Restaurar snapshot/PITR do banco conforme procedimento Supabase aprovado.
   - Se o restore for para teste, mascarar ou anonimizar PII/PHI antes de expor
     a qualquer usuario que nao tenha autorizacao de dados reais.
   - Validar migrations esperadas, extensoes, grants, RLS enabled e funcoes RPC.
4. **Restaurar storage**
   - Restaurar buckets, objetos e metadados; preservar privacidade dos buckets
     clinicos.
   - Nao registrar paths completos ou signed URLs em evidencias.
   - Recriar policies/ownership e validar leitura negada para usuarios anonimos.
5. **Reaplicar configuracao segura**
   - Reaplicar secrets segregados/dummy, URLs de app, webhooks sandbox e versoes
     de Edge Functions do commit/tag escolhido.
   - Validar `/api/health` e dashboard `/admin/observability` sem exibir dados
     sensiveis.
6. **Checks de integridade**
   - Rodar checks read-only e smokes autorizados: `git diff --check`, CI/build do
     commit, smoke pos-deploy, contratos de RLS/RBAC, health e rotas protegidas.
   - Conferir contagens agregadas por tabela/bucket, idempotency keys de
     webhooks, saldos financeiros/estoque e documentos pendentes.
7. **Go/no-go**
   - Comparar resultado com RPO/RTO, divergencias e riscos residuais.
   - Registrar decisao, owner, timestamp UTC, checks executados e proximas acoes
     no template de evidencia redigida.
8. **Encerrar ambiente isolado**
   - Revogar acessos temporarios, destruir dados de teste quando aplicavel,
     remover secrets dummy que nao serao reutilizados e arquivar evidencia
     redigida.

## Checks minimos de integridade pos-restore

| Check | Tipo | Criterio de aceite | Observacao |
| --- | --- | --- | --- |
| Health de app | Read-only | `/api/health` `ok` ou `degraded` justificado; nunca `fail` em go-live. | Deve incluir request/correlation id. |
| Auth fail-closed | Read-only | Rotas protegidas redirecionam anonimo para login ou retornam forbidden esperado. | Sem cookies reais em evidencia. |
| RLS cross-tenant | Read-only/mutante somente local autorizado | Tenant A nao le/edita tenant B em familias clinicas, docs, billing, chat, reports, CRM e estoque. | Usar usuarios dummy. |
| RBAC admin/suporte | Read-only | Staff sem permissao nao acessa admin plataforma, break-glass ou dados financeiros sensiveis. | Registrar apenas roles/permissoes. |
| Storage privado | Read-only | Objetos clinicos nao sao publicos; signed URLs curtas exigem permissao. | Nao imprimir URL. |
| Webhooks/idempotencia | Read-only | Eventos restaurados preservam provider_event_id/idempotency keys e status. | Nao reenviar provider sem autorizacao. |
| Financeiro | Read-only | Invoices, pagamentos e divergencias batem com snapshot agregado aprovado. | IDs externos redigidos. |
| Estoque | Read-only | Ledger reconcilia saldo por lote/local; saldo negativo segue bloqueado. | Usar contagens agregadas. |
| Audit logs | Read-only | Eventos sensiveis existem por periodo/tipo e sem payload bruto indevido. | Verificar retention_until quando existir. |

## Evidencia redigida de teste de restore

Para cada teste, registrar em `docs/operations/BACKUP_RESTORE_EVIDENCE_TEMPLATE.md`
ou em sistema interno equivalente:

- ambiente origem e destino redigidos;
- timestamp UTC do backup e do restore;
- owner, aprovador, janela e motivo;
- RPO/RTO alvo vs. medido;
- checks executados e status;
- divergencias, dados descartados/recomputados e riscos residuais;
- decisao go/no-go e follow-ups;
- confirmacao de que nenhuma evidencia contem secret, PII/PHI, payload bruto,
  signed URL ou storage path sensivel.

Cadencia minima: antes do go-live, a cada trimestre em staging/ambiente isolado,
apos mudancas relevantes de schema/storage/provider e apos incidente S1/S2 que
envolva disponibilidade ou integridade de dados.

## Politica de retencao e descarte

| Classe de dado | Retencao padrao | Descarte/anonimizacao | Owner | Observacao |
| --- | --- | --- | --- | --- |
| Backups de banco com dados reais | PITR conforme plano contratado; snapshots diarios por 30 dias; mensais por 12 meses, salvo exigencia contratual maior. | Expurgo seguro pelo provedor; acesso somente on-call autorizado. | Data/Platform | Ajustar por contrato clinico e legislacao aplicavel antes de producao. |
| Backups de storage clinico | Diarios por 30 dias; mensais por 12 meses; documentos assinados conforme contrato/obrigacao legal. | Remocao segura ou preservacao legal quando exigida. | Documents/LGPD | Nunca tornar buckets publicos para restore. |
| Logs operacionais | 90 dias para logs detalhados redigidos; agregados por 12 meses. | Expurgo automatico; manter apenas metricas agregadas. | Observability | Logs nao devem conter PII/PHI ou payload bruto. |
| Payloads/resumos de webhooks | Resumo operacional e hash/idempotency enquanto necessario para auditoria; payload bruto deve ser evitado. | Redigir/descartar payload bruto; manter status, ids redigidos/hash e timestamps. | Integrations/Security | Asaas e D4Sign continuam fail-closed e idempotentes. |
| Leads nao convertidos | 180 dias apos ultima interacao ou opt-out imediato, salvo base legal documentada. | Anonimizacao/expurgo por helper de retencao autorizado. | CRM/LGPD | Conforme runbook de CRM/estoque. |
| Anexos clinicos e documentos gerados | Conforme obrigacao clinica/contratual; temporarios expiram em ate 30 dias. | Expurgo de temporarios; preservacao de documentos legais quando aplicavel. | Clinical/Documents | Signed URLs sempre curtas. |
| Audit logs | Minimo 5 anos ou prazo contratual/legal maior. | Preservar integridade; expurgo apenas com aprovacao LGPD/security. | Security/LGPD | Necessario para suporte/break-glass/admin. |
| Exports e relatorios baixados | Temporarios por ate 7 dias; relatorios recomputaveis preferem nao persistir arquivo. | Expurgo automatico de arquivo e signed URL. | Reports/Data | Manter audit log do export, nao o arquivo quando possivel. |
| Evidencias de restore/incidente | 5 anos para S1/S2; 12 meses para exercicios sem incidente. | Arquivar redigido; remover anexos sensiveis. | Security/Operations | Evidencia deve conter apenas dados agregados. |

## Disaster recovery e modo degradado seguro

| Cenario | Severidade inicial | Acoes imediatas | Modo degradado seguro | Comunicacao |
| --- | --- | --- | --- | --- |
| Banco Supabase indisponivel ou corrompido | S1 | Acionar on-call, congelar writes, avaliar PITR/snapshot, preservar evidencias. | App mostra indisponibilidade operacional; bloquear writes clinicos/financeiros; orientar registro manual temporario aprovado. | Status page/canal cliente com impacto e ETA; updates a cada 30 min. |
| Storage/documentos indisponiveis | S2/S1 se impactar cuidado critico | Bloquear novas assinaturas/downloads, validar buckets e signed URL service. | Prontuario continua sem anexos; documentos pendentes ficam em fila; sem expor buckets publicos. | Avisar clinicas afetadas e owner documental. |
| Edge Functions/webhooks falhando | S2 | Pausar retries externos quando possivel, verificar assinatura/idempotencia, manter eventos em backlog. | App continua leitura; acoes dependentes de provider entram como pendentes. | Integrations on-call informa janela de normalizacao. |
| Vercel/hosting indisponivel | S1 | Rollback/redeploy, validar DNS, checar CI/deploy e health externo. | Se banco estiver integro, manter plano manual de atendimento e comunicacao. | Status page e clientes com workaround operacional. |
| D4Sign indisponivel | S2 | Pausar envio de novos documentos, manter gerados localmente como pendentes. | Geracao interna continua; assinatura fica pendente sem reenvio automatico. | Clinicas recebem aviso de atraso documental. |
| Asaas indisponivel/divergente | S2 | Pausar criacao/retry de cobrancas, preservar ledger local, reconciliar quando voltar. | Financeiro exibe estado pendente/degradado; evitar duplicidade de cobranca. | Financeiro/on-call comunica risco e ETA. |
| Jobs operacionais atrasados | S3/S2 | Verificar fila, lock, ultima execucao e logs redigidos. | Dados continuam visiveis; automacoes atrasadas aparecem no dashboard. | Owner operacional acompanha ate voltar ao SLA. |
| Exposicao de dados em backup/log | S1 | Isolar evidencia/sink, revogar acesso, iniciar incidente LGPD, planejar rotacao. | Suspender compartilhamento de evidencias e exports ate revisao. | Security/LGPD define comunicacao legal. |

## Responsabilidades

- **Incident commander:** coordena S1/S2, comunicacao e decisao go/no-go.
- **Data/Platform on-call:** executa restore tecnico autorizado e valida banco,
  storage, CI/deploy e health.
- **Security/LGPD owner:** aprova redacao, preservacao de evidencias, retencao,
  descarte e comunicacoes legais.
- **Integrations owner:** coordena D4Sign/Asaas, webhooks, idempotencia e pausa
  de retries/providers.
- **Clinical/Finance owner:** valida impacto operacional e aceita divergencias
  residuais de prontuario, agenda, documentos e cobrancas.
- **Release owner:** relaciona restore/DR a tag, changelog, rollback e gates de
  release.

## Relacao com outros runbooks

- `docs/operations/ENVIRONMENT_MATRIX.md`: segregacao de ambientes, owners,
  dados permitidos e retencao de logs.
- `docs/operations/RELEASE_PROCESS.md`: tag, checklist, smoke pos-deploy,
  rollback e criterios de abortar promocao.
- `docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md`: health, alertas,
  severidades, ack e dashboard operacional.
- `docs/integrations/D4SIGN_RUNBOOK.md` e
  `docs/integrations/ASAAS_BILLING_RUNBOOK.md`: contratos de provider e
  restricoes para webhooks/retries.
- `docs/CRM_INVENTORY_GOVERNANCE_RUNBOOK.md` e runbooks Supabase: retencao de
  CRM, estoque, comunicacoes, documentos, programas e RBAC.
