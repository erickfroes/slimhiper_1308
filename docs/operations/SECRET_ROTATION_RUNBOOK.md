# Runbook de rotacao de chaves e secrets

Escopo da PR 10.4: ordem segura, validacao e rollback para rotacao de chaves por
ambiente. Este documento nao contem valores reais e nao autoriza rotacao em
staging/producao sem janela aprovada, backup de configuracao redigido, plano de
rollback, owners presentes e evidencia redigida.

## Regras gerais

- Nunca ler, imprimir ou colar secrets reais em tickets, logs, terminal
  compartilhado, screenshots ou documentos.
- Rotacionar por ambiente, nesta ordem preferencial: local/preview descartavel,
  staging, producao.
- Separar chaves de local, preview, staging e producao; preview nao pode usar
  service role, callbacks ou provider credentials de producao.
- Validar consumidores antes da troca: Next.js runtime, Supabase Edge Functions,
  CI/CD, jobs, webhooks, monitoring e credenciais de suporte.
- Preferir rotacao com sobreposicao quando o provedor suporta duas chaves ativas;
  se nao suporta, planejar janela curta e rollback explicito.
- Confirmar que `NEXT_PUBLIC_*` contem apenas valores seguros para browser; nada
  de service role, webhook secret, provider token ou credencial de suporte.

## Fluxo padrao de rotacao

1. **Abrir plano:** secret alvo, ambiente, motivo, owner, janela, impacto,
   dependencias, ordem, rollback e checks.
2. **Inventariar consumidores:** localizar variaveis em templates/docs/codigo
   sem ler `.env` real; confirmar onde sao configuradas no provedor.
3. **Congelar mudancas relacionadas:** evitar deploys concorrentes, migrations,
   retries de webhook e alteracoes de provider durante a janela.
4. **Preparar rollback:** manter acesso ao secret anterior no cofre seguro pelo
   menor tempo necessario, registrar versao/config anterior sem expor valor.
5. **Aplicar nova chave:** atualizar cofre/ambiente/Edge Functions/CI conforme
   ordem do tipo de secret.
6. **Redeploy/restart controlado:** executar apenas os servicos que precisam
   recarregar secrets.
7. **Validar:** health, smoke read-only, webhook dummy/sandbox quando permitido,
   logs redigidos, dashboards e ausencia de erros 401/403/5xx anormais.
8. **Revogar antiga:** somente depois da validacao e janela de observacao.
9. **Registrar evidencia:** checks, horarios UTC, owners, resultado, rollback
   nao usado/usado e follow-up.

## Ordem por tipo de secret

| Secret                             | Consumidores                                                                | Ordem segura                                                                                                                        | Validacao                                                                                     | Rollback                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Supabase anon key                  | Browser/SSR anon, scripts read-only autorizados.                            | Criar/obter nova anon key, atualizar ambiente de app, redeploy, smoke anon/protegido, revogar antiga.                               | `/api/health`, `/auth/login`, redirects fail-closed, rotas protegidas sem dados expostos.     | Reaplicar anon anterior no ambiente e redeploy se revogacao antiga ainda nao ocorreu.                     |
| Supabase service role              | Edge Functions trusted, scripts operacionais autorizados, jobs server-side. | Atualizar primeiro cofres de Edge/jobs, redeploy functions/jobs, validar operacoes server-side read-only, revogar antiga.           | Health interno, Edge Function autorizada em sandbox, logs sem service role.                   | Reverter cofre para versao anterior e redeploy; se segredo vazou, nao reativar sem Security.              |
| JWT/Auth signing secret            | Supabase Auth/sessoes.                                                      | Planejar impacto de sessoes; comunicar janela; aplicar conforme suporte do provedor; invalidar sessoes quando necessario.           | Login, refresh, SSR guard, usuarios inativos/sem workspace, admin/clinic/patient fail-closed. | Seguir mecanismo oficial do provedor; rollback pode exigir nova invalidacao de sessoes.                   |
| Storage keys/policies              | Signed URL service, buckets privados, documentos.                           | Atualizar service credentials/policies, validar buckets privados e signed URLs curtas, revogar anterior.                            | Download autorizado, cross-tenant 403/404, bucket nao publico.                                | Reverter config/policy anterior apenas se nao houve exposicao.                                            |
| D4Sign tokens/crypt/webhook secret | Edge `d4sign-send-document`, `webhook-d4sign`.                              | Pausar envios, configurar nova credencial sandbox/prod no provider e Edge, testar assinatura dummy/sandbox autorizada, retomar.     | HMAC invalido negado, evento valido processado uma vez, envio sandbox quando autorizado.      | Reativar secret anterior no provider/Edge se nao comprometido; manter envios pausados se houver suspeita. |
| Asaas API/webhook secret           | Billing Edge Functions, `webhook-asaas`.                                    | Pausar criacao/retry de cobrancas, atualizar API key/webhook no provider e Edge, validar evento dummy/sandbox, retomar idempotente. | Signature failure negada, invoice/customer/subscription sandbox autorizados, sem duplicidade. | Reverter secret anterior se seguro; caso contrario manter criacao pausada e corrigir config.              |
| CI/CD deploy tokens                | GitHub/hosting/build/deploy.                                                | Criar token novo com escopo minimo, atualizar secret do CI, rodar workflow, revogar antigo.                                         | `npm ci`, type-check, lint, build, deploy/preview conforme ambiente.                          | Restaurar token antigo se nao comprometido; se comprometido, criar terceiro token.                        |
| Monitoring/alerting keys           | Logs, metrics, status page, alert channels.                                 | Atualizar sink/agent, enviar evento controlado nao sensivel, confirmar ack, revogar antiga.                                         | Alerta controlado recebido, severidade e owner corretos, sem payload sensivel.                | Reaplicar chave antiga se segura; senao usar canal manual temporario.                                     |
| Credenciais de suporte/break-glass | Admin/support users, SSO/MFA, cofre.                                        | Criar credencial temporaria, confirmar MFA/expiracao, revogar antiga, revisar audit log.                                            | Login autorizado, escopo minimo, expiracao e audit log revisavel.                             | Reativacao antiga apenas com aprovacao Security; preferir nova credencial.                                |

## Checklist de seguranca da janela

- [ ] Owner tecnico, Security/LGPD e owner operacional confirmados.
- [ ] Ambiente, secret alvo e consumidores listados sem valores reais.
- [ ] Freeze de deploy/migration/provider retries quando aplicavel.
- [ ] Plano de rollback documentado antes de aplicar mudanca.
- [ ] Evidencia de backup/config export redigida quando suportado.
- [ ] Validacoes e smoke definidos por ambiente.
- [ ] Secret antigo revogado apos validacao ou mantido apenas em cofre com prazo
      de expiracao aprovado.
- [ ] Tickets, screenshots e logs revisados para ausencia de secrets/PII/PHI.

## Evidencia de rotacao

Registre apenas metadados redigidos:

| Campo      | Exemplo seguro                                          |
| ---------- | ------------------------------------------------------- |
| Secret     | `SUPABASE_SERVICE_ROLE_KEY` em staging, sem valor.      |
| Motivo     | Rotacao periodica trimestral ou incidente S1.           |
| Janela     | Inicio/fim UTC e duracao.                               |
| Sistemas   | App, Edge Functions, CI, provider, monitoring.          |
| Checks     | Comandos/smokes, status, request ids redigidos.         |
| Resultado  | Sucesso, rollback, revogacao pendente com prazo.        |
| Aprovacoes | Nomes/roles internos ou IDs de ticket, sem credenciais. |

## Frequencia minima recomendada

| Classe                                           | Cadencia                                                        | Observacao                                                |
| ------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------- |
| Service role, provider API keys, webhook secrets | Trimestral ou apos qualquer suspeita.                           | Coordenar com janela e validacao sandbox/staging.         |
| CI/CD deploy tokens e monitoring keys            | Semestral ou por mudanca de equipe/escopo.                      | Escopo minimo e revogacao imediata de tokens antigos.     |
| Credenciais de suporte/break-glass               | Revisao mensal; credenciais temporarias expiram em horas.       | Remover usuarios sem necessidade atual.                   |
| Anon/public config                               | Quando provedor exige, suspeita de abuso ou mudanca de projeto. | Publico nao significa sem governanca; validar rate/abuso. |

## Relacao com outros runbooks

- `docs/operations/INCIDENT_RESPONSE_RUNBOOK.md`: quando rotacao e parte de
  resposta a incidente.
- `docs/operations/ROLLBACK_DAILY_OPERATIONS_RUNBOOK.md`: rollback tecnico,
  pausa de webhooks e checks diarios apos rotacao.
- `docs/operations/ENVIRONMENT_MATRIX.md` e `docs/operations/env-templates/`:
  nomes de variaveis e segregacao por ambiente.
- `docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md`: teste de alerta e
  verificacao de logs redigidos.
