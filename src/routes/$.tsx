import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import App from "../App";

export const Route = createFileRoute("/$")({
  ssr: false,
  component: SpaCatchAll,
});

function SpaCatchAll() {
  return (
    <ClientOnly
      fallback={
        <div className="min-h-screen grid place-items-center text-muted-foreground">
          Carregando...
        </div>
      }
    >
      <App />
    </ClientOnly>
  );
}
