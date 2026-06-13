# Roteiro Manual De UI No Vercel

Roteiro completo para validar manualmente, pela UI hospedada no Vercel, os
modulos atuais do SlimHiper. Use este arquivo como checklist de execucao por
ambiente de preview, staging ou producao controlada.

## 1. Escopo E Regras

Objetivo:

- Validar navegacao, estados visuais, permissoes, fluxos principais e erros
  esperados de cada modulo pela interface web.
- Registrar evidencias redigidas para release, go-live ou homologacao.
- Separar problemas de UX de problemas de contrato/backend.

Regras obrigatorias:

- Nao usar pacientes reais, payloads reais de provider, tokens, cookies,
  secrets ou credenciais pessoais em evidencias.
- Nao disparar chamadas reais para D4Sign, Asaas, webhooks externos ou scripts
  Supabase durante este roteiro. Se a UI levar a uma chamada real nao
  autorizada, marque `blocked`.
- Usar contas e dados de teste anonimizados.
- Nao copiar conteudo sensivel do DevTools para evidencias.
- Se `NEXT_PUBLIC_USE_MOCK_DATA=true` estiver ativo, registrar que o teste
  validou UX/mock, nao contrato de producao.
- Se o ambiente for producao, executar apenas leitura e fluxos nao mutativos,
  salvo autorizacao formal.

## 2. Identificacao Da Execucao

Preencha antes de comecar:

```text
Data:
Executor:
Ambiente Vercel:
Base URL:
Branch/Preview:
Commit/Release:
Supabase project/ambiente:
NEXT_PUBLIC_USE_MOCK_DATA:
Navegador desktop:
Navegador mobile/responsivo:
Contas de teste usadas:
Observacoes:
```

Padrao de resultado:

- `pass`: comportamento esperado validado.
- `fail`: erro funcional, tela branca, overlay, erro de console relevante,
  permissao incorreta ou dado sensivel exposto.
- `blocked`: faltou conta, seed, permissao, ambiente, contrato ou autorizacao.
- `skipped`: fora do escopo da execucao, com justificativa.

Modelo rapido por item:

```text
Modulo:
Rota:
Perfil:
Resultado:
Evidencia:
Console:
Observacoes:
```

## 3. Perfis Minimos Para Teste

Prepare estes usuarios no ambiente alvo. Se algum nao existir, marque os testes
dependentes como `blocked`.

| Perfil | Uso no roteiro |
| --- | --- |
| Anonimo | Login, guards, rotas publicas e redirecionamentos. |
| Staff clinico | Dashboard, pacientes, agenda, Paciente 360, atendimento. |
| Coordenador/tenant admin | Configuracoes, equipe, unidades, programas e permissoes de clinica. |
| Financeiro clinica | Financeiro, cobrancas, recibos e permissoes financeiras. |
| Recepcao/agenda | Agenda, fila, pacientes e restricoes clinicas. |
| Usuario restrito | Validar forbidden, abas bloqueadas e dados omitidos. |
| Paciente vinculado | Portal `/patient`, dados proprios e entitlements. |
| Platform admin | Console `/admin` e operacoes de plataforma. |

## 4. Checklist Global

Execute para cada perfil principal:

- [ ] Abrir a `BASE_URL` em janela anonima.
- [ ] Confirmar que `/` redireciona corretamente para login ou area autorizada.
- [ ] Confirmar que nao ha tela branca, overlay de framework ou erro fatal.
- [ ] Abrir DevTools Console e registrar apenas a contagem/tipo de erros, sem
  copiar dados sensiveis.
- [ ] Verificar que loading, empty, error e forbidden aparecem com texto claro.
- [ ] Atualizar a pagina em uma rota interna e confirmar que a sessao persiste.
- [ ] Usar voltar/avancar do navegador e confirmar que tabs/filtros nao quebram.
- [ ] Testar desktop amplo, tablet e mobile.
- [ ] Validar que menus, dialogs, drawers e botoes funcionam por teclado quando
  pratico.
- [ ] Validar que textos nao sobrepoem cards, tabelas, botoes ou navegacao.
- [ ] Confirmar que nenhum segredo, token, payload bruto, URL assinada longa ou
  dado clinico desnecessario aparece na tela.

## 5. Autenticacao, Sessao E Guards

Rotas: `/auth/login`, `/auth/accept-invite`, `/no-workspace`, `/api/auth/app-session`
por efeito de UI.

### Login

- [ ] Como anonimo, abrir `/auth/login`.
- [ ] Confirmar formulario com e-mail, senha e botao `Entrar`.
- [ ] Enviar credenciais vazias/invalidas e verificar erro amigavel.
- [ ] Entrar com staff clinico e confirmar destino esperado, normalmente
  `/clinic/dashboard`.
- [ ] Entrar com platform admin e confirmar destino esperado, normalmente
  `/admin`.
- [ ] Entrar com paciente vinculado e confirmar destino esperado, normalmente
  `/patient`.
- [ ] Recarregar a rota apos login e confirmar que nao volta indevidamente ao
  login.
- [ ] Usar botao `Sair` no shell e confirmar retorno para `/auth/login`.

### Convite

- [ ] Abrir `/auth/accept-invite` sem link valido.
- [ ] Confirmar estado de erro claro para convite ausente, invalido ou expirado.
- [ ] Com link de teste autorizado, criar senha com menos de 8 caracteres e
  confirmar validacao.
- [ ] Informar senhas divergentes e confirmar validacao.
- [ ] Concluir convite de teste e confirmar redirecionamento por role.

### Guards E Acesso Negado

- [ ] Como anonimo, tentar `/clinic/dashboard`, `/clinic/patients`,
  `/admin`, `/patient`.
- [ ] Confirmar redirecionamento/forbidden adequado.
- [ ] Como staff sem perfil platform admin, tentar `/admin`.
- [ ] Como paciente, tentar `/clinic/dashboard` e `/admin`.
- [ ] Como usuario sem workspace ativo, confirmar tela `/no-workspace` quando
  aplicavel.

## 6. Shell Clinico

Rotas base: `/clinic/dashboard` e demais rotas sob `/clinic`.

- [ ] Confirmar sidebar com Dashboard, Pacientes, Agenda, CRM, Estoque,
  Programas, Comunidade, Documentos, Financeiro, Relatorios, Inbox e
  Configuracoes, respeitando entitlements do plano.
- [ ] Navegar por todos os itens visiveis e confirmar estado ativo.
- [ ] Recolher/expandir menu no desktop.
- [ ] Abrir menu no mobile e fechar por clique fora/Escape.
- [ ] Usar busca global de pacientes na topbar e confirmar ida para
  `/clinic/patients?search=...`.
- [ ] Abrir menu de conversas da topbar, validar loading/empty/erro e link para
  `/clinic/inbox?tab=conversas`.
- [ ] Abrir menu de notificacoes, validar contadores e acao de marcar como lida
  quando disponivel.
- [ ] Sair pela topbar e pela area inferior do menu.

## 7. Dashboard Clinico

Rota: `/clinic/dashboard`.

- [ ] Confirmar KPIs principais de operacao, agenda, adesao, financeiro,
  documentos, mensagens, renovacoes/comercial e estoque quando disponiveis.
- [ ] Validar cards de fila/agenda do dia.
- [ ] Validar graficos, listas e alertas sem quebra visual.
- [ ] Clicar nos cards/links de acao rapida e confirmar destino correto.
- [ ] Confirmar que alertas apontam para paciente, agenda, documentos,
  financeiro, inbox ou estoque conforme categoria.
- [ ] Confirmar empty/error quando o backend nao retornar dados.
- [ ] Com usuario restrito, validar que financeiro ou dados sensiveis sao
  omitidos quando sem permissao.

## 8. Pacientes

Rota: `/clinic/patients`.

- [ ] Confirmar loading inicial e lista/tabela responsiva.
- [ ] Buscar por nome, telefone, e-mail ou termo disponivel.
- [ ] Limpar busca e confirmar restauracao da lista.
- [ ] Aplicar filtros de status, prioridade, programa ou outros filtros
  disponiveis.
- [ ] Ordenar colunas como Prioridade, Paciente, Idade, Programa, Semana,
  Adesao e Financeiro.
- [ ] Alterar paginacao e navegar entre paginas.
- [ ] Selecionar pacientes por checkbox e confirmar estado visual.
- [ ] Abrir drawer de contexto do paciente.
- [ ] No drawer, validar score, prioridade, proxima acao, documentos, chat,
  financeiro e secoes bloqueadas por permissao.
- [ ] Clicar em `Abrir 360` e confirmar rota `/clinic/patients/[patientId]`.
- [ ] Clicar em abrir chat e confirmar rota `/clinic/inbox?tab=conversas`.
- [ ] Marcar paciente para revisao e validar feedback de sucesso/erro.
- [ ] Criar paciente de teste com dados anonimizados.
- [ ] Editar paciente de teste e confirmar persistencia/feedback.
- [ ] Validar que CPF aparece mascarado e PII nao e exposta indevidamente.
- [ ] Como usuario sem `patients.read`, confirmar bloqueio ou redirecionamento.

## 9. Paciente 360

Rota: `/clinic/patients/[patientId]`.

### Estrutura Geral

- [ ] Abrir um paciente de teste pela lista.
- [ ] Confirmar header com dados basicos, programa, status e indicadores.
- [ ] Confirmar breadcrumb para voltar a Pacientes.
- [ ] Atualizar a pagina e confirmar que os dados recarregam.
- [ ] Acessar paciente inexistente ou fora do tenant e confirmar erro/forbidden.
- [ ] Validar que abas sem permissao ficam desabilitadas ou exibem estado
  restrito.
- [ ] Validar que `?tab=` na URL abre a aba correta e que voltar/avancar
  preserva navegacao.

### Aba Resumo

- [ ] Validar cards clinicos, financeiros, documentos e chat conforme permissoes.
- [ ] Clicar em atalho para prontuario.
- [ ] Clicar em iniciar/abrir atendimento quando disponivel.
- [ ] Confirmar que dados restritos aparecem como bloqueados para usuario sem
  permissao.

### Aba Evolucao

- [ ] Validar grafico/historico de evolucao.
- [ ] Testar filtros ou periodos disponiveis.
- [ ] Validar estado sem fotos/medidas.
- [ ] Confirmar que fotos ou anexos nao expõem URLs sensiveis.

### Aba Timeline

- [ ] Alternar filtros: Todos, Clinico, Financeiro, Documentos, Agenda,
  Comunicacao, App do paciente e Comercial.
- [ ] Confirmar agrupamento por data.
- [ ] Clicar em evento com link e validar destino.
- [ ] Confirmar que eventos sensiveis respeitam permissao.
- [ ] Validar empty state por categoria sem eventos.

### Aba Prontuario

- [ ] Alternar subtabs: Evolucao, SOAP, Medidas e labs, Anexos, Equipe e
  Auditoria.
- [ ] Confirmar notas longitudinais e SOAP finalizados.
- [ ] Confirmar medidas, bioimpedancia e exames.
- [ ] Validar anexos vazios/indisponiveis sem quebra.
- [ ] Validar equipe assistencial e acoes permitidas.
- [ ] Confirmar auditoria sem conteudo clinico bruto.
- [ ] Clicar em abrir atendimento e validar rota de encounter.

### Aba Consultas

- [ ] Confirmar consultas futuras e historico.
- [ ] Validar status, profissional, unidade e horarios.
- [ ] Testar acao de reagendar/cancelar quando existir e for autorizada.
- [ ] Confirmar empty state sem consultas.

### Aba Nutricao

- [ ] Confirmar plano alimentar ativo ou estado indisponivel.
- [ ] Testar acoes: criar, editar, duplicar, enviar ao paciente, arquivar e ver
  registros do app, marcando `blocked` se backend/permissao nao permitir.
- [ ] Validar que alteracoes exibem feedback e nao expõem dado sensivel.

### Aba Prescricoes

- [ ] Confirmar lista de prescricoes por tipo e status.
- [ ] Abrir fluxo/wizard de prescricao quando autorizado.
- [ ] Passar pelas etapas Dados, Itens, Posologia, Orientacoes e Revisao.
- [ ] Validar campos obrigatorios.
- [ ] Salvar rascunho, emitir/assinar ou cancelar somente em ambiente
  autorizado.
- [ ] Confirmar que usuario sem permissao medica nao ve prescricoes medicas.

### Aba Documentos

- [ ] Confirmar documentos do paciente, status e filtros.
- [ ] Abrir detalhe de documento.
- [ ] Solicitar URL assinada somente em ambiente autorizado; caso contrario
  marcar `blocked`.
- [ ] Validar que URLs sao curtas/temporarias e nao aparecem em evidencia.
- [ ] Confirmar empty/error.

### Aba Financeiro

- [ ] Confirmar cobranças, pagamentos, pendencias e status.
- [ ] Validar que usuario sem `financial.read` nao ve valores.
- [ ] Testar links para modulo financeiro quando disponiveis.
- [ ] Nao criar cobranca real Asaas sem autorizacao.

### Aba Pacotes

- [ ] Confirmar pacote ativo, progresso, sessoes, check-ins e contratos.
- [ ] Testar acoes: vender novo pacote, renovar, cancelar, editar acesso, ver
  contrato e ver financeiro.
- [ ] Marcar `blocked` para acoes dependentes de venda/cobranca real.
- [ ] Confirmar estado sem pacote ativo.

### Aba Chat

- [ ] Confirmar threads, mensagens e contador nao lido.
- [ ] Enviar mensagem de teste anonima se `chat.write` estiver liberado.
- [ ] Marcar conversa como lida.
- [ ] Validar empty state e bloqueio sem permissao.
- [ ] Nao inserir informacao clinica sensivel no texto de teste.

### Aba Relatorios

- [ ] Confirmar relatorios disponiveis para o paciente.
- [ ] Gerar/baixar/visualizar somente se ambiente permitir.
- [ ] Validar estado sem relatorio.
- [ ] Confirmar que export respeita permissao e nao expõe dados indevidos.

## 10. Atendimento, SOAP, Medidas E Exames

Rota: `/clinic/patients/[patientId]/encounter`.

- [ ] Abrir atendimento a partir do Paciente 360.
- [ ] Confirmar carregamento de contexto, programa, riscos, prescricoes,
  ultimas medidas e pendencias.
- [ ] Expandir/recolher secoes laterais.
- [ ] Em mobile, abrir drawer de contexto e fechar.
- [ ] Preencher SOAP: Subjetivo, Objetivo, Avaliacao e Plano.
- [ ] Aguardar autosave e confirmar indicador `Salvo`.
- [ ] Clicar em salvar rascunho e confirmar feedback.
- [ ] Tentar finalizar com campos faltantes e confirmar validacao.
- [ ] Finalizar SOAP completo em ambiente de teste autorizado.
- [ ] Confirmar que atendimento finalizado bloqueia edicao.
- [ ] Registrar medidas com numeros validos e validar feedback/lista.
- [ ] Registrar bioimpedancia de teste e validar feedback/lista.
- [ ] Criar solicitacao de exame de teste e validar feedback/lista.
- [ ] Confirmar que erros de acao aparecem sem quebrar a pagina.
- [ ] Como usuario sem `encounters.write` ou `soap.write`, validar bloqueio.

## 11. Agenda E Fila

Rota: `/clinic/agenda`.

- [ ] Confirmar titulo `Agenda e Fila`.
- [ ] Alternar abas Agenda, Fila e Retornos.
- [ ] Criar consulta de teste com paciente, data, horario, unidade e
  profissional.
- [ ] Editar consulta criada.
- [ ] Cancelar consulta com motivo.
- [ ] Avancar status na trilha: Agendado, Confirmado, Chegou, Triagem,
  Medidas, Bioimpedancia, Aguardando medico, Consulta, Checkout e Concluido.
- [ ] Confirmar que status invalido ou permissao ausente bloqueia acao.
- [ ] Abrir atendimento a partir de consulta/fila.
- [ ] Validar cards da fila: aguardando, chamados e em atendimento.
- [ ] Chamar paciente, iniciar atendimento e concluir quando autorizado.
- [ ] Validar retornos pendentes e acoes de agendamento.
- [ ] Testar filtros de dia/visao quando disponiveis.
- [ ] Confirmar timezone correto para o ambiente.

## 12. CRM Operacional

Rota: `/clinic/crm`.

- [ ] Confirmar titulo `CRM operacional`.
- [ ] Validar funil, KPIs e colunas/status.
- [ ] Buscar lead por nome, e-mail ou telefone.
- [ ] Filtrar por status e origem.
- [ ] Criar lead de teste com consentimento e dados anonimizados.
- [ ] Editar lead.
- [ ] Abrir detalhe do lead.
- [ ] Criar nota comercial sem dados clinicos sensiveis.
- [ ] Criar ou concluir tarefa quando disponivel.
- [ ] Atualizar timeline do lead.
- [ ] Testar conversao lead -> paciente somente em ambiente autorizado.
- [ ] Validar bloqueio para usuario sem `crm.read`.

## 13. Estoque

Rota: `/clinic/inventory`.

- [ ] Confirmar snapshot de itens, lotes, movimentacoes e alertas.
- [ ] Buscar por item ou SKU.
- [ ] Criar item de teste com nome, SKU, unidade, categoria e estoque minimo.
- [ ] Confirmar que custo restrito respeita permissao.
- [ ] Editar item.
- [ ] Criar lote com quantidade, validade e custo unitario de teste.
- [ ] Registrar recebimento com motivo auditavel.
- [ ] Registrar consumo/perda/ajuste com motivo obrigatorio.
- [ ] Registrar transferencia entre locais se existir mais de um local.
- [ ] Validar alertas de estoque minimo, vencimento e divergencia.
- [ ] Confirmar que movimentos atualizam saldo e historico.
- [ ] Validar bloqueio sem permissao de estoque.

## 14. Programas, Catalogo Comercial E Builder

Rotas: `/clinic/programs`, `/clinic/programs/builder`.

### Catalogo E Programas

- [ ] Confirmar tabs Servicos, Pacotes, Programas e Upgrades.
- [ ] Criar servico de teste.
- [ ] Editar, ativar/inativar ou clonar servico quando autorizado.
- [ ] Criar pacote de teste com beneficios e limites.
- [ ] Editar, publicar/inativar ou clonar pacote.
- [ ] Validar lista de programas, status ativo/rascunho/arquivado e menu de
  acoes.
- [ ] Matricular paciente de teste em programa/pacote quando autorizado.
- [ ] Solicitar upgrade e cotar upgrade somente com dados de teste.
- [ ] Confirmar estados vazios e erros do catalogo.

### Builder De Programa

- [ ] Abrir `/clinic/programs/builder`.
- [ ] Navegar pelas etapas: Dados Gerais, Fases, Servicos, Entitlements,
  Check-ins, Documentos, Financeiro, Equipe e Revisao.
- [ ] Validar obrigatoriedade de nome, duracao e campos minimos.
- [ ] Adicionar fase e servicos.
- [ ] Configurar entitlements do paciente.
- [ ] Configurar check-ins.
- [ ] Vincular documentos/templates.
- [ ] Configurar financeiro sem disparar cobranca real.
- [ ] Adicionar equipe.
- [ ] Revisar resumo final.
- [ ] Salvar rascunho e publicar somente em ambiente autorizado.
- [ ] Confirmar que voltar/avancar preserva dados do wizard.

## 15. Comunidade

Rotas: `/clinic/community` e aba Comunidade do `/patient`.

### Moderacao Na Clinica

- [ ] Confirmar filtros Pendentes, Aprovados, Rejeitados e Denunciados.
- [ ] Abrir item de comunidade.
- [ ] Aprovar conteudo de teste.
- [ ] Rejeitar conteudo com motivo objetivo.
- [ ] Ocultar conteudo com motivo objetivo.
- [ ] Validar denuncia e historico de moderacao.
- [ ] Criar prompt semanal de teste.
- [ ] Confirmar que motivos entram na auditoria e podem ser vistos quando
  aplicavel.
- [ ] Validar estado de fila vazia.

### Visao Do Paciente

- [ ] No portal do paciente, abrir aba Comunidade.
- [ ] Criar publicacao de teste permitida.
- [ ] Validar estado aguardando moderacao.
- [ ] Curtir, comentar e denunciar conteudo de teste.
- [ ] Confirmar que conteudo rejeitado/oculto nao aparece indevidamente.

## 16. Documentos E D4Sign

Rota: `/clinic/documents`.

- [ ] Confirmar workspace documental com templates e documentos gerados.
- [ ] Buscar template/documento.
- [ ] Validar status: Rascunho, Disponivel, Pendente assinatura, Assinado,
  Falha operacional e Restrito.
- [ ] Abrir detalhe de documento e confirmar resumo sem payload sensivel.
- [ ] Criar novo documento pelo wizard.
- [ ] Selecionar paciente de teste e template ativo.
- [ ] Validar preview/variaveis quando disponivel.
- [ ] Gerar documento somente em ambiente autorizado.
- [ ] Solicitar signed URL somente se permitido; nao registrar URL em evidencia.
- [ ] Enviar para D4Sign somente com autorizacao explicita de sandbox.
- [ ] Validar falha provider sem exibir token, crypt key ou payload bruto.
- [ ] Confirmar estado sem templates/documentos.

## 17. Financeiro Clinico E Asaas

Rota: `/clinic/financeiro`.

- [ ] Confirmar KPIs: receita do mes, recebimentos pendentes, cobrancas
  vencidas e assinaturas/pacotes ativos.
- [ ] Validar distribuicao por status de cobranca.
- [ ] Validar cards de divergencias, webhooks falhos, pendentes e sem vinculo.
- [ ] Filtrar/listar cobrancas e pacientes financeiros.
- [ ] Abrir detalhe de cobranca/paciente quando disponivel.
- [ ] Testar acoes internas permitidas sem chamar Asaas real.
- [ ] Confirmar que botoes Asaas bloqueados exibem motivo quando fluxo nao esta
  autorizado.
- [ ] Aprovar comprovante de teste.
- [ ] Rejeitar comprovante exigindo motivo.
- [ ] Confirmar feedback de sucesso/erro.
- [ ] Como usuario sem `financial.read`, confirmar valores omitidos ou acesso
  negado.

## 18. Relatorios Clinicos

Rota: `/clinic/reports`.

- [ ] Confirmar titulo `Relatorios clinicos`.
- [ ] Confirmar lista de definicoes allowlist.
- [ ] Selecionar definicao de relatorio.
- [ ] Configurar filtros permitidos: periodo, unidade, profissional, paciente
  ou escopo quando disponivel.
- [ ] Executar run de teste se autorizado.
- [ ] Validar resultado, status e historico de runs.
- [ ] Gerar export somente se autorizado.
- [ ] Confirmar que export persistente aparece na lista.
- [ ] Validar empty state sem definicoes, runs ou exports.
- [ ] Confirmar que usuario sem `reports.read` nao acessa relatorios.

## 19. Inbox Clinico

Rota: `/clinic/inbox`.

- [ ] Confirmar titulo `Inbox clinico`.
- [ ] Alternar abas Conversas, Notificacoes e Atribuidas a mim.
- [ ] Filtrar por UUID do paciente e categoria.
- [ ] Abrir conversa.
- [ ] Validar thread, mensagens e link para paciente.
- [ ] Enviar resposta operacional de teste quando `chat.write` estiver
  liberado.
- [ ] Marcar conversa como lida.
- [ ] Atribuir/desatribuir conversa quando disponivel.
- [ ] Abrir notificacao e validar destino.
- [ ] Marcar notificacao como lida.
- [ ] Confirmar loading, empty e erro sem payload sensivel.

## 20. Configuracoes Da Clinica

Rota: `/clinic/settings`.

- [ ] Confirmar menu interno com Perfil, Unidades, Equipe, Papeis, Branding,
  Portal, Chat, Mensagens, Legal, Integracoes, Financeiro, Programas e
  Compliance.
- [ ] Em Perfil, editar dados nao sensiveis de teste e salvar.
- [ ] Em Unidades, criar/editar unidade de teste.
- [ ] Em Equipe, convidar membro somente em ambiente autorizado; caso contrario
  validar formulario e marcar `blocked`.
- [ ] Em Equipe, alterar papel/status somente se o backend de auditoria estiver
  autorizado.
- [ ] Em Papeis, validar matriz de permissoes exibida.
- [ ] Em Branding, alterar cor/logo/textos de teste e confirmar preview.
- [ ] Em Portal, alternar preferencias de auto-agendamento, chat, documentos,
  financeiro, lembretes e NPS.
- [ ] Em Chat, alterar horarios de atendimento.
- [ ] Em Mensagens, criar/editar template de mensagem.
- [ ] Em Legal, validar LGPD, termos e consentimentos.
- [ ] Em Integracoes, confirmar que secrets nao aparecem.
- [ ] Em Financeiro, alternar preferencias como NF-e automatica, alertas e
  recibo.
- [ ] Em Programas, validar defaults de programa.
- [ ] Em Compliance, validar politicas, auditoria e alertas.
- [ ] Usar recarregar/atualizar e confirmar persistencia.
- [ ] Como usuario sem tenant admin, confirmar acoes bloqueadas.

## 21. Portal Do Paciente

Rota: `/patient`.

- [ ] Entrar como paciente vinculado.
- [ ] Confirmar que apenas dados do proprio paciente aparecem.
- [ ] Confirmar navegacao mobile/desktop nas abas Resumo, Diario, Minha
  jornada, Beneficios, Comunidade, Documentos, Financeiro, Chat,
  Notificacoes e Check-ins.

### Resumo

- [ ] Confirmar status do programa, progresso, proximos compromissos e alertas.
- [ ] Confirmar que dados de outro paciente/tenant nao aparecem.

### Diario

- [ ] Ajustar agua.
- [ ] Registrar refeicao com observacao de teste.
- [ ] Registrar treino.
- [ ] Preencher check-in diario.
- [ ] Validar resumo semanal e progresso do diario.
- [ ] Registrar quando o diario estiver em fallback local.

### Minha Jornada

- [ ] Navegar por etapas Perfil, Metas, Rotina, Lembretes e Revisao.
- [ ] Editar preferencias permitidas.
- [ ] Validar historico recente.
- [ ] Confirmar que medicamentos/lembretes nao expõem dado indevido.

### Beneficios

- [ ] Confirmar pacote atual.
- [ ] Validar opcoes de upgrade.
- [ ] Solicitar upgrade de teste somente em ambiente autorizado.
- [ ] Validar historico de upgrades.

### Documentos

- [ ] Confirmar documentos liberados ao paciente.
- [ ] Abrir/baixar documento somente se autorizado.
- [ ] Validar estado sem documentos.

### Financeiro

- [ ] Confirmar cobrancas proprias.
- [ ] Abrir link de pagamento somente se ambiente sandbox/autorizado.
- [ ] Confirmar que cobrancas de outro paciente nao aparecem.

### Chat

- [ ] Enviar mensagem de teste.
- [ ] Confirmar resposta/estado enviado.
- [ ] Validar empty state.

### Notificacoes E Check-ins

- [ ] Marcar notificacao como lida.
- [ ] Responder check-in atribuido.
- [ ] Validar campos obrigatorios e feedback.

## 22. Admin Platform

Rotas: `/admin`, `/admin/tenants`, `/admin/tenants/[tenantId]`,
`/admin/billing`, `/admin/usage`, `/admin/storage`, `/admin/integrations`,
`/admin/webhooks`, `/admin/observability`, `/admin/security`, `/admin/support`,
`/admin/audit`.

### Shell Admin

- [ ] Entrar como platform admin.
- [ ] Confirmar sidebar admin com Visao Geral, Tenants, Financeiro, Uso e
  metricas, Armazenamento, Integracoes, Webhooks, Observabilidade, Seguranca,
  Suporte e Auditoria.
- [ ] Recolher/expandir menu.
- [ ] Testar menu mobile.
- [ ] Usar botao Atualizar quando presente.
- [ ] Sair do admin.
- [ ] Como usuario nao-admin, confirmar bloqueio em todas as rotas admin.

### Visao Geral

- [ ] Abrir `/admin`.
- [ ] Confirmar snapshot sanitizado de plataforma.
- [ ] Validar cards, gaps, sessoes e links para tenants.
- [ ] Confirmar que payload bruto e secrets nao aparecem.

### Tenants

- [ ] Abrir `/admin/tenants`.
- [ ] Buscar por clinica, owner, ID ou e-mail.
- [ ] Filtrar por status/plano quando disponivel.
- [ ] Criar tenant de teste somente em ambiente autorizado.
- [ ] Abrir detalhe de tenant.
- [ ] Confirmar metricas, owner, plano, status, usuarios e integracoes.

### Detalhe Do Tenant

- [ ] Alternar abas: Visao Geral, Usuarios, Unidades, Billing, Integracoes,
  Auditoria, Webhooks, Suporte e Break-Glass.
- [ ] Em Modulos e entitlements, sincronizar com plano ou criar override
  somente com motivo auditavel e autorizacao.
- [ ] Em Usuarios, convidar, alterar role, suspender ou reenviar convite de
  teste somente se autorizado.
- [ ] Em Unidades, criar/editar unidade de teste.
- [ ] Em Billing, validar assinatura local, divergencias e historico.
- [ ] Em Integracoes, validar Asaas e D4Sign sem mostrar secrets.
- [ ] Em Auditoria, buscar evento e abrir detalhe sanitizado.
- [ ] Em Webhooks, abrir detalhe e solicitar reprocesso local sem provider call.
- [ ] Em Suporte, criar sessao de suporte de teste com motivo auditavel.
- [ ] Em Break-Glass, criar/aprovar/revogar somente em ambiente autorizado.

### Admin Financeiro

- [ ] Abrir `/admin/billing`.
- [ ] Validar receita SaaS, status de planos, divergencias e tenants afetados.
- [ ] Criar/editar plano local somente se autorizado.
- [ ] Confirmar que codigo de plano fica imutavel apos criacao.

### Uso, Storage E Integracoes

- [ ] Abrir `/admin/usage` e validar metricas agregadas sem PII.
- [ ] Abrir `/admin/storage` e validar uso por tenant/bucket sem URLs sensiveis.
- [ ] Abrir `/admin/integrations` e validar status Asaas/D4Sign sem secrets.
- [ ] Confirmar links para tenant quando aplicavel.

### Webhooks

- [ ] Abrir `/admin/webhooks`.
- [ ] Buscar evento, tenant ou ID.
- [ ] Filtrar provider/status quando disponivel.
- [ ] Abrir detalhe sanitizado.
- [ ] Solicitar reprocesso local com motivo minimo.
- [ ] Confirmar que a UI diz que nao chama Asaas ou D4Sign diretamente.

### Observabilidade

- [ ] Abrir `/admin/observability`.
- [ ] Buscar job, categoria ou evidencia.
- [ ] Validar status OK/Atencao/Critico.
- [ ] Abrir detalhes de checks/runbooks.
- [ ] Confirmar que jobs manuais bloqueados exibem motivo.

### Seguranca, Suporte E Auditoria

- [ ] Abrir `/admin/security` e validar sessoes, break-glass, riscos e acoes
  permitidas.
- [ ] Abrir `/admin/support` e validar sessoes de suporte, filtros e motivos.
- [ ] Abrir `/admin/audit`, buscar evento e exportar somente se autorizado.
- [ ] Confirmar que detalhes de auditoria sao redigidos.

## 23. Testes Transversais De Permissao

Execute pelo menos uma vez:

- [ ] Staff clinico tenta abrir Admin: esperado `forbidden` ou redirect.
- [ ] Financeiro clinica tenta ver prontuario/SOAP restrito: esperado bloqueio.
- [ ] Recepcao tenta ver valores financeiros restritos: esperado omissao.
- [ ] Usuario restrito tenta abas bloqueadas do Paciente 360: esperado botao
  desabilitado ou estado restrito.
- [ ] Paciente tenta acessar outro `patientId`: esperado bloqueio.
- [ ] Usuario de tenant A tenta URL de paciente/tenant B: esperado bloqueio.
- [ ] Platform admin ve apenas snapshots sanitizados, nao dados clinicos brutos.

## 24. Testes De Responsividade

Para estas rotas, testar desktop, tablet e mobile:

- [ ] `/auth/login`
- [ ] `/clinic/dashboard`
- [ ] `/clinic/patients`
- [ ] `/clinic/patients/[patientId]`
- [ ] `/clinic/patients/[patientId]/encounter`
- [ ] `/clinic/agenda`
- [ ] `/clinic/programs`
- [ ] `/clinic/documents`
- [ ] `/clinic/financeiro`
- [ ] `/clinic/settings`
- [ ] `/patient`
- [ ] `/admin`
- [ ] `/admin/tenants`
- [ ] `/admin/tenants/[tenantId]`
- [ ] `/admin/webhooks`

Validar em cada uma:

- [ ] Sidebar/menu abre e fecha.
- [ ] Tabelas viram scroll horizontal ou cards sem cortar conteudo.
- [ ] Dialogs/drawers cabem na tela e fecham por botao.
- [ ] Botoes nao sobrepoem textos.
- [ ] Campos de formulario ficam usaveis com teclado mobile.

## 25. Criterios De Aprovacao

Uma execucao pode ser considerada aprovada quando:

- [ ] Todos os modulos criticos foram `pass` ou possuem `blocked` justificado.
- [ ] Nenhum `fail` critico ficou aberto em login, guards, pacientes, Paciente
  360, financeiro, documentos, portal do paciente ou admin.
- [ ] Nenhum segredo, payload bruto, token, cookie, URL assinada sensivel ou PII
  real apareceu em tela/evidencia.
- [ ] Acoes que poderiam chamar D4Sign/Asaas real foram bloqueadas ou testadas
  apenas em sandbox autorizado.
- [ ] Permissoes por role foram validadas em pelo menos um caso positivo e um
  caso negativo.
- [ ] Console nao possui erro fatal recorrente.
- [ ] Rotas principais foram testadas em desktop e mobile.
- [ ] Evidencias foram registradas com dados anonimizados.

## 26. Resumo Final Da Execucao

```text
Total de modulos:
Pass:
Fail:
Blocked:
Skipped:

Falhas criticas:
Falhas medias:
Falhas menores:
Bloqueios por ambiente/permissao:
Riscos residuais:
Go/No-go:
Responsavel pela decisao:
```
