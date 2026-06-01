import { useEffect, useState } from "react";
import { useNavigate, Link } from "@/lib/router-compat";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";

const signInSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) {
    return "Email ou senha incorretos";
  }
  if (m.includes("email not confirmed")) return "Email ainda não confirmado";
  if (m.includes("user not found")) return "Usuário não encontrado";
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Muitas tentativas. Tente novamente em alguns instantes";
  }
  if (m.includes("network")) return "Erro de conexão. Verifique sua internet";
  return "Não foi possível entrar. Verifique seus dados e tente novamente";
}

export default function Auth() {
  const navigate = useNavigate();
  const { user, isMasterAdmin, isManager, loading, rolesLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && !rolesLoading && user) {
      if (isMasterAdmin) navigate("/admin", { replace: true });
      else if (isManager) navigate("/dashboard", { replace: true });
      else navigate("/", { replace: true });
    }
  }, [user, isMasterAdmin, isManager, loading, rolesLoading, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setBusy(false);
    if (error) return toast.error(translateAuthError(error.message));
    toast.success("Bem-vindo!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-accent/30">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6 font-bold text-xl">
          <img src={logoIcon} alt="Logo" className="w-10 h-10 rounded-lg object-cover" />
          CS Pro
        </Link>
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle>Acessar plataforma</CardTitle>
            <CardDescription>Entre com sua conta para gerenciar seu restaurante.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-in">Email</Label>
                <Input id="email-in" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pwd-in">Senha</Label>
                <div className="relative">
                  <Input
                    id="pwd-in"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
