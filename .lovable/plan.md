## Objetivo

Copiar **toda a estrutura e dados** do Supabase atual (`yltsrnmzlsxfdgnrsbio`) para o novo Postgres puro em `136.248.125.75:5432/postgres`, sem alterar nada no banco origem.

## Escopo

| Item | Ação |
|---|---|
| `public` (estrutura) | Copiar 100% — tabelas, índices, sequences, functions, triggers, enums, RLS policies |
| `public` (dados) | Copiar 100% — todas as linhas de todas as tabelas |
| `auth.users`, `auth.identities`, etc. | Copiar como `public.auth_users_backup`, `public.auth_identities_backup` (dados puros, para uso futuro) |
| `storage` | **Pular** (arquivos físicos ficam no R2/Supabase, URLs atuais continuam funcionando) |
| `realtime`, `vault`, `supabase_functions`, `pgsodium` | Pular (específicos do Supabase, não fazem sentido em Postgres puro) |
| Banco origem | **Read-only** — nada é alterado |

## Como vai funcionar

1. Eu rodo no sandbox Lovable (que tem `pg_dump` 15 e `psql`):
   - `pg_dump` da origem usando `SUPABASE_DB_URL` (que já está nas envs)
   - `psql` no destino `136.248.125.75:5432`
2. Faço em 4 etapas sequenciais com validação no final.

```text
ORIGEM (Supabase Lovable)              DESTINO (seu Postgres puro)
db.yltsrnmzlsxfdgnrsbio...      ──►   136.248.125.75:5432
└── pg_dump (read-only)                └── psql restore
```

## Etapas

### 1. Pré-flight
- Testar conectividade TCP no `136.248.125.75:5432`
- Testar `psql` no destino (autenticação + permissão CREATE)
- Listar tabelas e contagens da origem (baseline)

### 2. Dump da origem
- `pg_dump --schema=public --no-owner --no-privileges --quote-all-identifiers` → `dump_public.sql` (estrutura + dados + functions + triggers + policies)
- `pg_dump --schema=auth --data-only --no-owner` → `dump_auth_data.sql` (só dados de auth.users / identities / etc.)

### 3. Restore no destino
- Aplicar `dump_public.sql` no destino (cria tudo do zero em `public`)
- Criar tabelas `public.auth_users_backup`, `public.auth_identities_backup`, `public.auth_sessions_backup`, etc. com a mesma estrutura de `auth.*`
- Carregar `dump_auth_data.sql` redirecionando inserts para as `*_backup` em `public`
- Patch na function `enqueue_evolution_message_for_order` (tem URL+anon-key do projeto antigo `kcjrrnxsqdcgjqplgiku` hardcoded — vou neutralizar o `net.http_post` no destino já que não terá pg_net / edge functions)
- Remover/neutralizar referências a `auth.uid()` nas RLS policies se necessário (Postgres puro não tem `auth.uid()`) — vou marcar as policies como não aplicáveis ou criar stub `auth.uid()` que retorna NULL pra não quebrar

### 4. Validação
- Contagem lado-a-lado de todas as tabelas críticas: `restaurants`, `orders`, `order_items`, `customers`, `profiles`, `user_roles`, `products`, `categories`, `option_groups`, `option_items`, `expenses`, etc.
- Contagem `auth.users` (origem) vs `public.auth_users_backup` (destino)
- Lista de objetos criados no destino (tables/functions/sequences)
- Relatório final em `/mnt/documents/migration-report.txt`

## Pontos técnicos

- **`auth.uid()` nas RLS**: vou criar um stub `CREATE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid $$` no destino pra policies não quebrarem na criação. As policies ficam inativas funcionalmente (já que não tem GoTrue), mas a estrutura é preservada.
- **`pg_net`, `pgsodium`, `pgjwt`**: extensions Supabase-only. Vou comentar/remover do dump e neutralizar chamadas `net.http_post` nas functions.
- **Sequences**: `pg_dump` já preserva os valores atuais — numeração de pedidos (`order_number_seq`) continua de onde parou.
- **Roles** (`anon`, `authenticated`, `service_role`, `supabase_auth_admin`): vou criar como roles vazias no destino só pra os GRANT/policies não falharem, ou usar `--no-privileges` que já ignora isso.
- **Sem alteração na origem**: tudo é `pg_dump` (SELECT-only) + queries de contagem read-only.

## O que **não** será feito

- Edge Functions não migram (são código Deno do Supabase — não rodam em Postgres puro / Directus)
- Storage físico (arquivos no R2) não muda — continuam acessíveis pelas URLs atuais
- Frontend continua apontando pro Supabase atual (mudança de `.env` é decisão separada, depois da validação)
- Login dos usuários no novo ambiente (combinamos: backup só, auth depois)

## Riscos

- Se `136.248.125.75:5432` estiver com firewall bloqueando o IP do sandbox, paro na etapa 1 e te aviso.
- Se a senha estiver errada, paro na etapa 1.
- Restaurar policies pode dar warnings (não errors) por falta de roles — vou logar e seguir.

## Entregáveis

- Banco destino populado e validado
- `/mnt/documents/migration-report.txt` com contagens lado-a-lado e log completo
- Lista de itens não migrados (edge functions, storage, secrets) para você decidir os próximos passos
