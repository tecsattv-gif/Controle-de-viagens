import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export type Trip = {
  id: string;
  date: string; // yyyy-mm-dd (start date)
  end_date: string; // yyyy-mm-dd (end date)
  km_start: number;
  km_end: number;
  km: number;
  start_time: string;
  end_time: string;
  loading_place: string;
  unloading_place: string;
  // Coordenadas GPS gravadas ao preencher o local ("" = sem localização).
  loading_lat?: string;
  loading_lng?: string;
  unloading_lat?: string;
  unloading_lng?: string;
  rest_place: string;
  rest_stops: string[];
  notes: string;
  freight_gross: number;
  freight_gross_currency: string;
  freight_net: number;
  freight_net_currency: string;
  freight_paid: number;
  freight_paid_currency: string;
  freight_payment_date: string;
  freight_status: string;
  freight_diesel: number;
  freight_diesel_currency: string;
  freight_arla: number;
  freight_arla_currency: string;
  tolls: { value: number; currency: string }[];
  vehicle_id: string;
  vehicle_label: string;
  driver_id: string;
  driver_name: string;
  driver_license: string;
  // Fechada pelo botão "Fechar viagem" (KM final e descarga são opcionais).
  closed?: boolean;
  created_at: string;
};

export type TripInput = {
  date: string;
  end_date: string;
  km_start: number;
  km_end: number;
  start_time: string;
  end_time: string;
  loading_place: string;
  unloading_place: string;
  // Coordenadas GPS gravadas ao preencher o local ("" = sem localização).
  loading_lat?: string;
  loading_lng?: string;
  unloading_lat?: string;
  unloading_lng?: string;
  rest_stops: string[];
  notes: string;
  freight_gross: number;
  freight_gross_currency: string;
  freight_net: number;
  freight_net_currency: string;
  freight_paid: number;
  freight_paid_currency: string;
  freight_payment_date: string;
  freight_status: string;
  freight_diesel: number;
  freight_diesel_currency: string;
  freight_arla: number;
  freight_arla_currency: string;
  tolls: { value: number; currency: string }[];
  vehicle_id: string;
  vehicle_label: string;
  driver_id: string;
  driver_name: string;
  driver_license: string;
  closed?: boolean;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useTrips() {
  return useQuery({
    queryKey: ["trips"],
    queryFn: () => request<Trip[]>("/trips"),
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TripInput) =>
      request<Trip>("/trips", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TripInput }) =>
      request<Trip>(`/trips/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/trips/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

// Viagem em aberto = a ÚLTIMA viagem cadastrada ainda sem local de descarga
// E sem KM final (mesma regra do Controle Diário), e que não foi fechada pelo
// botão "Fechar viagem" (KM final e descarga são opcionais ao fechar).
export function findOpenTrip(trips?: Trip[]): Trip | undefined {
  if (!trips || trips.length === 0) return undefined;
  const last = [...trips].sort((x, y) =>
    (y.created_at || "").localeCompare(x.created_at || ""),
  )[0];
  const noKm = !last?.km_end || last.km_end === 0;
  const noPlace = !last?.unloading_place || last.unloading_place.trim() === "";
  return last && !last.closed && noKm && noPlace ? last : undefined;
}
