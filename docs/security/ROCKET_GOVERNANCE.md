# Rocket Governance

## Estado Atual

O projeto ainda carrega scripts e metadados Rocket globais por compatibilidade com o estado atual do produto. Nesta etapa eles nao foram removidos nem alterados.

## Risco

Scripts externos globais aumentam a superficie de seguranca em telas autenticadas, especialmente em fluxos com dados clinicos, financeiros, documentos e portal do paciente. Antes de go-live com dados reais, o escopo Rocket precisa estar aprovado junto com CSP, monitoramento e politica de ambientes.

## Guardrails

- Nao remover nem alterar Rocket sem tarefa especifica.
- Nao expor segredos ou dados sensiveis para scripts de terceiros.
- Revisar CSP com Rocket, Supabase, D4Sign, Asaas, imagens remotas e assets Next antes de producao.
- Manter qualquer decisao de remocao, allowlist ou isolamento documentada em runbook de seguranca.

## Status

Local/demo: permitido com risco registrado.

Producao com dados reais: pendente de decisao formal de governanca Rocket/CSP.
