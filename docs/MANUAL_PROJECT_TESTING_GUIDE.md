# Guia manual de testes do SlimHiper

Este roteiro cobre landing page, administração, clínica e portal do paciente em ambiente local, sempre com dados sintéticos `qa_`. Registre resultados em tickets sem prontuários, tokens, links assinados ou dados reais.

## 1. Regras de segurança

- Use somente Supabase local; nunca produção.
- Não acione provedores, cobranças ou assinatura externa.
- Use aliases `qa_` e e-mails `@example.test`.
- Evidências devem conter rota, papel, passos, esperado, obtido e captura sanitizada.
- Use uma janela anônima por papel ou faça logout entre perfis.

## 2. Preparação

Pré-requisitos: Docker Desktop em execução, Node.js, dependências instaladas com `npm install` e configuração local do frontend já existente. Não exponha nem copie variáveis ou chaves.

No diretório do projeto:

```powershell
npx supabase start
npx supabase db reset --local
npm run dev
```

Abra `http://localhost:4028`. O reset é exclusivo do banco local: não o execute contra ambiente remoto.

### Massa QA

No terminal local já configurado para os scripts de QA, execute:

```powershell
node scripts/qa/create-test-fixtures.mjs
```

As fixtures têm senha efêmera. No Studio local, em **Auth > Users**, localize `qa_<alias>@example.test` e defina uma senha temporária conhecida para os perfis que serão usados. Ao encerrar todos os testes:

```powershell
node scripts/qa/cleanup-test-fixtures.mjs
```

| Alias | Tenant | Papel | Uso |
| --- | --- | --- | --- |
| `qa_owner_a` | Aurora | clinic_admin | clínica, equipe, privacidade |
| `qa_physician_a` | Aurora | médico | SOAP, prescrição, documentos |
| `qa_nutrition_a` | Aurora | nutricionista | medidas e programas |
| `qa_reception_a` | Aurora | recepção | pacientes, agenda e fila |
| `qa_finance_a` | Aurora | financeiro | financeiro e recibos |
| `qa_patient_a` | Aurora | paciente | portal e LGPD próprios |
| `qa_guardian_a` | Aurora | responsável | vínculo autorizado |
| `qa_owner_b` / `qa_patient_b` | Boreal | admin / paciente | negativo cross-tenant |
| `qa_revoked_a` | Aurora | revogado | negação de acesso |
| `qa_support_pending` / `qa_support_active` | plataforma | suporte | break-glass |

## 3. Ordem de execução

1. Hero público sem sessão.
2. Autenticação e sessão revogada.
3. Administração da plataforma.
4. Clínica Aurora como admin e depois papéis operacionais.
5. Portal de paciente e responsável.
6. Testes negativos de RBAC e tenant.
7. Regressão automatizada e cleanup.

## 4. Hero e landing page (`/`)

Teste em desktop, tablet, celular e 320 px.

- Confirme selo, título, subtítulo e CTAs sem corte.
- **Agendar demonstração** deve navegar para `#demonstracao`.
- **Conhecer a plataforma** deve navegar para `#produto`.
- **Entrar** deve abrir `/auth/login`.
- Navegue por Produto, Operação, Segurança e Planos.
- Em celular, a prévia compacta deve ser legível e não produzir rolagem horizontal.
- Em desktop, a prévia completa não deve invadir a coluna de texto.
- Confirme que todos os nomes/números da prévia são demonstrativos.

Acessibilidade:

- Use `Tab`: foco visível e ordem lógica em logo, navegação e CTAs.
- Use `Enter` nos links.
- Confira contraste e ausência de conteúdo essencial dependente de hover.

## 5. Autenticação

- Faça login como `qa_owner_a`: deve abrir somente a Aurora.
- Faça logout e abra uma rota protegida: deve redirecionar ou mostrar acesso apropriado.
- Faça login como `qa_revoked_a`: não pode abrir módulos nem dados.
- Em aba anônima, abra rota protegida: nenhum dado pode aparecer antes do login.

Falhas que exibem dados protegidos, mantêm sessão revogada ou permitem troca de tenant pela URL são críticas.

## 6. Admin da plataforma (`/admin`)

Use uma identidade de plataforma autorizada. Se ela não existir na instalação local, marque como bloqueado por perfil; não crie permissões manuais fora da fixture.

| Rota | Conferir |
| --- | --- |
| `/admin` | Resumo, navegação, loading e erro |
| `/admin/tenants` | Aurora/Boreal, busca, status e isolamento |
| `/admin/tenants/[tenantId]` | Equipe, unidades, limites e confirmações |
| `/admin/audit` | Auditoria sem conteúdo clínico/payload bruto |
| `/admin/security` | Sessões e privilégios elevados |
| `/admin/support` | Pendente negado; ativo limitado e auditado |
| `/admin/webhooks` | Estado/redrive local, sem provider |
| `/admin/observability` | Jobs, filas e falhas sem segredos |
| billing, usage, storage | vazio/erro/permissão; sem cobrança real |

Negativo: um usuário Aurora deve receber negação segura ao abrir qualquer `/admin`.

## 7. Clínica Aurora (`/clinic/*`)

Em toda tela, confirme loading, vazio, erro, sucesso e persistência após recarregar.

| Área | Rota | Verificação | Papel |
| --- | --- | --- | --- |
| Dashboard | `/clinic/dashboard` | Indicadores e alertas sem Boreal | Admin |
| Agenda | `/clinic/agenda` | agendamento, chegada, triagem, medidas, checkout, conflito | Recepção/clínico |
| Pacientes | `/clinic/patients` | busca e edição permitida de `qa_patient_a` | Recepção |
| Paciente 360 | `/clinic/patients/[patientId]` | timeline, medidas, docs, programa e chat | Clínico |
| Atendimento | `/clinic/patients/[patientId]/encounter` | SOAP final, bloqueio de edição, adendo | Médico |
| Programas | `/clinic/programs`, `/builder` | rascunho, clone, matrícula e check-in | Admin/nutri |
| Documentos | `/clinic/documents` | template e geração local | Admin/médico |
| Financeiro | `/clinic/financeiro` | filtros, recibos e conciliação local | Financeiro |
| CRM | `/clinic/crm` | lead, etapa, responsável e histórico | Recepção |
| Inbox | `/clinic/inbox` | abrir, atribuir, responder e fechar | Recepção |
| Comunidade | `/clinic/community` | vazio, moderação e opt-out | Admin |
| Inventário | `/clinic/inventory` | item, movimento, estoque negativo | Admin |
| Relatórios | `/clinic/reports` | filtros, exportação e negação | Admin/financeiro |
| Configurações | `/clinic/settings` | equipe, permissões, portal, integrações e privacidade | Admin |

### Jornada clínica ponta a ponta

1. Localize ou crie paciente sintético Aurora.
2. Agende atendimento; valide conflito de sala/profissional.
3. Registre chegada, triagem e medidas.
4. Registre SOAP e finalize.
5. Tente alterar o finalizado: deve bloquear ou exigir adendo.
6. Gere documento/prescrição apenas localmente.
7. Faça checkout e abra Paciente 360.
8. Confirme autoria, paciente, tenant e eventos na timeline/auditoria.

### Privacidade

Em Configurações > Privacidade, como `qa_owner_a`:

- Salve rascunho com DPO, versão, SLA, retenções e consentimentos.
- Publique e confirme que automações só ficam ativas depois da publicação.
- Crie novo rascunho e confirme preservação da versão publicada.
- Faça opt-out de finalidade opcional e confirme efeito imediato.
- Como paciente, crie solicitação LGPD; como admin, atribua e confirme alerta/auditoria sanitizados.
- Pedido de anonimização ligado a prontuário/documento deve ficar `retained`, sem exclusão clínica automática.

## 8. Portal e responsável (`/patient`)

### Paciente

Com `qa_patient_a`:

- Confirme que só vê agenda, dados, documentos e solicitações próprios.
- Teste agendar/cancelar quando permitido.
- Envie mensagem e confira efeito na inbox da Aurora.
- Crie/consulte solicitação LGPD própria.
- Tente URL de `qa_patient_b` ou ID aleatório: deve negar.

### Responsável

Com `qa_guardian_a`:

- Confirme apenas o paciente explicitamente vinculado.
- Teste finance/evolução conforme escopo autorizado.
- Tente outro paciente Aurora/Boreal: deve negar sem expor nome, documento ou valor.

## 9. RBAC e isolamento

- `qa_owner_b` não acessa paciente, agenda, documento ou solicitação Aurora.
- `qa_patient_a` não cria solicitação para `qa_patient_b`.
- `qa_reception_a` não executa ações exclusivas de financeiro/admin/médico.
- `qa_finance_a` não edita prontuário.
- Suporte pendente não entra no tenant.
- Suporte ativo tem acesso temporário, auditado e restrito.

Tela vazia não basta: deve existir erro, vazio ou acesso negado seguro.

## 10. Regressão automatizada

Em terminal local já configurado para QA:

```powershell
node scripts/qa/run-scenario.mjs
node scripts/qa/run-clinical-record-scenario.mjs
node scripts/qa/run-continuity-exercise.mjs
node scripts/qa/run-integration-resilience-scenario.mjs
node scripts/qa/run-lgpd-governance-scenario.mjs
node scripts/qa/run-clinic-privacy-automation-scenario.mjs
```

Cada execução deve terminar em `passed`. Ao falhar, registre somente o erro sanitizado, execute cleanup e abra defeito.

## 11. Checklist de aceite

- [ ] Hero responde em desktop/mobile, CTAs e navegação funcionam.
- [ ] Sem sessão/revogado não acessa dados.
- [ ] Admin, Aurora e Boreal permanecem isolados.
- [ ] Agenda → atendimento → finalização → checkout persiste no Paciente 360.
- [ ] Registro final usa autoria, imutabilidade e adendo.
- [ ] Paciente/responsável só veem vínculos permitidos.
- [ ] Política LGPD exige publicação humana; auditoria não tem conteúdo clínico.
- [ ] Nenhum provider externo foi chamado.
- [ ] Não há overflow, console error ou tela em branco.
- [ ] Testes automatizados aplicáveis passam e fixtures são removidas.

## 12. Modelo de defeito

```text
Título: [Área] resumo
Ambiente: local / data ou commit
Papel: qa_<alias>
Rota: /...
Pré-condição: fixture qa_ criada
Passos: 1. ... 2. ... 3. ...
Esperado: ...
Obtido: ...
Impacto: bloqueador | alto | médio | baixo
Evidência: captura sanitizada, sem PII, tokens ou conteúdo clínico
```

## 13. Encerramento

1. Faça logout de todas as contas.
2. Execute `node scripts/qa/cleanup-test-fixtures.mjs`.
3. Pare o Supabase local somente se não estiver em uso por outro trabalho:

```powershell
npx supabase stop
```

