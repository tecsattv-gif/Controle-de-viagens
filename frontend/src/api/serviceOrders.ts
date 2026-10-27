import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type ServiceOrder = {
  id: string;
  number: number;
  date: string; // yyyy-mm-dd
  km: number;
  vehicle_plate: string;
  trailer_plate: string;
  descriptions: string[];
  created_at: string;
};

export type ServiceOrderInput = {
  date: string;
  km: number;
  vehicle_plate: string;
  trailer_plate: string;
  descriptions: string[];
};

// Número da OS formatado com 4 dígitos (OS Nº 0001).
export function formatOsNumber(n: number): string {
  return String(n || 0).padStart(4, "0");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useServiceOrders() {
  return useQuery({
    queryKey: ["service-orders"],
    queryFn: () => request<ServiceOrder[]>("/service-orders"),
  });
}

export function useCreateServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceOrderInput) =>
      request<ServiceOrder>("/service-orders", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-orders"] }),
  });
}

export function useUpdateServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServiceOrderInput }) =>
      request<ServiceOrder>(`/service-orders/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-orders"] }),
  });
}

export function useDeleteServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/service-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-orders"] }),
  });
}
