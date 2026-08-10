# Painel de chamadas

## Finalidade

O painel público em `/painel/[token]` mostra somente o primeiro nome e a inicial do
último sobrenome do paciente, a sala e o horário da chamada. Ele não pode exibir
dados clínicos, contato, profissional, prontuário ou nome completo.

## Operação

1. Na Agenda, crie um painel e escolha uma unidade ou deixe-o abrangendo todas as unidades.
2. Abra o link gerado em uma TV ou monitor da recepção.
3. Ao usar **Chamar** na fila, o painel atualiza automaticamente em até cinco segundos.
4. Desative o painel para interromper a leitura pública; renove o link se ele tiver sido exposto indevidamente.

## Segurança

- O token não é credencial de funcionário e não deve ser divulgado fora da unidade.
- A RPC pública `get_call_panel_snapshot` retorna payload minimizado e não concede
  acesso direto às tabelas de agenda, fila ou pacientes.
- A gestão de painéis exige `agenda.read`/`agenda.write` ou permissões equivalentes de Settings.

## Validação pós-migration

1. Criar painel ativo e abrir o link em uma janela sem sessão.
2. Chamar um paciente na fila e confirmar a exibição no formato `Primeiro U.` e a sala correta.
3. Renovar o link e confirmar que o anterior é recusado.
4. Desativar o painel e confirmar que a URL deixa de retornar dados.
5. Conferir que o painel não mostra nome completo, telefone, profissional ou dados clínicos.
