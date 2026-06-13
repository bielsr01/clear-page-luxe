## Caixa Diário — plano de implementação

### O que já existe (reaproveitar)
- Tabelas: `cash_register_sessions`, `cash_movements`, `cash_withdrawals`, `payment_reconciliation` — todas com RLS por restaurante via `is_restaurant_manager`.
- Enums: `cash_session_status` (open/closed), `cash_movement_type` (opening, order_cash, change_out, withdrawal, supply, adjustment), `payment_method` (cash, pix, card_on_delivery, online).
- Aba "Fluxo de caixa" já existe no `AppSidebar` / `ManagerDashboard` (placeholder "Em breve").
- `FinancePanel` (mensal) permanece intocado e continua acessível em "Receitas - Despesas".

### Mudanças de banco (1 migration)
1. `ALTER TABLE public.orders ADD COLUMN cash_session_id uuid REFERENCES public.cash_register_sessions(id)` + índice.
2. `ALTER TABLE public.orders ADD COLUMN created_by uuid` (quem registrou — usado em PDV / cancelamentos).
3. Estender enum `payment_method` com `card_debit`, `card_credit`, `mixed` (mantém os existentes funcionando).
4. Estender enum `cash_movement_type` com `cancel_refund` (estorno de venda cancelada paga em dinheiro).
5. Trigger `tg_orders_attach_cash_session` em `orders` (BEFORE INSERT) que, se `restaurant_id` for de venda interna (`order_type IN ('pdv','delivery','pickup')` e não `external_source`), procura sessão `open` da unidade e seta `cash_session_id`. Se não houver sessão aberta e `order_type='pdv'` → `RAISE EXCEPTION 'Nenhum caixa aberto'`. Para delivery/pickup do cardápio público apenas anexa se existir (não bloqueia cliente final).
6. Trigger `tg_orders_cash_movement` AFTER INSERT/UPDATE em `orders`: ao status `delivered` (ou `accepted` p/ delivery, conforme padrão atual) insere linha em `cash_movements` (`order_cash` / `cancel_refund`) com `session_id` e valor por forma de pagamento. Idempotente via `order_id` + `type`.
7. View `v_cash_session_summary` que calcula em tempo real para cada sessão: `cash_sales`, `pix_sales`, `card_sales`, `manual_in`, `manual_out`, `expected_cash`, `total_movement`.
8. Habilitar realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE cash_register_sessions, cash_movements, cash_withdrawals;` (se ainda não estiverem).
9. Function `public.close_cash_session(_session_id, counted_cash, counted_pix, counted_card, notes)` SECURITY DEFINER — calcula esperado a partir da view, grava em `cash_register_sessions` (status=closed, expected_cash, counted_cash, difference) e em `payment_reconciliation` (1 linha por método).
10. Function `public.reopen_cash_session(_session_id)` restrita a `master_admin`.
11. GRANTs/policies revisadas para `authenticated`.

### Frontend
Novo diretório `src/components/dashboard/cashflow/`:
- `CashFlowPanel.tsx` — container da aba "cash-flow" com 2 abas internas:
  - **Caixa diário** (novo) — default
  - **Resumo mensal** (renderiza `FinancePanel` atual, sem alteração)
- `CurrentSessionCard.tsx` — mostra sessão aberta (aberto por, hora, valor inicial, totais por forma, esperado, total geral) com subscribe em realtime nas 3 tabelas.
- `OpenSessionDialog.tsx` — modal de abertura (valor inicial, observação).
- `CloseSessionDialog.tsx` — modal de fechamento (dinheiro/pix/cartão contados, observação, mostra diferenças, chama `close_cash_session`).
- `CashMovementDialog.tsx` — entrada/retirada manual (tipo, valor, motivo).
- `SessionHistoryList.tsx` — sessões fechadas com drill-down (movimentações, vendas, diferenças).
- `useCashSession.ts` — hook com query da sessão aberta + summary + realtime.

Integrações:
- **`PdvDialog.tsx`**: bloquear venda se `useCashSession` não tiver sessão aberta — mostrar botão "Abrir caixa" que abre o `OpenSessionDialog`. Injeta `created_by = auth.uid()` no insert do pedido.
- **`StoreOpenToggle.tsx`**:
  - Ao abrir loja → se não houver sessão aberta, abre `OpenSessionDialog` em seguida (toast com CTA).
  - Ao fechar loja → se houver sessão aberta, abre `CloseSessionDialog` (bloqueia confirmação se usuário descartar? mostra aviso modal não-bloqueante).
- **`ManagerDashboard.tsx`**: substituir o `<div>Em breve.</div>` da view `cash-flow` por `<CashFlowPanel restaurantId={...} />`.
- **`OrdersPanel` / cancelamentos**: nenhum código novo — o trigger cuida do estorno automático ao status virar `cancelled`.

### Detalhes técnicos
- A view `v_cash_session_summary` é a **fonte única** de números no front (evita divergência). Front consulta `.from('v_cash_session_summary').eq('session_id', ...)`.
- Realtime: subscribe em `cash_register_sessions` (sessão atual), `cash_movements` (toda inserção) e `orders` filtrado por `restaurant_id` invalidam a query do summary.
- `payment_method='mixed'`: front grava em `orders.payment_method='mixed'` e cria 2+ linhas em `cash_movements` no momento da venda PDV (já há suporte multi-linha por venda).
- Auditoria: nenhum DELETE é exposto — UI só oferece "Estornar" que cria movimento `adjustment` negativo com motivo + `created_by`.
- Tipos: após a migration, `src/integrations/supabase/types.ts` será regenerado automaticamente.

### Entregáveis nesta ordem
1. Migration (banco + view + functions + triggers + realtime).
2. Componentes em `src/components/dashboard/cashflow/`.
3. Patch em `PdvDialog`, `StoreOpenToggle`, `ManagerDashboard`.
4. Resumo curto de onde tudo ficou.

### Fora de escopo (não mexer)
- `FinancePanel` mensal e `AdminFinancePanel` — preservados.
- Pedidos vindos de iFood/Quero (`external_source` setado) não geram movimento de caixa.
- Permissões granulares por grupo: usaremos a permission `finance` existente como gate.