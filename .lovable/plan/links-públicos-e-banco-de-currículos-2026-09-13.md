# Links públicos e Banco de Currículos

## O que será criado

- Um novo menu **Links**, logo abaixo de CRM de relacionamento, para administrar a página pública.
- Uma página pública e móvel em **`/bio`**, sem login, com a identidade Coxinha Surprise e três ações:
  - **Faça seu Pedido**: abre a lista de restaurantes ativos configurados e leva ao cardápio de cada unidade.
  - **Seja um franqueado**: abre o endereço institucional definido pelo administrador.
  - **Trabalhe conosco**: abre o formulário de candidatura.
- Um novo menu administrativo **Banco de Currículos**, com lista dos candidatos e acesso seguro ao currículo anexado.

## Configuração em Links

- Ativar ou desativar cada ação pública.
- Informar manualmente o endereço de **Seja um franqueado**.
- Para cada restaurante:
  - ativar ou desativar sua exibição;
  - usar automaticamente o endereço público sugerido (`/r/slug`);
  - ou informar outro endereço manualmente.
- Mostrar uma prévia e um atalho para abrir `/bio`.

## Formulário Trabalhe conosco

Campos obrigatórios:
- Nome completo
- Data de nascimento
- Sexo
- Telefone
- Cidade
- Currículo em PDF, Word ou imagem

O envio terá validação de formato e tamanho. O currículo ficará privado no Cloudflare R2 e somente administradores poderão abrir ou baixar o arquivo pelo painel.

## Dados e segurança

- Criar configurações únicas da página de links.
- Criar vínculos configuráveis para os restaurantes exibidos.
- Criar cadastro de candidatos com os dados informados e referência privada do currículo.
- A página pública poderá apenas ler os links habilitados e enviar candidaturas válidas.
- Alterações de configuração, listagem de candidatos e acesso aos arquivos serão exclusivos de `master_admin`.
- O envio público do currículo passará por uma função protegida com validação no servidor, limite de arquivo e nomes aleatórios para impedir acesso indevido.

## Interface

- Layout mobile-first na paleta atual do sistema, com logo, título **Coxinha Surprise** e botões grandes.
- Lista de restaurantes em uma tela/modal simples e pesquisável.
- Formulário acessível, com confirmação após o envio.
- Banco de Currículos organizado por data mais recente, com nome, telefone, cidade, idade/data de nascimento, sexo e ações para visualizar ou baixar.

## Verificação

- Testar `/bio` sem autenticação.
- Testar todos os botões, links automáticos e manuais, ativações e desativações.
- Testar envio dos formatos permitidos e rejeição dos inválidos.
- Confirmar que candidatos e arquivos não podem ser consultados publicamente.
- Conferir a experiência em celular e computador.
