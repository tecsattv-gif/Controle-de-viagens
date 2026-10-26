import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { FilePdf, Truck, X } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Tire, useTireConfigs, useTireSettings, useTires } from "@/src/api/tires";
import { useTrips } from "@/src/api/trips";
import { useVehicles, compositionPlates, vehicleLabel, vehicleName, vehicleTitle } from "@/src/api/vehicles";
import { SelectField } from "@/src/components/SelectField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { configPositions, positionLabel, treadState } from "@/src/utils/axleMaps";
import { formatDateBR, formatInt, toISODate } from "@/src/utils/format";
import { companyPdfHeaderHtml, useReportHeader } from "@/src/utils/reportHeader";
import { tireKmRun, vehicleCurrentKm } from "@/src/utils/tireKm";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BASE_CSS = `*{font-family:-apple-system,Roboto,Arial,sans-serif;box-sizing:border-box}
body{color:#1A1C19;font-size:11pt;margin:28px}
.osTitle{color:#E65C00;font-size:16pt;font-weight:800;margin:6px 0 6px 0}
.sub{color:#555;font-size:10pt;margin-bottom:12px}
.vh{border:1px solid #e3e3e3;border-radius:8px;padding:6px 10px;margin:4px 0 12px 0;font-size:10pt;line-height:1.5}
.vh .k{font-weight:800}
table{width:100%;border-collapse:collapse;font-size:10pt;margin-top:8px}
th,td{border:1px solid #e3e3e3;padding:6px 8px;text-align:left}
th{background:#f4f4f4}
.st-green{color:#1B7F2E;font-weight:700}.st-yellow{color:#B38600;font-weight:700}.st-red{color:#C62828;font-weight:700}`;

export default function PneusRelatoriosScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const { data: vehicles } = useVehicles();
  const { data: tires } = useTires();
  const { data: configs } = useTireConfigs();
  const { data: settings } = useTireSettings();
  const { data: trips } = useTrips();
  const { companyName, companyLogoUrl } = useReportHeader();

  const [vehicleId, setVehicleId] = useState("");
  const [tireId, setTireId] = useState("");
  const [busy, setBusy] = useState<"vehicle" | "tire" | null>(null);

  const g = settings?.green_min_mm ?? 5;
  const y = settings?.yellow_min_mm ?? 3;
  const stLabel = (s: Tire) => {
    const st = treadState(s.current_tread_mm, g, y);
    return st === "green" ? t("Bom") : st === "yellow" ? t("Atenção") : t("Trocar");
  };
  const stClass = (s: Tire) => {
    const st = treadState(s.current_tread_mm, g, y);
    return st === "green" ? "st-green" : st === "yellow" ? "st-yellow" : "st-red";
  };

  const share = async (html: string) => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch {
      try {
        await Print.printAsync({ html });
      } catch {
        // ignore
      }
    }
  };

  const genVehicleReport = async () => {
    if (!vehicleId) return;
    setBusy("vehicle");
    const vehicle = vehicles?.find((v) => v.id === vehicleId);
    const config = configs?.find((c) => c.vehicle_id === vehicleId);
    const positions = config ? configPositions(config.units) : [];
    const currentKm = vehicleCurrentKm(vehicleId, trips);
    const list = (tires || []).filter((ti) => ti.vehicle_id === vehicleId && ti.status === "installed");
    const header = await companyPdfHeaderHtml(companyName, companyLogoUrl);
    const rows = list.length
      ? list
          .map((ti) => {
            const run = tireKmRun(ti, currentKm);
            return `<tr><td>${esc(ti.number || "—")}</td><td>${esc(ti.brand || "—")}</td><td>${esc(ti.size || "—")}</td><td>${esc(positionLabel(ti.position_code, positions))}</td><td>${ti.install_km ? formatInt(ti.install_km) + " km" : "—"}</td><td>${run != null ? formatInt(run) + " km" : esc(t("Indisponível"))}</td><td>${ti.current_tread_mm} mm</td><td class="${stClass(ti)}">${esc(stLabel(ti))}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="8">${esc(t("Nenhum pneu cadastrado."))}</td></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>
      ${header}
      <div class="osTitle">${esc(t("Relatório de Pneus por Veículo"))}</div>
      <div class="vh">
        <div><span class="k">${esc(t("Veículo"))}:</span> ${esc(vehicle ? vehicleName(vehicle) || "—" : "—")}</div>
        <div><span class="k">${esc(t("Placa do veículo"))}:</span> ${esc(vehicle ? vehicle.truck_plate || "—" : "—")}</div>
        <div><span class="k">${esc(t("Placas das composições"))}:</span> ${esc(vehicle ? compositionPlates(vehicle) || "—" : "—")}</div>
        <div><span class="k">${esc(t("Emitido em"))}:</span> ${esc(formatDateBR(toISODate(new Date())))}</div>
      </div>
      <table><thead><tr>
        <th>${esc(t("Número"))}</th><th>${esc(t("Marca"))}</th><th>${esc(t("Medida"))}</th>
        <th>${esc(t("Posição"))}</th><th>${esc(t("KM de instalação"))}</th><th>${esc(t("KM percorridos"))}</th><th>${esc(t("Sulco"))}</th><th>${esc(t("Estado"))}</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    await share(html);
    setBusy(null);
  };

  const genTireReport = async () => {
    if (!tireId) return;
    setBusy("tire");
    const tire = tires?.find((x) => x.id === tireId);
    if (!tire) {
      setBusy(null);
      return;
    }
    const vehicle = vehicles?.find((v) => v.id === tire.vehicle_id);
    const config = configs?.find((c) => c.vehicle_id === tire.vehicle_id);
    const positions = config ? configPositions(config.units) : [];
    const currentKm = vehicleCurrentKm(tire.vehicle_id, trips);
    const run = tireKmRun(tire, currentKm);
    const header = await companyPdfHeaderHtml(companyName, companyLogoUrl);
    const measRows =
      [...(tire.measurements || [])].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((m) => `<tr><td>${esc(formatDateBR(m.date))}</td><td>${m.tread_mm} mm</td><td>${esc(m.notes || "—")}</td></tr>`).join("") ||
      `<tr><td colspan="3">—</td></tr>`;
    const movRows =
      [...(tire.movements || [])].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((mv) => `<tr><td>${esc(formatDateBR(mv.date))}</td><td>${esc(mv.from_position || "—")} → ${esc(mv.to_position || "—")}</td><td>${mv.km ? formatInt(mv.km) : "—"}</td></tr>`).join("") ||
      `<tr><td colspan="3">—</td></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>
      ${header}
      <div class="osTitle">${esc(t("Relatório Individual do Pneu"))}</div>
      <div class="vh">
        <div><span class="k">${esc(t("Veículo"))}:</span> ${esc(vehicle ? vehicleName(vehicle) || "—" : "—")}</div>
        <div><span class="k">${esc(t("Placa do veículo"))}:</span> ${esc(vehicle ? vehicle.truck_plate || "—" : "—")}</div>
        <div><span class="k">${esc(t("Placas das composições"))}:</span> ${esc(vehicle ? compositionPlates(vehicle) || "—" : "—")}</div>
      </div>
      <div class="sub">${esc(t("Número do pneu"))}: ${esc(tire.number || "—")} · ${esc(t("Marca"))}: ${esc(tire.brand || "—")} · ${esc(t("Medida"))}: ${esc(tire.size || "—")}</div>
      <div class="sub">${esc(t("Posição"))}: ${esc(tire.status === "removed" ? t("Retirado") : positionLabel(tire.position_code, positions))} · ${esc(t("KM de instalação"))}: ${tire.install_km ? formatInt(tire.install_km) + " km" : "—"} · ${esc(t("KM percorridos"))}: ${run != null ? formatInt(run) + " km" : esc(t("Indisponível"))}</div>
      <h3>${esc(t("Histórico de medições"))}</h3>
      <table><thead><tr><th>${esc(t("Data"))}</th><th>${esc(t("Sulco"))}</th><th>${esc(t("Observações"))}</th></tr></thead><tbody>${measRows}</tbody></table>
      <h3>${esc(t("Mudanças de posição"))}</h3>
      <table><thead><tr><th>${esc(t("Data"))}</th><th>${esc(t("Movimentação"))}</th><th>KM</th></tr></thead><tbody>${movRows}</tbody></table>
    </body></html>`;
    await share(html);
    setBusy(null);
  };

  const vehicleOptions = (vehicles || []).map((v) => ({ id: v.id, title: vehicleTitle(v), subtitle: vehicleLabel(v) }));
  const tireOptions = (tires || []).map((ti) => ({ id: ti.id, title: `${t("Pneu")} ${ti.number}`, subtitle: ti.brand }));

  return (
    <View style={styles.screen} testID="pneus-relatorios-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="rel-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Relatórios de Pneus")}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Truck size={20} color={colors.brandPrimary} weight="fill" />
            <Text style={styles.blockTitle}>{t("Relatório por Veículo")}</Text>
          </View>
          <SelectField label={t("Veículo")} placeholder={t("Selecione o veículo")} value={vehicleId} options={vehicleOptions} onChange={setVehicleId} testID="rel-vehicle-select" />
          <Pressable style={[styles.genBtn, (!vehicleId || busy === "vehicle") && styles.disabled]} onPress={genVehicleReport} disabled={!vehicleId || busy === "vehicle"} testID="gen-vehicle-report">
            {busy === "vehicle" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><FilePdf size={20} color={colors.onBrandPrimary} weight="bold" /><Text style={styles.genTxt}>{t("Gerar PDF")}</Text></>}
          </Pressable>
        </View>

        <View style={styles.block}>
          <View style={styles.blockHead}>
            <FilePdf size={20} color={colors.brandPrimary} weight="fill" />
            <Text style={styles.blockTitle}>{t("Relatório Individual do Pneu")}</Text>
          </View>
          <SelectField label={t("Pneu")} placeholder={t("Selecione o pneu")} value={tireId} options={tireOptions} onChange={setTireId} testID="rel-tire-select" />
          <Pressable style={[styles.genBtn, (!tireId || busy === "tire") && styles.disabled]} onPress={genTireReport} disabled={!tireId || busy === "tire"} testID="gen-tire-report">
            {busy === "tire" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><FilePdf size={20} color={colors.onBrandPrimary} weight="bold" /><Text style={styles.genTxt}>{t("Gerar PDF")}</Text></>}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.3 },
  content: { padding: 16, gap: 16 },
  block: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  blockTitle: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  genBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    marginTop: 6,
  },
  disabled: { opacity: 0.5 },
  genTxt: { fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 0.3, color: colors.onBrandPrimary },
}));
