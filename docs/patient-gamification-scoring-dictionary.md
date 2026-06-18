# Dicionário de Pontuação da Jornada do Paciente

Este documento registra as regras atuais usadas no painel gamificado do `/patient`.
A pontuação existe para orientar consistência clínica e clareza de próximo passo, sem ranking social ou recompensa financeira.

## Regras de XP

| Sinal | XP | Janela anti-spam | Critério |
| --- | ---: | --- | --- |
| `checkin` | 10 | 6 horas por dia | Check-in diário essencial concluído. |
| `document` | 8 | 10 minutos por documento | Documento solicitado registrado ou liberado no dia. |
| `chat` | 5 | 45 minutos por dia | Interação recente com a equipe nos últimos 7 dias. |
| `payment` | 5 | 4 horas por semana | Pagamento confirmado nos últimos 7 dias. |
| `admin` | 15 | 6 horas por dia | Financeiro sem pendência aberta no dia. |
| `habit` | 10 | 2 horas por dia | Pelo menos 2 hábitos do dia acima de 50%. |
| `hygiene` | 6 | 12 horas por semana | Onboarding concluído e rotina sem notificações pendentes. |

## Níveis

| Nível | Objetivo | Fonte principal |
| --- | --- | --- |
| Início | Onboarding concluído e perfil mínimo válido. | `get_patient_journey_snapshot` |
| Rotina | Hábitos e check-in do dia em andamento. | `get_patient_daily_snapshot` |
| Conexão | Comunicação, documentos e financeiro sem gargalos. | `get_patient_portal_snapshot` |
| Adesão | Semana sustentada com check-ins e hábitos. | Diário + check-ins |
| Evolução | Histórico positivo e autonomia no app. | Jornada + lembretes + histórico |

## Missões Semanais

O painel mantém no máximo 3 missões ativas:

| Missão | Tipo | Critério |
| --- | --- | --- |
| Missão rotina | Hábito clínico | Completar 2 dos 3 hábitos diários. |
| Missão administrativa | Administração | Manter financeiro sem pendência aberta. |
| Missão bem-estar | Bem-estar/conexão | Manter interação recente com a equipe. |

## Antifraude e Qualidade

- Eventos duplicados pela mesma origem não pontuam duas vezes.
- Eventos fora de janela de cooldown são exibidos como bloqueados na timeline.
- Dados inválidos não pontuam.
- A quebra de sequência encerra a cadeia atual, mas não apaga XP histórico.
- Estados críticos pausam a gamificação e priorizam comunicação clínica.

## Persistência

- `patient_journey_progress_snapshots` guarda o snapshot diário consolidado.
- `patient_weekly_quest_progress` guarda progresso semanal por missão.
- `patient_gamification_events` guarda eventos aceitos e bloqueados para auditoria.
- A gravação é feita por `record_patient_gamification_summary`, após autorização por `security.resolve_patient_portal_link`.

## Pontos Que Exigem Validação Humana

- Peso clínico relativo entre hábitos, financeiro e comunicação.
- Termos de microcopy em cenários de ansiedade, risco ou baixa adesão.
- Métricas mínimas para ligar monitorias de abandono.
- Critérios por protocolo quando a clínica tiver programas com metas diferentes.
