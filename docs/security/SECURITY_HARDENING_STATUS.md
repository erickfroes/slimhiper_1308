# Reforco de seguranca — nove fases

Atualizacao posterior em 2026-09-18: Docker voltou a responder e foi criada a
instancia isolada `slimhiper-security-local`. O historico completo de 101 migrations,
incluindo 830–832, foi aplicado com sucesso. O bloqueio Docker descrito na evidencia
anterior abaixo foi superado; os demais testes integrados continuam pendentes.
Detalhes em `docs/security/LOCAL_SECURITY_INSTANCE.md`.

Atualizado em 2026-09-18. **Implementacao local avancada; liberacao operacional
ainda bloqueada.** Nenhuma migration foi aplicada a staging/producao. Nenhum
provedor foi acionado. Alteracoes preexistentes foram preservadas.

## Estado por fase

| Fase            | Implementacao nesta arvore                                                                                                                                    | Evidencia e pendencia                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. RPC/RLS      | Migration 831 revoga ACLs legadas, inclusive authenticated, e defaults globais; allowlist explicita de assinaturas                                            | ACL negativa e defaults testados em PostgreSQL embarcado. Falta replay integral do historico e matriz real de papeis/RLS                                                                                                |
| 2. Convites     | Migration 830: identidade, membership, tenant, papel e versao vinculados; bloqueios; aceitacao/auditoria/token atomicos; endpoint service-only                | Testes de identidade/tenant incorretos, e-mail nao confirmado, replay, reenvio, mudanca de papel e rollback. Falta GoTrue/e-mail real local; senha e revogacao de sessoes sao operacoes Auth separadas da transacao SQL |
| 3. Dependencias | Next minimo 16.3.3, lock instalado 16.3.5; start de producao corrigido                                                                                        | Build passou. Atualizacao direcionada, nao certificacao de ausencia de CVEs em toda a arvore                                                                                                                            |
| 4. Scripts/CSP  | Proxy com nonce aleatorio, strict-dynamic, origens Supabase exatas, SSR dinamico e no-store; cookies preservados em redirects                                 | Teste de politica passou. Falta navegador/SSR integrado. unsafe-inline permanece somente em estilos                                                                                                                     |
| 5. Injecao      | CSV neutraliza formulas com controles iniciais; filtro PostgREST entre aspas com escaping                                                                     | Testes negativos passaram. Falta executar filtro via PostgREST real                                                                                                                                                     |
| 6. Uploads      | Endpoint autenticado, assinatura/MIME, tamanho, cotas, quarentena privada, ClamAV obrigatorio e proibicao de escrita direta/sobrescrita em buckets protegidos | Politicas restritivas e cotas testadas em PostgreSQL; protocolo scanner em loopback. Falta Storage HTTP + ClamAV real                                                                                                   |
| 7. Abuso HTTP   | Guard comum nas mutacoes Next e 31 Edge Functions; limite de bytes reais, timeout, orcamento SQL e Retry-After                                                | Testes de guarda Next e inventario passaram. Falta runtime Deno/Edge integrado; WAF por IP e protecao pre-autenticacao continuam requisitos de infraestrutura                                                           |
| 8. Origens      | SITE_URL canonico; convites nao confiam em Host/Forwarded; escrita Next exige Origin exato                                                                    | Testes de origem maliciosa passaram. Conferir allowlists reais de Auth/OAuth sem ampliar os dominios                                                                                                                    |
| 9. Regressao/CI | npm run test:security obrigatorio no job quality-gates; dados ficticios e banco em memoria                                                                    | Suite local aprovada. Execucao remota da CI, navegador, concorrencia real multi-conexao e Supabase completo pendentes                                                                                                   |

## Limites das evidencias

- `npm run test:security`: 18 testes passaram na verificacao final; inclui migrations
  830, 831 e 832 reais sobre contratos minimos sinteticos em PGlite/PostgreSQL.
  Helpers legados do fixture sao substitutos declarados, nao a aplicacao inteira.
- `npm run type-check`, `npm run lint` e `npm run build`: aprovados localmente.
  Build usa endpoints loopback ficticios, sem banco/provedor externo.
- Auditoria estatica Supabase: 101 migrations, 392 nomes de funcoes, 31 Edge
  Functions; 9 verificacoes aprovadas. Nao prova autorizacao runtime.
- Higiene de nomes de arquivos env versionados: aprovada; nenhum valor secreto
  foi lido ou impresso durante a auditoria.
- `git diff --check`: aprovado. Auditoria estatica de readiness em modo estrito
  com ambiente sintetico production/mock=false: 24 verificacoes aprovadas. Esse
  resultado nao valida a configuracao do ambiente hospedado.
- Docker Desktop: tentativa de iniciar o servico recusada por permissao Windows.
  Sem daemon disponivel, nao houve replay integral em Supabase local.
- Inicializacao do servidor Next para verificacao HTTP/navegador: bloqueada pela
  politica de execucao. Nao contornada. Build nao substitui teste de navegacao.
- Deno/Edge e ClamAV reais nao foram executados; teste ClamAV usa servidor TCP
  sintetico, nao afirma deteccao efetiva de malware.

## Sequencia de liberacao (ainda nao executada)

1. Disponibilizar Docker local e ambiente isolado com dados ficticios. Confirmar
   alvo local antes de executar qualquer migration, reset ou smoke.
2. Reaplicar o historico completo nesse ambiente, incluindo 810, 820–822 e
   830–832. Nao editar migrations antigas e nao usar push remoto nesta tarefa.
3. Validar ACL/RLS com anon, paciente, responsavel, staff, admin e dois tenants:
   REST direto, RPC direto e Storage, inclusive requisicoes feitas pelo console.
4. Configurar scanner privado atualizado e `CLAMAV_HOST`/`CLAMAV_PORT` no backend.
   Validar arquivo limpo, EICAR, scanner indisponivel, cotas, sobrescrita, corrida
   de revogacao e limpeza de quarentena. Nao usar arquivos clinicos reais.
5. Configurar `SITE_URL` HTTPS canonico e `APP_ALLOWED_ORIGINS` apenas quando
   necessario. `APP_ENV=local` permite HTTP somente loopback em testes locais;
   nao usar esta excecao em producao. Nao derivar origem de headers do cliente.
6. Publicar migrations ANTES de ativar o novo Next/Edge, em janela coordenada.
   A migration 832 bloqueia uploads do frontend antigo; o novo frontend depende
   dela e do scanner. Configuracao incompleta causa falha fechada, nao fallback.
7. Reemitir convites pendentes: a migration 830 revoga links antigos sem vinculo.
   Validar entrega, senha, aceite, revogacao de sessoes e recuperacao apos falha.
8. Testar navegador: nonce igual ao dos scripts SSR e distinto entre respostas,
   login, reset, convite, Patient 360, fotos, chat, billing e documentos. Verificar
   console/CSP, sem testar provedores reais sem autorizacao especifica.
9. Exigir CI verde e registrar evidencia desses smokes antes de declarar 9/9
   concluidas. Configurar WAF/Auth rate limits, MFA e alertas na infraestrutura.

## Contratos operacionais e riscos residuais

- Browser/console nunca e uma fronteira confiavel: usuarios podem chamar APIs.
  A protecao efetiva depende de grants/RLS e autorizacao server-side aplicados.
- Uploads aceitam PDF/JPEG/PNG/WebP conforme bucket. HEIC/HEIF, SVG, executaveis e
  PDF com acoes ativas detectadas sao recusados. Assinatura nao e parser completo
  nem garantia de ausencia de malware; ClamAV atualizado e obrigatorio.
- Limites atuais: 5 MiB imagens de perfil/refeicoes, 8 MiB progresso, 10 MiB
  demais; 100 MiB/100 reservas por usuario em 24 h, 1 GiB por tenant.
  Reservas rejeitadas contam no limite diario para evitar abuso. Cada tentativa
  usa caminho novo; objetos publicados nao sao sobrescritos pelo endpoint.
- Quarentena e removida ao final; falhas de remocao exigem reconciliacao privada
  por idade. Falha da auditoria apos promover o objeto exige reconciliar objeto,
  reserva e auditoria antes de nova tentativa. Storage e SQL nao sao uma unica
  transacao. Nao foi instalado um scheduler de limpeza nesta tarefa.
- Politicas restringem anon/authenticated; service_role continua uma fronteira
  privilegiada, nao um mecanismo WORM. Nao distribuir essa chave ao browser.
- Rate limits de aplicacao nao substituem limites de conexoes, IP, banda e Auth.
  Webhooks anonimos compartilham orcamento e dependem de HMAC/token no handler;
  flooding pode afetar disponibilidade. Dimensionar e testar antes de go-live.
- RPCs/REST legados continuam acessiveis conforme suas permissoes; os limites
  das rotas Next nao limitam automaticamente cada RPC direto do Supabase.
- Revogar outras sessoes Auth impede refresh, mas access tokens ja emitidos
  podem continuar validos ate expirar. Ajustar TTL e politicas operacionais.
- `package.json` mudou para corrigir Next/start e adicionar testes/PGlite; instalacao
  feita com `npm install --ignore-scripts --no-audit --no-fund`, lock preservado,
  `rocketCritical` intacto. Nao houve envio do grafo privado para npm audit.

Referencias: [Next Windows RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36),
[Next AVIF](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4),
[PostgreSQL default privileges](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html),
[PostgREST URL grammar](https://docs.postgrest.org/en/v13/references/api/url_grammar.html).
