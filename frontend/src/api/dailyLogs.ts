import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type DailyStop = {
  place: string;
  time: string; // HH:mm
  // Coordenadas capturadas pelo GPS ao adicionar a parada ("" = sem localização).
  lat?: string;
  lng?: string;
};

export type DailyLog = {
  id: string;
  date: string; // yyyy-mm-dd
  start_place: string;
  start_km: number;
  start_time: string; // HH:mm
  end_place: string;
  end_km: number;
  end_time: string; // HH:mm
  stops: DailyStop[];
  notes: string;
  created_at: string;
};

export type DailyLogInput = {
  date: string;
  start_place: string;
  start_km: number;
  start_time: string;
  end_place: string;
  end_km: number;
  end_time: string;
  stops: DailyStop[];
  notes: string;
};

// KM rodados no dia: km final - km inicial (nunca negativo).
export function dailyKm(log: { start_km: number; end_km: number }): number {
  const diff = (log.end_km || 0) - (log.start_km || 0);
  return diff > 0 ? diff : 0;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useDailyLogs() {
  return useQuery({
    queryKey: ["daily-logs"],
    queryFn: () => request<DailyLog[]>("/daily-logs"),
  });
}

export function useCreateDailyLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DailyLogInput) =>
      request<DailyLog>("/daily-logs", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-logs"] }),
  });
}

export function useUpdateDailyLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DailyLogInput }) =>
      request<DailyLog>(`/daily-logs/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-logs"] }),
  });
}

export function useDeleteDailyLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/daily-logs/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-logs"] }),
  });
}
