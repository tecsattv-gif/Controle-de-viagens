import { Trip } from "@/src/api/trips";
import { Tire } from "@/src/api/tires";

// KM atual do veículo = MAIOR km final registrado nas viagens desse veículo.
export function vehicleCurrentKm(vehicleId: string, trips: Trip[] | undefined): number | null {
  if (!vehicleId || !trips) return null;
  const vals = trips
    .filter((t) => t.vehicle_id === vehicleId && (t.km_end || 0) > 0)
    .map((t) => t.km_end || 0);
  if (!vals.length) return null;
  return Math.max(...vals);
}

// KM percorridos pelo pneu na instalação atual.
export function tireKmRun(tire: Tire, currentKm: number | null): number | null {
  const base = tire.status === "removed" ? tire.removed_km : currentKm;
  if (base == null) return null;
  const run = base - (tire.install_km || 0);
  return run >= 0 ? run : null;
}

// KM rodados entre uma medição de sulco e a anterior (a primeira compara com o KM
// de instalação). Devolve, por id da medição, a diferença — ou null quando a
// medição não tem KM ou não há KM anterior para comparar.
export function measurementKmSteps(tire: Tire): Record<string, number | null> {
  const sorted = [...(tire.measurements || [])].sort(
    (a, b) => (a.date || "").localeCompare(b.date || "") || (a.created_at || "").localeCompare(b.created_at || ""),
  );
  const out: Record<string, number | null> = {};
  let prev: number | null = tire.install_km ? tire.install_km : null;
  for (const m of sorted) {
    const km = m.km && m.km > 0 ? m.km : null;
    out[m.id] = km != null && prev != null && km >= prev ? km - prev : null;
    if (km != null) prev = km;
  }
  return out;
}
