# Template de evidencia para exercicio de incidente/rotacao/rollback

Use este template para exercicios de mesa da PR 10.4 ou para evidencias
redigidas de incidente real. Nao inclua secrets, tokens, cookies, PII/PHI,
payloads brutos de provider, storage paths sensiveis, signed URLs ou exports de
dados reais.

## Identificacao

- ID do exercicio/incidente:
- Ambiente:
- Data e janela UTC:
- Release/tag:
- Facilitador/incident commander:
- Participantes e roles:
- Runbooks usados:

## Cenario

- Tipo: PII/RLS/auth/agenda/prontuario/webhook/financeiro/documentos/restore/rotacao/rollback/outro.
- Severidade inicial:
- Sistemas afetados:
- Classes de dados afetadas, em termos agregados:
- Premissas e limites do exercicio:

## Timeline redigida

| Horario UTC | Evento                    | Decisao/acao | Owner | Evidencia redigida |
| ----------- | ------------------------- | ------------ | ----- | ------------------ |
|             | Deteccao                  |              |       |                    |
|             | Ack/classificacao         |              |       |                    |
|             | Isolamento                |              |       |                    |
|             | Correcao/rollback/rotacao |              |       |                    |
|             | Validacao                 |              |       |                    |
|             | Comunicacao               |              |       |                    |
|             | Encerramento              |              |       |                    |

## Checks executados

| Check                   | Comando/fonte | Resultado | Observacao |
| ----------------------- | ------------- | --------- | ---------- |
| Health                  |               |           |            |
| Smoke read-only         |               |           |            |
| Logs/alertas            |               |           |            |
| Auditoria               |               |           |            |
| Backlog/reprocessamento |               |           |            |
| Acesso privilegiado     |               |           |            |

## Decisoes e aprovacoes

- Aprovacao de rollback:
- Aprovacao de rotacao:
- Aprovacao de restore:
- Aprovacao de comunicacao externa:
- Riscos aceitos explicitamente:

## Resultado

- Severidade final:
- Tempo ate ack:
- Tempo ate isolamento:
- Tempo ate mitigacao:
- Tempo ate encerramento:
- Impacto residual:
- Go/no-go operacional:

## Follow-up

| Acao | Owner | Prazo | Severidade | Status |
| ---- | ----- | ----- | ---------- | ------ |
|      |       |       |            |        |

## Revisao de redacao

- [ ] Sem secrets/tokens/cookies.
- [ ] Sem PII/PHI ou dados financeiros identificaveis.
- [ ] Sem payload provider bruto.
- [ ] Sem storage path sensivel ou signed URL.
- [ ] Screenshots, logs e comandos foram redigidos.
- [ ] Evidencia pode ser compartilhada com owners internos aprovados.
