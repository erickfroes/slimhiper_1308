# Checklist de Reforma do Cockpit `/patient` (Gamificação)

## Fase 1 — Fundação

- [x] Definir o modelo de pontuação (XP, streaks, missões, níveis, badges).
- [x] Definir estados de progresso e flags críticas de bloqueio.
- [x] Integrar regra de pontuação inicial no frontend com deduplicação/anti-spam.
- [x] Incluir bloqueios por janela (`cooldown`) para evitar ponto de baixa qualidade.
- [ ] Validar regras de pontuação com time clínico, compliance e risco.
- [x] Documentar o dicionário de pontuação para time e operação.

## Fase 2 — MVP Visual

- [x] Substituir cards legados de cockpit por painel principal de jornada.
- [x] Incluir mapa da jornada com blocos:
  - Hoje
  - Progresso semanal
  - Próximos desafios
  - Próxima conquista
- [x] Exibir energia, streak, XP, badges, níveis e linha do tempo de eventos.
- [x] Conectar ações rápidas do diário ao novo resumo visual.
- [x] Manter atalhos diretos para tabs de jornada, diário, docs, financeiro e chat.
- [x] Refinar microcopy final e hierarquia visual para versão de produção.
- [x] Ajustar responsividade do novo painel em telas pequenas com revisão final.

## Fase 3 — Motor Completo

- [x] Gerar eventos de recompensa a partir de snapshot da jornada e diário.
- [x] Aplicar anti-abuso por origem duplicada e cooldown.
- [x] Exibir eventos aceitos e bloqueados (com razão) na timeline.
- [x] Mover regra de pontuação para serviço backend (fonte única de verdade).
- [x] Criar persistência de histórico de progresso por paciente (trajetória no tempo).
- [x] Implementar persistência de conquistas/metas por semana (auditoria).

## Fase 4 — Ajuste Fino

- [x] Atualização automática do painel após ações de diário.
- [x] Normalizar estados de risco/alerta para comportamento “pausa clínica”.
- [x] Ajustar acessibilidade (contraste, leitura de tela e estados de foco) do painel.
- [x] Resolver edge cases de dados ausentes e mensagens de fallback.
- [ ] Revisão UX com usuários/paciente piloto.

## Fase 5 — Lançamento e Tuning

- [x] Estrutura pronta para acompanhamento de retenção e adesão.
- [ ] Coletar baseline de `check-in diário`, retenção semanal e taxa de metas.
- [ ] Ajustar pesos/premiações por clínica/protocolo.
- [ ] Criar monitorias contínuas (dashboards de uso e risco de abandono).

## Pendências externas

- [ ] Validação das regras com time clínico, compliance e risco.
- [ ] Revisão UX com paciente piloto antes de produção ampla.
- [ ] Aplicação da migration Supabase em ambiente autorizado.
- [ ] Coleta de baseline real após lançamento.
