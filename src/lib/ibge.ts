// IBGE public API helpers - no auth key required, CORS enabled.
// Docs: https://servicodados.ibge.gov.br/api/docs/

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export type IbgeMunicipio = {
  id: string; // 7-digit IBGE code
  nome: string;
  uf: string;
};

export async function findIbgeMunicipio(
  cityName: string,
  uf?: string,
): Promise<IbgeMunicipio | null> {
  if (!cityName) return null;
  try {
    const url = uf
      ? `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`
      : `https://servicodados.ibge.gov.br/api/v1/localidades/municipios`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const list = (await r.json()) as any[];
    const target = norm(cityName);
    const found = list.find((m: any) => norm(m.nome) === target);
    if (!found) return null;
    const stateUf =
      found?.microrregiao?.mesorregiao?.UF?.sigla ??
      found?.regiao_imediata?.regiao_intermediaria?.UF?.sigla ??
      uf ??
      "";
    return { id: String(found.id), nome: found.nome, uf: stateUf };
  } catch {
    return null;
  }
}

// Latest series value from an aggregated /agregados endpoint
async function fetchLatestAgregado(
  aggId: string,
  varId: string,
  municipioId: string,
): Promise<number | null> {
  try {
    const url = `https://servicodados.ibge.gov.br/api/v3/agregados/${aggId}/periodos/-1/variaveis/${varId}?localidades=N6[${municipioId}]`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = (await r.json()) as any[];
    const series = data?.[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (!series) return null;
    const values = Object.values(series).filter(
      (v) => v !== null && v !== undefined && v !== "..." && v !== "-",
    );
    const last = values[values.length - 1];
    const n = Number(last);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Population: agregado 6579 (estimativas anuais), variável 9324 = população residente estimada
export async function fetchPopulation(municipioId: string): Promise<number | null> {
  return fetchLatestAgregado("6579", "9324", municipioId);
}

// GDP: agregado 5938, variável 37 = PIB a preços correntes (mil R$) - returns in R$
export async function fetchGdp(municipioId: string): Promise<number | null> {
  const v = await fetchLatestAgregado("5938", "37", municipioId);
  return v == null ? null : v * 1000;
}

// PIB per capita as income proxy: agregado 5938, variável 39 (R$ por habitante)
export async function fetchIncomePerCapita(municipioId: string): Promise<number | null> {
  return fetchLatestAgregado("5938", "39", municipioId);
}

export async function fetchIbgeBundle(municipioId: string) {
  const [population, gdp, incomePerCapita] = await Promise.all([
    fetchPopulation(municipioId),
    fetchGdp(municipioId),
    fetchIncomePerCapita(municipioId),
  ]);
  return { population, gdp, incomePerCapita };
}
