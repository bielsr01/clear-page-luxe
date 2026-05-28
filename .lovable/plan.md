# Envio Manual (WhatsApp via Evolution)

Criar uma nova aba no painel do restaurante chamada **"Envio Manual"**, dentro do grupo **Marketing**, onde o usuário digita um número e uma mensagem e clica em **Enviar** para disparar uma mensagem simples pela conexão Evolution já configurada do restaurante.

## Comportamento da tela

- Campo **Número (com DDD)** — input de texto livre, somente dígitos serão usados. Aceita formato com ou sem máscara; normalização BR (acrescenta `55` se faltar).
- Campo **Mensagem** — `textarea` multilinha.
- Botão **Enviar mensagem** — desabilitado se número < 10 dígitos ou mensagem vazia.
- Feedback via `toast` (sucesso / erro). Limpa a mensagem após envio bem-sucedido; mantém o número para envios em sequência.
- Aviso amigável se não houver integração Evolution conectada para o restaurante.

Sem histórico, sem mídia, sem agendamento — envio único e direto, como pedido.

## Permissões

Adicionar nova chave em `src/lib/permissions.ts`:

- `marketing.manual_send.view` (em `FULL_PERMISSIONS` e `EMPTY_PERMISSIONS`)
- Marcar como `LEGACY_INHERIT_FROM_PARENT` herdando de `marketing.bulk.view` para grupos antigos não bloquearem.
- Incluir no painel `AccessManagementPanel` junto às demais permissões de Marketing.

## Detalhes técnicos

**Arquivos novos**
- `src/components/dashboard/ManualSendPanel.tsx` — UI + chamada via `supabase.functions.invoke("evolution-send", { body: { action: "send", integrationId, phone, text } })`. Busca o `integrationId` da tabela `evolution_integrations` pelo `restaurant_id`.

**Arquivos editados**
- `src/components/dashboard/AppSidebar.tsx` — novo item `marketing:manual-send` (ícone `Send` ou `MessageCircle`) dentro do grupo Marketing; visibilidade via `can("marketing.manual_send.view")`.
- `src/pages/ManagerDashboard.tsx` — adicionar `"marketing:manual-send"` ao tipo/roteamento, título "Envio Manual", entrada no mapa `allowed`, renderizar `<ManualSendPanel restaurantId={...} />`.
- `src/lib/permissions.ts` — nova chave conforme acima.
- `src/components/dashboard/AccessManagementPanel.tsx` — toggle correspondente.

**Backend**: nenhuma alteração. A edge function `evolution-send` já existe, valida autorização (manager do restaurante), normaliza o telefone e envia via `/message/sendText/{instance}`.
