import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type TollExpense = {
  id: string;
  date: string; // yyyy-mm-dd
  value: number;
  place: string;
  created_at: string;
};

export type TollExpenseInput = {
  date: string;
  value: number;
  place: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useTollExpenses() {
  return useQuery({
    queryKey: ["toll-expenses"],
    queryFn: () => request<TollExpense[]>("/toll-expenses"),
  });
}

export function useCreateTollExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TollExpenseInput) =>
      request<TollExpense>("/toll-expenses", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["toll-expenses"] }),
  });
}

export function useUpdateTollExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TollExpenseInput }) =>
      request<TollExpense>(`/toll-expenses/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["toll-expenses"] }),
  });
}

export function useDeleteTollExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/toll-expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["toll-expenses"] }),
  });
}
