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
