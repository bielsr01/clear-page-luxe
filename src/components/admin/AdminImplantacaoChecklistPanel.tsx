import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Store { id: string; name: string; }
interface Item { id: string; name: string; sort_order: number; is_active: boolean; }
interface Status { id: string; store_id: string; item_id: string; checked: boolean; checked_at: string | null; }

export function AdminImplantacaoChecklistPanel() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [itemName, setItemName] = useState("");
  const [busy, setBusy] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    const [{ data: st }, { data: it }] = await Promise.all([
      supabase.from("implantacao_stores").select("id,name").order("name"),
      supabase.from("implantacao_checklist_items").select("*").eq("is_active", true).order("sort_order"),
    ]);
    setStores((st as any) ?? []);
    setItems((it as any) ?? []);
  };

  const loadStatus = async (sid: string) => {
    if (!sid) return setStatus([]);
    const { data, error } = await supabase.from("implantacao_checklist_status").select("*").eq("store_id", sid);
    if (error) return toast.error(error.message);
    setStatus((data as any) ?? []);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadStatus(selectedStoreId); }, [selectedStoreId]);

  const map = useMemo(() => {
    const m = new Map<string, Status>();
    status.forEach((s) => m.set(s.item_id, s));
    return m;
  }, [status]);

  const toggle = async (itemId: string, checked: boolean) => {
    if (!selectedStoreId) return toast.error("Selecione uma loja");
    const existing = map.get(itemId);
    const payload: any = {
      store_id: selectedStoreId,
      item_id: itemId,
      checked,
      checked_at: checked ? new Date().toISOString() : null,
      checked_by: checked ? user?.id ?? null : null,
    };
    const res = existing
      ? await supabase.from("implantacao_checklist_status").update(payload).eq("id", existing.id)
      : await supabase.from("implantacao_checklist_status").insert(payload);
    if (res.error) return toast.error(res.error.message);
    loadStatus(selectedStoreId);
  };

  const openNewItem = () => { setEditing(null); setItemName(""); setItemOpen(true); };
  const openEditItem = (i: Item) => { setEditing(i); setItemName(i.name); setItemOpen(true); };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    setBusy(true);
    const nextOrder = editing ? editing.sort_order : (items.at(-1)?.sort_order ?? 0) + 1;
    const res = editing
      ? await supabase.from("implantacao_checklist_items").update({ name: itemName.trim() }).eq("id", editing.id)
      : await supabase.from("implantacao_checklist_items").insert({ name: itemName.trim(), sort_order: nextOrder });
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Salvo");
    setItemOpen(false);
    load();
  };

  const removeItem = async (i: Item) => {
    const { error } = await supabase.from("implantacao_checklist_items").delete().eq("id", i.id);
    if (error) return toast.error(error.message);
    toast.success("Item excluído");
    load();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(items, oldIdx, newIdx).map((it, i) => ({ ...it, sort_order: i }));
    setItems(reordered);
    const { error } = await Promise.all(
      reordered.map((it, i) => supabase.from("implantacao_checklist_items").update({ sort_order: i }).eq("id", it.id))
    ).then(() => ({ error: null as any })).catch((err) => ({ error: err }));
    if (error) { toast.error("Erro ao salvar ordem"); load(); }
  };

  const completed = status.filter((s) => s.checked).length;
  const ids = items.map((i) => i.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-2 min-w-[260px]">
          <Label>Loja</Label>
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger><SelectValue placeholder="Selecione uma loja" /></SelectTrigger>
            <SelectContent>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={itemOpen} onOpenChange={setItemOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={openNewItem}><Plus className="w-4 h-4 mr-2" />Novo item do checklist</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle></DialogHeader>
            <form onSubmit={saveItem} className="space-y-3">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={itemName} onChange={(e) => setItemName(e.target.value)} required />
              </div>
              <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {selectedStoreId ? (
        <>
          <div className="text-sm text-muted-foreground">
            {completed} de {items.length} itens concluídos
          </div>
          <Card>
            <CardContent className="p-0">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <div className="divide-y">
                    {items.map((i) => (
                      <SortableChecklistRow
                        key={i.id}
                        item={i}
                        status={map.get(i.id)}
                        onToggle={(checked) => toggle(i.id, checked)}
                        onEdit={() => openEditItem(i)}
                        onRemove={() => removeItem(i)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Selecione uma loja para preencher o checklist.</CardContent></Card>
      )}
    </div>
  );
}

function SortableChecklistRow({
  item, status, onToggle, onEdit, onRemove,
}: {
  item: Item;
  status?: Status;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const checked = status?.checked ?? false;
  return (
    <div ref={setNodeRef} style={style} className="p-3 flex items-center gap-3 bg-background">
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
        {...attributes}
        {...listeners}
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="w-5 h-5" />
      </button>
      <Checkbox checked={checked} onCheckedChange={(v) => onToggle(!!v)} />
      <div className="flex-1 min-w-0">
        <div className={checked ? "line-through text-muted-foreground" : ""}>{item.name}</div>
        {status?.checked_at && (
          <div className="text-xs text-muted-foreground">
            Marcado em {new Date(status.checked_at).toLocaleString("pt-BR")}
          </div>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="w-4 h-4" /></Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost"><Trash2 className="w-4 h-4" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>O item será removido do checklist de todas as lojas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
