import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Copy, ExternalLink, Link2, Eye, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Shopper = { id: string; name: string; city: string | null; phone: string | null; cpf: string | null; pix_key: string | null };
type Question = { key: string; label: string };
type Category = { key: string; name: string; weight: number; questions: Question[] };
type Assignment = {
  id: string; shopper_id: string | null; restaurant_id: string;
  form_token: string; result_token: string; visit_date: string | null;
  comments: string | null; total_score: number | null; submitted_at: string | null;
  created_at: string;
};
type Restaurant = { id: string; name: string };

const emptyShopper: Omit<Shopper, "id"> = { name: "", city: "", phone: "", cpf: "", pix_key: "" };

function scoreBadge(score: number | null) {
  if (score == null) return <Badge variant="secondary">Pendente</Badge>;
  if (score >= 90) return <Badge className="bg-green-600 hover:bg-green-600">Excelente {score.toFixed(1)}%</Badge>;
  if (score >= 70) return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-black">Atenção {score.toFixed(1)}%</Badge>;
  return <Badge variant="destructive">Plano de ação {score.toFixed(1)}%</Badge>;
}

function slugKey(s: string) {
  return (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `k${Date.now()}`;
}

export default function AdminMysteryShopperPanel() {
  const [tab, setTab] = useState("clientes");
  const [shoppers, setShoppers] = useState<Shopper[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [config, setConfig] = useState<{ id: string; categories: Category[] } | null>(null);
  const [filterRestaurant, setFilterRestaurant] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const [editingShopper, setEditingShopper] = useState<Shopper | null>(null);
  const [newShopper, setNewShopper] = useState(false);
  const [shopperForm, setShopperForm] = useState<Omit<Shopper, "id">>(emptyShopper);

  const [genOpen, setGenOpen] = useState(false);
  const [genShopper, setGenShopper] = useState<string>("");
  const [genRestaurant, setGenRestaurant] = useState<string>("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatWeight, setNewCatWeight] = useState<number>(1);

  const restMap = useMemo(() => Object.fromEntries(restaurants.map((r) => [r.id, r.name])), [restaurants]);
  const shopperMap = useMemo(() => Object.fromEntries(shoppers.map((s) => [s.id, s.name])), [shoppers]);

  async function load() {
    setLoading(true);
    const [s, a, r, c] = await Promise.all([
      supabase.from("mystery_shoppers").select("*").order("name"),
      supabase.from("mystery_shopper_assignments").select("*").order("created_at", { ascending: false }),
      supabase.from("restaurants").select("id, name").order("name"),
      supabase.from("mystery_shopper_config").select("id, categories").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (s.data) setShoppers(s.data as Shopper[]);
    if (a.data) setAssignments(a.data as Assignment[]);
    if (r.data) setRestaurants(r.data as Restaurant[]);
    if (c.data) setConfig({ id: c.data.id as string, categories: (c.data.categories as any) || [] });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // ---- Shoppers CRUD ----
  const openNewShopper = () => { setShopperForm(emptyShopper); setNewShopper(true); };
  const openEditShopper = (s: Shopper) => { setShopperForm({ name: s.name, city: s.city || "", phone: s.phone || "", cpf: s.cpf || "", pix_key: s.pix_key || "" }); setEditingShopper(s); };
  async function saveShopper() {
    if (!shopperForm.name.trim()) { toast({ title: "Informe o nome" }); return; }
    if (editingShopper) {
      const { error } = await supabase.from("mystery_shoppers").update(shopperForm).eq("id", editingShopper.id);
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
      toast({ title: "Cliente oculto atualizado" });
      setEditingShopper(null);
    } else {
      const { error } = await supabase.from("mystery_shoppers").insert(shopperForm);
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
      toast({ title: "Cliente oculto cadastrado" });
      setNewShopper(false);
    }
    load();
  }
  async function deleteShopper(id: string) {
    if (!confirm("Excluir este cliente oculto?")) return;
    const { error } = await supabase.from("mystery_shoppers").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Excluído" }); load();
  }

  // ---- Assignments ----
  async function generateLink() {
    if (!genRestaurant) return toast({ title: "Escolha um restaurante" });
    const { data, error } = await supabase
      .from("mystery_shopper_assignments")
      .insert({ restaurant_id: genRestaurant, shopper_id: genShopper || null })
      .select("form_token")
      .single();
    if (error || !data) return toast({ title: "Erro", description: error?.message, variant: "destructive" });
    const url = `${window.location.origin}/cliente-oculto/${data.form_token}`;
    setGeneratedLink(url);
    load();
  }
  async function deleteAssignment(id: string) {
    if (!confirm("Excluir este formulário?")) return;
    const { error } = await supabase.from("mystery_shopper_assignments").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  }
  function copy(text: string, msg = "Link copiado") {
    navigator.clipboard.writeText(text);
    toast({ title: msg });
  }

  const filteredAssignments = useMemo(
    () => assignments.filter((a) => filterRestaurant === "all" || a.restaurant_id === filterRestaurant),
    [assignments, filterRestaurant]
  );

  // ---- Config ----
  async function saveConfig() {
    if (!config) return;
    const { error } = await supabase.from("mystery_shopper_config").update({ categories: config.categories as any, updated_at: new Date().toISOString() }).eq("id", config.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Configuração salva" });
  }
  function updateCategory(idx: number, patch: Partial<Category>) {
    if (!config) return;
    const next = [...config.categories];
    next[idx] = { ...next[idx], ...patch };
    setConfig({ ...config, categories: next });
  }
  function addCategory() {
    setNewCatName("");
    setNewCatWeight(1);
    setNewCatOpen(true);
  }
  function confirmAddCategory() {
    if (!config) return;
    const name = newCatName.trim();
    if (!name) { toast({ title: "Informe o nome da categoria" }); return; }
    const weight = Number(newCatWeight);
    if (!Number.isFinite(weight) || weight < 0) { toast({ title: "Peso inválido" }); return; }
    setConfig({ ...config, categories: [...config.categories, { key: slugKey(name), name, weight, questions: [] }] });
    setNewCatOpen(false);
  }
  function removeCategory(idx: number) {
    if (!config) return;
    setConfig({ ...config, categories: config.categories.filter((_, i) => i !== idx) });
  }
  function addQuestion(catIdx: number) {
    if (!config) return;
    const next = [...config.categories];
    next[catIdx] = { ...next[catIdx], questions: [...next[catIdx].questions, { key: slugKey(`q_${Date.now()}`), label: "Nova pergunta" }] };
    setConfig({ ...config, categories: next });
  }
  function updateQuestion(catIdx: number, qIdx: number, label: string) {
    if (!config) return;
    const next = [...config.categories];
    const qs = [...next[catIdx].questions];
    qs[qIdx] = { ...qs[qIdx], label };
    next[catIdx] = { ...next[catIdx], questions: qs };
    setConfig({ ...config, categories: next });
  }
  function removeQuestion(catIdx: number, qIdx: number) {
    if (!config) return;
    const next = [...config.categories];
    next[catIdx] = { ...next[catIdx], questions: next[catIdx].questions.filter((_, i) => i !== qIdx) };
    setConfig({ ...config, categories: next });
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="clientes">Clientes ocultos</TabsTrigger>
          <TabsTrigger value="forms">Formulários</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        {/* SHOPPERS */}
        <TabsContent value="clientes" className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Cadastro de clientes ocultos</h3>
            <Button onClick={openNewShopper}><Plus className="w-4 h-4 mr-1" />Novo cliente oculto</Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Chave Pix</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shoppers.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum cliente cadastrado</TableCell></TableRow>)}
                  {shoppers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.city || "—"}</TableCell>
                      <TableCell>{s.phone || "—"}</TableCell>
                      <TableCell>{s.cpf || "—"}</TableCell>
                      <TableCell>{s.pix_key || "—"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditShopper(s)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteShopper(s.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FORMS */}
        <TabsContent value="forms" className="space-y-3">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex gap-2 items-center">
              <Label className="text-sm">Restaurante:</Label>
              <Select value={filterRestaurant} onValueChange={setFilterRestaurant}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {restaurants.map((r) => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => { setGenOpen(true); setGeneratedLink(null); setGenShopper(""); setGenRestaurant(""); }}>
              <Link2 className="w-4 h-4 mr-1" />Gerar link de formulário
            </Button>
          </div>

          <div className="grid gap-3">
            {filteredAssignments.length === 0 && (<div className="text-center text-muted-foreground py-6 border rounded-md">Nenhum formulário gerado</div>)}
            {filteredAssignments.map((a) => {
              const formUrl = `${window.location.origin}/cliente-oculto/${a.form_token}`;
              const resultUrl = `${window.location.origin}/cliente-oculto/respostas/${a.result_token}`;
              return (
                <Card key={a.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div>
                        <div className="font-semibold">{restMap[a.restaurant_id] || "Restaurante"}</div>
                        <div className="text-sm text-muted-foreground">
                          Cliente: {a.shopper_id ? shopperMap[a.shopper_id] || "—" : "Não vinculado"}
                          {a.visit_date && <> · Visita: {new Date(a.visit_date + "T00:00").toLocaleDateString("pt-BR")}</>}
                          {a.submitted_at && <> · Enviado: {new Date(a.submitted_at).toLocaleString("pt-BR")}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">{scoreBadge(a.total_score)}</div>
                    </div>

                    {a.comments && (
                      <div className="text-sm bg-muted/50 rounded p-2 flex gap-2">
                        <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="whitespace-pre-wrap">{a.comments}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => copy(formUrl, "Link do formulário copiado")}>
                        <Copy className="w-3.5 h-3.5 mr-1" />Copiar link do formulário
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => window.open(formUrl, "_blank")}>
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />Abrir formulário
                      </Button>
                      {a.submitted_at && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => copy(resultUrl, "Link das respostas copiado")}>
                            <Copy className="w-3.5 h-3.5 mr-1" />Copiar link das respostas
                          </Button>
                          <Button size="sm" onClick={() => window.open(resultUrl, "_blank")}>
                            <Eye className="w-3.5 h-3.5 mr-1" />Visualizar respostas
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => deleteAssignment(a.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" />Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* CONFIG */}
        <TabsContent value="config" className="space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Configuração do questionário</h3>
              <p className="text-sm text-muted-foreground">Edite categorias, pesos e perguntas. As respostas são de 1 a 5 estrelas.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={addCategory}><Plus className="w-4 h-4 mr-1" />Categoria</Button>
              <Button onClick={saveConfig}>Salvar configuração</Button>
            </div>
          </div>

          {config?.categories.map((cat, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label>Nome da categoria</Label>
                    <Input value={cat.name} onChange={(e) => updateCategory(idx, { name: e.target.value })} />
                  </div>
                  <div className="w-28">
                    <Label>Peso</Label>
                    <Input type="number" min={0} step="0.5" value={cat.weight} onChange={(e) => updateCategory(idx, { weight: Number(e.target.value) })} />
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeCategory(idx)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {cat.questions.map((q, qIdx) => (
                  <div key={qIdx} className="flex gap-2 items-center">
                    <Input value={q.label} onChange={(e) => updateQuestion(idx, qIdx, e.target.value)} placeholder="Pergunta" />
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeQuestion(idx, qIdx)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addQuestion(idx)}><Plus className="w-3.5 h-3.5 mr-1" />Pergunta</Button>
              </CardContent>
            </Card>
          ))}
          {config && config.categories.length > 0 && (
            <div className="flex justify-end pt-2">
              <Button onClick={saveConfig}>Salvar configuração</Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New category dialog */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription>Informe o nome e o peso da categoria.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da categoria</Label>
              <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Ex.: Atendimento" />
            </div>
            <div>
              <Label>Peso</Label>
              <Input type="number" min={0} step="0.5" value={newCatWeight} onChange={(e) => setNewCatWeight(Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCatOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAddCategory}>Confirmar e adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shopper dialog */}
      <Dialog open={newShopper || !!editingShopper} onOpenChange={(o) => { if (!o) { setNewShopper(false); setEditingShopper(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingShopper ? "Editar cliente oculto" : "Novo cliente oculto"}</DialogTitle>
            <DialogDescription>Preencha os dados do cliente oculto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={shopperForm.name} onChange={(e) => setShopperForm({ ...shopperForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Cidade</Label><Input value={shopperForm.city || ""} onChange={(e) => setShopperForm({ ...shopperForm, city: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={shopperForm.phone || ""} onChange={(e) => setShopperForm({ ...shopperForm, phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>CPF</Label><Input value={shopperForm.cpf || ""} onChange={(e) => setShopperForm({ ...shopperForm, cpf: e.target.value })} /></div>
              <div><Label>Chave Pix</Label><Input value={shopperForm.pix_key || ""} onChange={(e) => setShopperForm({ ...shopperForm, pix_key: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveShopper}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate link dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar link do formulário</DialogTitle>
            <DialogDescription>Escolha o restaurante e (opcionalmente) o cliente oculto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Restaurante</Label>
              <Select value={genRestaurant} onValueChange={setGenRestaurant}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{restaurants.map((r) => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cliente oculto (opcional)</Label>
              <Select value={genShopper} onValueChange={setGenShopper}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{shoppers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            {generatedLink && (
              <div className="rounded-md border p-3 space-y-2 bg-muted/40">
                <div className="text-sm break-all">{generatedLink}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(generatedLink)}><Copy className="w-4 h-4 mr-1" />Copiar</Button>
                  <Button size="sm" onClick={() => window.open(generatedLink, "_blank")}><ExternalLink className="w-4 h-4 mr-1" />Abrir</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            {!generatedLink ? (
              <Button onClick={generateLink}>Gerar link</Button>
            ) : (
              <Button variant="outline" onClick={() => setGenOpen(false)}>Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
