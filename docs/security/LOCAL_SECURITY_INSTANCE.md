# Supabase local isolado do SlimHiper

Instancia criada em 2026-09-18 para validacao local. Projeto Docker:
`slimhiper-security-local`. Os volumes antigos `*_slimhiper_1308` foram
preservados, assim como os containers dos outros projetos.

Diretorio de trabalho: `.qa-artifacts/slimhiper-security-local` (ignorado pelo
Git). Contem `supabase/config.toml` independente e uma copia das 101 migrations
do projeto, aplicadas com sucesso na inicializacao. Essa copia nao acompanha
automaticamente futuras alteracoes das migrations na raiz.

Endpoints:

- API: http://127.0.0.1:55321
- PostgreSQL: 127.0.0.1:55322
- Studio: http://127.0.0.1:55323
- E-mails de teste: http://127.0.0.1:55324

Rede: `slimhiper-security-loopback`, configurada com
`com.docker.network.bridge.host_binding_ipv4=127.0.0.1`, seguindo a
[orientacao oficial de isolamento local](https://supabase.com/docs/guides/local-development).
Sempre informar essa rede ao reiniciar. **Ressalva verificada neste Windows:**
apesar da opcao configurada, Docker Desktop ainda anuncia as portas como
`0.0.0.0`/`[::]`. O isolamento de acesso ao host nao esta comprovado. Nao usar
esta instancia em rede nao confiavel ou com dados sensiveis ate restringir os
bindings/firewall e verificar novamente. Nenhuma regra global de firewall foi
alterada nesta tarefa.

Executar a partir do diretorio de trabalho acima:

```powershell
npm exec --offline -- supabase start --network-id slimhiper-security-loopback
npm exec --offline -- supabase stop --project-id slimhiper-security-local
```

O comando de start pode exibir credenciais locais; nao compartilhar sua saida.
Nao usar `stop --all` nem `--no-backup`. Nao executar `db reset` sem verificar
explicitamente o alvo e autorizar descarte de dados.

Cadastro publico desativado; e-mail exige confirmacao; TOTP habilitado. Nao
foram criados usuarios ou pacientes, nem executados bootstraps de provedores.
Edge Runtime, analytics e seeds de aplicacao estao desativados nesta instancia.
As migrations podem conter dados referenciais proprios do schema.

A configuracao do frontend e os arquivos `.env` existentes nao foram alterados.
API Auth health, Studio e e-mails de teste responderam HTTP 200. Os nove
containers novos iniciaram; os que possuem healthcheck ficaram saudaveis.
ClamAV, Edge Functions, fixtures de usuarios e testes completos de RLS/Auth/Storage
ainda precisam ser preparados antes de encerrar as nove fases de seguranca.
