import { useEffect, useState } from "react";

type AppComponent = () => JSX.Element;

export function ClientAppLoader() {
  const [App, setApp] = useState<AppComponent | null>(null);

  useEffect(() => {
    let mounted = true;

    import("@/App").then((module) => {
      if (mounted) setApp(() => module.default);
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!App) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  }

  return <App />;
}