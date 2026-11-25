import { describe, it, expect } from "vitest";
import { validateSplits, remainingAmount, canEditPayment } from "./paymentSplits";

describe("divisão de pagamento", () => {
  it("aceita 10 em dinheiro + 20 em pix num pedido de 30", () => {
    expect(validateSplits([{ method: "cash", amount: 10 }, { method: "pix", amount: 20 }], 30)).toBeNull();
  });
  it("recusa soma diferente do total", () => {
    expect(validateSplits([{ method: "cash", amount: 10 }, { method: "pix", amount: 15 }], 30)).not.toBeNull();
  });
  it("calcula o restante sem erro de centavos", () => {
    expect(remainingAmount([{ method: "cash", amount: 10.1 }], 30.3)).toBe(20.2);
  });
  it("só permite PDV e delivery próprio, não iFood/Quero", () => {
    expect(canEditPayment({ order_type: "pdv" })).toBe(true);
    expect(canEditPayment({ order_type: "delivery" })).toBe(true);
    expect(canEditPayment({ order_type: "delivery", external_source: "ifood" })).toBe(false);
  });
});
