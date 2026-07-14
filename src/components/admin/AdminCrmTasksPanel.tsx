import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrmTasksView } from "@/components/crm/CrmTasksView";

export function AdminCrmTasksPanel() {
  const [restaurants, setRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string>("all");

  useEffect(() => {
    supabase.from("restaurants").select("id,name").order("name").then(({ data }) => {
      setRestaurants((data as any) ?? []);
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="max-w-sm space-y-2">
        <Label>Restaurante</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <CrmTasksView restaurantId={selected === "all" ? null : selected} isAdmin />
    </div>
  );
}
