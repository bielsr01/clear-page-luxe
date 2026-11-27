import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderDetailsDialog } from "./OrderDetailsDialog";

const { fromMock, orderMock } = vi.hoisted(() => {
  const order = vi.fn().mockResolvedValue({ data: [], error: null });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { fromMock: vi.fn(() => ({ select })), orderMock: order };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock, rpc: vi.fn() },
}));

const baseOrder = {
  id: "pedido-teste",
  order_number: 30,
  customer_name: "Cliente Teste",
  customer_phone: "5587999999999",
  address_street: "Rua A",
  address_number: "10",
  address_complement: null,
  address_neighborhood: "Centro",
  address_city: "Petrolândia",
  address_state: "PE",
  address_cep: "",
  address_notes: null,
  payment_method: "cash",
  change_for: null,
  subtotal: 30,
  delivery_fee: 0,
  total: 30,
  status: "preparing",
  order_type: "pdv",
  created_at: "2026-11-26T12:00:00Z",
  delivery_latitude: null,
  delivery_longitude: null,
  external_source: null,
  payment_splits: null,
};

function renderDetails(status: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrderDetailsDialog
        order={{ ...baseOrder, status }}
        items={[]}
        onClose={vi.fn()}
        onAdvance={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onPrint={vi.fn()}
        canChangeStatus
        canEditOrders={false}
      />
    </QueryClientProvider>,
  );
}

describe("pagamento no detalhamento do pedido", () => {
  it("mostra o botão de alterar em um pedido aberto", async () => {
    renderDetails("preparing");
    expect(await screen.findByRole("button", { name: "Alterar forma de pagamento" })).toBeInTheDocument();
  });

  it("não mostra o botão de alterar depois que o pedido é entregue", async () => {
    renderDetails("delivered");
    expect(await screen.findByText("Sem itens.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alterar forma de pagamento" })).not.toBeInTheDocument();
  });
});
