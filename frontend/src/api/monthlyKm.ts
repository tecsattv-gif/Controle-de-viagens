import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type MonthlyKm = {
  id: string;
  start_date: string; // yyyy-mm-dd
  start_km: number;
  end_date: string; // yyyy-mm-dd
  end_km: number;
  created_at: string;
};

export type MonthlyKmInput = {
  start_date: string;
  start_km: number;
  end_date: string;
  end_km: number;
};

// Considera incompleto quando ainda não há KM final do mês.
export function isMonthlyOpen(m: { end_km: number }): boolean {
  return !m.end_km || m.end_km === 0;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useMonthlyKm() {
  return useQuery({
    queryKey: ["monthly-km"],
    queryFn: () => request<MonthlyKm[]>("/monthly-km"),
  });
}

export function useCreateMonthlyKm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MonthlyKmInput) =>
      request<MonthlyKm>("/monthly-km", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-km"] }),
  });
}

export function useUpdateMonthlyKm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MonthlyKmInput }) =>
      request<MonthlyKm>(`/monthly-km/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-km"] }),
  });
}

export function useDeleteMonthlyKm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/monthly-km/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-km"] }),
  });
}
