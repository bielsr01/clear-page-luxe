# Exclusão de currículos

## O que será criado
- Adicionar um botão de lixeira em cada candidatura no Banco de Currículos.
- Exibir uma confirmação com o nome do candidato antes da exclusão definitiva.
- Durante a exclusão, bloquear as ações daquele currículo e informar sucesso ou falha.

## Exclusão segura
- Criar uma função protegida que aceite apenas usuários `master_admin` autenticados.
- Localizar o currículo pelo identificador, apagar primeiro o arquivo privado no Cloudflare R2 e depois remover o cadastro no Supabase.
- Não permitir que o navegador envie ou escolha diretamente o endereço do arquivo a excluir.

## Verificação
- Confirmar que cancelar mantém o currículo.
- Confirmar que excluir remove imediatamente o item da lista e também o arquivo anexado.
- Validar que usuários sem permissão não conseguem executar a exclusão.

## Detalhes técnicos
- A interface usará o diálogo de confirmação e os botões já existentes no sistema.
- A chamada autenticada ficará centralizada no utilitário de currículos.
- A nova função será registrada junto às demais funções do projeto e fará a validação de função administrativa no servidor.
