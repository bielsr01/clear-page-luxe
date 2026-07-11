
## Mapa de Expansão (Admin)

Novo menu no painel admin com integração Google Maps + IBGE para prospecção de cidades.

### Fluxo do usuário
1. Digita o nome da cidade em um autocomplete (Places API New via gateway já conectado).
2. Mapa Google centraliza na cidade. Ao arrastar o mapa, reverse geocoding atualiza automaticamente o nome da cidade exibida (label acima do mapa).
3. Ao confirmar a cidade, o sistema busca no IBGE e pré-preenche automaticamente: **Habitantes**, **Renda per capita**, **PIB**.
4. Usuário preenche manualmente: **Qtd. restaurantes**, **Qtd. fast-foods**, **Qtd. concorrentes diretos** + observações.
5. Salva → aparece como card no grid. Clique no card abre modal com todos os detalhes (auto + manual), com opção editar/excluir.

### APIs IBGE (todas públicas, sem chave)
- **Localidades** — resolver `city_name + UF` → `municipio_id` (código IBGE 7 dígitos):
  `GET https://servicodados.ibge.gov.br/api/v1/localidades/municipios`
- **População** (estimativa mais recente, agregado 6579, variável 9324):
  `GET https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[{ibgeId}]`
- **PIB municipal** (agregado 5938, variável 37 = PIB a preços correntes, mil R$):
  `GET https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/-1/variaveis/37?localidades=N6[{ibgeId}]`
- **Renda per capita** — não existe atualizada por município na API; usar PIB per capita como proxy (variável 39 do agregado 5938) OU renda média domiciliar do Censo 2022 (agregado 793x). Vou usar **PIB per capita (variável 39)** por ser confiável e anual.

Fallback: se algum endpoint falhar, o campo fica editável em branco com aviso.

### Chamada IBGE — onde executar
Chamar direto do frontend (CORS liberado pelo IBGE, sem chave). Sem edge function necessária.

### Google Maps
Reusar o conector já configurado:
- `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` para carregar o Maps JS + `PlaceAutocompleteElement`.
- Reverse geocoding server-side: já existe edge function `geocode` — estender com modo `reverse` (lat/lng → cidade/UF) chamando `maps/api/geocode/json?latlng=...` via gateway.

### Banco de dados
Nova tabela `public.expansion_cities`:

```text
id, city_name, state_uf, ibge_id, lat, lng,
population, income_per_capita, gdp,
restaurants_count, fastfoods_count, competitors_count,
notes, created_by, created_at, updated_at
```

- RLS: só `master_admin` (via `has_role`).
- GRANTs padrão authenticated + service_role.
- Índice em `ibge_id` (único).

### Arquivos

**Criar:**
- `src/components/admin/AdminExpansionMapPanel.tsx` — painel principal (busca + mapa + form + grid de cards + modal detalhes)
- `src/components/admin/ExpansionCityMap.tsx` — wrapper do Google Map com autocomplete e drag → reverse geocode
- `src/lib/ibge.ts` — funções `fetchIbgeMunicipio(nome, uf)`, `fetchPopulation`, `fetchGdp`, `fetchIncomePerCapita`

**Editar:**
- `src/components/admin/AdminSidebar.tsx` — item "Mapa de expansão" (ícone `MapPin`), tipo `"expansion"` no `AdminView`
- `src/pages/MasterAdmin.tsx` — rota `expansion` renderiza `<AdminExpansionMapPanel />`
- `supabase/functions/geocode/index.ts` — adicionar modo reverse (lat/lng)

**Migração:** tabela + RLS + GRANTs + trigger `touch_updated_at`.

### Detalhes técnicos
- Autocomplete restrito a `country: BR`.
- Ao arrastar mapa: debounce 400ms → `page.evaluate` reverse → atualiza label da cidade.
- Cards em grid responsivo mostrando nome, UF, população e nº restaurantes cadastrados.
- Modal com todos os campos + botões Editar / Excluir.

Confirmo? Após aprovação: migração → edge function reverse → frontend.
