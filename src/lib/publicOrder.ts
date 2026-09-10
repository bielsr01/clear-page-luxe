import { supabase } from "@/integrations/supabase/client";

export interface PublicOrderBundle {
  order: any;
  items: any[];
  options: any[];
}

/**
 * Busca um pedido (com itens e opções) usando a função segura `get_public_order`.
 * A tabela `orders` não é mais legível publicamente — apenas quem tem o id do
 * pedido ou o token do link de acompanhamento consegue ver aquele pedido.
 */
export async function fetchPublicOrder(params: { orderId?: string | null; token?: string | null }): Promise<PublicOrderBundle | null> {
  const { data, error } = await (supabase.rpc as any)("get_public_order", {
    _order_id: params.orderId ?? null,
    _token: params.token ?? null,
  });
  if (error || !data) return null;
  const bundle = data as any;
  if (!bundle?.order) return null;
  return {
    order: bundle.order,
    items: Array.isArray(bundle.items) ? bundle.items : [],
    options: Array.isArray(bundle.options) ? bundle.options : [],
  };
}
