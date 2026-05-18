import { createFileRoute } from "@tanstack/react-router";
import { ClientAppLoader } from "@/components/ClientAppLoader";

export const Route = createFileRoute("/$")({
  component: CatchAllRoute,
});

function CatchAllRoute() {
  return <ClientAppLoader />;
}