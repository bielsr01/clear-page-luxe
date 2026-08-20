import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye, Search, ExternalLink } from "lucide-react";
import { brl, displayOrderNumber } from "@/lib/format";
import { OrderDetailsDialog } from "./OrderDetailsDialog";
import { Input } from "@/components/ui/input";

interface CouponUsageDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: any[];
  filterCode: string | null;
  couponCodes: Set<string>;
}

export function CouponUsageDetailsDialog({
  open,
  onOpenChange,
  orders,
  filterCode,
  couponCodes,
}: CouponUsageDetailsDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<any[]>([]);

  const filteredOrders = useMemo(() => {
    let list = orders.filter((o) => {
      if (!o.coupon_code) return false;
      const code = o.coupon_code.toUpperCase();
      if (filterCode && code !== filterCode) return false;
      return couponCodes.has(code);
    });

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(s) ||
          (o.customer_name || "").toLowerCase().includes(s) ||
          (o.coupon_code || "").toLowerCase().includes(s) ||
          (o.order_number?.toString() || "").includes(s)
      );
    }

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, filterCode, couponCodes, searchTerm]);

  const fetchOrderDetails = async (order: any) => {
    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);
    
    // We need the full order object for OrderDetailsDialog
    const { data: fullOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order.id)
      .single();

    setSelectedOrder(fullOrder);
    setSelectedOrderItems(items || []);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Detalhamento de Uso de Cupons
              {filterCode && <span className="text-muted-foreground ml-2 font-mono text-sm">({filterCode})</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por pedido, cliente ou cupom..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              {filteredOrders.length} pedido(s) encontrado(s)
            </div>
          </div>

          <div className="flex-1 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cupom</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum pedido encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((o) => {
                    const discount = Math.max(0, Number(o.subtotal) + Number(o.delivery_fee) - Number(o.total));
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">#{displayOrderNumber(o)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(o.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate" title={o.customer_name || "N/A"}>
                          {o.customer_name || "N/A"}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-bold text-xs bg-muted px-1.5 py-0.5 rounded">
                            {o.coupon_code}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap font-medium">
                          {brl(o.total)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-destructive">
                          -{brl(discount)}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => fetchOrderDetails(o)}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {selectedOrder && (
        <OrderDetailsDialog
          order={selectedOrder}
          items={selectedOrderItems}
          onClose={() => setSelectedOrder(null)}
          onAdvance={() => {}}
          onCancel={() => {}}
          onDelete={() => {}}
          onPrint={() => {}}
          canChangeStatus={false}
          canEditOrders={false}
        />
      )}
    </>
  );
}
