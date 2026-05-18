import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const spaFallback = (): Plugin => {
  const rewriteToIndex = (req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const accept = req.headers.accept;
    const acceptsHtml = Array.isArray(accept) ? accept.some((value) => value.includes("text/html")) : accept?.includes("text/html");
    const pathname = url.split("?")[0];

    if ((method === "GET" || method === "HEAD") && acceptsHtml && pathname !== "/" && !pathname.includes(".") && !pathname.startsWith("/api/")) {
      req.url = "/index.html";
    }

    next();
  };

  return {
    name: "spa-history-fallback",
    configureServer(server) {
      server.middlewares.use(rewriteToIndex);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewriteToIndex);
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  appType: "spa",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [spaFallback(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
