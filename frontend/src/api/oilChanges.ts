import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";
import { parseISODate, toISODate } from "@/src/utils/format";


// Oils that support interval control + alerts (engine, gearbox, differentials).
// steering / other are simple (type, brand, liters, value) with no interval.
export type OilKind = "engine" | "gearbox" | "diff1" | "diff2" | "steering" | "other";

// Source (pt-BR) labels used as i18n keys.
export const OIL_LABELS: Record<OilKind, string> = {
  engine: "Óleo do motor",
  gearbox: "Óleo da caixa de marchas",
  diff1: "Diferencial",
  diff2: "2º Diferencial",
  steering: "Óleo da direção hidráulica",
  other: "Outro óleo",
};

export const FILTER_KINDS = [
  "oil",
  "fuel",
  "water_sep",
  "air",
  "cabin",
  "adblue",
  "air_dryer",
  "steering",
  "gearbox",
  "other",
] as const;
export type FilterKind = (typeof FILTER_KINDS)[number];

export const FILTER_LABELS: Record<FilterKind, string> = {
  oil: "Filtro de óleo",
  fuel: "Filtro de combustível",
  water_sep: "Pré-filtro / separador de água",
  air: "Filtro de ar do motor",
  cabin: "Filtro de cabine",
  adblue: "Filtro do AdBlue / ARLA 32",
  air_dryer: "Filtro do secador de ar",
  steering: "Filtro da direção hidráulica",
  gearbox: "Filtro da caixa de câmbio",
  other: "Outro filtro",
};

export type ControlMode = "km" | "time" | "both";
export type TimeUnit = "months" | "years";

export type OilComponent = {
  kind: OilKind;
  label: string;
  enabled: boolean;
  oil_type: string;
  brand: string;
  liters: number;
  value: number;
  km: number;
  date: string;
  control: ControlMode;
  interval_km: number;
  next_km: number;
  interval_time: number;
  time_unit: TimeUnit;
  next_date: string;
  alert_km: number;
  alert_days: number;
};

export type FilterItem = {
  kind: FilterKind;
  label: string;
  brand: string;
  oil_type: string;
  quantity: string;
  value: number;
};

export type OilChange = {
  id: string;
  vehicle_id: string;
  vehicle_label: string;
  vehicle_plate: string;
  current_km: number;
  date: string;
  km: number;
  place: string;
  notes: string;
  traction: string; // ""|6x2|6x4
  components: OilComponent[];
  filters: FilterItem[];
  labor_value: number;
  other_costs: number;
  total: number;
  created_at: string;
};

export type OilChangeInput = Omit<OilChange, "id" | "created_at">;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useOilChanges() {
  return useQuery({
    queryKey: ["oil-changes"],
    queryFn: () => request<OilChange[]>("/oil-changes"),
  });
}

export function useCreateOilChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OilChangeInput) =>
      request<OilChange>("/oil-changes", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oil-changes"] }),
  });
}

export function useUpdateOilChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OilChangeInput }) =>
      request<OilChange>(`/oil-changes/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oil-changes"] }),
  });
}

export function useDeleteOilChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/oil-changes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oil-changes"] }),
  });
}

// ---------------------------------------------------------------------------
// Compute helpers for next change by KM / time.
// ---------------------------------------------------------------------------
export function computeNextKm(baseKm: number, intervalKm: number): number {
  if (!intervalKm || intervalKm <= 0) return 0;
  return (baseKm || 0) + intervalKm;
}

export function computeNextDate(baseDateISO: string, interval: number, unit: TimeUnit): string {
  if (!interval || interval <= 0 || !baseDateISO) return "";
  const d = parseISODate(baseDateISO);
  if (unit === "years") d.setFullYear(d.getFullYear() + interval);
  else d.setMonth(d.getMonth() + interval);
  return toISODate(d);
}

export type CompStatus = {
  status: "overdue" | "upcoming" | "ok";
  byKm: boolean;
  byTime: boolean;
};

function daysBetween(fromISO: string, toISODateStr: string): number {
  const a = parseISODate(fromISO).getTime();
  const b = parseISODate(toISODateStr).getTime();
  return Math.round((b - a) / 86400000);
}

// Evaluate a component against the current KM and today's date.
export function componentStatus(c: OilComponent, currentKm: number, todayISO: string): CompStatus {
  const usesKm = c.control === "km" || c.control === "both";
  const usesTime = c.control === "time" || c.control === "both";

  let overdueKm = false;
  let upcomingKm = false;
  if (usesKm && c.next_km > 0) {
    const remaining = c.next_km - (currentKm || 0);
    if (remaining <= 0) overdueKm = true;
    else if (c.alert_km > 0 && remaining <= c.alert_km) upcomingKm = true;
  }

  let overdueTime = false;
  let upcomingTime = false;
  if (usesTime && c.next_date) {
    const days = daysBetween(todayISO, c.next_date);
    if (days <= 0) overdueTime = true;
    else if (c.alert_days > 0 && days <= c.alert_days) upcomingTime = true;
  }

  const overdue = overdueKm || overdueTime;
  const upcoming = !overdue && (upcomingKm || upcomingTime);
  return {
    status: overdue ? "overdue" : upcoming ? "upcoming" : "ok",
    byKm: overdueKm || upcomingKm,
    byTime: overdueTime || upcomingTime,
  };
}

export type OilAlert = {
  recordId: string;
  vehicle: string;
  componentLabel: string;
  kind: OilKind;
  status: "overdue" | "upcoming";
  byKm: boolean;
  byTime: boolean;
  nextKm: number;
  nextDate: string;
};

// Only the most recent oil change per vehicle resets the clock, so alerts are
// evaluated against the latest record for each vehicle.
export function oilChangeAlerts(list: OilChange[], currentKm: number): OilAlert[] {
  const todayISO = toISODate(new Date());
  const latestByVehicle = new Map<string, OilChange>();
  // list is already sorted date desc by backend; keep first seen per vehicle.
  for (const rec of list) {
    const key = rec.vehicle_id || rec.id;
    if (!latestByVehicle.has(key)) latestByVehicle.set(key, rec);
  }
  const alerts: OilAlert[] = [];
  for (const rec of latestByVehicle.values()) {
    for (const c of rec.components || []) {
      if (!c.enabled) continue;
      if (c.control !== "km" && c.control !== "time" && c.control !== "both") continue;
      const st = componentStatus(c, currentKm, todayISO);
      if (st.status === "ok") continue;
      alerts.push({
        recordId: rec.id,
        vehicle: rec.vehicle_plate || rec.vehicle_label || "",
        componentLabel: c.label || OIL_LABELS[c.kind] || "",
        kind: c.kind,
        status: st.status,
        byKm: st.byKm,
        byTime: st.byTime,
        nextKm: c.next_km,
        nextDate: c.next_date,
      });
    }
  }
  // overdue first
  alerts.sort((a, b) => (a.status === b.status ? 0 : a.status === "overdue" ? -1 : 1));
  return alerts;
}

// Largest KM seen across trips / daily logs / oil changes (suggested current KM).
export function maxKmFrom(
  trips: { km_start?: number; km_end?: number }[] | undefined,
  dailyLogs: { start_km?: number; end_km?: number }[] | undefined,
  oilChanges: { km?: number; current_km?: number }[] | undefined,
): number {
  let max = 0;
  for (const t of trips ?? []) max = Math.max(max, t.km_end || 0, t.km_start || 0);
  for (const d of dailyLogs ?? []) max = Math.max(max, d.end_km || 0, d.start_km || 0);
  for (const o of oilChanges ?? []) max = Math.max(max, o.km || 0, o.current_km || 0);
  return max;
}

// Total cost of an oil-change record.
export function oilChangeTotal(components: OilComponent[], filters: FilterItem[], labor: number, other: number): number {
  const c = (components || []).reduce((s, x) => s + (x.enabled ? x.value || 0 : 0), 0);
  const f = (filters || []).reduce((s, x) => s + (x.value || 0), 0);
  return c + f + (labor || 0) + (other || 0);
}
