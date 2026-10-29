import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { CaretRight, ClockCounterClockwise, FilePdf, MagnifyingGlass, X } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTireConfigs, useTireSettings, useTires } from "@/src/api/tires";
import { useTrips } from "@/src/api/trips";
import { useVehicles, compositionPlates, vehicleName, vehicleTitle } from "@/src/api/vehicles";
import { SelectField } from "@/src/components/SelectField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { configPositions, positionLabel, stateColor, treadState } from "@/src/utils/axleMaps";
import { formatDateBR, formatInt, toISODate } from "@/src/utils/format";
import { companyPdfHeaderHtml, useReportHeader } from "@/src/utils/reportHeader";
import { tireKmRun, vehicleCurrentKm } from "@/src/utils/tireKm";
import { htmlToPdf } from "@/src/utils/pdf";
import { themeReportHtml } from "@/src/utils/reportColors";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function PneusHistoricoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const { data: tires, isLoading } = useTires();
  const { data: vehicles } = useVehicles();
  const { data: settings } = useTireSettings();
  const { data: configs } = useTireConfigs();
  const { data: trips } = useTrips();
  const { companyName, companyLogoUrl } = useReportHeader();

  const [vehicleFilter, setVehicleFilter] = useState("");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    let list = tires || [];
    if (vehicleFilter) list = list.filter((ti) => ti.vehicle_id === vehicleFilter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((ti) => (ti.number || "").toLowerCase().includes(q) || (ti.brand || "").toLowerCase().includes(q));
    return list;
  }, [tires, vehicleFilter, query]);

  const vehicleOptions = (vehicles || []).map((v) => ({ id: v.id, title: vehicleTitle(v) }));

  const g = settings?.green_min_mm ?? 5;
  const y = settings?.yellow_min_mm ?? 3;
  const stateFor = (ti: { status: string; current_tread_mm: number }) => {
    if (ti.status === "removed") return t("Removido");
    const st = treadState(ti.current_tread_mm, g, y);
    return st === "green" ? t("Bom") : st === "yellow" ? t("Atenção") : t("Crítico");
  };

  const exportPdf = async () => {
    if (!filtered.length) return;
    setExporting(true);
    const header = await companyPdfHeaderHtml(companyName, companyLogoUrl);
    const emission = formatDateBR(toISODate(new Date()));
    const cssSafe = (s: string) => (s || "").replace(/["\\]/g, "'");
    const filterVehicle = vehicleFilter ? vehicles?.find((v) => v.id === vehicleFilter) : undefined;
    const showVehicleCol = !vehicleFilter;

    // Quadro de identificação do veículo (uma vez, no topo)
    const vehBox = filterVehicle
      ? `<table class="vbox"><tr>
           <td><span class="k">${esc(t("Veículo"))}:</span> ${esc(vehicleName(filterVehicle) || vehicleTitle(filterVehicle))}</td>
           <td><span class="k">${esc(t("Matrícula"))}:</span> ${esc(filterVehicle.truck_plate || "—")}</td>
           <td><span class="k">${esc(t("Reboque(s)"))}:</span> ${esc(compositionPlates(filterVehicle) || "—")}</td>
           <td><span class="k">${esc(t("Data de emissão"))}:</span> ${esc(emission)}</td>
         </tr></table>`
      : `<table class="vbox"><tr>
           <td><span class="k">${esc(t("Veículo"))}:</span> ${esc(t("Todos os veículos"))}</td>
           <td><span class="k">${esc(t("Data de emissão"))}:</span> ${esc(emission)}</td>
         </tr></table>`;

    // Identificação compacta repetida no topo de cada página (dentro do thead)
    const compact = filterVehicle
      ? `${esc(vehicleName(filterVehicle) || vehicleTitle(filterVehicle))} · ${esc(filterVehicle.truck_plate || "—")}${compositionPlates(filterVehicle) ? " · " + esc(compositionPlates(filterVehicle)) : ""}`
      : esc(t("Todos os veículos"));

    type Col = { w: number; th: string; align: "left" | "center" | "right" };
    const cols: Col[] = [
      ...(showVehicleCol ? [{ w: 13, th: t("Veículo"), align: "left" as const }] : []),
      { w: 5, th: t("Nº"), align: "center" },
      { w: 15, th: t("Marca / Modelo"), align: "left" },
      { w: 11, th: t("Medida"), align: "left" },
      { w: 17, th: t("Posição"), align: "left" },
      { w: 10, th: t("Instalação"), align: "center" },
      { w: 11, th: t("KM de instalação"), align: "right" },
      { w: 11, th: t("KM percorridos"), align: "right" },
      { w: 8, th: `${t("Sulco")} (mm)`, align: "right" },
      { w: 9, th: t("Estado"), align: "center" },
    ];
    const colgroup = `<colgroup>${cols.map((c) => `<col style="width:${c.w}%"/>`).join("")}</colgroup>`;
    const headRow = cols.map((c) => `<th class="a-${c.align}">${esc(c.th)}</th>`).join("");
    const colspan = cols.length;

    const rows = filtered
      .map((ti, i) => {
        const veh = vehicles?.find((v) => v.id === ti.vehicle_id);
        const config = configs?.find((c) => c.vehicle_id === ti.vehicle_id);
        const positions = config ? configPositions(config.units) : [];
        const run = tireKmRun(ti, vehicleCurrentKm(ti.vehicle_id, trips));
        const pos = ti.status === "removed" ? t("Retirado") : positionLabel(ti.position_code, positions);
        const vehCell = showVehicleCol ? `<td class="a-left">${esc(veh ? vehicleTitle(veh) : "—")}</td>` : "";
        return (
          `<tr class="${i % 2 ? "alt" : ""}">${vehCell}` +
          `<td class="a-center">${esc(ti.number || "—")}</td>` +
          `<td class="a-left">${esc(ti.brand || "—")}</td>` +
          `<td class="a-left">${esc(ti.size || "—")}</td>` +
          `<td class="a-left">${esc(pos)}</td>` +
          `<td class="a-center">${ti.install_date ? esc(formatDateBR(ti.install_date)) : "—"}</td>` +
          `<td class="a-right">${ti.install_km ? formatInt(ti.install_km) : "—"}</td>` +
          `<td class="a-right">${run != null ? formatInt(run) : "—"}</td>` +
          `<td class="a-right">${ti.current_tread_mm ? ti.current_tread_mm : "—"}</td>` +
          `<td class="a-center">${esc(stateFor(ti))}</td>` +
          `</tr>`
        );
      })
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
      @page { size: A4; margin: 10mm;
        @bottom-left { content: "${cssSafe(companyName || "")}"; font-size: 8pt; color: #666; }
        @bottom-center { content: "${cssSafe(t("Emitido em"))} ${cssSafe(emission)}"; font-size: 8pt; color: #666; }
        @bottom-right { content: "${cssSafe(t("Página"))} " counter(page) " ${cssSafe(t("de"))} " counter(pages); font-size: 8pt; color: #666; }
      }
      *{font-family:-apple-system,Roboto,Arial,sans-serif;box-sizing:border-box}
      body{color:#1A1C19;font-size:9.5pt;margin:0}
      .hr{height:3px;background:#E65C00;border:0;margin:8px 0 10px 0}
      .title{text-align:center;color:#E65C00;font-size:16pt;font-weight:800;letter-spacing:1px;margin:2px 0 8px 0}
      table.vbox{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:9.5pt}
      table.vbox td{border:1px solid #e3e3e3;padding:5px 8px}
      table.vbox .k{font-weight:800}
      table.data{width:100%;border-collapse:collapse;font-size:8pt;table-layout:fixed}
      table.data th,table.data td{border:1px solid #d9d9d9;padding:4px 4px;word-wrap:break-word;overflow:hidden}
      table.data thead th{background:#ececec;font-weight:800;color:#222}
      table.data .compact{background:#fff;font-weight:700;font-size:8.5pt;color:#444;text-align:left;border-bottom:2px solid #E65C00}
      tr{page-break-inside:avoid}
      tr.alt td{background:#f7f7f7}
      .a-left{text-align:left}.a-center{text-align:center}.a-right{text-align:right}
      thead{display:table-header-group}
    </style></head><body>
      ${header}
      <hr class="hr"/>
      <div class="title">${esc(t("HISTÓRICO DE PNEUS"))}</div>
      ${vehBox}
      <table class="data">${colgroup}
        <thead>
          <tr><th class="compact" colspan="${colspan}">${compact}</th></tr>
          <tr>${headRow}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`;
    try {
      const { uri } = await htmlToPdf(html);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch {
      try {
        await Print.printAsync({ html: themeReportHtml(html) });
      } catch {
        // ignore
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.screen} testID="pneus-historico-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="hist-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Histórico de Pneus")}</Text>
        <Pressable
          onPress={exportPdf}
          style={styles.iconBtn}
          hitSlop={10}
          disabled={exporting || filtered.length === 0}
          testID="hist-pdf"
        >
          {exporting ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : (
            <FilePdf size={24} color={filtered.length === 0 ? colors.muted : colors.brandPrimary} weight="bold" />
          )}
        </Pressable>
      </View>

      <View style={styles.filters}>
        <SelectField
          label={t("Veículo")}
          placeholder={t("Todos os veículos")}
          value={vehicleFilter}
          options={vehicleOptions}
          onChange={setVehicleFilter}
          testID="hist-vehicle-filter"
        />
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t("Número ou marca do pneu")}
            placeholderTextColor={colors.muted}
            testID="hist-search"
          />
        </View>
        <Pressable
          style={[styles.pdfBtn, (exporting || filtered.length === 0) && styles.pdfDisabled]}
          onPress={exportPdf}
          disabled={exporting || filtered.length === 0}
          testID="hist-pdf-btn"
        >
          {exporting ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <FilePdf size={20} color={colors.onBrandPrimary} weight="bold" />
              <Text style={styles.pdfBtnTxt}>{t("Gerar PDF")}</Text>
            </>
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => {
            const vehicle = vehicles?.find((v) => v.id === item.vehicle_id);
            const st = treadState(item.current_tread_mm, settings?.green_min_mm ?? 5, settings?.yellow_min_mm ?? 3);
            const stColor = stateColor(st, colors);
            return (
              <Pressable style={styles.card} onPress={() => router.push({ pathname: "/pneu-detalhe", params: { id: item.id } })} testID={`hist-tire-${item.id}`}>
                <View style={[styles.dot, { backgroundColor: stColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{t("Pneu")} {item.number} · {item.brand || "—"}</Text>
                  <Text style={styles.cardSub}>{vehicle ? vehicleTitle(vehicle) : t("Sem veículo")} · {item.status === "removed" ? t("Retirado") : item.position_code}</Text>
                  <Text style={styles.cardMeta}>
                    {item.install_date ? formatDateBR(item.install_date) : "—"} · {item.install_km ? `${formatInt(item.install_km)} km` : "—"} · {(item.measurements || []).length} {t("medições")} · {(item.movements || []).length} {t("mov.")}
                  </Text>
                </View>
                <CaretRight size={20} color={colors.muted} weight="bold" />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered} testID="hist-empty">
              <ClockCounterClockwise size={54} color={colors.muted} weight="regular" />
              <Text style={styles.dim}>{t("Nenhum pneu encontrado.")}</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        />
      )}
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
  filters: { paddingHorizontal: 16, paddingTop: 12 },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    marginTop: 10,
  },
  pdfDisabled: { opacity: 0.5 },
  pdfBtnTxt: { fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 0.3, color: colors.onBrandPrimary },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.onSurface },
  centered: { alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  dim: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center" },
  list: { padding: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  cardTitle: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurface },
  cardSub: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 3 },
}));
