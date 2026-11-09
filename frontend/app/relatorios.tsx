import * as Print from "expo-print";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { FilePdf, PathIcon as Path, Table, Warning, X } from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Driver, useDrivers } from "@/src/api/drivers";
import { Trip, useTrips, useDeleteTrip } from "@/src/api/trips";
import { useRefuelings, Refueling } from "@/src/api/refuelings";
import { useVehicles, Vehicle } from "@/src/api/vehicles";
import { DateInputField } from "@/src/components/DateInputField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatDecimal, formatInt, money, toISODate } from "@/src/utils/format";
import { computeConsumption, computeFuelTotals, FuelTotals } from "@/src/utils/fuel";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { useReportHeader } from "@/src/utils/reportHeader";
import { companyPdfHeaderHtml } from "@/src/utils/reportHeader";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import {
  computeFreightTotals,
  computeTripFinance,
  FreightTotals,
} from "@/src/utils/freight";
import { htmlToPdf } from "@/src/utils/pdf";
import { themeReportHtml } from "@/src/utils/reportColors";
function dateRange(t: Trip): string {
  return t.end_date && t.end_date !== t.date
    ? `${formatDateBR(t.date)} → ${formatDateBR(t.end_date)}`
    : formatDateBR(t.date);
}

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function genTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type HeaderInfo = {
  driverName: string;
  driverNumber: string;
  driverCompany: string;
  driverLicense: string;
  vehicleBrandModel: string;
  vehiclePlate: string;
  trailers: string;
  dolly: string;
};

type Tr = (s: string, vars?: Record<string, string | number>) => string;

function compactHeader(h: HeaderInfo, periodo: string, tr: Tr): string {
  const parts = [
    tr("RELATÓRIO DE VIAGENS"),
    h.driverName,
    h.vehiclePlate || h.vehicleBrandModel,
    periodo,
  ].filter(Boolean);
  return parts.join(" · ").replace(/"/g, "'");
}

function buildHeaderHtml(h: HeaderInfo, periodo: string, tr: Tr): string {
  const lines: string[] = [];
  const driverLine = h.driverName;
  if (driverLine) lines.push(`<div class="h-line"><b>${tr("Motorista:")}</b> ${escapeHtml(driverLine)}${h.driverLicense ? ` — ${tr("CNH {n}", { n: escapeHtml(h.driverLicense) })}` : ""}</div>`);
  const veh = [h.vehicleBrandModel, h.vehiclePlate ? tr("Placa {p}", { p: h.vehiclePlate }) : ""].filter(Boolean).join(" — ");
  if (veh) lines.push(`<div class="h-line"><b>${tr("Veículo:")}</b> ${escapeHtml(veh)}</div>`);
  if (h.trailers) lines.push(`<div class="h-line"><b>${tr("Reboque(s):")}</b> ${escapeHtml(h.trailers)}</div>`);
  if (h.dolly) lines.push(`<div class="h-line"><b>${tr("Dolly:")}</b> ${escapeHtml(h.dolly)}</div>`);
  lines.push(`<div class="h-line"><b>${tr("Período:")}</b> ${escapeHtml(periodo)}</div>`);
  return `<div class="doc-header">
    <div class="h-title">${tr("RELATÓRIO DE VIAGENS")}</div>
    ${lines.join("")}
  </div>`;
}

function financeRowsHtml(t: Trip, tr: Tr): string {
  const f = computeTripFinance(t);
  const km = t.km || 0;
  const gross = f.grossEur + f.grossBrl;
  const diesel = f.dieselEur + f.dieselBrl;
  const arla = f.arlaEur + f.arlaBrl;
  const tolls = f.tollsEur + f.tollsBrl;
  const expenses = f.expensesEur + f.expensesBrl;
  const net = f.netEur + f.netBrl;
  if (!gross && !expenses && !net) return "";
  const status = t.freight_status && t.freight_status !== "Não informado" ? `<tr><td class="k">${tr("Situação")}</td><td colspan="3">${escapeHtml(t.freight_status)}</td></tr>` : "";
  const expenseRows =
    diesel || arla || tolls
      ? `<tr><td class="k">${tr("Diesel")}</td><td>${money(diesel)}</td><td class="k">ARLA 32</td><td>${money(arla)}</td></tr>
     <tr><td class="k">${tr("Pedágios")}</td><td>${money(tolls)}</td><td class="k">${tr("Total despesas")}</td><td>${money(expenses)}</td></tr>
     <tr><td class="k">${tr("Custo por km")}</td><td colspan="3">${money(km > 0 ? expenses / km : 0)}</td></tr>`
      : "";
  return `<tr><td class="k">${tr("Resumo financeiro")}</td><td colspan="3"></td></tr>${status}<tr><td class="k">${tr("Frete bruto")}</td><td colspan="3">${money(gross)}</td></tr>${expenseRows}<tr><td class="k">${tr("Frete líquido")}</td><td colspan="3"><b>${money(net)}</b></td></tr>`;
}

function tripSectionHtml(t: Trip, index: number, tr: Tr): string {
  return `
  <div class="trip">
    <div class="trip-head">
      <span class="trip-title">${tr("Viagem {n}", { n: index })} — ${escapeHtml(dateRange(t))}</span>
      <span class="trip-km">${formatInt(t.km)} km</span>
    </div>
    <table class="grid">
      <tr><td class="k">${tr("KM inicial")}</td><td>${formatInt(t.km_start)}</td></tr>
      <tr><td class="k">${tr("KM final")}</td><td>${formatInt(t.km_end)}</td></tr>
      <tr><td class="k">${tr("KM rodados")}</td><td><b>${formatInt(t.km)} km</b></td></tr>
      <tr><td class="k">${tr("Carregamento")}</td><td>${escapeHtml(t.loading_place || "—")}</td></tr>
      <tr><td class="k">${tr("Descarga")}</td><td>${escapeHtml(t.unloading_place || "—")}</td></tr>
      <tr><td class="k">${tr("Observações")}</td><td>${escapeHtml(t.notes || "—")}</td></tr>
    </table>
    <table class="grid fin">${financeRowsHtml(t, tr)}</table>
  </div>`;
}

function fuelTableHtml(items: Refueling[], tr: Tr): string {
  if (items.length === 0) {
    return `<div class="muted">${tr("Nenhum abastecimento no período.")}</div>`;
  }
  const rows = items
    .map((r) => {
      const dieselCost = r.diesel_liters * r.diesel_price;
      const total = dieselCost + r.arla_liters * r.arla_price;
      return `<tr>
        <td>${escapeHtml(formatDateBR(r.date))}</td>
        <td>${escapeHtml(r.station_place || r.station_name || "—")}</td>
        <td class="r">${formatInt(r.km)}</td>
        <td class="r">${formatDecimal(r.diesel_liters)}</td>
        <td class="r">${formatDecimal(r.arla_liters)}</td>
        <td class="r">${money(r.diesel_price)}</td>
        <td class="r">${money(total)}</td>
      </tr>`;
    })
    .join("");
  return `<table class="fuel">
    <thead><tr>
      <th>${tr("Data")}</th><th>${tr("Local")}</th><th class="r">KM</th><th class="r">${tr("Diesel L")}</th>
      <th class="r">${tr("ARLA L")}</th><th class="r">${tr("Preço/L")}</th><th class="r">${tr("Total")}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildHtml(
  header: HeaderInfo,
  periodo: string,
  trips: Trip[],
  totalKm: number,
  refuels: Refueling[],
  ft: FuelTotals,
  media: string,
  fin: FreightTotals,
  tr: Tr,
): string {
  const headerHtml = buildHeaderHtml(header, periodo, tr);
  const tripsHtml = trips.length
    ? trips.map((t, i) => tripSectionHtml(t, i + 1, tr)).join("")
    : `<div class="muted">${tr("Nenhuma viagem no período.")}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    @page {
      size: A4;
      margin: 24mm 12mm 16mm 12mm;
      @top-center { content: "${compactHeader(header, periodo, tr)}"; font-size: 8pt; color: #999; }
      @bottom-left { content: "${tr("Gerado em {ts}", { ts: genTimestamp() })}"; font-size: 8pt; color: #999; }
      @bottom-right { content: "${tr("Página")} " counter(page) " ${tr("de")} " counter(pages); font-size: 8pt; color: #999; }
    }
    * { font-family: -apple-system, Roboto, Arial, sans-serif; box-sizing: border-box; }
    body { color: #1A1C19; font-size: 10.5pt; margin: 0; }
    .doc-header { border-bottom: 2px solid #E65C00; padding-bottom: 6px; margin-bottom: 10px; }
    .h-title { color: #E65C00; font-size: 17pt; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 4px; }
    .h-line { font-size: 9pt; color: #333; line-height: 1.45; }
    .h-line b { color: #111; }
    h2 { color: #E65C00; font-size: 12pt; margin: 16px 0 6px; border-bottom: 1px solid #eee; padding-bottom: 3px; }
    .muted { color: #888; font-size: 9.5pt; padding: 6px 0; }
    .trip { border: 1px solid #E0E0E0; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; page-break-inside: avoid; }
    .trip-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .trip-title { font-size: 11pt; font-weight: 700; }
    .trip-km { background: #FFE5D0; color: #E65C00; font-weight: 700; padding: 2px 9px; border-radius: 20px; font-size: 9.5pt; }
    table.grid { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    table.grid td { padding: 3px 6px; border-bottom: 1px solid #F2F2F2; vertical-align: top; }
    table.grid td.k { color: #888; width: 22%; }
    table.grid.fin { margin-top: 6px; border-top: 1px dashed #ddd; }
    ul.stops { margin: 0; padding-left: 16px; }
    table.fuel { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    table.fuel thead { display: table-header-group; }
    table.fuel th { background: #F5F5F5; color: #555; text-align: left; padding: 5px 6px; border-bottom: 1px solid #DDD; }
    table.fuel td { padding: 5px 6px; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
    table.fuel tr { page-break-inside: avoid; }
    table.fuel .r { text-align: right; white-space: nowrap; }
    table.sum { width: 100%; border-collapse: collapse; font-size: 10pt; }
    table.sum td { padding: 6px 8px; border-bottom: 1px solid #EEE; }
    table.sum td.k { color: #666; }
    table.sum td.v { text-align: right; font-weight: 700; }
    .grand { margin-top: 10px; background: #121212; color: #fff; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; font-size: 11pt; font-weight: 700; page-break-inside: avoid; }
    .grand .val { color: #FF8A3D; }
  </style></head>
  <body>
    ${headerHtml}

    <h2>${tr("Viagens")}</h2>
    ${tripsHtml}

    <h2>${tr("Abastecimentos")}</h2>
    ${fuelTableHtml(refuels, tr)}

    <h2>${tr("Resumo do período")}</h2>
    <table class="sum">
      <tr><td class="k">${tr("Total de viagens")}</td><td class="v">${trips.length}</td></tr>
      <tr><td class="k">${tr("Total de KM rodados")}</td><td class="v">${formatInt(totalKm)} km</td></tr>
      <tr><td class="k">${tr("Total de Diesel (abastecido)")}</td><td class="v">${formatDecimal(ft.dieselLiters)} L</td></tr>
      <tr><td class="k">${tr("Total de ARLA 32 (abastecido)")}</td><td class="v">${formatDecimal(ft.arlaLiters)} L</td></tr>
      <tr><td class="k">${tr("Média de consumo")}</td><td class="v">${media} km/L</td></tr>
    </table>

    <h2>${tr("Resumo financeiro do período")}</h2>
    <table class="sum">
      <tr><td class="k">${tr("Total frete bruto")}</td><td class="v">${money(fin.grossEur + fin.grossBrl)}</td></tr>
      <tr><td class="k">${tr("Total gasto Diesel")}</td><td class="v">${money(fin.dieselEur + fin.dieselBrl)}</td></tr>
      <tr><td class="k">${tr("Total gasto ARLA 32")}</td><td class="v">${money(fin.arlaEur + fin.arlaBrl)}</td></tr>
      <tr><td class="k">${tr("Total gasto Pedágios")}</td><td class="v">${money(fin.tollsEur + fin.tollsBrl)}</td></tr>
      <tr><td class="k">${tr("Total de despesas")}</td><td class="v">${money(fin.expensesEur + fin.expensesBrl)}</td></tr>
      <tr><td class="k">${tr("Total recebido")}</td><td class="v">${money(fin.paidEur + fin.paidBrl)}</td></tr>
      <tr><td class="k">${tr("A receber")}</td><td class="v">${money(fin.toReceiveEur + fin.toReceiveBrl)}</td></tr>
    </table>
    <div class="grand"><span>${tr("LÍQUIDO DO PERÍODO")}</span><span class="val">${money(fin.resultEur + fin.resultBrl)}</span></div>
  </body></html>`;
}

function csvNum(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2).replace(".", ",");
}

function csvCell(s: string): string {
  const v = s ?? "";
  if (/[;"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildCsv(trips: Trip[], tr: Tr): string {
  const headers = [
    tr("Data início"),
    tr("Data fim"),
    tr("KM inicial"),
    tr("KM final"),
    tr("KM rodados"),
    `${tr("Frete bruto")} EUR`,
    `${tr("Frete bruto")} BRL`,
    `${tr("Diesel")} EUR`,
    `${tr("Diesel")} BRL`,
    "ARLA EUR",
    "ARLA BRL",
    `${tr("Pedágios")} EUR`,
    `${tr("Pedágios")} BRL`,
    `${tr("Despesas")} EUR`,
    `${tr("Despesas")} BRL`,
    `${tr("Líquido")} EUR`,
    `${tr("Líquido")} BRL`,
    `${tr("Custo/km")} EUR`,
    `${tr("Custo/km")} BRL`,
    tr("Situação"),
    tr("Veículo"),
    tr("Motorista"),
    tr("Observações"),
  ];
  const lines = [headers.join(";")];
  for (const t of trips) {
    const f = computeTripFinance(t);
    const km = t.km || 0;
    const row = [
      formatDateBR(t.date),
      t.end_date && t.end_date !== t.date ? formatDateBR(t.end_date) : formatDateBR(t.date),
      String(t.km_start),
      String(t.km_end),
      String(t.km),
      csvNum(f.grossEur),
      csvNum(f.grossBrl),
      csvNum(f.dieselEur),
      csvNum(f.dieselBrl),
      csvNum(f.arlaEur),
      csvNum(f.arlaBrl),
      csvNum(f.tollsEur),
      csvNum(f.tollsBrl),
      csvNum(f.expensesEur),
      csvNum(f.expensesBrl),
      csvNum(f.netEur),
      csvNum(f.netBrl),
      csvNum(km > 0 ? f.expensesEur / km : 0),
      csvNum(km > 0 ? f.expensesBrl / km : 0),
      t.freight_status || "",
      t.vehicle_label || "",
      t.driver_name ? (t.driver_license ? `${t.driver_name} - CNH ${t.driver_license}` : t.driver_name) : "",
      t.notes || "",
    ].map((c) => csvCell(String(c)));
    lines.push(row.join(";"));
  }
  // UTF-8 BOM so Excel shows accents correctly.
  return "\uFEFF" + lines.join("\r\n");
}

export default function RelatoriosScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data } = useTrips();
  const { data: refuelData } = useRefuelings();
  const { data: vehiclesData } = useVehicles();
  const { data: driversData } = useDrivers();
  const delTrip = useDeleteTrip();
  const removeWithUndo = useUndoableDelete();

  const now = new Date();
  const [start, setStart] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [end, setEnd] = useState(now);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const { vehicleLabel, driverName: rhDriverName, driverLicense: rhDriverLicense, companyName, companyLogoUrl } = useReportHeader();

  const startISO = toISODate(start);
  const endISO = toISODate(end);
  const invalid = endISO < startISO;

  const trips = useMemo(
    () =>
      (data ?? [])
        .filter((t) => t.date >= startISO && t.date <= endISO)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data, startISO, endISO],
  );
  const totalKm = trips.reduce((sum, t) => sum + t.km, 0);
  const periodo = `${formatDateBR(startISO)} a ${formatDateBR(endISO)}`;

  const refuels = (refuelData ?? []).filter((r) => r.date >= startISO && r.date <= endISO);
  const ft = computeFuelTotals(refuels);
  const media = computeConsumption(refuels, totalKm);

  // Auto-detect single driver/vehicle from the trips in the period.
  const autoDriverId = useMemo(() => {
    const ids = [...new Set(trips.map((t) => t.driver_id).filter(Boolean))];
    return ids.length === 1 ? ids[0] : "";
  }, [trips]);
  const autoVehicleId = useMemo(() => {
    const ids = [...new Set(trips.map((t) => t.vehicle_id).filter(Boolean))];
    return ids.length === 1 ? ids[0] : "";
  }, [trips]);

  const drivers = driversData ?? [];
  const vehicles = vehiclesData ?? [];
  const driver: Driver | undefined = drivers.find((d) => d.id === autoDriverId);
  const vehicle: Vehicle | undefined = vehicles.find((v) => v.id === autoVehicleId);

  const header: HeaderInfo = {
    driverName: driver?.full_name || trips.find((t) => t.driver_name)?.driver_name || rhDriverName || "",
    driverNumber: driver?.driver_number || "",
    driverCompany: driver?.company || "",
    driverLicense: driver?.license_number || trips.find((t) => t.driver_license)?.driver_license || rhDriverLicense || "",
    vehicleBrandModel: vehicle
      ? [vehicle.truck_brand, vehicle.truck_model].filter(Boolean).join(" ")
      : "",
    vehiclePlate: vehicle?.truck_plate || vehicleLabel || "",
    trailers: vehicle ? (vehicle.trailers || []).filter(Boolean).join(", ") : "",
    dolly: vehicle && vehicle.uses_dolly
      ? [vehicle.dolly_plate, vehicle.dolly_trailer_plate ? `(reboque ${vehicle.dolly_trailer_plate})` : ""]
          .filter(Boolean)
          .join(" ")
      : "",
  };

  const fin = computeFreightTotals(trips);

  const exportPdf = async () => {
    if (invalid) {
      setBanner(t("A data final deve ser igual ou posterior à data inicial."));
      return;
    }
    setBanner(null);
    setExporting(true);
    const html = buildHtml(header, periodo, trips, totalKm, refuels, ft, media, fin, t);
    const companyHtml = await companyPdfHeaderHtml(companyName, companyLogoUrl);
    const htmlWithCompany = companyHtml ? html.replace("<body>", `<body>${companyHtml}`) : html;
    try {
      const { uri } = await htmlToPdf(htmlWithCompany);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: t("Relatório de Viagem"),
          UTI: "com.adobe.pdf",
        });
      }
    } catch {
      try {
        await Print.printAsync({ html: themeReportHtml(htmlWithCompany) });
      } catch {
        setBanner(t("Não foi possível gerar o PDF neste dispositivo."));
      }
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = async () => {
    if (invalid) {
      setBanner(t("A data final deve ser igual ou posterior à data inicial."));
      return;
    }
    if (trips.length === 0) {
      setBanner(t("Nenhuma viagem no período para exportar."));
      return;
    }
    setBanner(null);
    setExportingCsv(true);
    const csv = buildCsv(trips, t);
    const filename = `viagens_${startISO}_a_${endISO}.csv`;
    try {
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, filename);
        if (file.exists) file.delete();
        file.create();
        await file.write(csv);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: "text/csv",
            dialogTitle: "Planilha de Viagens",
            UTI: "public.comma-separated-values-text",
          });
        }
      }
    } catch {
      setBanner("Não foi possível gerar a planilha neste dispositivo.");
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <View style={styles.screen} testID="relatorios-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="reports-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Relatório de Viagem")}</Text>
      </View>

      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.presetRow}>
          {([
            ["Este mês", () => { const d = new Date(); setStart(new Date(d.getFullYear(), d.getMonth(), 1)); setEnd(d); }],
            ["Este ano", () => { const d = new Date(); setStart(new Date(d.getFullYear(), 0, 1)); setEnd(d); }],
          ] as const).map(([label, fn]) => (
            <Pressable key={label} style={styles.presetBtn} onPress={fn} testID={`preset-${label}`}>
              <Text style={styles.presetText}>{t(label)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <DateInputField label={t("Data inicial")} value={start} onChange={setStart} testID="report-start-date" />
          <View style={{ width: 12 }} />
          <DateInputField
            label={t("Data final")}
            value={end}
            onChange={setEnd}
            error={invalid ? t("Deve ser ≥ inicial") : undefined}
            testID="report-end-date"
          />
        </View>

        {header.vehiclePlate || header.driverName ? (
          <View style={styles.headerInfo} testID="reports-headerinfo">
            {header.vehiclePlate ? (
              <Text style={styles.headerInfoText}>{t("Matrícula:")} {header.vehiclePlate}</Text>
            ) : null}
            {header.driverName ? (
              <Text style={styles.headerInfoText}>
                {t("Motorista:")} {header.driverName}
                {header.driverLicense ? ` — ${t("CNH {n}", { n: header.driverLicense })}` : ""}
              </Text>
            ) : null}
          </View>
        ) : null}

        {banner ? (
          <View style={styles.banner} testID="reports-banner">
            <Warning size={18} color={colors.error} weight="bold" />
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}

        <Text style={styles.countLabel}>
          {invalid ? t("Período inválido") : t("{n} viagem(ns) no período", { n: trips.length })}
        </Text>

        {!invalid &&
          trips.map((trip) => {
            return (
              <View key={trip.id} style={styles.rowWrap}>
                <SwipeableRow
                  onEdit={() => router.push({ pathname: "/editar-viagem", params: { id: trip.id } })}
                  onDelete={() => removeWithUndo({ queryKey: ["trips"], id: trip.id, run: () => delTrip.mutateAsync(trip.id) })}
                  testID={`report-trip-${trip.id}`}
                >
                  <View style={styles.cardHead}>
                    <Text style={styles.cardDate} numberOfLines={1}>
                      {dateRange(trip)}
                    </Text>
                    <View style={styles.kmBadge}>
                      <Path size={14} color={colors.onBrandTertiary} weight="bold" />
                      <Text style={styles.kmText}>{formatInt(trip.km)} km</Text>
                    </View>
                  </View>
                  <Row label={t("KM inicial / final")} value={`${formatInt(trip.km_start)} → ${formatInt(trip.km_end)}`} />
                  <Row label={t("Carregamento")} value={trip.loading_place || "—"} />
                  <Row label={t("Descarga")} value={trip.unloading_place || "—"} />
                  {trip.vehicle_label ? <Row label={t("Veículo")} value={trip.vehicle_label} /> : null}
                  {trip.driver_name ? (
                    <Row
                      label={t("Motorista")}
                      value={trip.driver_license ? `${trip.driver_name} • CNH ${trip.driver_license}` : trip.driver_name}
                    />
                  ) : null}
                  <Row label={t("Observações")} value={trip.notes || "—"} />
                </SwipeableRow>
              </View>
            );
          })}

        <View style={styles.fuelCard} testID="report-fuel">
          <Text style={styles.fuelTitle}>{t("ABASTECIMENTOS NO PERÍODO")}</Text>
          <Row label={t("Diesel")} value={`${formatDecimal(ft.dieselLiters)} L`} />
          <Row label="ARLA 32" value={`${formatDecimal(ft.arlaLiters)} L`} />
          <Row label={t("Abastecimentos")} value={String(ft.count)} />
          <Row label={t("Gasto Diesel")} value={money(ft.dieselTotal)} />
          <Row label={t("Gasto ARLA 32")} value={money(ft.arlaTotal)} />
          <Row label={t("Total do período")} value={money(ft.grandTotal)} />
          <Row label={t("Média de consumo")} value={`${media} km/L`} />
        </View>

        <View style={styles.totalCard} testID="report-total">
          <Text style={styles.totalLabel}>{t("TOTAL DE KM NO PERÍODO")}</Text>
          <Text style={styles.totalValue}>{formatInt(totalKm)} km</Text>
        </View>

        <Pressable
          style={[styles.pdfBtn, (exporting || invalid) && styles.pdfBtnDisabled]}
          onPress={exportPdf}
          disabled={exporting || invalid}
          testID="export-pdf-button"
          accessibilityRole="button"
        >
          {exporting ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <FilePdf size={22} color={colors.onBrandPrimary} weight="bold" />
              <Text style={styles.pdfText}>{t("Exportar PDF")}</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={[styles.csvBtn, (exportingCsv || invalid) && styles.pdfBtnDisabled]}
          onPress={exportCsv}
          disabled={exportingCsv || invalid}
          testID="export-csv-button"
          accessibilityRole="button"
        >
          {exportingCsv ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : (
            <>
              <Table size={22} color={colors.brandPrimary} weight="bold" />
              <Text style={styles.csvText}>{t("Exportar Planilha (CSV)")}</Text>
            </>
          )}
        </Pressable>
        {Platform.OS === "web" ? (
          <Text style={styles.webHint}>{t("No app (Expo Go) o PDF/planilha abre para compartilhar/salvar.")}</Text>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3 },
  content: { padding: 16 },
  row: { flexDirection: "row" },
  presetRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  presetBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  presetText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  countLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginBottom: 12 },
  headerInfo: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 2,
  },
  headerInfoText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.brandPrimary },
  rowWrap: { marginBottom: 12 },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardDate: {
    flexShrink: 1,
    marginRight: 8,
    fontFamily: fonts.displaySemiBold,
    fontSize: 20,
    color: colors.onSurface,
  },
  kmBadge: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.brandTertiary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kmText: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.onBrandTertiary },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 5,
    borderTopColor: colors.divider,
    borderTopWidth: 1,
  },
  infoLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, flexShrink: 0 },
  infoValue: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    textAlign: "right",
  },
  totalCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fuelCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  fuelTitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.8,
    color: colors.brandPrimary,
    marginBottom: 4,
  },
  totalLabel: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.8, color: colors.onSurfaceInverse },
  totalValue: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.brandPrimary },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
  },
  pdfBtnDisabled: { opacity: 0.5 },
  csvBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    marginTop: 12,
  },
  csvText: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.5,
    color: colors.brandPrimary,
  },
  pdfText: {
    fontFamily: fonts.displayBold,
    fontSize: 20,
    letterSpacing: 0.5,
    color: colors.onBrandPrimary,
  },
  webHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 10,
  },
}));
