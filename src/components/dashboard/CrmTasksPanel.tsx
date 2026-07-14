import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { CrmTasksView } from "@/components/crm/CrmTasksView";

export function CrmTasksPanel() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: own } = await supabase.from("restaurants").select("id").eq("owner_id", user.id).maybeSingle();
      if (own) { setRestaurantId((own as any).id); setLoading(false); return; }
      const { data: mem } = await supabase.from("restaurant_members").select("restaurant_id").eq("user_id", user.id).maybeSingle();
      setRestaurantId((mem as any)?.restaurant_id ?? null);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!restaurantId) return <div className="text-muted-foreground">Sem restaurante vinculado.</div>;
  return <CrmTasksView restaurantId={restaurantId} />;
}
