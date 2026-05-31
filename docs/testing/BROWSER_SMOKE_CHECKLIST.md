# Browser Smoke Checklist

Checklist operacional para validar rotas criticas no navegador antes de uma
release ou PR com mudanca de UI. Este documento registra o roteiro; resultados
de uma execucao especifica devem ir para `docs/testing/BASELINE_CHECKS.md` ou
para o resumo do PR.

## Regras De Seguranca

- Nao usar pacientes reais, payloads provider reais, tokens, cookies ou
  credenciais em evidencias.
- Nao chamar D4Sign, Asaas, Supabase mutating scripts, `supabase db push` ou
  bootstraps sem autorizacao explicita.
- Preferir ambiente local/sandbox segregado e fixtures anonimizadas.
- Se `NEXT_PUBLIC_USE_MOCK_DATA=true` for usado, registrar que o smoke validou
  UX, nao contrato de producao.

## Setup

1. Rodar `npm run dev`.
2. Abrir `http://localhost:4028`.
3. Confirmar que nao ha tela branca, overlay de framework ou erro de console.
4. Quando houver sessao de teste autorizada, validar os caminhos autenticados
   por role.

## Status De Resultado

- `pass`: rota e interacao principal funcionaram.
- `fail`: rota quebrou, exibiu overlay, erro de console relevante ou estado
  incorreto.
- `blocked`: falta sessao, seed, permissao ou ambiente autorizado.
- `skipped`: fora do escopo do PR, com justificativa registrada.

## Limites Conhecidos

- Se o in-app Browser nao conseguir digitar por falta do clipboard virtual,
  marcar interacoes de login/formulario como `blocked` e complementar com
  smoke HTTP/RPC autenticado local. Nao marcar a interacao visual como `pass`
  ate ela ser executada no Browser.

## Rotas Clinicas

| Rota | Perfil minimo | Validar |
| --- | --- | --- |
| `/auth/login` | anonimo | Loading, erro de credencial, foco, acessibilidade basica e redirecionamento por role. |
| `/clinic/dashboard` | staff clinico | KPIs, fila, agenda, alertas, quick actions, empty/error backend e sem fallback silencioso. |
| `/clinic/patients` | `patients.read` | Lista, busca, filtro, empty, error, retry e acao de novo paciente quando habilitada. |
| `/clinic/patients/[patientId]` | `patients.read` | Paciente 360, abas, loading/error por aba e forbidden por permissao. |
| `/clinic/patients/[patientId]/encounter` | `encounters.read` | Abrir atendimento, rascunho, finalizar SOAP, timeline e bloqueio sem permissao. |
| `/clinic/agenda` | `agenda.read` | Criar/editar quando habilitado, alterar status, cancelar, fila, timezone e estados vazios. |
| `/clinic/documents` | `documents.read` | Templates, gerar documento, signed URL, erro de permissao e falha provider sem payload sensivel. |
| `/clinic/financeiro` | `financial.read` | Resumo, cobrancas, inadimplencia, conciliacao, loading/error/forbidden. |
| `/clinic/programs` | `packages.read` | Lista, empty/error, builder, publicar/enrollment quando habilitado. |
| `/clinic/settings` | tenant admin | Snapshot real, salvar unidade, salvar preferencias/integracoes sem secrets, equipe/roles reais em leitura; convite e alteracao de role ficam blocked ate mutators auditados. |

## Rotas Admin E Portal

| Rota | Perfil minimo | Validar |
| --- | --- | --- |
| `/admin` | platform admin | Guard de plataforma, dashboard real ou erro claro. |
| `/admin/tenants` | platform admin | Listagem, detalhe, filtros, usuarios, unidades e estados de erro. |
| `/admin/webhooks` | platform admin | Eventos unificados, filtros, retry/triagem, permissao e payload redigido. |
| `/patient` | patient linked | Bloqueado ate linkage; depois dados limitados ao proprio paciente. |

## Evidencia Sugerida

```text
Date:
Branch:
Commit:
Environment:
Dev server:
Auth/session:
Routes checked:
Results:
Blocked/skipped:
Console errors:
Screenshots or notes:
Residual risk:
```
