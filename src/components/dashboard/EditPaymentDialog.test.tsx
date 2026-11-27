import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditPaymentDialog } from "./EditPaymentDialog";

const { rpcMock, successMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  successMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock },
}));

vi.mock("sonner", () => ({
  toast: { success: successMock, error: vi.fn() },
}));

describe("alteração de pagamento no detalhamento", () => {
  it("salva R$ 10 em dinheiro e R$ 20 no Pix em um pedido aberto de R$ 30", async () => {
    const splits = [
      { method: "cash", amount: 10 },
      { method: "pix", amount: 20 },
    ];
    rpcMock.mockResolvedValue({ data: { payment_method: "mixed", payment_splits: splits }, error: null });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <EditPaymentDialog
        open
        onOpenChange={onOpenChange}
        orderId="pedido-aberto"
        total={30}
        currentMethod="cash"
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar outra forma" }));

    const amounts = screen.getAllByPlaceholderText("0,00");
    expect(amounts).toHaveLength(2);
    expect(amounts[1]).toHaveValue("20.00");
    expect(screen.getByText("Valores conferem com o total.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("update_order_payment", {
        _order_id: "pedido-aberto",
        _splits: splits,
      });
    });
    expect(onSaved).toHaveBeenCalledWith({ payment_method: "mixed", payment_splits: splits });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(successMock).toHaveBeenCalledWith("Forma de pagamento atualizada. O caixa já foi ajustado.");
  });
});
