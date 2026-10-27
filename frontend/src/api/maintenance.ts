import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export const MAINTENANCE_CATEGORIES = [
  "Mecânica",
  "Elétrica",
  "Borracharia",
  "Outros",
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export type Maintenance = {
  id: string;
  category: string;
  date: string; // yyyy-mm-dd
  place: string;
  description: string;
  price: number;
  km: number;
  notes: string;
  created_at: string;
};

export type MaintenanceInput = {
  category: string;
  date: string;
  place: string;
  description: string;
  price: number;
  km: number;
  notes: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useMaintenances() {
  return useQuery({
    queryKey: ["maintenances"],
    queryFn: () => request<Maintenance[]>("/maintenances"),
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MaintenanceInput) =>
      request<Maintenance>("/maintenances", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenances"] }),
  });
}

export function useUpdateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MaintenanceInput }) =>
      request<Maintenance>(`/maintenances/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenances"] }),
  });
}

export function useDeleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/maintenances/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenances"] }),
  });
}
