import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Upload, CheckCircle2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-external`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Group = { id: string; name: string };
type StepState = { score: number; notes: string; photoUrl?: string | null; uploading?: boolean };

async function callAction(action: string, token: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ action, token, ...extra }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function uploadPhoto(token: string, groupId: string, file: File) {
  const form = new FormData();
  form.append("token", token);
  form.append("group_id", groupId);
  form.append("file", file);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.url as string;
}

export default function AuditExternal() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [month, setMonth] = useState("");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);

  const [auditorName, setAuditorName] = useState("");
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [states, setStates] = useState<StepState[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await callAction("get_form", token);
        if (!res.restaurant) throw new Error("Restaurante não encontrado");
        setRestaurantName(res.restaurant.name);
        setMonth(res.audit_month);
        setGroups(res.groups || []);
        setAlreadySubmitted(!!res.already_submitted);
        setStates((res.groups || []).map(() => ({ score: 100, notes: "" })));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const updateSt = (patch: Partial<StepState>) => {
    setStates((prev) => prev.map((s, i) => (i === step ? { ...s, ...patch } : s)));
  };

  const onPickPhoto = async (file: File) => {
    if (!token) return;
    const g = groups[step];
    updateSt({ uploading: true });
    try {
      const url = await uploadPhoto(token, g.id, file);
      updateSt({ uploading: false, photoUrl: url });
    } catch (e: any) {
      updateSt({ uploading: false, photoUrl: null });
      toast.error(`Erro ao enviar foto: ${e.message}`);
    }
  };

  const finish = async () => {
    if (!token) return;
    if (states.some((s) => !s.photoUrl)) {
      toast.error("Envie a foto de todos os grupos antes de finalizar.");
      return;
    }
    setSaving(true);
    try {
      const rows = groups.map((g, i) => ({
        group_id: g.id,
        group_name: g.name,
        score: states[i].score,
        notes: states[i].notes || null,
        photo_url: states[i].photoUrl,
      }));
      await callAction("submit", token, { auditor_name: auditorName.trim(), rows });
      setDone(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  if (error) return <div className="min-h-screen grid place-items-center text-destructive p-4 text-center">{error}</div>;

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-14 h-14 text-success" />
            <h2 className="text-xl font-semibold">Auditoria enviada!</h2>
            <p className="text-sm text-muted-foreground">Obrigado, {auditorName}. Sua avaliação foi registrada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-screen grid place-items-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5" /> Auditoria — {restaurantName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">Mês de referência: <strong>{month}</strong></div>
            {alreadySubmitted && (
              <div className="text-xs rounded border border-warning/50 bg-warning/10 text-warning-foreground p-2">
                Já existe uma auditoria registrada para este mês. Ao enviar, uma nova será acrescentada.
              </div>
            )}
            {groups.length === 0 ? (
              <div className="text-sm text-destructive">Nenhum grupo de auditoria configurado.</div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Seu nome <span className="text-destructive">*</span></Label>
                  <Input value={auditorName} onChange={(e) => setAuditorName(e.target.value)} placeholder="Nome completo" />
                </div>
                <Button className="w-full" disabled={!auditorName.trim()} onClick={() => setStarted(true)}>
                  Iniciar auditoria
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const current = groups[step];
  const st = states[step];
  const isLast = step === groups.length - 1;

  return (
    <div className="min-h-screen p-4 bg-muted/30">
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="text-base">Auditoria — {restaurantName}</CardTitle>
          <div className="text-sm text-muted-foreground">
            Passo {step + 1} de {groups.length} • <span className="font-bold text-foreground">{current?.name}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Foto <span className="text-destructive">*</span></Label>
            {st?.photoUrl ? (
              <div className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Foto enviada</div>
            ) : (
              <div className="text-xs text-muted-foreground">Obrigatório para prosseguir.</div>
            )}
            <label className="flex items-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-accent">
              <Upload className="w-4 h-4" />
              <span className="text-sm">{st?.uploading ? "Enviando..." : "Escolher / tirar foto"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onPickPhoto(e.target.files[0])}
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Pontuação</Label>
              <Badge variant="outline" className="font-mono text-base">{st?.score ?? 0}</Badge>
            </div>
            <Slider min={0} max={100} step={1} value={[st?.score ?? 0]} onValueChange={(v) => updateSt({ score: v[0] })} />
          </div>

          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea value={st?.notes ?? ""} onChange={(e) => updateSt({ notes: e.target.value })} rows={3} />
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" disabled={step === 0 || saving} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>
            {isLast ? (
              <Button disabled={saving || st?.uploading || !st?.photoUrl} onClick={finish}>
                {saving ? "Enviando..." : "Finalizar auditoria"}
              </Button>
            ) : (
              <Button disabled={st?.uploading || !st?.photoUrl} onClick={() => setStep((s) => s + 1)}>
                Próximo <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
