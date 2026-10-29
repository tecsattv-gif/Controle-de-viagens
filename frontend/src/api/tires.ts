import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";
import { ConfigUnit } from "@/src/utils/axleMaps";


export type TireMeasurement = {
  id: string;
  date: string;
  tread_mm: number;
  km?: number | null; // KM do veículo no dia da medição (medições antigas não têm)
  notes: string;
  created_at: string;
};

export type TireMovement = {
  id: string;
  date: string;
  vehicle_id: string;
  from_position: string;
  to_position: string;
  km: number;
  created_at: string;
};

export type Tire = {
  id: string;
  number: string;
  brand: string;
  size: string;
  install_date: string;
  install_km: number;
  current_tread_mm: number;
  notes: string;
  vehicle_id: string;
  position_code: string;
  status: "installed" | "removed";
  removed_km: number;
  measurements: TireMeasurement[];
  movements: TireMovement[];
  created_at: string;
};

export type TireInput = {
  number: string;
  brand: string;
  size: string;
  install_date: string;
  install_km: number;
  current_tread_mm: number;
  notes: string;
  vehicle_id: string;
  position_code: string;
};

export type TireSettings = { green_min_mm: number; yellow_min_mm: number };

export type TireConfig = { id: string; vehicle_id: string; units: ConfigUnit[] };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useTires(vehicleId?: string) {
  return useQuery({
    queryKey: ["tires", vehicleId ?? "all"],
    queryFn: () => request<Tire[]>(`/tires${vehicleId ? `?vehicle_id=${vehicleId}` : ""}`),
  });
}

export function useAllTires() {
  return useQuery({ queryKey: ["tires", "all"], queryFn: () => request<Tire[]>("/tires") });
}

function invalidateTires(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["tires"] });
}

export function useCreateTire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TireInput) => request<Tire>("/tires", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => invalidateTires(qc),
  });
}

export function useUpdateTire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TireInput> }) =>
      request<Tire>(`/tires/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => invalidateTires(qc),
  });
}

export function useDeleteTire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<{ success: boolean }>(`/tires/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateTires(qc),
  });
}

export function useAddMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, tread_mm, km, notes }: { id: string; date: string; tread_mm: number; km: number | null; notes: string }) =>
      request<Tire>(`/tires/${id}/measurements`, { method: "POST", body: JSON.stringify({ date, tread_mm, km, notes }) }),
    onSuccess: () => invalidateTires(qc),
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mid }: { id: string; mid: string }) =>
      request<Tire>(`/tires/${id}/measurements/${mid}`, { method: "DELETE" }),
    onSuccess: () => invalidateTires(qc),
  });
}

export function useMoveTire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to_position, vehicle_id, km, date }: { id: string; to_position: string; vehicle_id: string; km: number; date: string }) =>
      request<Tire>(`/tires/${id}/move`, { method: "POST", body: JSON.stringify({ to_position, vehicle_id, km, date }) }),
    onSuccess: () => invalidateTires(qc),
  });
}

export function useTireConfigs() {
  return useQuery({ queryKey: ["tire-configs"], queryFn: () => request<TireConfig[]>("/tire-configs") });
}

export function useSaveTireConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicle_id, units }: { vehicle_id: string; units: ConfigUnit[] }) =>
      request<TireConfig>(`/tire-configs/${vehicle_id}`, { method: "PUT", body: JSON.stringify({ vehicle_id, units }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tire-configs"] }),
  });
}

export function useTireSettings() {
  return useQuery({ queryKey: ["tire-settings"], queryFn: () => request<TireSettings>("/tire-settings") });
}

export function useSaveTireSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TireSettings) => request<TireSettings>("/tire-settings", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tire-settings"] }),
  });
}
