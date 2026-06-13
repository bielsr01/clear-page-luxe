import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrentSessionCard } from "./CurrentSessionCard";
import { SessionHistoryList } from "./SessionHistoryList";
import { FinancePanel } from "@/components/dashboard/FinancePanel";

export function CashFlowPanel({ restaurantId }: { restaurantId: string }) {
  return (
    <Tabs defaultValue="daily" className="space-y-4">
      <TabsList>
        <TabsTrigger value="daily">Caixa diário</TabsTrigger>
        <TabsTrigger value="monthly">Resumo financeiro</TabsTrigger>
      </TabsList>
      <TabsContent value="daily" className="space-y-4">
        <CurrentSessionCard restaurantId={restaurantId} />
        <SessionHistoryList restaurantId={restaurantId} />
      </TabsContent>
      <TabsContent value="monthly">
        <FinancePanel restaurantIds={[restaurantId]} />
      </TabsContent>
    </Tabs>
  );
}
