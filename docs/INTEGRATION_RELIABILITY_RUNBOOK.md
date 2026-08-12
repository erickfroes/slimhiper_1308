# Confiabilidade de integrações

## Contrato interno

`integration_outbox` é a fila transacional de operações destinadas aos canais
`communications`, `fiscal` e `payment`. A tabela guarda somente código de
operação, chave de idempotência, digest SHA-256 e resumo operacional fixo;
payloads, assinaturas e identificadores externos brutos não são persistidos.

O worker confiável chama `process_local_integration_outbox()` com o resultado
normalizado do adaptador. `timeout`, `http_429`, `http_500` e `ambiguous` usam
backoff exponencial. Após três tentativas, ou em `http_400`/`http_401`, o item
vai para `integration_dead_letters`.

Eventos de entrada passam pelo adaptador antes de
`record_local_inbound_integration_event()`. Assinatura inválida é rejeitada e
enviada à DLQ sem corpo do evento. Chaves repetidas são idempotentes; sequência
anterior à última aplicada para a entidade é marcada como ignorada.

## Reconciliação e operação

Usuários com `financial.read` obtêm apenas contagens sanitizadas por
`get_integration_reconciliation()`. Operadores de backend podem analisar a
DLQ, corrigir a causa e criar uma nova operação com outra chave de idempotência
ou registrar a resolução. Nunca repasse payload bruto à interface clínica.

Antes de ligar um adaptador a qualquer sandbox, a equipe responsável deve
aprovar autenticação, rotação de segredo, assinatura, limites, política de
retry e procedimento de replay. Produção requer teste segregado e evidência de
reconciliação; este repositório não chama provedores no harness QA.
