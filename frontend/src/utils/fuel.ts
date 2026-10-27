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
