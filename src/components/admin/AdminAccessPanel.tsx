import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccessManagementPanel } from "@/components/dashboard/AccessManagementPanel";

interface RestaurantLite { id: string; name: string }

export function AdminAccessPanel() {
  const [restaurants, setRestaurants] = useState<RestaurantLite[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id,name")
        .order("name");
      const list = (data ?? []) as RestaurantLite[];
      setRestaurants(list);
      if (list.length && !restaurantId) setRestaurantId(list[0].id);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="max-w-md space-y-1">
        <Label>Restaurante</Label>
        <Select value={restaurantId} onValueChange={setRestaurantId}>
          <SelectTrigger><SelectValue placeholder="Selecione um restaurante" /></SelectTrigger>
          <SelectContent>
            {restaurants.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {restaurantId ? (
        <AccessManagementPanel key={restaurantId} restaurantId={restaurantId} />
      ) : (
        <p className="text-sm text-muted-foreground">Selecione um restaurante para gerenciar os acessos.</p>
      )}
    </div>
  );
}
