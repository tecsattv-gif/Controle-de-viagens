import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { useDrivers } from "@/src/api/drivers";
import { useVehicles } from "@/src/api/vehicles";
import { useAuth } from "@/src/context/AuthContext";
import { fileUrl, toDataUri } from "@/src/utils/upload";

const SELECTED_VEHICLE_KEY = "selectedVehicleId";

// Matrícula do veículo selecionado, motorista principal e dados da empresa,
// para incluir em todos os relatórios (PDF/CSV).
export function useReportHeader() {
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(SELECTED_VEHICLE_KEY).then((v) => {
      if (v) setSelectedId(v);
    });
  }, []);

  const list = vehicles ?? [];
  const vehicle = list.find((v) => v.id === selectedId) ?? list[0];
  const vehicleLabel = vehicle?.truck_plate || vehicle?.truck_brand || "";
  const driverName = drivers?.[0]?.full_name || "";
  const driverLicense = drivers?.[0]?.license_number || "";
  const companyName = user?.company_name || "";
  const companyLogoUrl = user?.company_logo_path ? fileUrl(user.company_logo_path) : "";

  return { vehicleLabel, driverName, driverLicense, companyName, companyLogoUrl };
}

function escHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Gera o bloco HTML (logo + nome da empresa) para o topo dos PDFs.
// O logo é embutido em base64 para renderizar de forma confiável no PDF.
export async function companyPdfHeaderHtml(name: string, logoUrl: string): Promise<string> {
  let img = "";
  if (logoUrl) {
    try {
      const dataUri = await toDataUri(logoUrl);
      if (!dataUri) throw new Error("no logo");
      img = `<img src="${dataUri}" style="max-height:64px;max-width:180px;object-fit:contain"/>`;
    } catch {
      img = "";
    }
  }
  if (!img && !name) return "";
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #E65C00">${img}${
    name ? `<div style="font-size:16pt;font-weight:800;color:#1A1C19">${escHtml(name)}</div>` : ""
  }</div>`;
}
