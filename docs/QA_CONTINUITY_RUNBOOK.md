# Exercício local de continuidade (`qa_`)

## Escopo automatizado

`scripts/qa/run-continuity-exercise.mjs` somente aceita o alvo local já
protegido por `assertQaTarget()`. Ele cria dados sintéticos, captura um backup
lógico local, remove o tenant de teste, recompõe identidades/RBAC com o seed e
restaura dados clínicos, PII, anexo no storage e financeiro local duas vezes.

O relatório em `.qa-artifacts/qa_continuity_report.json` contém apenas
contagens, durações e prefixos de hashes. O arquivo de backup é removido no
fim, inclusive em falhas. Nenhuma URL assinada, token, credencial, dado real ou
chamada de provedor faz parte do exercício.

## Execução local

1. Inicie um Supabase local isolado e aplique as migrations locais.
2. Obtenha variáveis do próprio `supabase status --output env` apenas na sessão
   de execução; não coloque valores em arquivos `.env` nem os imprima.
3. Execute `node scripts/qa/run-continuity-exercise.mjs`.
4. Confirme o resultado `status: passed`, dois restores e os limites de RPO/RTO.
   Os limites locais padrão são cinco minutos e podem ser reduzidos por
   `QA_MAX_RPO_MS` e `QA_MAX_RTO_MS`.
5. Preserve apenas o relatório sanitizado exigido pela evidência; descarte
   qualquer backup lógico temporário.

## Passos manuais inevitáveis antes de go-live

1. Aprovadores clínico, técnico, operacional e LGPD definem e registram RPO,
   RTO, retenção, criptografia, região e responsável do backup de produção.
2. A equipe de infraestrutura executa restore em um projeto de staging
   segregado, com credenciais entregues fora deste repositório, e confirma que
   banco e storage usam cópias do mesmo ponto no tempo.
3. A equipe operacional simula indisponibilidade real de banco/storage e
   confirma a mensagem segura ao usuário, o procedimento de recuperação e a
   fila de reconciliação. Provedores externos não são acionados neste lote.
4. Registre duas restaurações aprovadas, o hash do artefato de backup, tempos
   observados, desvios e decisão de go/no-go no sistema de mudanças autorizado.

Não execute este roteiro contra produção. Dados reais, payloads de webhook e
credenciais nunca devem ser anexados ao relatório do exercício.
