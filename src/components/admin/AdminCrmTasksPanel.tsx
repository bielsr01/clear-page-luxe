import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList } from "lucide-react";

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
      <Card>
        <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-accent text-accent-foreground grid place-items-center">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <div className="text-lg font-semibold">Tarefas do dia</div>
            <p className="text-sm text-muted-foreground">
              {selected === "all" ? "Todos os restaurantes." : restaurants.find((r) => r.id === selected)?.name}
              {" "}— em breve.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
