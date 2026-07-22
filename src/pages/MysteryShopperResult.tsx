import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StarRating } from "@/components/MysteryShopperStars";
import { Badge } from "@/components/ui/badge";
import logoIcon from "@/assets/logo-icon.png";

type Question = { key: string; label: string };
type Category = { key: string; name: string; weight: number; questions: Question[] };

function catAverage(cat: Category, ratings: any): { avg: number; pct: number } {
  const vals = cat.questions.map((q) => Number(ratings?.[cat.key]?.[q.key] || 0)).filter((v) => v > 0);
  if (!vals.length) return { avg: 0, pct: 0 };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { avg, pct: (avg / 5) * 100 };
}

function totalBadge(score: number | null) {
  if (score == null) return null;
  if (score >= 90) return <Badge className="bg-green-600 hover:bg-green-600 text-lg py-1 px-3">Excelente · {score.toFixed(1)}%</Badge>;
  if (score >= 70) return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-black text-lg py-1 px-3">Atenção · {score.toFixed(1)}%</Badge>;
  return <Badge variant="destructive" className="text-lg py-1 px-3">Plano de ação · {score.toFixed(1)}%</Badge>;
}

export default function MysteryShopperResult() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data, error } = await supabase.rpc("mystery_get_result", { _token: token });
      if (error) { setError(error.message); setLoading(false); return; }
      const res = data as any;
      if (res?.error) { setError("Respostas não encontradas"); setLoading(false); return; }
      setData(res);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen grid place-items-center">Carregando…</div>;
  if (error) return <div className="min-h-screen grid place-items-center text-destructive">{error}</div>;

  const config: Category[] = data.config || [];

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-3">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader className="text-center border-b">
            <img src={logoIcon} alt="Logo" className="w-14 h-14 mx-auto object-contain mb-2" />
            <CardTitle className="text-2xl">{data.restaurant_name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cliente oculto: {data.shopper_name || "—"}
              {data.visit_date && <> · Visita: {new Date(data.visit_date + "T00:00").toLocaleDateString("pt-BR")}</>}
            </p>
            <div className="pt-2">{totalBadge(data.total_score != null ? Number(data.total_score) : null)}</div>
          </CardHeader>
        </Card>

        {config.map((cat) => {
          const { avg, pct } = catAverage(cat, data.ratings);
          return (
            <Card key={cat.key}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg">{cat.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">Média: {avg.toFixed(1)} · {pct.toFixed(0)}% · peso {cat.weight}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {cat.questions.map((q) => (
                  <div key={q.key} className="space-y-1.5">
                    <div className="text-sm">{q.label}</div>
                    <StarRating value={Number(data.ratings?.[cat.key]?.[q.key] || 0)} readOnly />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {data.comments && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg">Comentários</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap">{data.comments}</p></CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
