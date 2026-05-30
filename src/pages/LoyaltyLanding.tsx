import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { 
  Award, 
  MessageCircle, 
  Loader2, 
  ArrowLeft, 
  CheckCircle2, 
  History, 
  Gift, 
  Coins,
  Phone,
  ArrowRight,
  Info,
  ShieldCheck,
  Star
} from "lucide-react";
import { formatPhone, normalizeBrPhone } from "@/lib/format";

type FlowStep = "landing" | "phone" | "otp" | "dashboard";

interface LoyaltySettings {
  enabled: boolean;
  loyalty_description: string;
  loyalty_rules: string;
}

export default function LoyaltyLanding() {
  const { slug } = useParams();
  const [step, setStep] = useState<FlowStep>("landing");
  const [phone, setPhone] = useState("");
  const [otpCodeId, setOtpCodeId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [memberData, setMemberData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const { data: restaurant, isLoading: isRestLoading, error: queryError } = useQuery({
    queryKey: ["restaurant-loyalty-public", slug],
    queryFn: async () => {
      if (!slug) throw new Error("Slug é obrigatório");
      
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, logo_url, phone, whatsapp_url")
        .eq("slug", slug)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: loyaltySettings, isLoading: isLoyaltyLoading } = useQuery({
    queryKey: ["restaurant-loyalty-settings-public", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return null;

      const { data, error } = await supabase
        .from("loyalty_settings")
        .select("enabled, loyalty_description, loyalty_rules")
        .eq("restaurant_id", restaurant.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!restaurant?.id,
  });

  const rawSettings = loyaltySettings;
  const settingsObj = Array.isArray(rawSettings) ? rawSettings[0] : (rawSettings as any);
  
  const settings: LoyaltySettings = {
    enabled: !!settingsObj?.enabled,
    loyalty_description: settingsObj?.loyalty_description || "Acumule pontos em todas as suas compras e troque por benefícios exclusivos. Quanto mais você consome, mais vantagens recebe.",
    loyalty_rules: settingsObj?.loyalty_rules || 
      "• Acumule pontos em cada pedido: Ganhe pontos em todas as suas compras, seja pelo delivery, retirada ou PDV.\n" +
      "• Troque por benefícios: Use seus pontos para resgatar produtos exclusivos ou descontos especiais em seus próximos pedidos.\n" +
      "• Consulta Simples: Acompanhe seu saldo e histórico de pontos em tempo real através deste link oficial.\n" +
      "• Validação por WhatsApp: Para sua segurança, o acesso ao seu extrato é validado através de um código enviado para seu WhatsApp.\n" +
      "• Exclusividade: Os benefícios são exclusivos para cada loja e não podem ser transferidos entre diferentes unidades."
  };

  const displayUnitName = useMemo(() => {
    const rawName = restaurant?.name?.trim() ?? "";
    const normalizedName = rawName.replace(/^Coxinha Surprise\s*-\s*/i, "").trim();
    return normalizedName || rawName;
  }, [restaurant?.name]);

  const supportWhatsappUrl = useMemo(() => {
    const rawUrl = restaurant?.whatsapp_url?.trim();
    if (rawUrl) {
      if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
      const rawDigits = rawUrl.replace(/\D/g, "");
      if (rawDigits) return `https://wa.me/${rawDigits.startsWith("55") ? rawDigits : `55${rawDigits}`}`;
    }

    const phoneDigits = restaurant?.phone ? restaurant.phone.replace(/\D/g, "") : "";
    if (!phoneDigits) return null;
    return `https://wa.me/${phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`}`;
  }, [restaurant?.phone, restaurant?.whatsapp_url]);

  useEffect(() => {
    if (restaurant?.name) {
      document.title = `Fidelidade - ${restaurant.name}`;
    }
  }, [restaurant?.name]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const openPhoneStep = () => setStep("phone");

  const handleSendOtp = async (isResend = false) => {
    if (!phone) return toast.error("Informe seu telefone");
    const cleanPhone = normalizeBrPhone(phone);
    if (cleanPhone.length < 10) return toast.error("Telefone inválido");
    if (!restaurant?.id) return;

    setIsLoading(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("loyalty-otp", {
        body: {
          action: "send",
          restaurantId: restaurant.id,
          phone: cleanPhone,
          type: "consultation"
        }
      });

      if (invokeErr) throw invokeErr;
      if (!data?.ok) throw new Error(data?.error || "Falha ao enviar código");

      setOtpCodeId(data.codeId);
      setStep("otp");
      setResendCooldown(60);
      if (isResend) toast.success("Novo código enviado!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCodeId || otpValue.length !== 6) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("verify_loyalty_consultation_code", {
        _code_id: otpCodeId,
        _code: otpValue,
      });

      if (error) throw error;
      
      const response = data as any;
      if (!response?.success) {
        setOtpValue("");
        throw new Error(response?.error || "Código inválido");
      }

      setMemberData(response.member);
      setHistory(response.history || []);
      setStep("dashboard");
      toast.success("Bem-vindo(a)!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isRestLoading || isLoyaltyLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (queryError || !restaurant || !settings.enabled) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-6 sm:p-8 space-y-5 sm:space-y-6 shadow-xl border-none rounded-3xl">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <Award className="w-10 h-10 text-slate-300" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-800">Programa de Fidelidade Indisponível</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Este restaurante não possui um programa de fidelidade ativo no momento ou o endereço acessado está incorreto.
            </p>
          </div>
          <Button variant="outline" className="w-full h-12 font-bold rounded-xl" onClick={() => window.location.href = "/"}>
            Ir para a página inicial
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[linear-gradient(180deg,#f7f4ff_0%,#fafafa_38%,#ffffff_100%)]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.14),transparent_28%),radial-gradient(circle_at_left,rgba(168,85,247,0.10),transparent_24%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.04),transparent_18%)]" />
      <div className="relative min-h-[100dvh] flex flex-col items-center p-2 sm:p-4 md:p-8">
      <div className="w-full max-w-6xl space-y-4 sm:space-y-6">
        {/* Header/Landing */}
        {step === "landing" && (
          <div className="flex min-h-[calc(100dvh-1rem)] flex-col gap-4 sm:gap-6">
            <div className="relative overflow-hidden rounded-[1.75rem] sm:rounded-[2.5rem] border border-white/70 bg-white shadow-[0_28px_90px_rgba(91,33,182,0.12)] backdrop-blur">
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.09),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.08),transparent_28%)]" />
              <div className="relative flex flex-col p-5 sm:p-8 lg:p-10">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="relative shrink-0">
                    {restaurant.logo_url ? (
                      <img
                        src={restaurant.logo_url}
                        alt={restaurant.name}
                        className="h-20 w-20 sm:h-24 sm:w-24 rounded-[1.25rem] object-cover border-4 border-white shadow-lg"
                      />
                    ) : (
                      <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-[1.25rem] bg-primary flex items-center justify-center text-white text-2xl sm:text-4xl font-black shadow-lg">
                        {restaurant.name.charAt(0)}
                      </div>
                    )}
                    <div className="absolute -bottom-2 -right-2 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white shadow-md grid place-items-center ring-2 ring-primary/10">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                  </div>

                  <h1 className="text-base sm:text-lg font-black tracking-[0.24em] uppercase text-slate-900">
                    Coxinha Surprise - {displayUnitName}
                  </h1>
                  <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.24em] text-primary">
                    Programa de fidelidade
                  </div>

                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[1.25rem] border border-slate-100 bg-slate-50/90 p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-primary">
                      <Info className="h-4 w-4 sm:h-5 sm:w-5" />
                      <h2 className="text-base sm:text-lg font-black text-slate-900">Como funciona?</h2>
                    </div>
                    <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 font-medium">
                      {settings.loyalty_description}
                    </p>
                  </div>

                  <div className="rounded-[1.25rem] border border-slate-100 bg-white p-4 sm:p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-primary">
                      <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
                      <h2 className="text-base sm:text-lg font-black text-slate-900">Regras do programa</h2>
                    </div>
                    <div className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-slate-600 font-medium">
                      {settings.loyalty_rules}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100/80 bg-white/95 p-4 sm:p-6">
                <Button
                  className="relative z-20 w-full h-12 sm:h-14 text-base sm:text-lg font-black rounded-2xl shadow-lg shadow-primary/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  onClick={openPhoneStep}
                  type="button"
                >
                  Consultar meu saldo de pontos
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <div className="mt-4 flex flex-col items-center gap-2 text-center">
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-500">
                    Precisa de suporte? Entre em contato pelo WhatsApp!
                  </p>
                  <Button
                    variant="outline"
                    type="button"
                    className="h-9 rounded-full border-primary/20 bg-primary/5 px-4 text-xs font-black text-primary hover:bg-primary/10"
                    onClick={() => {
                      if (supportWhatsappUrl) {
                        window.open(supportWhatsappUrl, "_blank", "noopener,noreferrer");
                      } else {
                        toast.error("Este restaurante ainda não tem WhatsApp cadastrado.");
                      }
                    }}
                  >
                    <MessageCircle className="mr-2 h-3.5 w-3.5" />
                    Falar no WhatsApp
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "phone" && (
          <Card className="overflow-hidden rounded-[1.75rem] sm:rounded-[2.5rem] border border-white/70 bg-white shadow-[0_28px_90px_rgba(91,33,182,0.12)] backdrop-blur">
            <CardHeader className="bg-[linear-gradient(135deg,#7c3aed_0%,#6d28d9_52%,#4c1d95_100%)] text-white space-y-2 pb-6 sm:pb-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white hover:bg-white/10 -ml-2 mb-2 rounded-full" 
                onClick={() => setStep("landing")}
              >
                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </Button>
              <CardTitle className="text-2xl sm:text-3xl font-black leading-none">Consultar Pontos</CardTitle>
              <CardDescription className="text-white/80 text-sm sm:text-base font-medium">
                Informe seu WhatsApp cadastrado para enviarmos um código de acesso seguro.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10 mt-3 sm:mt-4 p-5 sm:p-10 space-y-6 sm:space-y-8 bg-white rounded-t-[1.5rem] sm:rounded-t-[2.5rem] shadow-[0_-12px_40px_rgba(15,23,42,0.08)]">
              <div className="space-y-3">
                <Label htmlFor="phone" className="text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] ml-1">WhatsApp com DDD</Label>
                <div className="relative">
                  <Phone className="w-4 h-4 sm:w-5 sm:h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input 
                    id="phone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    className="pl-12 h-12 sm:h-14 text-base sm:text-xl font-bold bg-slate-50 border-slate-100 focus:bg-white transition-all rounded-xl focus:ring-primary"
                  />
                </div>
              </div>
              <Button 
                className="w-full h-12 sm:h-14 font-black text-base sm:text-lg rounded-xl shadow-lg shadow-primary/20" 
                onClick={() => handleSendOtp(false)}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin mr-2" /> : <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />}
                {isLoading ? "Enviando..." : "Receber código via WhatsApp"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: OTP Input */}
        {step === "otp" && (
          <Card className="overflow-hidden rounded-[1.75rem] sm:rounded-[2.5rem] border border-white/70 bg-white shadow-[0_28px_90px_rgba(91,33,182,0.12)] backdrop-blur">
            <CardHeader className="bg-[linear-gradient(135deg,#7c3aed_0%,#6d28d9_52%,#4c1d95_100%)] text-white space-y-2 pb-6 sm:pb-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white hover:bg-white/10 -ml-2 mb-2 rounded-full" 
                onClick={openPhoneStep}
              >
                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </Button>
              <CardTitle className="text-2xl sm:text-3xl font-black leading-none">Validar Código</CardTitle>
              <CardDescription className="text-white/80 text-sm sm:text-base font-medium">
                Digite o código de 6 dígitos enviado para {phone}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10 mt-3 sm:mt-4 p-5 sm:p-10 flex flex-col items-center space-y-6 sm:space-y-10 bg-white rounded-t-[1.5rem] sm:rounded-t-[2.5rem] shadow-[0_-12px_40px_rgba(15,23,42,0.08)]">
              <InputOTP 
                maxLength={6} 
                value={otpValue} 
                onChange={(v) => setOtpValue(v.replace(/\D/g, ""))}
                autoFocus
              >
                <InputOTPGroup className="gap-1 sm:gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot 
                      key={i} 
                      index={i} 
                      className="w-9 h-12 sm:w-14 sm:h-20 text-2xl sm:text-3xl font-black rounded-2xl border-slate-100 bg-slate-50 focus:border-primary focus:bg-white transition-all shadow-inner" 
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>

              <div className="w-full space-y-4 sm:space-y-6">
                <Button 
                  className="w-full h-12 sm:h-14 font-black text-base sm:text-lg rounded-xl shadow-lg shadow-primary/20" 
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otpValue.length !== 6}
                >
                  {isLoading ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />}
                  {isLoading ? "Validando..." : "Acessar minha conta"}
                </Button>

                <div className="text-center">
                  <button
                    onClick={() => handleSendOtp(true)}
                    disabled={isLoading || resendCooldown > 0}
                    className="text-sm font-black text-primary hover:underline disabled:opacity-50 disabled:no-underline transition-all"
                  >
                    {resendCooldown > 0 ? `Reenviar disponível em ${resendCooldown}s` : "Não recebi o código via WhatsApp"}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Dashboard/Member Area */}
        {step === "dashboard" && memberData && (
          <div className="flex min-h-[calc(100dvh-1rem)] flex-col">
            <Card className="flex flex-1 min-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-[1.75rem] sm:rounded-[2.5rem] border border-white/70 bg-white shadow-[0_28px_90px_rgba(91,33,182,0.12)] backdrop-blur">
              <div className="bg-[linear-gradient(135deg,#7c3aed_0%,#6d28d9_52%,#4c1d95_100%)] p-5 sm:p-8 text-white relative">
                <div className="flex justify-between items-start mb-5 sm:mb-8 gap-4">
                  <div className="space-y-1">
                    <p className="text-white/65 text-[10px] font-black uppercase tracking-[0.2em]">Seu saldo atual</p>
                    <div className="flex items-center gap-4">
                      <div className="bg-yellow-400 p-2 rounded-2xl shadow-lg shadow-yellow-600/20">
                        <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-white fill-white" />
                      </div>
                      <div className="flex items-baseline gap-1">
                        <h2 className="text-4xl sm:text-6xl font-black tracking-tighter">{memberData.points}</h2>
                        <span className="text-sm sm:text-xl font-bold opacity-80 uppercase tracking-widest">pts</span>
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-white hover:bg-white/10 rounded-full h-10 w-10 sm:h-12 sm:w-12"
                    onClick={() => {
                      setStep("landing");
                      setMemberData(null);
                      setOtpValue("");
                    }}
                  >
                    <ArrowLeft className="w-6 h-6 sm:w-7 sm:h-7" />
                  </Button>
                </div>
                <div className="space-y-1 relative z-10">
                  <p className="text-xl sm:text-2xl font-black tracking-tight">{memberData.name}</p>
                  <p className="text-white/80 text-sm sm:text-base font-bold tracking-wide">{formatPhone(memberData.phone)}</p>
                </div>
                
                {/* Decorative circles */}
                <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/10 rounded-full blur-2xl pointer-events-none" />
              </div>
              
              <CardContent className="flex min-h-0 flex-1 flex-col p-0 bg-white">
                <div className="p-4 sm:p-8 border-b flex items-center justify-between bg-slate-50/50">
                  <h3 className="text-base sm:text-xl font-black flex items-center gap-2 sm:gap-3 text-slate-800 uppercase tracking-tight">
                    <History className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> Extrato de Pontos
                  </h3>
                  <div className="bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                    Últimas movimentações
                  </div>
                </div>

                <div className="min-h-0 flex-1 divide-y overflow-y-auto">
                  {history.length === 0 ? (
                    <div className="p-10 sm:p-16 text-center text-slate-300 space-y-4">
                      <Gift className="w-12 h-12 sm:w-16 sm:h-16 mx-auto opacity-10" />
                      <p className="font-bold italic text-base sm:text-lg">Você ainda não possui movimentações.</p>
                    </div>
                  ) : (
                    history.map((tx) => (
                      <div key={tx.id} className="p-4 sm:p-6 flex justify-between items-center hover:bg-slate-50 transition-all border-l-4 border-l-transparent hover:border-l-primary">
                        <div className="space-y-2 min-w-0 pr-3">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className={`w-3 h-3 rounded-full shadow-sm ${tx.points > 0 ? "bg-green-500" : "bg-red-500"}`} />
                            <p className="font-black text-slate-800 text-sm sm:text-lg tracking-tight break-words">
                              {tx.type === 'redeem' ? 'Resgate de Prêmio' : 
                               tx.type === 'manual' ? 'Ajuste Manual' : 
                               tx.order_number ? 'Compra Realizada' : 'Lançamento de Pontos'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">
                            <span className="bg-slate-100 px-2 py-1 rounded-md">{new Date(tx.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            <span className="bg-slate-100 px-2 py-1 rounded-md">{new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            {tx.order_number && (
                              <span className="bg-primary/5 text-primary px-2 py-1 rounded-md border border-primary/10">Pedido #{tx.order_number}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-2xl font-black tracking-tighter ${tx.points > 0 ? "text-green-600" : "text-red-600"}`}>
                            {tx.points > 0 ? "+" : ""}{tx.points}
                            <span className="text-xs ml-1 uppercase">pts</span>
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
