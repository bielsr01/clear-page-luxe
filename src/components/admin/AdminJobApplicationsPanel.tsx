import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileUser, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getResumeUrl } from "@/lib/bio";
import { formatPhone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Application = {
  id: string;
  full_name: string;
  birth_date: string;
  sex: string;
  phone: string;
  city: string;
  resume_filename: string;
  resume_size_bytes: number;
  created_at: string;
};

const sexLabels: Record<string, string> = { feminino: "Feminino", masculino: "Masculino", outro: "Outro", nao_informar: "Prefere não informar" };
const fileSize = (value: number) => value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;

export function AdminJobApplicationsPanel() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("job_applications").select("id,full_name,birth_date,sex,phone,city,resume_filename,resume_size_bytes,created_at").order("created_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(error.message);
    setApplications(data ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return applications;
    return applications.filter((item) => `${item.full_name} ${item.phone} ${item.city}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [applications, search]);

  const openResume = async (application: Application, mode: "view" | "download") => {
    setOpening(`${application.id}:${mode}`);
    try {
      const url = await getResumeUrl(application.id, mode);
      if (mode === "view") window.open(url, "_blank", "noopener,noreferrer");
      else window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o currículo");
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone ou cidade" className="pl-9" /></div>
      <Card><CardContent className="p-0">
        {loading ? <div className="p-10 text-center text-muted-foreground">Carregando...</div> : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground"><FileUser className="mx-auto mb-3 h-9 w-9" />Nenhum currículo encontrado.</div>
        ) : (
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Recebido</TableHead><TableHead>Candidato</TableHead><TableHead>Nascimento</TableHead><TableHead>Sexo</TableHead><TableHead>Telefone</TableHead><TableHead>Cidade</TableHead><TableHead>Arquivo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((item) => <TableRow key={item.id}>
              <TableCell className="whitespace-nowrap">{new Date(item.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</TableCell>
              <TableCell className="font-medium">{item.full_name}</TableCell>
              <TableCell className="whitespace-nowrap">{new Date(`${item.birth_date}T12:00:00`).toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>{sexLabels[item.sex] ?? item.sex}</TableCell>
              <TableCell className="whitespace-nowrap">{formatPhone(item.phone)}</TableCell>
              <TableCell>{item.city}</TableCell>
              <TableCell><div className="max-w-48 truncate" title={item.resume_filename}>{item.resume_filename}</div><div className="text-xs text-muted-foreground">{fileSize(item.resume_size_bytes)}</div></TableCell>
              <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Visualizar" disabled={!!opening} onClick={() => void openResume(item, "view")}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Baixar" disabled={!!opening} onClick={() => void openResume(item, "download")}><Download className="h-4 w-4" /></Button></div></TableCell>
            </TableRow>)}</TableBody>
          </Table></div>
        )}
      </CardContent></Card>
    </div>
  );
}