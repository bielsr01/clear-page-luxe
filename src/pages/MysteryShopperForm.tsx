import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { StarRating } from "@/components/MysteryShopperStars";
import { CalendarIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import logoIcon from "@/assets/logo-icon.png";

type Question = { key: string; label: string };
type Category = { key: string; name: string; weight: number; questions: Question[] };

export default function MysteryShopperForm() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [config, setConfig] = useState<Category[]>([]);
  const [alreadySubmitted, setAlreadySubmitted] = useState<string | null>(null);

  const [visitDate, setVisitDate] = useState<Date | undefined>(new Date());
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data, error } = await supabase.rpc("mystery_get_form", { _token: token });
      if (error) { setError(error.message); setLoading(false); return; }
      const res = data as any;
      if (res?.error) { setError(res.error === "not_found" ? "Formulário não encontrado" : res.error); setLoading(false); return; }
      setRestaurantName(res.assignment.restaurant_name || "");
      setConfig(res.config || []);
      if (res.assignment.submitted_at) setAlreadySubmitted(res.assignment.result_token);
      setLoading(false);
    })();
  }, [token]);

  function setRating(catKey: string, qKey: string, v: number) {
    setRatings((prev) => ({ ...prev, [catKey]: { ...(prev[catKey] || {}), [qKey]: v } }));
  }

  async function handleSubmit() {
    if (!visitDate) { alert("Informe a data da visita"); return; }
    const total = config.reduce((n, c) => n + c.questions.length, 0);
    const answered = config.reduce((n, c) => n + Object.keys(ratings[c.key] || {}).length, 0);
    if (answered < total) { if (!confirm(`Você respondeu ${answered} de ${total} perguntas. Enviar mesmo assim?`)) return; }
    setSubmitting(true);
    const { data, error } = await supabase.rpc("mystery_submit_form", {
      _token: token!,
      _visit_date: format(visitDate, "yyyy-MM-dd"),
      _ratings: ratings as any,
      _comments: comments || "",
    });
    setSubmitting(false);
    if (error) { alert(error.message); return; }
    const res = data as any;
    if (res?.error) { alert(res.error); return; }
    setDone(true);
  }

  if (loading) return <div className="min-h-screen grid place-items-center">Carregando…</div>;
  if (error) return <div className="min-h-screen grid place-items-center text-destructive">{error}</div>;

  if (done || alreadySubmitted) {
    const resultToken = alreadySubmitted;
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-muted/30">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="p-8 space-y-4">
            <img src={logoIcon} alt="Logo" className="w-16 h-16 mx-auto object-contain" />
            <CheckCircle2 className="w-20 h-20 text-green-600 mx-auto" />
            <h1 className="text-2xl font-bold">Obrigado pela sua avaliação!</h1>
            <p className="text-muted-foreground">Suas respostas foram registradas com sucesso.</p>
            {resultToken && (
              <Button variant="outline" onClick={() => navigate(`/cliente-oculto/respostas/${resultToken}`)}>Ver minhas respostas</Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-3">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader className="text-center border-b">
            <img src={logoIcon} alt="Logo" className="w-14 h-14 mx-auto object-contain mb-2" />
            <CardTitle className="text-2xl">{restaurantName}</CardTitle>
            <p className="text-sm text-muted-foreground">Avaliação de Cliente Oculto</p>
          </CardHeader>
          <CardContent className="pt-4">
            <Label>Data da visita</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !visitDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {visitDate ? format(visitDate, "dd/MM/yyyy") : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={visitDate} onSelect={setVisitDate} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {config.map((cat) => (
          <Card key={cat.key}>
            <CardHeader className="pb-2"><CardTitle className="text-lg">{cat.name}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {cat.questions.map((q) => (
                <div key={q.key} className="space-y-1.5">
                  <div className="text-sm">{q.label}</div>
                  <StarRating value={ratings[cat.key]?.[q.key] || 0} onChange={(v) => setRating(cat.key, q.key, v)} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Comentários</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={4} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Escreva informações adicionais…" />
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Enviando…" : "Enviar respostas"}
        </Button>
      </div>
    </div>
  );
}
