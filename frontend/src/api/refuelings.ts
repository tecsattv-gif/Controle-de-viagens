import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type Currency = "EUR" | "BRL";

export type Refueling = {
  id: string;
  date: string; // yyyy-mm-dd
  station_name: string;
  station_place: string;
  diesel_liters: number;
  diesel_price: number;
  arla_liters: number;
  arla_price: number;
  currency: Currency;
  payment_method: string;
  card_type: string;
  card_name: string;
  km: number; // KM do Diesel
  arla_km: number; // KM do ARLA (independente)
  notes: string;
  created_at: string;
};

export type RefuelingInput = {
  date: string;
  station_place: string; // Local do abastecimento
  diesel_liters: number;
  diesel_price: number;
  arla_liters: number;
  arla_price: number;
  km: number; // KM do Diesel
  arla_km: number; // KM do ARLA
  notes: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useRefuelings() {
  return useQuery({
    queryKey: ["refuelings"],
    queryFn: () => request<Refueling[]>("/refuelings"),
  });
}

export function useCreateRefueling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RefuelingInput) =>
      request<Refueling>("/refuelings", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["refuelings"] }),
  });
}

export function useUpdateRefueling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RefuelingInput }) =>
      request<Refueling>(`/refuelings/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["refuelings"] }),
  });
}

export function useDeleteRefueling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/refuelings/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["refuelings"] }),
  });
}
