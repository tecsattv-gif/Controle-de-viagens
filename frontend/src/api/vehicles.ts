import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type Vehicle = {
  id: string;
  company: string;
  truck_brand: string;
  truck_plate: string;
  truck_model: string;
  trailers: string[];
  uses_dolly: boolean;
  dolly_plate: string;
  dolly_trailer_plate: string;
  photo_path: string;
  created_at: string;
};

export type VehicleInput = {
  company: string;
  truck_brand: string;
  truck_plate: string;
  truck_model: string;
  trailers: string[];
  uses_dolly: boolean;
  dolly_plate: string;
  dolly_trailer_plate: string;
  photo_path: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: () => request<Vehicle[]>("/vehicles"),
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleInput) =>
      request<Vehicle>("/vehicles", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VehicleInput }) =>
      request<Vehicle>(`/vehicles/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

// Short one-line label with all plates of the composition (for pickers/cards).
export function vehicleLabel(v: Vehicle): string {
  const parts: string[] = [];
  if (v.truck_plate) parts.push(`Cavalo ${v.truck_plate}`);
  const trailers = (v.trailers || []).filter(Boolean);
  if (trailers.length) parts.push(`Reboque ${trailers.join(", ")}`);
  if (v.uses_dolly) {
    if (v.dolly_plate) parts.push(`Dolly ${v.dolly_plate}`);
    if (v.dolly_trailer_plate) parts.push(`Reboque Dolly ${v.dolly_trailer_plate}`);
  }
  return parts.join(" • ") || "Composição sem placas";
}

export function vehicleTitle(v: Vehicle): string {
  if (v.truck_plate) return v.truck_plate;
  if (v.truck_brand) return v.truck_brand;
  return "Composição";
}

// Nome do veículo (marca + modelo) para cabeçalhos de relatório.
export function vehicleName(v: Vehicle): string {
  return [v.truck_brand, v.truck_model].filter(Boolean).join(" ").trim();
}

// Apenas as placas das composições (reboques + dolly), sem o cavalo.
export function compositionPlates(v: Vehicle): string {
  const parts: string[] = [];
  (v.trailers || []).filter(Boolean).forEach((p) => parts.push(p));
  if (v.uses_dolly) {
    if (v.dolly_plate) parts.push(v.dolly_plate);
    if (v.dolly_trailer_plate) parts.push(v.dolly_trailer_plate);
  }
  return parts.join(", ");
}
