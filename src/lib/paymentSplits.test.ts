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
  it.each(["pending", "accepted", "preparing", "out_for_delivery", "awaiting_pickup"])(
    "permite alterar pedido próprio aberto com status %s",
    (status) => {
      expect(canEditPayment({ order_type: "delivery", status })).toBe(true);
    },
  );
  it.each(["delivered", "cancelled"])("bloqueia pagamento de pedido concluído com status %s", (status) => {
    expect(canEditPayment({ order_type: "pdv", status })).toBe(false);
    expect(canEditPayment({ order_type: "delivery", status })).toBe(false);
  });
  it("permite PDV e retirada própria enquanto estão abertos", () => {
    expect(canEditPayment({ order_type: "pdv", status: "preparing" })).toBe(true);
    expect(canEditPayment({ order_type: "pickup", status: "awaiting_pickup" })).toBe(true);
  });
  it("não permite alterar iFood ou Quero mesmo enquanto estão abertos", () => {
    expect(canEditPayment({ order_type: "delivery", status: "preparing", external_source: "ifood" })).toBe(false);
    expect(canEditPayment({ order_type: "delivery", status: "preparing", external_source: "quero" })).toBe(false);
  });
});
