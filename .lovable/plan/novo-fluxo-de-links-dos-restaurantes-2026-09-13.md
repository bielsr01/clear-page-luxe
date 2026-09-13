# Novo fluxo de links dos restaurantes

## Alterações
- Remover o campo editável e o texto auxiliar exibidos em cada restaurante.
- Mostrar sempre o endereço efetivo de forma limpa: `/r/slug` para o padrão ou o endereço personalizado salvo.
- Adicionar um botão **Editar** ao lado do endereço de cada restaurante.
- Abrir uma janela de edição com o campo do endereço e três ações:
  - **Restaurar padrão**: volta para `/r/slug`;
  - **Cancelar**: fecha sem alterar;
  - **Salvar link**: valida e aplica o endereço personalizado.
- Manter a ativação/desativação atual e o botão geral **Salvar** para persistir todas as mudanças.

## Comportamento
- Ao ativar um restaurante sem personalização, o endereço padrão aparecerá imediatamente.
- O endereço padrão será exibido apenas como `/r/slug`, sem o domínio temporário da prévia.
- Cancelar não alterará o link que já estava configurado.
