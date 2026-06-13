# Production Readiness Execution Plan

Este arquivo e o entrypoint solicitado para aplicar o plano de producao do
SlimHiper.

O runbook operacional canonico fica em:

- `docs/operations/PRODUCTION_READINESS_EXECUTION_PLAN.md`

Use esse runbook para mover cada componente pelos niveis N1-N5, registrar
evidencias, bloquear go-live quando houver risco e executar a auditoria local
read-only.

O acompanhamento operacional fica em:

- `docs/operations/PRODUCTION_READINESS_STAGE_TRACKER.md`

## Comando Principal

```bash
node scripts/operations/check-production-readiness.mjs
```

Para tratar avisos como bloqueadores em uma release candidate:

```bash
node scripts/operations/check-production-readiness.mjs --strict
```

## Regra De Aplicacao

Este entrypoint nao substitui os runbooks de operacao. Antes de qualquer
promocao, use tambem:

- `docs/operations/RELEASE_PROCESS.md`
- `docs/operations/ENVIRONMENT_MATRIX.md`
- `docs/operations/LGPD_SECURITY_READINESS_REVIEW.md`
- `docs/operations/OBSERVABILITY_ALERTING_RUNBOOK.md`
- `docs/operations/BACKUP_RESTORE_DR_RUNBOOK.md`
- `docs/operations/INCIDENT_RESPONSE_RUNBOOK.md`

Go-live permanece **NO-GO** ate que staging/production-like, mocks desligados,
smokes autenticados, restore/alerta, rollback e aprovacao humana LGPD/security
estejam registrados com evidencia redigida.
