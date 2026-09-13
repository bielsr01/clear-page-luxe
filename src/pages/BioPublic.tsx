import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, ChevronRight, Loader2, MapPin, Search, ShoppingBag, Store, Upload } from "lucide-react";
import { toast } from "sonner";
import logoIcon from "@/assets/logo-icon.png";
import { supabase } from "@/integrations/supabase/client";
import { BioRestaurantLink, BioSettings, defaultBioSettings } from "@/lib/bio";
import { formatPhone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Restaurant = { id: string; name: string; slug: string };
type Screen = "home" | "restaurants" | "careers" | "success";

export default function BioPublic() {
  const [screen, setScreen] = useState<Screen>("home");
  const [settings, setSettings] = useState<BioSettings>(defaultBioSettings);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [links, setLinks] = useState<BioRestaurantLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [phone, setPhone] = useState("");
  const [sex, setSex] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.title = "Coxinha Surprise | Links";
    const load = async () => {
      const [settingsResult, linksResult, restaurantsResult] = await Promise.all([
        (supabase as any).from("bio_settings").select("order_enabled,franchise_enabled,franchise_url,careers_enabled").eq("id", true).maybeSingle(),
        (supabase as any).from("bio_restaurant_links").select("id,restaurant_id,enabled,custom_url").eq("enabled", true),
        supabase.from("restaurants").select("id,name,slug").order("name"),
      ]);
      setSettings(settingsResult.data ?? defaultBioSettings);
      setLinks(linksResult.data ?? []);
      setRestaurants(restaurantsResult.data ?? []);
      setLoading(false);
    };
    void load();
  }, []);

  const visibleRestaurants = useMemo(() => {
    const enabledIds = new Set(links.map((link) => link.restaurant_id));
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return restaurants.filter((restaurant) => enabledIds.has(restaurant.id) && (!term || restaurant.name.toLocaleLowerCase("pt-BR").includes(term)));
  }, [links, restaurants, search]);

  const restaurantUrl = (restaurant: Restaurant) => links.find((link) => link.restaurant_id === restaurant.id)?.custom_url || `/r/${restaurant.slug}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = fileRef.current?.files?.[0];
    if (!sex) return toast.error("Selecione o sexo");
    if (!file) return toast.error("Anexe seu currículo");
    if (file.size > 10 * 1024 * 1024) return toast.error("O currículo deve ter no máximo 10 MB");
    setSending(true);
    try {
      const data = new FormData(form);
      data.set("phone", phone);
      data.set("sex", sex);
      data.set("resume", file);
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/job-application-submit`, {
        method: "POST",
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: data,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível enviar");
      form.reset();
      setPhone("");
      setSex("");
      setScreen("success");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o currículo");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 text-center">
          <img src={logoIcon} alt="Logo Coxinha Surprise" className="mx-auto mb-4 h-24 w-24 rounded-2xl object-contain shadow-elegant" />
          <h1 className="text-3xl font-extrabold">Coxinha Surprise</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sabor, oportunidade e novas histórias.</p>
        </header>

        {loading ? <div className="grid place-items-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : screen === "home" ? (
          <section className="space-y-3" aria-label="Links principais">
            {settings.order_enabled && <Button className="h-16 w-full justify-between px-5 text-base shadow-soft" onClick={() => setScreen("restaurants")}><span className="flex items-center gap-3"><ShoppingBag className="h-5 w-5" />Faça seu Pedido</span><ChevronRight className="h-5 w-5" /></Button>}
            {settings.franchise_enabled && settings.franchise_url && <Button asChild variant="secondary" className="h-16 w-full justify-between px-5 text-base shadow-soft"><a href={settings.franchise_url} target="_blank" rel="noopener noreferrer"><span className="flex items-center gap-3"><Store className="h-5 w-5" />Seja um franqueado</span><ChevronRight className="h-5 w-5" /></a></Button>}
            {settings.careers_enabled && <Button variant="outline" className="h-16 w-full justify-between px-5 text-base shadow-soft" onClick={() => setScreen("careers")}><span className="flex items-center gap-3"><BriefcaseBusiness className="h-5 w-5" />Trabalhe conosco</span><ChevronRight className="h-5 w-5" /></Button>}
          </section>
        ) : screen === "restaurants" ? (
          <section className="space-y-4">
            <Button variant="ghost" className="px-0" onClick={() => setScreen("home")}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
            <div><h2 className="text-2xl font-bold">Onde você quer pedir?</h2><p className="text-sm text-muted-foreground">Escolha a unidade mais próxima.</p></div>
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar restaurante" className="pl-9" /></div>
            <div className="space-y-2">{visibleRestaurants.map((restaurant) => <Button key={restaurant.id} asChild variant="outline" className="h-14 w-full justify-between px-4"><a href={restaurantUrl(restaurant)}><span className="flex items-center gap-3 text-left"><MapPin className="h-5 w-5 text-primary" />{restaurant.name}</span><ChevronRight className="h-4 w-4" /></a></Button>)}{visibleRestaurants.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum restaurante encontrado.</p>}</div>
          </section>
        ) : screen === "careers" ? (
          <section className="space-y-5">
            <Button variant="ghost" className="px-0" onClick={() => setScreen("home")}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
            <div><h2 className="text-2xl font-bold">Trabalhe conosco</h2><p className="text-sm text-muted-foreground">Envie seus dados para fazer parte do nosso time.</p></div>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="full_name">Nome completo</Label><Input id="full_name" name="full_name" minLength={3} maxLength={120} required autoComplete="name" /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="birth_date">Data de nascimento</Label><Input id="birth_date" name="birth_date" type="date" max={new Date().toISOString().slice(0, 10)} required /></div>
                <div className="space-y-2"><Label>Sexo</Label><Select value={sex} onValueChange={setSex}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="feminino">Feminino</SelectItem><SelectItem value="masculino">Masculino</SelectItem><SelectItem value="outro">Outro</SelectItem><SelectItem value="nao_informar">Prefiro não informar</SelectItem></SelectContent></Select></div>
              </div>
              <div className="space-y-2"><Label htmlFor="phone">Telefone</Label><Input id="phone" name="phone" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="(00) 00000-0000" inputMode="tel" minLength={14} maxLength={16} required /></div>
              <div className="space-y-2"><Label htmlFor="city">Cidade</Label><Input id="city" name="city" minLength={2} maxLength={100} required autoComplete="address-level2" /></div>
              <div className="space-y-2"><Label htmlFor="resume">Currículo</Label><Input ref={fileRef} id="resume" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp" required /><p className="text-xs text-muted-foreground">PDF, Word ou imagem, com até 10 MB.</p></div>
              <Button type="submit" className="h-12 w-full" disabled={sending}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{sending ? "Enviando..." : "Enviar currículo"}</Button>
            </form>
          </section>
        ) : (
          <section className="text-center"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-success text-success-foreground"><BriefcaseBusiness className="h-8 w-8" /></div><h2 className="text-2xl font-bold">Currículo enviado!</h2><p className="mt-2 text-muted-foreground">Recebemos seus dados. Boa sorte!</p><Button className="mt-6" onClick={() => setScreen("home")}>Voltar aos links</Button></section>
        )}
        <footer className="mt-12 text-center text-xs text-muted-foreground">Coxinha Surprise</footer>
      </div>
    </main>
  );
}