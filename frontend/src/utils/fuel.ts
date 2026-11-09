import type { Refueling } from "@/src/api/refuelings";

export type FuelTotals = {
  dieselLiters: number;
  arlaLiters: number;
  count: number;
  dieselTotal: number;
  arlaTotal: number;
  grandTotal: number;
};

// Sum fuel liters and costs. Currency was removed from the product, so all
// money is a single plain amount (no EUR/BRL split, no conversion).
export function computeFuelTotals(items: Refueling[]): FuelTotals {
  const t: FuelTotals = {
    dieselLiters: 0,
    arlaLiters: 0,
    count: 0,
    dieselTotal: 0,
    arlaTotal: 0,
    grandTotal: 0,
  };
  for (const r of items) {
    t.count += 1;
    t.dieselLiters += r.diesel_liters || 0;
    t.arlaLiters += r.arla_liters || 0;
    t.dieselTotal += (r.diesel_liters || 0) * (r.diesel_price || 0);
    t.arlaTotal += (r.arla_liters || 0) * (r.arla_price || 0);
  }
  t.grandTotal = t.dieselTotal + t.arlaTotal;
  return t;
}

// Média de consumo (km/L) pelo método do tanque cheio, usando o KM do Diesel
// gravado em cada abastecimento: km rodados = maior KM − menor KM; litros =
// soma do diesel de todos os abastecimentos, menos o primeiro (o diesel do
// primeiro foi gasto antes do período). Se não houver pelo menos dois
// abastecimentos com KM, usa os km das viagens/controles (fallbackKm) sobre o
// total de litros, como antes. Devolve "—" quando não dá para calcular.
export function computeConsumption(items: Refueling[], fallbackKm = 0): string {
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  const withKm = items
    .filter((r) => (r.km || 0) > 0 && (r.diesel_liters || 0) > 0)
    .sort((a, b) => a.km - b.km);
  if (withKm.length >= 2) {
    const kmRun = withKm[withKm.length - 1].km - withKm[0].km;
    const liters = withKm.slice(1).reduce((s, r) => s + (r.diesel_liters || 0), 0);
    if (kmRun > 0 && liters > 0) return fmt(kmRun / liters);
  }
  const totalLiters = items.reduce((s, r) => s + (r.diesel_liters || 0), 0);
  if (fallbackKm > 0 && totalLiters > 0) return fmt(fallbackKm / totalLiters);
  return "—";
}
