import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export function CrmTasksPanel() {
  return (
    <Card>
      <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-accent text-accent-foreground grid place-items-center">
          <ClipboardList className="w-7 h-7" />
        </div>
        <div>
          <div className="text-lg font-semibold">Tarefas do dia</div>
          <p className="text-sm text-muted-foreground">Em breve. Esta seção ainda está em construção.</p>
        </div>
      </CardContent>
    </Card>
  );
}
