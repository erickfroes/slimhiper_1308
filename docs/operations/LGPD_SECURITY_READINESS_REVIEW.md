# Revisao LGPD/Security E Readiness De Producao

Este documento consolida a PR 10.5 da Fase 10. Ele e um artefato operacional de
revisao final antes de habilitar dados reais, providers de producao ou promocao
para `production`.

> Status desta PR: **go/no-go tecnico = NO-GO ate assinatura humana e smokes de
> staging**. A branch entrega checklist, hardening de headers/build e relatorio
> de readiness, mas nao substitui revisao juridica/LGPD, DPO/encarregado,
> aprovacao contratual, smoke pos-deploy, restore testado ou validacao humana.

## Escopo Da Revisao

- Superficie de dados: PII/PHI, dados financeiros, documentos, comunicacoes,
  logs, auditoria, backups e exports.
- Acessos: staff clinico, admin plataforma, paciente, responsavel, suporte,
  break-glass, Edge Functions, service role e scripts trusted.
- Controles tecnicos: RBAC/RLS, SSR auth, cookies Supabase, headers/CSP, storage,
  signed URLs, webhook HMAC, idempotencia, rate limits e payload size.
- Operacao: ambientes segregados, observabilidade, alertas, backup/restore, DR,
  incidente, rollback, rotacao de secrets e evidencias redigidas.

Fora de escopo nesta branch:

- Chamar APIs reais de D4Sign/Asaas.
- Rodar `supabase db push`, migrations, bootstraps, restores ou scripts mutantes.
- Ler `.env` ou validar valores reais de secrets.
- Aprovar juridicamente politica de privacidade, termos, DPA ou contrato de
  operador.

## Inventario De Dados E Finalidade

| Superficie | Dados | Finalidade | Base legal a confirmar | Controlador/operador | Retencao/descarte | Exportacao/acesso |
| --- | --- | --- | --- | --- | --- | --- |
| Auth/perfil/membership | Identidade, e-mail, papel, tenant/unidade, status | Autenticacao, autorizacao e auditoria | Execucao de contrato, legitimo interesse e obrigacao legal conforme contrato | Clinica como controladora; SlimHiper como operador quando aplicavel | Enquanto contrato/obrigacoes vigentes; revogar/desativar acesso ao desligar | Admin/support auditado; titular via canal LGPD |
| Pacientes e `patient_pii` | Identificacao, contato, dados sensiveis de saude | Atendimento clinico, jornada e prontuario operacional | Saude/tutela da saude, execucao de contrato e consentimentos aplicaveis | Clinica controladora | Retencao clinica/legal definida por contrato; anonimizacao quando cabivel | Staff autorizado; exportacao redigida/autorizada |
| Paciente 360/prontuario/timeline | Eventos clinicos, exames, tarefas, check-ins | Continuidade do cuidado e operacao clinica | Saude e execucao de contrato | Clinica controladora | Conforme prontuario/contrato; descarte controlado | Staff autorizado; paciente/responsavel apenas escopo liberado |
| Documentos/D4Sign/storage | Templates, documentos gerados, metadados provider, PDFs | Geracao, assinatura e consulta permissionada | Execucao de contrato, consentimento quando aplicavel | Clinica controladora; D4Sign suboperador | Bucket privado; signed URL curta; descarte por politica documental | Staff autorizado e vinculos paciente/responsavel liberados |
| Financeiro/Asaas | Cobrancas, faturas, status, IDs provider | Faturamento, conciliacao e suporte | Execucao de contrato e obrigacoes legais/fiscais | Clinica controladora; Asaas suboperador | Conforme fiscal/contratual; payload bruto evitado | Staff financeiro/admin autorizado; portal somente contrato especifico |
| CRM | Lead, origem/campanha, opt-out, conversao | Prospeccao e relacionamento | Consentimento/legitimo interesse a validar por canal | Clinica controladora | Retencao de nao convertidos por politica; anonimizar/expirar | Reports agregados sem PII por padrao |
| Comunicacoes/chat | Mensagens, anexos, read receipts, moderacao | Comunicação operacional e jornada | Execucao de contrato/consentimento conforme canal | Clinica controladora | `retention_until`, moderacao e arquivamento | Staff/paciente/responsavel por escopo; conteudo moderado oculto |
| Relatorios/exports | Dados agregados e, quando permitido, operacionais | Gestao, auditoria e BI | Legitimo interesse/contrato; evitar PII desnecessaria | Clinica controladora | Export temporario e rastreado | Permissao explicita; evidencia sem PII |
| Logs/audit/observability | Eventos, request/correlation id, tenant pseudonimizado, severidade | Seguranca, diagnostico e auditoria | Legitimo interesse, seguranca e obrigacao legal | SlimHiper/clinica conforme contrato | Retencao operacional minima; nao logar payload bruto | Suporte/security com trilha auditavel |
| Backups/DR | Snapshots criptografados de dados autorizados | Recuperacao e continuidade | Obrigacao legal/contratual e seguranca | Operador custodiante | RPO/RTO e retencao por ambiente | Restore somente em janela aprovada e evidencias redigidas |

## RBAC/RLS E Acessos Privilegiados

Checklist final antes de producao:

- Staff clinico deve passar por SSR auth, membership ativa, tenant/unidade e
  permissao granular antes de acessar pacientes, agenda, documentos, financeiro,
  CRM, estoque, comunicacoes e relatorios.
- Admin plataforma deve consumir RPCs sanitizados e nao acessar payload bruto de
  provider ou PII clinica sem fluxo support/break-glass aprovado.
- Paciente/responsavel deve permanecer fail-closed exceto vinculos ativos e
  superficies explicitamente liberadas, como documentos released via Edge signed
  URL curta.
- Suporte/break-glass exige aprovacao, justificativa, janela, expiracao,
  auditoria e revisao pos-uso.
- Service role deve existir somente em Edge Functions, scripts trusted e jobs
  controlados que validam tenant/provider/contexto antes da operacao.
- Scripts Supabase mutantes, migrations, bootstraps, retries, restores e
  provider workflows exigem autorizacao explicita e plano de rollback.

Evidencias tecnicas ja existentes nos checkpoints incluem smokes de RLS
cross-tenant, linkage paciente/responsavel, Paciente 360, documentos,
financeiro, programas, comunicacoes, CRM/estoque e admin plataforma. Esses
smokes precisam ser reexecutados em ambiente autorizado antes do go-live.

## Logs, Erros E Evidencias

Nunca registrar em logs, tickets, PRs, screenshots ou runbooks preenchidos:

- secrets, tokens, cookies, JWTs, service-role keys, webhook secrets ou provider
  credentials;
- payload bruto D4Sign/Asaas, body de webhook, assinatura HMAC ou headers
  sensiveis;
- PII/PHI, texto livre clinico, nomes/e-mails/telefones reais, documentos ou
  dados financeiros identificaveis;
- storage path completo, signed URL, provider document/customer/invoice IDs
  atrelados a paciente real;
- exports, backups ou evidencias de restore com dados reais.

Padrao permitido: request/correlation id, ambiente, modulo, severidade, resultado,
latencia, contagens agregadas, codigos de erro estaveis e identificadores
pseudonimizados quando indispensavel.

## Hardening Tecnico Executado Nesta PR

- Build de producao deixa de publicar source maps por padrao; habilitacao exige
  `ENABLE_PRODUCTION_SOURCE_MAPS=true` e deve ser aprovada como excecao.
- `next build` volta a falhar em erro de TypeScript ou ESLint em vez de ignorar
  falhas silenciosamente.
- Headers globais deliberados foram adicionados: CSP, `Referrer-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`, `X-DNS-Prefetch-Control`,
  `Permissions-Policy` e HSTS em build de producao.
- A CSP preserva os scripts Rocket existentes, imagens remotas ja configuradas e
  conexoes Supabase por HTTPS/WSS; `unsafe-eval` fica restrito a builds nao
  produtivos para compatibilidade de desenvolvimento.

Excecoes aceitas nesta branch:

- `script-src 'unsafe-inline'` e `style-src 'unsafe-inline'` permanecem para
  compatibilidade com Next.js/App Router e estilos runtime ate existir projeto de
  nonce/hash CSP dedicado.
- Rocket continua permitido porque `src/app/layout.tsx` ja depende desses
  scripts e a governanca deles nao foi solicitada nesta PR.
- Rate limit de aplicacao nao foi introduzido globalmente; endpoints criticos
  seguem dependentes de Supabase/Auth, HMAC, idempotencia, provider sandbox e
  controles de infraestrutura/edge. Definir rate limiting gerenciado no hosting
  antes de go-live.

## Politicas, Titular E Contratos

Antes de liberar dados reais, owner humano deve anexar internamente evidencia de:

- politica de privacidade e termos aprovados para pacientes, responsaveis,
  clinicas e usuarios staff;
- DPA/contrato de operador entre SlimHiper e clinica, incluindo suboperadores,
  transferencia internacional, suporte, backup/DR e incidente;
- canal de direitos do titular com SLA, autenticacao do solicitante, triagem,
  exportacao, correcao, anonimização/eliminacao e negativa justificada;
- lista de suboperadores e regioes: Supabase, hosting/CI, monitoramento, D4Sign,
  Asaas, provedores de e-mail/SMS/WhatsApp se usados, e qualquer IA externa;
- processo de resposta a incidente alinhado ao runbook e criterio de comunicacao
  regulatoria/contratual.

## Readiness Go/No-Go

| Gate | Status desta PR | Proximo passo |
| --- | --- | --- |
| CI/local `type-check`, `lint`, `build`, `git diff --check` | Executado nesta branch | Bloquear merge se regredir |
| Headers/CSP/build hardening | Implementado | Validar em staging/browser por rota critica |
| Ambientes e secrets segregados | Documentado em PR 10.1 | Conferencia humana no gerenciador de secrets |
| Observabilidade e alertas | Documentado/implementado em PR 10.2 | Teste de alerta controlado em staging |
| Backup/restore/DR | Documentado em PR 10.3 | Restore em ambiente isolado com evidencia redigida |
| Incidente/rotacao/rollback/operacao | Documentado em PR 10.4 | Exercicio de mesa e revisao owner |
| Smokes Fases 1-9 + pos-deploy staging | Pendente neste ambiente | Rodar com Docker/Supabase/env autorizados |
| Politicas, DPA e canal LGPD | Pendente owner humano | Aprovar juridicamente antes de dado real |
| Provider producao D4Sign/Asaas | Nao autorizado | Habilitar somente apos go/no-go e rollback |

Decisao tecnica desta branch: **NO-GO para producao com dados reais** ate que os
itens pendentes acima tenham owner, data, evidencia redigida e assinatura humana.

## Registro De Aprovacao Humana

Preencher fora do Git ou em sistema interno de governanca, sem dados sensiveis:

- Release/tag/SHA:
- Ambiente:
- Owner tecnico:
- Owner LGPD/security/DPO:
- Owner juridico/contratual:
- Data/hora da revisao:
- Riscos residuais aceitos:
- Prazo de mitigacao:
- Plano de rollback validado:
- Decisao final: `GO` / `NO-GO`
- Assinaturas/aprovacoes:
