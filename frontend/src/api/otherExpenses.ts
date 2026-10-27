import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type OtherExpense = {
  id: string;
  date: string; // yyyy-mm-dd
  place: string;
  service: string;
  value: number;
  created_at: string;
};

export type OtherExpenseInput = {
  date: string;
  place: string;
  service: string;
  value: number;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useOtherExpenses() {
  return useQuery({
    queryKey: ["other-expenses"],
    queryFn: () => request<OtherExpense[]>("/other-expenses"),
  });
}

export function useCreateOtherExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OtherExpenseInput) =>
      request<OtherExpense>("/other-expenses", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["other-expenses"] }),
  });
}

export function useUpdateOtherExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OtherExpenseInput }) =>
      request<OtherExpense>(`/other-expenses/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["other-expenses"] }),
  });
}

export function useDeleteOtherExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/other-expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["other-expenses"] }),
  });
}
