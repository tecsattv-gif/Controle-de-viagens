import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { localRequest } from "@/src/local/server";


export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

export type Driver = {
  id: string;
  full_name: string;
  driver_number: string;
  company: string;
  cpf: string;
  license_number: string;
  age: number | null;
  birth_date: string; // yyyy-mm-dd
  blood_type: string;
  license_expiry: string; // yyyy-mm-dd
  toxicology_expiry: string; // yyyy-mm-dd
  photo_path: string;
  order: number;
  created_at: string;
};

export type DriverInput = {
  full_name: string;
  driver_number: string;
  company: string;
  cpf: string;
  license_number: string;
  age: number | null;
  birth_date: string;
  blood_type: string;
  license_expiry: string;
  toxicology_expiry: string;
  photo_path: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return localRequest<T>(path, options as { method?: string; body?: any });
}

export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: () => request<Driver[]>("/drivers"),
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DriverInput) =>
      request<Driver>("/drivers", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DriverInput }) =>
      request<Driver>(`/drivers/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });
}

export function useDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/drivers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });
}

export function useSetPrimaryDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ success: boolean }>(`/drivers/${id}/primary`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });
}

// Days until an ISO date (yyyy-mm-dd). Negative = already expired. null if empty.
export function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

// "expired" | "soon" (<=30d) | "ok" | null (no date)
export function expiryStatus(iso: string): "expired" | "soon" | "ok" | null {
  const d = daysUntil(iso);
  if (d === null) return null;
  if (d < 0) return "expired";
  if (d <= 30) return "soon";
  return "ok";
}
