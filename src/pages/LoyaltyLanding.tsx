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
  Info
} from "lucide-react";
import { formatPhone, normalizeBrPhone } from "@/lib/format";

type FlowStep = "landing" | "phone" | "otp" | "dashboard";

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

  const { data: restaurant, isLoading: isRestLoading } = useQuery({
    queryKey: ["restaurant-loyalty-public", slug],
    queryFn: async () => {
      if (!slug) throw new Error("Slug is required");
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
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const settings = restaurant?.loyalty_settings?.[0] || {
    enabled: false,
    loyalty_description: "Acumule pontos em todas as suas compras e troque por benefícios exclusivos.",
    loyalty_rules: "• A cada R$ 1,00 gasto equivale a 1 ponto.\n• Os pontos só podem ser utilizados na mesma unidade onde foram acumulados.\n• Os pontos só podem ser resgatados presencialmente na loja."
  };

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

  const handleSendOtp = async (isResend = false) => {
    if (!phone) return toast.error("Informe seu telefone");
    const cleanPhone = normalizeBrPhone(phone);
    if (cleanPhone.length < 10) return toast.error("Telefone inválido");

    setIsLoading(true);
    try {
      // 1) Create consultation code
      const { data: codeId, error: codeErr } = await supabase.rpc("create_loyalty_consultation_code", {
        _restaurant_id: restaurant?.id,
        _phone: cleanPhone,
      });

      if (codeErr) {
        if (codeErr.message.includes("não encontrado")) {
          throw new Error("Você ainda não possui cadastro no nosso programa de fidelidade. Faça um pedido para começar a pontuar!");
        }
        throw codeErr;
      }

      // 2) Get evolution integration
      const { data: integ } = await supabase.from("evolution_integrations")
        .select("id").eq("restaurant_id", restaurant?.id).maybeSingle();
      
      if (!integ?.id) throw new Error("Sistema de envio indisponível no momento. Por favor, tente mais tarde.");

      // 3) Get the code from the database (we need the text code to send via WhatsApp)
      // Since create_loyalty_consultation_code only returns the ID for security, we need to fetch the row if we are on the server side,
      // but here we are on the client. Wait, the RPC returns the ID. 
      // How do I get the code text to send? 
      // I should have a separate edge function or the RPC should handle the sending.
      // In the dashboard (LoyaltyRewardsTab), the code was fetched after RPC because the manager has access.
      // Here, the public user DOES NOT have access to loyalty_redeem_codes.
      
      // I will create an edge function 'loyalty-otp' to handle both generation and sending for public use.
      // But for now, let's assume I need to update the RPC or use an edge function.
      
      // Let's use an edge function to keep it secure.
      const { data, error: invokeErr } = await supabase.functions.invoke("loyalty-otp", {
        body: {
          action: "send",
          restaurantId: restaurant?.id,
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
      if (!data.success) {
        setOtpValue("");
        throw new Error(data.error || "Código inválido");
      }

      setMemberData(data.member);
      setHistory(data.history || []);
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

  if (!restaurant || !settings.enabled) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8 space-y-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
            <Award className="w-8 h-8 text-slate-300" />
          </div>
          <h1 className="text-xl font-bold">Programa Indisponível</h1>
          <p className="text-slate-500">Este restaurante não possui um programa de fidelidade ativo no momento.</p>
          <Button variant="outline" onClick={() => window.history.back()}>Voltar</Button>
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
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-primary/10 p-8 flex flex-col items-center text-center space-y-4">
                {restaurant.logo_url ? (
                  <img src={restaurant.logo_url} alt={restaurant.name} className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-sm" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-white text-3xl font-bold shadow-sm">
                    {restaurant.name.charAt(0)}
                  </div>
                )}
                <div className="space-y-1">
                  <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                    Programa de Fidelidade
                  </h1>
                  <p className="text-primary font-bold text-lg">
                    {restaurant.name}
                  </p>
                </div>
              </div>
              <div className="p-8 space-y-8">
                <div className="space-y-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Info className="w-5 h-5 text-primary" /> Como funciona?
                  </h2>
                  <p className="text-slate-600 leading-relaxed">
                    {settings.loyalty_description}
                  </p>
                </div>

                <div className="space-y-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" /> Regras
                  </h2>
                  <div className="bg-slate-50 rounded-xl p-4 whitespace-pre-wrap text-sm text-slate-600 leading-relaxed border border-slate-100">
                    {settings.loyalty_rules}
                  </div>
                </div>

                <Button 
                  className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20" 
                  onClick={() => setStep("phone")}
                >
                  Consultar Saldo de Pontos
                </Button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 opacity-40 py-4">
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
          <Card className="border-none shadow-xl overflow-hidden rounded-2xl">
            <CardHeader className="bg-primary text-primary-foreground space-y-1 pb-8">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-primary-foreground hover:bg-white/10 -ml-2 mb-2" 
                onClick={() => setStep("landing")}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <CardTitle className="text-2xl font-black">Consultar Pontos</CardTitle>
              <CardDescription className="text-primary-foreground/80">
                Informe seu WhatsApp cadastrado para enviarmos um código de acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6 -mt-4 bg-white rounded-t-2xl">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">WhatsApp com DDD</Label>
                <div className="relative">
                  <Phone className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input 
                    id="phone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    className="pl-10 h-12 text-lg font-medium bg-slate-50 border-slate-200 focus:bg-white transition-all"
                  />
                </div>
              </div>
              <Button 
                className="w-full h-12 font-bold text-base" 
                onClick={() => handleSendOtp(false)}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <MessageCircle className="w-5 h-5 mr-2" />}
                {isLoading ? "Enviando..." : "Receber código via WhatsApp"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: OTP Input */}
        {step === "otp" && (
          <Card className="border-none shadow-xl overflow-hidden rounded-2xl">
            <CardHeader className="bg-primary text-primary-foreground space-y-1 pb-8">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-primary-foreground hover:bg-white/10 -ml-2 mb-2" 
                onClick={() => setStep("phone")}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <CardTitle className="text-2xl font-black">Validar Código</CardTitle>
              <CardDescription className="text-primary-foreground/80">
                Digite o código de 6 dígitos que enviamos para {phone}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 flex flex-col items-center space-y-8 -mt-4 bg-white rounded-t-2xl">
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
                      className="w-10 h-14 md:w-12 md:h-16 text-2xl font-bold rounded-xl border-slate-200 bg-slate-50 focus:border-primary focus:bg-white transition-all shadow-sm" 
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>

              <div className="w-full space-y-4">
                <Button 
                  className="w-full h-12 font-bold text-base" 
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otpValue.length !== 6}
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                  {isLoading ? "Validando..." : "Acessar minha conta"}
                </Button>

                <div className="text-center">
                  <button
                    onClick={() => handleSendOtp(true)}
                    disabled={isLoading || resendCooldown > 0}
                    className="text-sm font-bold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : "Não recebi o código"}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Dashboard/Member Area */}
        {step === "dashboard" && memberData && (
          <div className="space-y-6">
            <Card className="border-none shadow-xl overflow-hidden rounded-3xl">
              <div className="bg-primary p-8 text-primary-foreground relative">
                <div className="flex justify-between items-start mb-6">
                  <div className="space-y-1">
                    <p className="text-primary-foreground/60 text-xs font-black uppercase tracking-widest">Seu saldo atual</p>
                    <div className="flex items-center gap-3">
                      <Coins className="w-8 h-8 text-yellow-400 fill-yellow-400" />
                      <h2 className="text-5xl font-black">{memberData.points}</h2>
                      <span className="text-xl font-bold mt-2">pts</span>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-primary-foreground hover:bg-white/10"
                    onClick={() => {
                      setStep("landing");
                      setMemberData(null);
                      setOtpValue("");
                    }}
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <p className="text-xl font-black">{memberData.name}</p>
                  <p className="text-primary-foreground/70 text-sm font-medium">{formatPhone(memberData.phone)}</p>
                </div>
                
                {/* Decorative circles */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-black/10 rounded-full blur-2xl pointer-events-none" />
              </div>
              
              <CardContent className="p-0 bg-white">
                <div className="p-6 border-b">
                  <h3 className="text-lg font-black flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" /> Extrato de Pontos
                  </h3>
                </div>

                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {history.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 space-y-2">
                      <Gift className="w-12 h-12 mx-auto opacity-20" />
                      <p className="font-medium italic">Você ainda não possui movimentações.</p>
                    </div>
                  ) : (
                    history.map((tx) => (
                      <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${tx.points > 0 ? "bg-green-500" : "bg-red-500"}`} />
                            <p className="font-bold text-slate-800">
                              {tx.type === "redeem" ? "Resgate de Prêmio" : tx.type === "manual" ? "Ajuste Manual" : "Compra Realizada"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                            <span>{new Date(tx.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {tx.order_number && (
                              <>
                                <span>•</span>
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded">Pedido #{tx.order_number}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-black ${tx.points > 0 ? "text-green-600" : "text-red-600"}`}>
                            {tx.points > 0 ? "+" : ""}{tx.points} pts
                          </p>
                          {tx.balance_after !== undefined && (
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Saldo: {tx.balance_after} pts</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            
            <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10 flex items-center gap-4">
              <div className="bg-primary text-white p-3 rounded-xl">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <p className="font-black text-slate-900 leading-none">Que tal resgatar algo?</p>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Vá até a nossa unidade e peça seu prêmio!</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
