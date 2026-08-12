# Governança LGPD e direitos do titular

## Contratos implementados

`lgpd_processing_inventory` mantém atividades versionadas por tenant, com
finalidade, base legal, controlador, operador, retenção, compartilhamento e
perfis de acesso. `patient_consents` preserva a linha do tempo de
consentimento para marketing, comunidade, fotos de progresso e comunicações
opcionais. A revogação não apaga evidência anterior.

`data_subject_requests` controla acesso, correção, exportação, revogação e
anonimização. A anonimização limpa somente dados pessoais permitidos. Havendo
encounter, SOAP, prescrição ou documento clínico, a solicitação termina em
`retained` com `clinical_retention_required`; não há exclusão silenciosa.

Auditoria LGPD registra apenas IDs, tipo, status e códigos de resolução. Não
inclua SOAP, diagnóstico, prescrição, anexo, texto de prontuário ou payload de
exportação em `audit_logs`.

## Passos manuais obrigatórios

1. DPO/controlador aprova a matriz de bases legais, retenções e operadores por
tenant antes de ativar uma atividade no inventário.
2. A equipe clínica define a tabela de guarda aplicável a cada tipo de
prontuário; a aplicação não deve inferir prazo legal nem apagar registros
clínicos.
3. Toda solicitação negada ou retida recebe análise humana, responsável,
justificativa legal e evidência fora do conteúdo clínico.
4. Revise trimestralmente privilégios, sessões de suporte/break-glass e
exportações incomuns. Execute tabletop de incidente apenas com `qa_`.
