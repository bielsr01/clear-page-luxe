## Diagnóstico

O projeto original (`Restaurant Flow`) usa o template **antigo** `vite_react_shadcn_ts`: Vite puro + `BrowserRouter`. Em produção é uma SPA estática, qualquer URL serve `index.html` e o React Router resolve no cliente.

Este projeto (`Coxinha Surprise`) foi criado no template **novo** `tanstack_start_ts_2026-05-12`: TanStack Start com SSR rodando em Cloudflare Workers (`wrangler.jsonc` → `src/server.ts`). O roteamento de produção é o **TanStack Router server-side**, não SPA estática.

O que está acontecendo:
- `src/routes/` só contém `__root.tsx` e `index.tsx` (rota `/`).
- O `App.tsx` monta `<BrowserRouter>` com `/auth`, `/admin`, `/dashboard`, etc., mas isso só roda **depois** do servidor responder com HTML.
- Em produção, quando o usuário pede `/auth` direto, o Worker do TanStack roteia no servidor, não encontra a rota, e devolve o `notFoundComponent` do `__root.tsx` (a página "404 Page not found" que aparece no vídeo).
- No preview interno funciona porque o middleware `spa-history-fallback` que adicionamos no `vite.config.ts` reescreve URLs para `/index.html` no dev/preview server local — mas isso **não existe em produção** (Cloudflare Workers ignora `_redirects` e ignora plugins Vite).
- `public/_redirects` e o `cp _redirects` no build script não têm efeito: a hospedagem da Lovable para o template TanStack Start é Worker, não static host.

Resumindo: a stack mudou de SPA estática para SSR, mas o app ainda está escrito como SPA. O servidor não conhece as rotas.

## Correção (mínima, sem reescrever o app)

Criar uma rota **catch-all** no TanStack Router que renderiza o `App.tsx` (com `BrowserRouter`) somente no cliente. Assim qualquer URL bate no servidor, o servidor devolve o shell HTML, e o `BrowserRouter` assume e resolve `/auth`, `/admin`, etc. no cliente — mantendo todo o código atual funcionando.

### Mudanças

1. **`src/routes/$.tsx`** (novo) — catch-all splat route com `ssr: false`, renderiza `<App />` dentro de `<ClientOnly fallback={<Loading/>}>`. Isso casa qualquer caminho não declarado.

2. **`src/routes/index.tsx`** — substituir o placeholder atual para também renderizar `<App />` (mesmo padrão `ClientOnly`), para a rota `/`.

3. **`src/routes/__root.tsx`** — remover/relaxar o `notFoundComponent` (deixar só um fallback simples) já que o splat agora pega tudo. O `<Outlet />` continua.

4. **`vite.config.ts`** — remover o plugin `spaFallback` e `appType:"spa"`. Não fazem mais sentido com TanStack Start e podem confundir o build.

5. **`package.json`** — reverter os scripts `build`/`build:dev` para o original (`vite build` puro). O `cp public/_redirects` é inútil neste template.

6. **`public/_redirects`** — pode ser apagado (não faz nada em Worker).

### Por que isso resolve

- O Worker TanStack Start passa a casar qualquer URL via `$.tsx` em vez de devolver 404.
- O HTML servido carrega o `App.tsx` no cliente, `BrowserRouter` lê `window.location.pathname` e renderiza a rota React Router correspondente (`/auth`, `/admin`, etc.).
- `ssr: false` + `ClientOnly` evita que `BrowserRouter` quebre no SSR (ele usa `window`).
- Funciona idêntico em: preview interno da Lovable, link `id-preview--*.lovable.app`, link publicado `*.lovable.app` e domínio custom `app.coxinhasurprise.com.br`.

### Alternativa (não recomendada agora)

Migrar todas as páginas para arquivos em `src/routes/` (rotas nativas TanStack). É a forma "correta" para o template novo, mas é uma refatoração grande (10+ páginas, params, guards de role) e o usuário já valida que a lógica do React Router funciona. Fica como evolução futura.

## Detalhes técnicos

- `createFileRoute("/$")({ ssr: false, component: ... })` — o splat (`$`) tem prioridade menor que rotas declaradas, então `index.tsx` continua respondendo `/`.
- `ClientOnly` é importado de `@tanstack/react-router`; o fallback é um spinner igual ao `RequireRole` (texto "Carregando...") para evitar flash.
- Como `ssr: false`, o handler do Worker só monta o shell — sem custo de render do app no servidor; o usuário vê HTML quase imediatamente e a SPA hidrata.
- O `AuthProvider`, `QueryClientProvider` e demais providers continuam dentro do `App.tsx` exatamente como hoje; nenhuma página precisa mudar.
- Após publicar, testar deep links: `https://clear-page-luxe.lovable.app/auth`, `/admin`, `/dashboard`, `/r/algum-slug`, e refresh (F5) em qualquer rota interna.
