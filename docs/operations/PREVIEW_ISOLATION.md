# Politica de Isolamento de Previews

Previews existem para revisao de PR e devem ser considerados descartaveis.

## Requisitos obrigatorios

- Usar projeto Supabase isolado de preview ou mock/dummy explicitamente rotulado.
- Nao reutilizar service role, webhook tokens, buckets, URLs assinadas, bases
  D4Sign/Asaas ou credenciais de producao.
- Nao executar callbacks reais de D4Sign/Asaas; usar sandbox/dummy ou manter
  webhooks desabilitados.
- Nao importar dados reais identificaveis. Quando houver necessidade de massa de
  teste realista, usar dados sinteticos ou anonimizados aprovados.
- Expirar/destruir ambiente e logs apos review conforme retencao curta definida
  na matriz de ambientes.

## Validacoes antes de compartilhar uma URL de preview

- [ ] `NEXT_PUBLIC_USE_MOCK_DATA` esta `true` somente se o preview for dummy e
      sem dados reais; caso contrario esta `false`/ausente.
- [ ] Nenhum secret backend pertence a staging/producao.
- [ ] Rotas protegidas redirecionam/negam sem sessao.
- [ ] Webhooks externos estao desabilitados ou apontam para sandbox/dummy.
- [ ] Logs do preview nao exibem payload bruto, PII/PHI, tokens ou signed URLs.
