import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  isOpenNow, isWithinSchedule, ManualOverride, OpeningHours, getEffectiveOverride,
} from "@/lib/hours";
import { useCashSession } from "@/hooks/useCashSession";
import { requestCashflowAction } from "@/lib/cashflowBus";
import { useAuth } from "@/contexts/AuthContext";
import { usePreviousCashClose } from "@/hooks/usePreviousCashClose";
import { brl } from "@/lib/format";


interface Props {
  restaurantId: string;
  openingHours: OpeningHours | null | undefined;
  manualOverride: ManualOverride;
  onChanged: () => void;
}

export function StoreOpenToggle({ restaurantId, openingHours, manualOverride, onChanged }: Props) {
  const ov = getEffectiveOverride(manualOverride);
  const open = isOpenNow(openingHours, ov);
  const withinSchedule = isWithinSchedule(openingHours);
  const { isOpen: cashOpen, refetch: refetchCash } = useCashSession(restaurantId);
  const { user } = useAuth();
  const { data: prevClose } = usePreviousCashClose(restaurantId);

  // Cash opening fields (used inline when opening the store without an open cash session)
  const [cashAmount, setCashAmount] = useState("0");
  const [cashNotes, setCashNotes] = useState("");

  // Pré-preenche com o fechamento anterior quando disponível
  useEffect(() => {
    if (!cashOpen && prevClose != null) {
      setCashAmount(String(Number(prevClose).toFixed(2)));
    }
  }, [cashOpen, prevClose]);

  const cashValueNum = Number(String(cashAmount).replace(",", "."));
  const cashIsDifferent = prevClose != null && !isNaN(cashValueNum)
    && Math.abs(cashValueNum - Number(prevClose)) > 0.001;


  const warnCashOnClose = () => {
    if (cashOpen) {
      toast.warning("Atenção: o caixa continua aberto. Lembre-se de fechá-lo.", {
        action: { label: "Fechar caixa", onClick: () => requestCashflowAction("close") },
      });
    }
  };

  const [openDialog, setOpenDialog] = useState(false);
  const [openStep, setOpenStep] = useState<"mode" | "cash">("mode");
  const [closeDialog, setCloseDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  // Modo de duração para abrir/fechar manualmente
  const [closeMode, setCloseMode] = useState<"until" | "today">("today");
  const [minutes, setMinutes] = useState("30");
  const [untilTime, setUntilTime] = useState("23:00");

  const [openMode, setOpenMode] = useState<"until" | "today" | "early">("today");
  const [openMinutes, setOpenMinutes] = useState("30");
  const [openUntilTime, setOpenUntilTime] = useState("23:00");

  // Calcula horário de fechamento agendado para hoje
  const todayScheduledClose = (): Date | null => {
    if (!openingHours) return null;
    const now = new Date();
    const cfg = openingHours[String(now.getDay())];
    if (!cfg || !cfg.enabled) return null;
    const [oh, om] = (cfg.open || "00:00").split(":").map(Number);
    const [ch, cm] = (cfg.close || "00:00").split(":").map(Number);
    const d = new Date(now);
    d.setHours(ch, cm, 0, 0);
    // Cruza meia-noite
    if (ch * 60 + cm <= oh * 60 + om) d.setDate(d.getDate() + 1);
    if (d.getTime() <= now.getTime()) return null;
    return d;
  };
  const earlyClose = todayScheduledClose();


  const persist = async (override: ManualOverride) => {
    setBusy(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ manual_override: override as any, is_open: override?.type === "open" ? true : override?.type === "closed" ? false : isWithinSchedule(openingHours) })
      .eq("id", restaurantId);
    setBusy(false);
    if (error) return toast.error(error.message);
    onChanged();
  };

  const openCashIfNeeded = async (): Promise<boolean> => {
    if (cashOpen) return true;
    if (!user?.id) { toast.error("Usuário não autenticado"); return false; }
    const value = Number(String(cashAmount).replace(",", "."));
    if (isNaN(value) || value < 0) { toast.error("Valor inicial do caixa inválido"); return false; }
    if (cashIsDifferent && !cashNotes.trim()) {
      toast.error("Informe o motivo da diferença em relação ao fechamento anterior");
      return false;
    }

    const { error } = await supabase.from("cash_register_sessions").insert({
      restaurant_id: restaurantId,
      opened_by: user.id,
      opening_amount: value,
      opening_notes: cashNotes || null,
      status: "open" as const,
    } as any);
    if (error) {
      if (error.code === "23505") { await refetchCash(); return true; }
      toast.error(error.message);
      return false;
    }
    await refetchCash();
    toast.success("Caixa aberto");
    setCashAmount("0");
    setCashNotes("");
    return true;
  };

  const handleToggle = (next: boolean) => {
    if (next) {
      // Tentando abrir — sempre passa pelo diálogo para garantir caixa aberto
      if (withinSchedule && cashOpen) {
        persist(null).then(() => { toast.success("Loja aberta"); });
      } else {
        setOpenMode(withinSchedule ? "today" : "minutes");
        setOpenMinutes("30");
        // Se já está dentro do horário, pula direto para o caixa
        setOpenStep(withinSchedule ? "cash" : "mode");
        setOpenDialog(true);
      }
    } else {
      setCloseMode("minutes");
      setMinutes("30");
      setCloseDialog(true);
    }
  };

  const computeUntil = (mode: "minutes" | "until" | "today", mins: string, time: string): string => {
    const now = new Date();
    if (mode === "minutes") {
      const m = Math.max(1, parseInt(mins) || 0);
      return new Date(now.getTime() + m * 60_000).toISOString();
    }
    if (mode === "until") {
      const [h, mi] = time.split(":").map(Number);
      const d = new Date(now);
      d.setHours(h, mi, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };

  const confirmOpen = async () => {
    // Garante caixa aberto antes de abrir a loja
    const ok = await openCashIfNeeded();
    if (!ok) return;

    if (withinSchedule) {
      await persist(null);
      setOpenDialog(false);
      toast.success("Loja aberta");
      return;
    }

    let until: string;
    if (openMode === "early") {
      if (!earlyClose) { toast.error("Não há horário agendado para hoje"); return; }
      until = earlyClose.toISOString();
    } else {
      until = computeUntil(openMode as "minutes" | "until" | "today", openMinutes, openUntilTime);
    }
    await persist({ type: "open", until });
    setOpenDialog(false);
    toast.success("Loja aberta manualmente");
  };


  const confirmClose = async () => {
    const until = computeUntil(closeMode, minutes, untilTime);
    await persist({ type: "closed", until });
    setCloseDialog(false);
    toast.success("Loja fechada");
    if (closeMode === "minutes") {
      warnCashOnClose();
    } else if (cashOpen) {
      // Fechamento prolongado: abre o popup de fechamento de caixa automaticamente
      requestCashflowAction("close");
    }
  };

  // Auto-sync: quando override expira ou a janela de horário muda, atualiza is_open no banco
  const lastSyncedRef = useRef<boolean>(open);
  const cashOpenRef = useRef<boolean>(cashOpen);
  useEffect(() => { lastSyncedRef.current = open; }, []);
  useEffect(() => { cashOpenRef.current = cashOpen; }, [cashOpen]);
  useEffect(() => {
    const tick = async () => {
      const computed = isOpenNow(openingHours, manualOverride);
      const ovNow = getEffectiveOverride(manualOverride);
      // Se o override expirou (ainda existe no banco mas já passou), limpar
      if (manualOverride && !ovNow) {
        // Só reabre automaticamente se houver caixa aberto.
        const nextIsOpen = isWithinSchedule(openingHours) && cashOpenRef.current;
        await supabase
          .from("restaurants")
          .update({ manual_override: null, is_open: nextIsOpen })
          .eq("id", restaurantId);
        onChanged();
        return;
      }
      if (computed !== lastSyncedRef.current) {
        // Bloqueia abertura automática sem caixa aberto — o popup AutoOpenCashPrompt cuidará disso.
        if (computed && !cashOpenRef.current) return;
        lastSyncedRef.current = computed;
        await supabase.from("restaurants").update({ is_open: computed }).eq("id", restaurantId);
        onChanged();
      }
    };
    const id = setInterval(tick, 30_000);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, JSON.stringify(openingHours), JSON.stringify(manualOverride)]);

  const ovLabel = () => {
    if (!ov) return null;
    if (ov.type === "open") {
      if (ov.until) {
        const d = new Date(ov.until);
        return `Aberto até ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      }
      // Sem until: usa horário de fechamento programado de hoje, se houver
      const sched = todayScheduledClose();
      if (sched) return `Aberto até ${sched.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      return "Aberto";
    }
    if (ov.type === "closed") {
      if (!ov.until) return "Fechado";
      const d = new Date(ov.until);
      return `Fechado até ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return null;
  };

  return (
    <>
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
        <Badge className={open ? "bg-success text-success-foreground" : ""} variant={open ? "default" : "secondary"}>
          {open ? "Aberto" : "Fechado"}
        </Badge>
        {ovLabel() && <span className="text-xs text-muted-foreground">{ovLabel()}</span>}
        <Switch checked={open} onCheckedChange={handleToggle} disabled={busy} />
      </div>

      {/* Opções de abertura fora do horário */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openStep === "cash"
                ? "Abertura de caixa"
                : (withinSchedule ? "Abrir restaurante" : "Abrir fora do horário")}
            </DialogTitle>
            <DialogDescription>
              {openStep === "cash"
                ? "Informe o valor inicial em dinheiro presente na gaveta para abrir o caixa."
                : (withinSchedule
                  ? "Para abrir o restaurante é necessário um caixa aberto."
                  : "O restaurante está fora do horário de funcionamento configurado. Por quanto tempo deseja manter aberto? Ao expirar, o sistema fecha automaticamente.")}
            </DialogDescription>
          </DialogHeader>

          {openStep === "cash" && !cashOpen && (
            <div className="space-y-3 py-2 border rounded-lg p-3 bg-muted/40">
              {prevClose != null && (
                <div className="text-xs text-muted-foreground">
                  Sugestão baseada no fechamento anterior: <b>{brl(Number(prevClose))}</b>
                </div>
              )}
              <div>
                <Label>Valor inicial (R$)</Label>
                <Input type="number" step="0.01" min={0} value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
              </div>
              <div>
                <Label>
                  Observação {cashIsDifferent ? <span className="text-destructive">(obrigatória — valor difere do fechamento anterior)</span> : "(opcional)"}
                </Label>
                <Input
                  value={cashNotes}
                  onChange={(e) => setCashNotes(e.target.value)}
                  placeholder={cashIsDifferent ? "Explique o motivo da diferença…" : ""}
                />
              </div>
            </div>
          )}

          {openStep === "mode" && !withinSchedule && (
            <RadioGroup value={openMode} onValueChange={(v) => setOpenMode(v as any)} className="space-y-3 py-2">
              <div className="flex items-center gap-3">
                <RadioGroupItem value="minutes" id="om" />
                <Label htmlFor="om" className="flex-1">Por alguns minutos</Label>
                <Input
                  type="number" min={1} className="w-24"
                  value={openMinutes}
                  onChange={(e) => setOpenMinutes(e.target.value)}
                  onFocus={() => setOpenMode("minutes")}
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="until" id="ou" />
                <Label htmlFor="ou" className="flex-1">Até um horário específico</Label>
                <Input
                  type="time" className="w-32"
                  value={openUntilTime}
                  onChange={(e) => setOpenUntilTime(e.target.value)}
                  onFocus={() => setOpenMode("until")}
                />
              </div>
              {earlyClose && (
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="early" id="oe" />
                  <Label htmlFor="oe" className="flex-1">
                    Abrir mais cedo (fecha às {earlyClose.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})
                  </Label>
                </div>
              )}
              <div className="flex items-center gap-3">
                <RadioGroupItem value="today" id="ot" />
                <Label htmlFor="ot" className="flex-1">Abrir pelo resto do dia</Label>
              </div>
            </RadioGroup>
          )}

          <DialogFooter>
            {openStep === "cash" && !withinSchedule ? (
              <Button variant="outline" onClick={() => setOpenStep("mode")}>Voltar</Button>
            ) : (
              <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            )}
            {openStep === "mode" && !cashOpen ? (
              <Button onClick={() => setOpenStep("cash")} disabled={busy}>Avançar</Button>
            ) : (
              <Button onClick={confirmOpen} disabled={busy}>Confirmar abertura</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opções de fechamento */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar restaurante</DialogTitle>
            <DialogDescription>Por quanto tempo deseja fechar?</DialogDescription>
          </DialogHeader>

          <RadioGroup value={closeMode} onValueChange={(v) => setCloseMode(v as any)} className="space-y-3 py-2">
            <div className="flex items-center gap-3">
              <RadioGroupItem value="minutes" id="m" />
              <Label htmlFor="m" className="flex-1">Por alguns minutos</Label>
              <Input
                type="number" min={1} className="w-24"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                onFocus={() => setCloseMode("minutes")}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="until" id="u" />
              <Label htmlFor="u" className="flex-1">Até um horário específico</Label>
              <Input
                type="time" className="w-32"
                value={untilTime}
                onChange={(e) => setUntilTime(e.target.value)}
                onFocus={() => setCloseMode("until")}
              />
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="today" id="t" />
              <Label htmlFor="t" className="flex-1">Fechar pelo resto do dia</Label>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Cancelar</Button>
            <Button onClick={confirmClose} disabled={busy} variant="destructive">Confirmar fechamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
