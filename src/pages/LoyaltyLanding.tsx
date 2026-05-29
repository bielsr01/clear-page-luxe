import { useEffect, useState } from "react";
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
        .select(`
          id, 
          name, 
          logo_url, 
          loyalty_settings (
            enabled, 
            loyalty_description, 
            loyalty_rules
          )
        `)
        .eq("slug", slug)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const rawSettings = restaurant?.loyalty_settings;
  // Handle both array and object formats for the joined table
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

  useEffect(() => {
    if (restaurant?.name) {
      document.title = `Fidelidade - Coxinha Surprise ${restaurant.name}`;
    }
  }, [restaurant?.name]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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

  if (isRestLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (queryError || !restaurant || !settings.enabled) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8 space-y-6 shadow-xl border-none rounded-3xl">
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
          
          <div className="flex flex-col items-center gap-2 opacity-30 pt-4">
            <span className="text-[10px] uppercase tracking-wider font-black">Powered by</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center text-[10px] text-white font-bold">CS</div>
              <span className="text-sm font-bold text-slate-900">Coxinha Surprise</span>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8">
      <div className="max-w-xl w-full space-y-6">
        {/* Header/Landing */}
        {step === "landing" && (
          <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100">
              <div className="bg-primary/10 p-10 flex flex-col items-center text-center space-y-4 relative">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Star className="w-20 h-20 fill-primary" />
                </div>
                
                {restaurant.logo_url ? (
                  <img src={restaurant.logo_url} alt={restaurant.name} className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-md z-10" />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-primary flex items-center justify-center text-white text-4xl font-black shadow-md z-10">
                    {restaurant.name.charAt(0)}
                  </div>
                )}
                <div className="space-y-1 z-10">
                  <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                    Programa de Fidelidade
                  </h1>
                  <p className="text-primary font-black text-xl">
                    Coxinha Surprise
                  </p>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-widest mt-2">
                    Unidade {restaurant.name}
                  </p>
                </div>
              </div>
              <div className="p-10 space-y-10">
                <div className="space-y-4">
                  <h2 className="text-xl font-black flex items-center gap-2 text-slate-800">
                    <Info className="w-6 h-6 text-primary" /> Como funciona?
                  </h2>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    {settings.loyalty_description}
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-black flex items-center gap-2 text-slate-800">
                    <ShieldCheck className="w-6 h-6 text-primary" /> Regras do Programa
                  </h2>
                  <div className="bg-slate-50 rounded-2xl p-6 whitespace-pre-wrap text-sm text-slate-600 leading-relaxed border border-slate-100 font-medium">
                    {settings.loyalty_rules}
                  </div>
                </div>

                <Button 
                  className="w-full h-16 text-lg font-black shadow-lg shadow-primary/30 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]" 
                  onClick={() => setStep("phone")}
                >
                  Consultar Saldo de Pontos
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 opacity-40 py-6">
              <span className="text-[10px] uppercase tracking-wider font-black">Powered by</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center text-[10px] text-white font-bold">CS</div>
                <span className="text-sm font-bold text-slate-900">Coxinha Surprise</span>
              </div>
            </div>
          </div>
        )}

        {/* Step: Phone Input */}
        {step === "phone" && (
          <Card className="border-none shadow-2xl overflow-hidden rounded-[2.5rem]">
            <CardHeader className="bg-primary text-primary-foreground space-y-2 pb-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-primary-foreground hover:bg-white/10 -ml-2 mb-2 rounded-full" 
                onClick={() => setStep("landing")}
              >
                <ArrowLeft className="w-6 h-6" />
              </Button>
              <CardTitle className="text-3xl font-black leading-none">Consultar Pontos</CardTitle>
              <CardDescription className="text-primary-foreground/80 text-base font-medium">
                Informe seu WhatsApp cadastrado para enviarmos um código de acesso seguro.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-10 space-y-8 -mt-6 bg-white rounded-t-[2.5rem]">
              <div className="space-y-3">
                <Label htmlFor="phone" className="text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] ml-1">WhatsApp com DDD</Label>
                <div className="relative">
                  <Phone className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input 
                    id="phone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    className="pl-12 h-14 text-xl font-bold bg-slate-50 border-slate-100 focus:bg-white transition-all rounded-xl focus:ring-primary"
                  />
                </div>
              </div>
              <Button 
                className="w-full h-14 font-black text-lg rounded-xl shadow-lg shadow-primary/20" 
                onClick={() => handleSendOtp(false)}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <MessageCircle className="w-6 h-6 mr-2" />}
                {isLoading ? "Enviando..." : "Receber código via WhatsApp"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: OTP Input */}
        {step === "otp" && (
          <Card className="border-none shadow-2xl overflow-hidden rounded-[2.5rem]">
            <CardHeader className="bg-primary text-primary-foreground space-y-2 pb-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-primary-foreground hover:bg-white/10 -ml-2 mb-2 rounded-full" 
                onClick={() => setStep("phone")}
              >
                <ArrowLeft className="w-6 h-6" />
              </Button>
              <CardTitle className="text-3xl font-black leading-none">Validar Código</CardTitle>
              <CardDescription className="text-primary-foreground/80 text-base font-medium">
                Digite o código de 6 dígitos enviado para {phone}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-10 flex flex-col items-center space-y-10 -mt-6 bg-white rounded-t-[2.5rem]">
              <InputOTP 
                maxLength={6} 
                value={otpValue} 
                onChange={(v) => setOtpValue(v.replace(/\D/g, ""))}
                autoFocus
              >
                <InputOTPGroup className="gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot 
                      key={i} 
                      index={i} 
                      className="w-10 h-14 md:w-14 md:h-20 text-3xl font-black rounded-2xl border-slate-100 bg-slate-50 focus:border-primary focus:bg-white transition-all shadow-inner" 
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>

              <div className="w-full space-y-6">
                <Button 
                  className="w-full h-14 font-black text-lg rounded-xl shadow-lg shadow-primary/20" 
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otpValue.length !== 6}
                >
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <ArrowRight className="w-6 h-6 mr-2" />}
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
          <div className="space-y-6">
            <Card className="border-none shadow-2xl overflow-hidden rounded-[2.5rem]">
              <div className="bg-primary p-10 text-primary-foreground relative">
                <div className="flex justify-between items-start mb-8">
                  <div className="space-y-1">
                    <p className="text-primary-foreground/60 text-[10px] font-black uppercase tracking-[0.2em]">Seu saldo atual</p>
                    <div className="flex items-center gap-4">
                      <div className="bg-yellow-400 p-2 rounded-2xl shadow-lg shadow-yellow-600/20">
                        <Coins className="w-8 h-8 text-white fill-white" />
                      </div>
                      <div className="flex items-baseline gap-1">
                        <h2 className="text-6xl font-black tracking-tighter">{memberData.points}</h2>
                        <span className="text-xl font-bold opacity-80 uppercase tracking-widest">pts</span>
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-primary-foreground hover:bg-white/10 rounded-full h-12 w-12"
                    onClick={() => {
                      setStep("landing");
                      setMemberData(null);
                      setOtpValue("");
                    }}
                  >
                    <ArrowLeft className="w-7 h-7" />
                  </Button>
                </div>
                <div className="space-y-1 relative z-10">
                  <p className="text-2xl font-black tracking-tight">{memberData.name}</p>
                  <p className="text-primary-foreground/70 text-base font-bold tracking-wide">{formatPhone(memberData.phone)}</p>
                </div>
                
                {/* Decorative circles */}
                <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/10 rounded-full blur-2xl pointer-events-none" />
              </div>
              
              <CardContent className="p-0 bg-white">
                <div className="p-8 border-b flex items-center justify-between bg-slate-50/50">
                  <h3 className="text-xl font-black flex items-center gap-3 text-slate-800 uppercase tracking-tight">
                    <History className="w-6 h-6 text-primary" /> Extrato de Pontos
                  </h3>
                  <div className="bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                    Últimas movimentações
                  </div>
                </div>

                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {history.length === 0 ? (
                    <div className="p-16 text-center text-slate-300 space-y-4">
                      <Gift className="w-16 h-16 mx-auto opacity-10" />
                      <p className="font-bold italic text-lg">Você ainda não possui movimentações.</p>
                    </div>
                  ) : (
                    history.map((tx) => (
                      <div key={tx.id} className="p-6 flex justify-between items-center hover:bg-slate-50 transition-all border-l-4 border-l-transparent hover:border-l-primary">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full shadow-sm ${tx.points > 0 ? "bg-green-500" : "bg-red-500"}`} />
                            <p className="font-black text-slate-800 text-lg tracking-tight">
                              {tx.type === 'redeem' ? 'Resgate de Prêmio' : 
                               tx.type === 'manual' ? 'Ajuste Manual' : 
                               tx.order_number ? 'Compra Realizada' : 'Lançamento de Pontos'}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">
                            <span className="bg-slate-100 px-2 py-1 rounded-md">{new Date(tx.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            <span className="bg-slate-100 px-2 py-1 rounded-md">{new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            {tx.order_number && (
                              <span className="bg-primary/5 text-primary px-2 py-1 rounded-md border border-primary/10">Pedido #{tx.order_number}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
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

            <div className="flex flex-col items-center gap-2 opacity-40 py-8">
              <span className="text-[10px] uppercase tracking-wider font-black">Powered by</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center text-[10px] text-white font-bold">CS</div>
                <span className="text-sm font-bold text-slate-900">Coxinha Surprise</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
