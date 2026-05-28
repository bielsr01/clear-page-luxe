# Confirmação de resgate de fidelidade via código WhatsApp (OTP)

Adicionar uma etapa extra no fluxo de resgate de recompensa: quando o operador clicar em **Confirmar resgate** na etapa 5, o sistema envia um código de 6 dígitos para o WhatsApp do cliente cadastrado e exige a digitação desse código antes de criar o pedido e debitar os pontos.

## Fluxo proposto

1. Operador chega à etapa 5 (resumo) — igual hoje.
2. Clica em **Confirmar resgate**.
   - Sistema gera código aleatório de 6 dígitos.
   - Salva no banco (tabela nova `loyalty_redeem_codes`) com `expires_at = now() + 10 min`.
   - Dispara mensagem via Evolution para o telefone do `selectedMember`:
     `Seu código de confirmação de resgate é XXXXXX`
3. Abre um segundo diálogo (modal sobreposto) com:
   - Campo de 6 dígitos (`InputOTP`).
   - Texto: *"Enviamos um código para o WhatsApp de {nome} ({telefone})"*.
   - Botão **Validar e finalizar resgate**.
   - Link **Reenviar código** (gera novo código, invalida anterior, throttle de 30s).
4. Ao validar:
   - Confere código + validade no banco.
   - Se ok: roda o fluxo atual de `confirm()` (cria pedido, chama RPC `redeem_loyalty_points`), marca código como `used_at = now()`, fecha tudo, toast de sucesso.
   - Se inválido/expirado: toast de erro, mantém modal aberto para nova tentativa (máx 5 tentativas, depois precisa reenviar).

Cliente sem telefone válido (< 10 dígitos) ou restaurante sem integração Evolution ativa → mostrar erro claro e não permitir confirmar.

## Detalhes técnicos

### Banco (migration nova)

Tabela `public.loyalty_redeem_codes`:
- `id uuid PK`, `restaurant_id uuid`, `member_id uuid`, `reward_id uuid`
- `code text` (6 dígitos, armazenado como texto), `phone text`
- `created_at`, `expires_at` (default `now()+10min`), `used_at`, `attempts int default 0`
- Index em `(restaurant_id, member_id, reward_id, used_at)`.
- GRANTs para `authenticated` + `service_role`.
- RLS: política `is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(..., 'master_admin')` para ALL.

Duas funções SECURITY DEFINER (mais simples e seguro do que expor SELECT direto):
- `create_loyalty_redeem_code(_restaurant_id, _member_id, _reward_id) RETURNS table(id uuid, code text, phone text)` — invalida códigos anteriores não usados do mesmo trio, gera código de 6 dígitos via `lpad((floor(random()*1000000))::text, 6, '0')`, valida que o member pertence ao restaurante, retorna código + telefone do member.
- `verify_loyalty_redeem_code(_code_id uuid, _code text) RETURNS boolean` — incrementa `attempts`, valida não expirado, não usado, ≤ 5 tentativas; em sucesso seta `used_at` e retorna true.

### Frontend — `src/components/dashboard/LoyaltyRewardsTab.tsx`

No `RedeemDialog`:
- Novo estado: `otpStep: "idle"|"sending"|"awaiting"`, `codeId`, `otpInput`, `resendCooldown`.
- Substituir handler do botão **Confirmar resgate**:
  1. chama `supabase.rpc("create_loyalty_redeem_code", {...})`,
  2. chama `supabase.functions.invoke("evolution-send", { body: { action: "send", integrationId, phone, text: "Seu código de confirmação de resgate é " + code } })`,
  3. abre sub-dialog OTP.
- Sub-dialog usa `InputOTP` (6 slots, `inputMode="numeric"`).
- **Validar**: `rpc("verify_loyalty_redeem_code", { _code_id, _code })`; se true → executa a função `confirm()` atual (criação de pedido + `redeem_loyalty_points`). Se false → toast de erro.
- Buscar `integrationId` ativo do restaurante uma vez (query `evolution_integrations` por `restaurant_id`).

Sem mudanças em outros painéis. A edge function `evolution-send` existente já cobre o envio e a autorização.

## Itens fora de escopo

- Sem histórico/visualização dos códigos para o operador.
- Sem alteração no fluxo de cliente final na vitrine.
- Sem rate-limit global além do "5 tentativas + reenviar".
