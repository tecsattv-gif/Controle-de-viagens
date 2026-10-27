import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type Freight = {
  id: string;
  date: string;
  client: string;
  origin: string;
  destination: string;
  value: number;
  currency: string;
  weight: number;
  reference: string;
  notes: string;
  created_at: string;
};

export type FreightInput = {
  date: string;
  client: string;
  origin: string;
  destination: string;
  value: number;
  currency: string;
  weight: number;
  reference: string;
  notes: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useFreights() {
  return useQuery({
    queryKey: ["freights"],
    queryFn: () => request<Freight[]>("/freights"),
  });
}

export function useCreateFreight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FreightInput) =>
      request<Freight>("/freights", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freights"] }),
  });
}

export function useUpdateFreight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FreightInput }) =>
      request<Freight>(`/freights/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freights"] }),
  });
}

export function useDeleteFreight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/freights/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freights"] }),
  });
}
