import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ManualSendPanel({ restaurantId }: { restaurantId: string }) {
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const { data: integration, isLoading } = useQuery({
    queryKey: ["evolution_integration_for_manual", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("evolution_integrations")
        .select("id, instance_name")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      return data;
    },
    enabled: !!restaurantId,
  });

  const digits = phone.replace(/\D/g, "");
  const canSend = !!integration?.id && digits.length >= 10 && text.trim().length > 0 && !sending;

  async function handleSend() {
    if (!integration?.id) {
      toast.error("Nenhuma integração WhatsApp/Evolution configurada para este restaurante.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-send", {
        body: { action: "send", integrationId: integration.id, phone: digits, text: text.trim() },
      });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.error || "Falha ao enviar");
      toast.success("Mensagem enviada");
      setText("");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Send className="w-5 h-5" /> Envio Manual</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoading && !integration && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Nenhuma integração Evolution/WhatsApp configurada. Configure em Configurações → Integrações antes de enviar.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="manual-phone">Número (com DDD)</Label>
          <Input
            id="manual-phone"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />
          <p className="text-xs text-muted-foreground">
            Apenas os dígitos serão usados. O DDI 55 é adicionado automaticamente se faltar.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-text">Mensagem</Label>
          <Textarea
            id="manual-text"
            placeholder="Digite a mensagem a enviar..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={!canSend}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar mensagem
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
