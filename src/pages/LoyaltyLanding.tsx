import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function LoyaltyLanding() {
  const { slug } = useParams();

  const { data: restaurant } = useQuery({
    queryKey: ["restaurant-loyalty", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("name, logo_url")
        .eq("slug", slug)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 flex flex-col items-center text-center space-y-6">
        {restaurant?.logo_url ? (
          <img 
            src={restaurant.logo_url} 
            alt={restaurant.name} 
            className="w-24 h-24 rounded-full object-cover border-4 border-slate-100"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-2xl">
            {restaurant?.name?.charAt(0) || "S"}
          </div>
        )}
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            Programa de Fidelidade
          </h1>
          <p className="text-slate-500 font-medium">
            {restaurant?.name || "Sistema de Gestão"}
          </p>
        </div>

        <div className="w-full h-px bg-slate-100" />
        
        <p className="text-slate-400 text-sm">
          Página em construção. Em breve você poderá acompanhar seus pontos e resgatar prêmios aqui!
        </p>

        <div className="pt-4 flex flex-col items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">Desenvolvido por</span>
          <div className="flex items-center gap-2 opacity-50">
            {/* Using a placeholder for system logo */}
            <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center text-[10px] text-white font-bold">
              CS
            </div>
            <span className="text-sm font-bold text-slate-900">Coxinha Surprise</span>
          </div>
        </div>
      </div>
    </div>
  );
}
