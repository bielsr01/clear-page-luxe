export type SplitMethod = "cash" | "pix" | "card_debit" | "card_credit" | "card_on_delivery";
export interface PaymentSplit { method: SplitMethod; amount: number }

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  card_debit: "Cartão de débito",
  card_credit: "Cartão de crédito",
  card_on_delivery: "Cartão na entrega",
};

const cents = (n: number) => Math.round(Number(n || 0) * 100);

/** Retorna mensagem de erro ou null se a divisão for válida para o total. */
export function validateSplits(splits: PaymentSplit[], total: number): string | null {
  if (splits.length === 0) return "Informe ao menos uma forma de pagamento.";
  if (splits.some((s) => !(cents(s.amount) > 0))) return "Cada valor precisa ser maior que zero.";
  const sum = splits.reduce((a, s) => a + cents(s.amount), 0);
  if (sum !== cents(total)) return "A soma dos pagamentos precisa ser igual ao total do pedido.";
  return null;
}

export function remainingAmount(splits: PaymentSplit[], total: number): number {
  return (cents(total) - splits.reduce((a, s) => a + cents(s.amount), 0)) / 100;
}

export function canEditPayment(o: { external_source?: string | null; order_type: string }): boolean {
  return !o.external_source && ["pdv", "delivery", "pickup"].includes(o.order_type);
}
