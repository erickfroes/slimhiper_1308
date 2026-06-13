# Processo de Release e Gates de Promocao

Este runbook cobre a PR 10.1 da Fase 10: CI/CD, qualidade e ambientes. Ele nao
autoriza push de banco, migracoes em ambiente compartilhado, chamadas a
providers, restore, retries de webhook ou rotacao de chaves sem uma janela
aprovada e rollback documentado.

## Pre-requisitos antes de abrir promocao

1. Confirmar que Fases 1-9 possuem evidencias locais registradas no checkpoint:
   `type-check`, `lint`, `build`, `git diff --check`, smokes Supabase locais
   quando ambiente Docker/Postgres estiver disponivel e browser smoke obrigatorio
   marcado como gate de release quando ainda nao executado.
2. Confirmar que a branch nao depende de `NEXT_PUBLIC_USE_MOCK_DATA=true` para
   `staging` ou `production`.
3. Confirmar que variaveis de ambiente seguem a matriz em
   `docs/operations/ENVIRONMENT_MATRIX.md` e que nenhum secret real foi
   versionado.
4. Confirmar que migrations novas foram revisadas, possuem rollback/roll-forward
   planejado e so serao aplicadas em janela autorizada.
5. Confirmar que callbacks reais D4Sign/Asaas permanecem congelados ou apontam
   para sandbox/dummy ate o go/no-go humano.
6. Executar a auditoria read-only de readiness e anexar o resumo na evidencia:
   `node scripts/operations/check-production-readiness.mjs`. Use `--strict`
   quando a release candidate exigir que qualquer aviso bloqueie a promocao.

## Gates obrigatorios de CI

O workflow `.github/workflows/ci.yml` bloqueia merge quando qualquer gate abaixo
falha:

- `npm ci` para instalar exatamente o lockfile.
- `git diff --check` contra a base correta de PR/push.
- `npm run type-check`.
- `npm run lint`.
- `npm run build`.
- Contratos fixture de Patient 360, D4Sign e Billing.

Smokes locais que dependem de Docker/Supabase sao condicionais. Eles ficam
explicitamente skipped por padrao e so rodam via `workflow_dispatch` com
`run_local_supabase_smokes=true`, em runner autorizado e com secrets dummy do
ambiente apropriado.

## Fluxo de versao, tag e changelog

1. Criar release candidate a partir de `main` apos CI verde.
2. Atualizar changelog/release notes com:
   - escopo funcional;
   - migrations planejadas;
   - Edge Functions alteradas;
   - flags/configuracoes alteradas;
   - riscos residuais;
   - owners e janela de deploy.
3. Usar tag semantica `vMAJOR.MINOR.PATCH` ou tag de release candidate
   `vMAJOR.MINOR.PATCH-rc.N` conforme decisao humana.
4. Associar commit SHA, workflow run, ambiente alvo, owner e aprovadores.
5. Nunca colocar secrets, IDs de paciente, signed URLs, payloads brutos ou
   provider IDs sensiveis no changelog publico.

## Checklist de migracoes e deploy

- [ ] Migrations revisadas em ordem cronologica sem editar historico antigo.
- [ ] `supabase migration up --local --include-all` executado em ambiente local
      autorizado ou pendencia justificada por indisponibilidade Docker/Postgres.
- [ ] Plano de rollback/roll-forward aprovado por owner tecnico.
- [ ] Janela de aplicacao em staging/producao aprovada.
- [ ] Backups/restore recentes verificados conforme runbook da PR 10.3 quando
      existir.
- [ ] Edge Functions e variaveis do ambiente alvo conferidas sem imprimir
      valores.
- [ ] Provider webhooks congelados, sandbox/dummy ou monitorados conforme risco.

## Smoke pos-deploy de staging

Executar com dados dummy/anonimizados e evidencias redigidas:

- `node scripts/observability/post-deploy-smoke.mjs --base-url <staging-url>`
  para health/login e redirects fail-closed.
- `node scripts/observability/staging-authenticated-browser-smoke.mjs --base-url
  <staging-url>` com usuarios dummy clinic/admin/patient para login real via UI,
  rotas criticas, busca, portal paciente, overlay, console e responsividade.
- `node scripts/operations/run-local-restore-drill.mjs` antes da promocao para
  provar restore schema-only local sem dados reais.
- `node scripts/operations/run-local-alert-rollback-drill.mjs --base-url
  <staging-url>` em staging para ensaiar alerta controlado e rollback/tabletop
  sem mutacao Git/deploy.
- `/auth/login` responde 200 e fluxo anonimo nao revela dados.
- Rotas clinicas principais redirecionam/403 sem sessao e carregam com usuario
  dummy autorizado.
- Admin plataforma bloqueia usuario sem permissao e carrega resumo sanitizado
  com usuario autorizado.
- Portal paciente continua fail-closed ou usa contrato portal-scoped quando
  liberado.
- Webhooks D4Sign/Asaas usam modo sandbox/dummy e validacao fail-closed.
- Edge Functions criticas respondem envelopes esperados sem payload sensivel.
- Relatorios/export usam dados dummy e nao vazam custo/PII sem permissao.

## Rollback e criterios de abortar promocao

Abortar promocao e acionar rollback quando qualquer item ocorrer:

- CI obrigatorio falha ou foi bypassado sem aprovacao humana registrada.
- `NEXT_PUBLIC_USE_MOCK_DATA=true` aparece em staging/producao.
- Secret de producao aparece em preview/local ou em log de CI.
- Migration falha sem caminho claro de roll-forward seguro.
- Auth/RLS retorna 200 onde o esperado era 401/403/404 fail-closed.
- Webhook real dispara contra ambiente errado ou assinatura/HMAC falha.
- Smoke pos-deploy encontra tela em branco, erro 5xx, vazamento de PII/PHI,
  signed URL, provider payload bruto ou divergencia financeira/clinica critica.

Rollback tecnico minimo:

1. Congelar novas promocoes e webhooks de provider quando aplicavel.
2. Reverter deploy para ultimo artefato verde.
3. Nao fazer rollback destrutivo de migration sem plano aprovado; preferir
   roll-forward corretivo quando houver dados reais.
4. Registrar evidencia redigida, owner, decisao e follow-up.

## Evidencia de release

Para cada release, anexar internamente:

- link do workflow CI verde;
- comandos locais executados e resultado;
- ambiente, SHA, tag e owner;
- checklist de variaveis revisado sem valores;
- smoke pos-deploy redigido;
- template `docs/operations/STAGING_GO_LIVE_EVIDENCE_TEMPLATE.md` preenchido
  com evidencias staging e screenshots redigidas;
- decisao go/no-go;
- riscos residuais aceitos e prazo de mitigacao.

## Gate LGPD/Security Final

A promocao para producao com dados reais exige a revisao final de
`docs/operations/LGPD_SECURITY_READINESS_REVIEW.md` preenchida em sistema interno
ou anexada como evidencia redigida. A decisao tecnica padrao e **NO-GO** ate que
existam:

- smokes de staging/pos-deploy com dados dummy ou anonimizados;
- restore testado em ambiente isolado;
- teste de alerta controlado recebido, acknowledged e resolvido;
- conferencia de secrets por ambiente sem expor valores;
- politica de privacidade, termos, DPA/contrato de operador e canal do titular
  aprovados por owner humano;
- riscos residuais aceitos explicitamente com owner e prazo.
