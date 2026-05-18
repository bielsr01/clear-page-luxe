import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";
import Index from "@/pages/Index";
import MasterAdmin from "@/pages/MasterAdmin";
import ManagerDashboard from "@/pages/ManagerDashboard";
import RestaurantPublic from "@/pages/RestaurantPublic";
import OrderTracking from "@/pages/OrderTracking";
import OrderTicket from "@/pages/OrderTicket";
import KitchenTicketPublic from "@/pages/KitchenTicketPublic";
import CustomerTicketPublic from "@/pages/CustomerTicketPublic";
import NotFound from "@/pages/NotFound";
import { RequireRole } from "@/components/RequireRole";

export const Route = createFileRoute("/$")({
  ssr: false,
  component: LegacyRouteBridge,
});

function LegacyRouteBridge() {
  const path = typeof window === "undefined" ? "/" : window.location.pathname;

  if (path === "/") return <Index />;
  if (path === "/auth") return <Auth />;
  if (path === "/admin") return <RequireRole role="master_admin"><MasterAdmin /></RequireRole>;
  if (path === "/dashboard") return <RequireRole role="manager"><ManagerDashboard /></RequireRole>;
  if (/^\/r\/[^/]+$/.test(path)) return <RestaurantPublic />;
  if (/^\/pedido\/[^/]+$/.test(path)) return <OrderTracking />;
  if (/^\/ticket\/[^/]+$/.test(path)) return <RequireRole role="manager"><OrderTicket /></RequireRole>;
  if (/^\/ticket-cozinha\/[^/]+$/.test(path)) return <KitchenTicketPublic />;
  if (/^\/ticket-cliente\/[^/]+$/.test(path)) return <CustomerTicketPublic />;

  return <NotFound />;
}
