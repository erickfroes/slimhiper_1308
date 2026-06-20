# Matriz de Ambientes e Variaveis

Este documento define os ambientes permitidos para a Fase 10 / PR 10.1. Ele nao
contem valores reais e deve ser usado em conjunto com `.env.example`, secrets do
provedor de CI/CD e configuracao segura do hosting/Supabase.

## Regras globais

- Nunca reutilizar service role, tokens de webhook, chaves D4Sign/Asaas/Mercado Pago ou
  credenciais de monitoramento entre `preview`, `staging` e `production`.
- `NEXT_PUBLIC_*` so pode conter valores seguros para navegador. Nenhuma chave
  service-role, webhook secret, token de provider, cookie, URL assinada ou dado
  de paciente pode usar esse prefixo.
- `NEXT_PUBLIC_USE_MOCK_DATA=true` e permitido apenas em `local` e em previews
  descartaveis rotulados como dummy. O valor deve ser `false` ou ausente em
  `staging` e `production`.
- Previews devem usar dados dummy/anonimizados, projetos Supabase isolados,
  callbacks de provider desabilitados ou apontados para sandbox dummy, e nunca
  service-role de producao.
- Evidencias de release devem redigir secrets, tokens, cookies, PII/PHI,
  payloads brutos de provider, paths sensiveis de storage e signed URLs.

## Matriz operacional

| Ambiente     | Owner primario                                | URL esperada              | Dados permitidos                                                                            | Branch/promocao                                              | Retencao de logs                                                                   | Variaveis permitidas                                                                                                                          |
| ------------ | --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`      | Engenheiro responsavel pela tarefa            | `http://localhost:4028`   | Dummy local, fixtures e dados sinteticos. Dados reais sao proibidos.                        | Branch de trabalho. Sem promocao automatica.                 | Curta; limpar logs locais antes de compartilhar evidencias.                        | Publicas locais, anon local, service role local somente em scripts/Edge Functions trusted. Provider sandbox apenas com autorizacao explicita. |
| `preview`    | Autor da PR + reviewer tecnico                | URL efemera do hosting/CI | Dummy/anonimizado. Sem callbacks reais.                                                     | PR branch; destruivel apos review.                           | Curta, suficiente para debug da PR; sem payload sensivel.                          | `NEXT_PUBLIC_*` seguros, anon/URL de Supabase preview, secrets backend de preview. Service role de producao proibida.                         |
| `staging`    | Release owner + owner de seguranca/operacao   | URL fixa de staging       | Dados dummy realistas ou dados anonimizados aprovados. Sem dado clinico real identificavel. | Promocao controlada a partir de `main` ou release candidate. | Retencao operacional definida no runbook de observabilidade; evidencias redigidas. | Chaves segregadas de staging, provider sandbox, webhook sandbox/dummy, service role staging apenas backend/Edge/jobs. Mock desabilitado.      |
| `production` | Owner humano de producao + suporte de plantao | URL publica oficial       | Dados reais autorizados conforme contrato/LGPD.                                             | Tag/versionamento aprovado apos staging go/no-go.            | Conforme politicas LGPD/contratuais e runbooks de backup/observabilidade.          | Somente chaves de producao segregadas. Service role apenas backend/Edge/jobs controlados. Mock desabilitado.                                  |

## Template de variaveis por ambiente

Arquivos versionados sem valores reais estao em `docs/operations/env-templates/` para `local`, `preview`, `staging` e `production`. Eles servem apenas como checklist de nomes; copie para o gerenciador de secrets do ambiente e mantenha valores fora do Git.

Preencher no gerenciador de secrets do ambiente, nunca em Git. Valores abaixo
sao nomes e finalidade; mantenha vazios em templates versionados.

### Publicas seguras (`NEXT_PUBLIC_*`)

| Variavel                               | Local                   | Preview                         | Staging             | Production             | Observacao                                                 |
| -------------------------------------- | ----------------------- | ------------------------------- | ------------------- | ---------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Projeto local           | Projeto preview                 | Projeto staging     | Projeto production     | URL publica do projeto correspondente.                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon local  | Preview                         | Staging             | Production             | Chave publica anon/publishable, nunca service role.        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | Anon local              | Preview                         | Staging             | Production             | Manter por compatibilidade enquanto referencias existirem. |
| `NEXT_PUBLIC_USE_MOCK_DATA`            | `true` ou `false`       | `true` apenas se dummy rotulado | `false`/ausente     | `false`/ausente        | Gate de producao: nunca habilitar com dados reais.         |
| `NEXT_PUBLIC_SITE_URL`                 | `http://localhost:4028` | URL preview                     | URL staging         | URL oficial            | Usada para links/redirects publicos.                       |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`        | Vazio                   | Vazio/dummy                     | Staging se aprovado | Production se aprovado | Publica, mas deve seguir consentimento/privacidade.        |
| `NEXT_PUBLIC_ADSENSE_ID`               | Vazio                   | Vazio                           | Vazio               | Se aprovado            | Nao configurar em superficies clinicas sem revisao.        |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`   | Vazio/dummy             | Vazio/dummy                     | Sandbox             | Production se usado    | Publica; nao substitui gateway backend.                    |

### Backend, scripts e Edge Functions

| Variavel                         | Ambientes permitidos                                    | Observacao                                                                                         |
| -------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                   | Todos, segregado                                        | Backend/scripts/Edge do projeto do ambiente.                                                       |
| `SUPABASE_ANON_KEY`              | Todos, segregado                                        | Server-side anon/session-scoped quando necessario.                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`      | Local/preview/staging/production segregados             | Apenas scripts trusted, Edge Functions e jobs controlados; nunca browser.                          |
| `SUPABASE_BOOTSTRAP_PASSWORD`    | Local/staging controlado                                | Nao usar contra producao sem janela autorizada.                                                    |
| `SUPABASE_BOOTSTRAP_TENANT_SLUG` | Local/staging controlado                                | Dummy/tenant tecnico.                                                                              |
| `SUPABASE_BOOTSTRAP_TENANT_NAME` | Local/staging controlado                                | Dummy/tenant tecnico.                                                                              |
| `TEST_ACCESS_TOKEN`              | Local/staging smoke                                     | Token curto, redigido em logs.                                                                     |
| `TEST_PATIENT_ID`                | Local/staging smoke                                     | ID dummy/anonimizado.                                                                              |
| `TEST_TEMPLATE_ID`               | Local/staging smoke                                     | Template dummy.                                                                                    |
| `ENABLE_PRODUCTION_SOURCE_MAPS`  | Preview/staging/production somente com excecao aprovada | `true` publica source maps de producao; manter vazio/`false` por padrao e registrar justificativa. |

### Providers e webhooks

| Variavel                         | Ambientes permitidos                                                    | Observacao                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `D4SIGN_TOKEN_API`               | Local/staging sandbox; production somente apos go/no-go                 | Nunca imprimir. Sandbox e production segregados.                                                    |
| `D4SIGN_CRYPT_KEY`               | Local/staging sandbox; production somente apos go/no-go                 | Secret backend/Edge only.                                                                           |
| `D4SIGN_BASE_URL`                | Local/staging sandbox; production                                       | Base sandbox/production por ambiente.                                                               |
| `D4SIGN_SAFE_UUID`               | Local/staging sandbox; production                                       | Cofre do ambiente; nao reutilizar producao em preview.                                              |
| `D4SIGN_FOLDER_UUID`             | Local/staging sandbox; production                                       | Pasta/cofre segregado.                                                                              |
| `D4SIGN_AUTO_DISCOVER_SAFE`      | Local/staging sandbox                                                   | Opt-in operacional; nao ativar em producao sem runbook.                                             |
| `D4SIGN_WEBHOOK_TOKEN`           | Staging/production segregados                                           | Usar apenas em endpoints do ambiente.                                                               |
| `D4SIGN_WEBHOOK_HMAC_SECRET`     | Staging/production segregados                                           | Rotacao conforme runbook de incidentes.                                                             |
| `ASAAS_API_KEY`                  | Local/staging sandbox; production somente apos go/no-go                 | Nunca misturar sandbox/producao.                                                                    |
| `ASAAS_BASE_URL`                 | Local/staging sandbox; production                                       | Base por ambiente.                                                                                  |
| `ASAAS_WEBHOOK_TOKEN`            | Staging/production segregados                                           | Validacao fail-closed.                                                                              |
| `MERCADOPAGO_ACCESS_TOKEN`       | Local/staging com credencial de teste; production somente apos go/no-go | Secret server/Edge only. Nunca `NEXT_PUBLIC_*`.                                                     |
| `MERCADOPAGO_BASE_URL`           | Local/staging/production                                                | Default esperado: `https://api.mercadopago.com`; validar credencial de teste antes de sandbox real. |
| `MERCADOPAGO_WEBHOOK_SECRET`     | Staging/production segregados                                           | Usado para validar `x-signature` fail-closed.                                                       |
| `MERCADOPAGO_NOTIFICATION_URL`   | Staging/production por ambiente                                         | URL publica do webhook configurada no provider.                                                     |
| `MERCADOPAGO_PUBLIC_KEY`         | Somente se SDK/frontend futuro for aprovado                             | Publica, mas nao necessaria para Checkout Pro redirect MVP.                                         |
| `MERCADOPAGO_CLIENT_ID`          | Marketplace/OAuth somente se aprovado                                   | Server/admin config; nao requerido no MVP single-seller.                                            |
| `MERCADOPAGO_CLIENT_SECRET`      | Marketplace/OAuth somente se aprovado                                   | Secret server-only.                                                                                 |
| `MERCADOPAGO_OAUTH_REDIRECT_URL` | Marketplace/OAuth somente se aprovado                                   | URL de callback segregada por ambiente.                                                             |

### Provedores opcionais de IA

| Variavel             | Ambientes permitidos                      | Observacao                                                     |
| -------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| `OPENAI_API_KEY`     | Backend controlado por ambiente, se usado | Nunca `NEXT_PUBLIC_*`; sem envio de PII/PHI sem base aprovada. |
| `GEMINI_API_KEY`     | Backend controlado por ambiente, se usado | Mesmo criterio de redacao e finalidade.                        |
| `ANTHROPIC_API_KEY`  | Backend controlado por ambiente, se usado | Mesmo criterio de redacao e finalidade.                        |
| `PERPLEXITY_API_KEY` | Backend controlado por ambiente, se usado | Mesmo criterio de redacao e finalidade.                        |
