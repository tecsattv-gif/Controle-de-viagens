import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  CheckSquare,
  FilePdf,
  PencilSimple,
  Square,
  Trash,
  Warning,
  X,
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Refueling, useRefuelings, useDeleteRefueling } from "@/src/api/refuelings";
import { useTrips } from "@/src/api/trips";
import { DateInputField } from "@/src/components/DateInputField";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import {
  formatDateBR,
  formatDecimal,
  formatInt,
  money,
  toISODate,
} from "@/src/utils/format";
import { computeFuelTotals, FuelTotals } from "@/src/utils/fuel";
import { confirmDelete as confirmDeleteHelper } from "@/src/utils/confirmDelete";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useReportHeader } from "@/src/utils/reportHeader";
import { companyPdfHeaderHtml } from "@/src/utils/reportHeader";
import { htmlToPdf } from "@/src/utils/pdf";

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(
  periodo: string,
  items: Refueling[],
  ft: FuelTotals,
  media: string,
  vehicleLabel: string,
  driverName: string,
): string {
  const rows = items
    .map((r) => {
      const dieselCost = (r.diesel_liters || 0) * (r.diesel_price || 0);
      const arlaCost = (r.arla_liters || 0) * (r.arla_price || 0);
      const total = dieselCost + arlaCost;
      const hasArla = (r.arla_liters || 0) > 0 || (r.arla_price || 0) > 0;
      return `
      <div class="ab">
        <div class="ab-head">
          <span class="ab-date">${escapeHtml(formatDateBR(r.date))}</span>
          <span class="ab-total">${total > 0 ? money(total) : "Valor não informado"}</span>
        </div>
        <table class="grid">
          <tr><td>Local</td><td colspan="3">${escapeHtml(r.station_place || r.station_name || "—")}</td></tr>
          <tr><td>Diesel</td><td>${formatDecimal(r.diesel_liters)} L</td><td>Preço/L</td><td>${money(r.diesel_price)}</td></tr>
          <tr><td>KM Diesel</td><td>${formatInt(r.km)}</td><td>Total Diesel</td><td>${money(dieselCost)}</td></tr>
          ${
            hasArla
              ? `<tr><td>ARLA 32</td><td>${formatDecimal(r.arla_liters)} L</td><td>Preço/L</td><td>${money(r.arla_price)}</td></tr>
          <tr><td>KM ARLA</td><td>${formatInt(r.arla_km)}</td><td>Total ARLA</td><td>${money(arlaCost)}</td></tr>`
              : ""
          }
          <tr><td>Observações</td><td colspan="3">${escapeHtml(r.notes || "—")}</td></tr>
        </table>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    * { font-family: -apple-system, Roboto, Arial, sans-serif; }
    body { color: #1A1C19; padding: 24px; }
    h1 { color: #E65C00; font-size: 24px; margin: 0 0 4px; }
    h2 { color: #E65C00; font-size: 16px; margin: 18px 0 6px; }
    .periodo { color: #555; font-size: 14px; margin-bottom: 16px; }
    .ab { border: 1px solid #E0E0E0; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; }
    .ab-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .ab-date { font-size: 18px; font-weight: 700; }
    .ab-total { background: #FFE5D0; color: #E65C00; font-weight: 700; padding: 3px 10px; border-radius: 20px; font-size: 14px; }
    table.grid { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.grid td { padding: 4px 6px; border-bottom: 1px solid #F0F0F0; }
    table.grid td:nth-child(odd) { color: #888; width: 90px; }
    table.tot { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; }
    table.tot th, table.tot td { padding: 6px; border-bottom: 1px solid #EEE; text-align: right; }
    table.tot th:first-child, table.tot td:first-child { text-align: left; color: #888; }
  </style></head>
  <body>
    <h1>Relatório de Abastecimentos</h1>
    <div class="periodo">Período: ${escapeHtml(periodo)} &nbsp;•&nbsp; ${items.length} abastecimento(s)</div>
    ${
      vehicleLabel || driverName
        ? `<div class="periodo">${vehicleLabel ? `<b>Matrícula:</b> ${escapeHtml(vehicleLabel)}` : ""}${vehicleLabel && driverName ? " &nbsp;&nbsp; " : ""}${driverName ? `<b>Motorista:</b> ${escapeHtml(driverName)}` : ""}</div>`
        : ""
    }
    ${rows || '<div class="periodo">Nenhum abastecimento selecionado.</div>'}
    <h2>Totais</h2>
    <table class="tot">
      <tr><td>Gasto Diesel</td><td>${money(ft.dieselTotal)}</td></tr>
      <tr><td>Gasto ARLA 32</td><td>${money(ft.arlaTotal)}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>${money(ft.grandTotal)}</strong></td></tr>
    </table>
    <h2>Resumo</h2>
    <table class="tot">
      <tr><td>Litros de Diesel</td><td>${formatDecimal(ft.dieselLiters)} L</td></tr>
      <tr><td>Litros de ARLA 32</td><td>${formatDecimal(ft.arlaLiters)} L</td></tr>
      <tr><td>Média de consumo</td><td>${media} km/L</td></tr>
    </table>
  </body></html>`;
}

export default function RelatorioAbastecimentosScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data } = useRefuelings();
  const { data: tripsData } = useTrips();
  const { vehicleLabel, driverName, companyName, companyLogoUrl } = useReportHeader();
  const del = useDeleteRefueling();
  const removeWithUndo = useUndoableDelete();

  const confirmDelete = (id: string) => {
    confirmDeleteHelper({
      title: "Excluir registro",
      message: "Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.",
      confirmText: "Excluir",
      cancelText: "Cancelar",
      onConfirm: () => removeWithUndo({ queryKey: ["refuelings"], id, run: () => del.mutateAsync(id) }),
    });
  };

  const now = new Date();
  const [start, setStart] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [end, setEnd] = useState(now);
  const [exporting, setExporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});

  const startISO = toISODate(start);
  const endISO = toISODate(end);
  const invalid = endISO < startISO;

  const inPeriod = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.date >= startISO && r.date <= endISO)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data, startISO, endISO],
  );

  const selected = inPeriod.filter((r) => !excluded[r.id]);
  const ft = computeFuelTotals(selected);

  const kmPeriod = (tripsData ?? [])
    .filter((t) => t.date >= startISO && t.date <= endISO)
    .reduce((sum, t) => sum + t.km, 0);
  const media =
    ft.dieselLiters > 0 ? (kmPeriod / ft.dieselLiters).toFixed(2).replace(".", ",") : "—";

  const periodo = `${formatDateBR(startISO)} a ${formatDateBR(endISO)}`;

  const toggle = (id: string) => setExcluded((prev) => ({ ...prev, [id]: !prev[id] }));
  const selectAll = () => setExcluded({});
  const clearAll = () => {
    const next: Record<string, boolean> = {};
    for (const r of inPeriod) next[r.id] = true;
    setExcluded(next);
  };

  const exportPdf = async () => {
    if (invalid) {
      setBanner("A data final deve ser igual ou posterior à data inicial.");
      return;
    }
    if (selected.length === 0) {
      setBanner("Selecione ao menos um abastecimento.");
      return;
    }
    setBanner(null);
    setExporting(true);
    const html0 = buildHtml(periodo, selected, ft, media, vehicleLabel, driverName);
    const companyHtml = await companyPdfHeaderHtml(companyName, companyLogoUrl);
    const html = companyHtml ? html0.replace("<body>", `<body>${companyHtml}`) : html0;
    try {
      const { uri } = await htmlToPdf(html);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Relatório de Abastecimentos",
          UTI: "com.adobe.pdf",
        });
      }
    } catch {
      try {
        await Print.printAsync({ html });
      } catch {
        setBanner("Não foi possível gerar o PDF neste dispositivo.");
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.screen} testID="relatorio-abastec-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={10}
          testID="refuel-reports-close"
          accessibilityRole="button"
        >
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Relatório de Abastecimentos</Text>
      </View>

      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.row}>
          <DateInputField label="Data inicial" value={start} onChange={setStart} testID="refuel-report-start" />
          <View style={{ width: 12 }} />
          <DateInputField
            label="Data final"
            value={end}
            onChange={setEnd}
            error={invalid ? "Deve ser ≥ inicial" : undefined}
            testID="refuel-report-end"
          />
        </View>

        {banner ? (
          <View style={styles.banner} testID="refuel-reports-banner">
            <Warning size={18} color={colors.error} weight="bold" />
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}

        <View style={styles.selectBar}>
          <Text style={styles.countLabel}>
            {invalid ? "Período inválido" : `${selected.length} de ${inPeriod.length} selecionado(s)`}
          </Text>
          <View style={styles.selectActions}>
            <Pressable onPress={selectAll} hitSlop={8} testID="select-all">
              <Text style={styles.selectAction}>Todos</Text>
            </Pressable>
            <Text style={styles.selectSep}>•</Text>
            <Pressable onPress={clearAll} hitSlop={8} testID="clear-all">
              <Text style={styles.selectAction}>Limpar</Text>
            </Pressable>
          </View>
        </View>

        {!invalid &&
          inPeriod.map((r) => {
            const isSel = !excluded[r.id];
            const total = r.diesel_liters * r.diesel_price + r.arla_liters * r.arla_price;
            const renderRightActions = () => (
              <Pressable
                style={styles.deleteAction}
                onPress={() => confirmDelete(r.id)}
                testID={`refuel-delete-${r.id}`}
                accessibilityRole="button"
              >
                <Trash size={24} color={colors.onError} weight="bold" />
                <Text style={styles.deleteActionText}>Apagar</Text>
              </Pressable>
            );
            return (
              <ReanimatedSwipeable
                key={r.id}
                renderRightActions={renderRightActions}
                overshootRight={false}
                friction={2}
                rightThreshold={40}
              >
                <Pressable
                  style={[styles.item, isSel && styles.itemActive]}
                  onPress={() => toggle(r.id)}
                  testID={`refuel-select-${r.id}`}
                  accessibilityRole="button"
                >
                  {isSel ? (
                    <CheckSquare size={24} color={colors.brandPrimary} weight="fill" />
                  ) : (
                    <Square size={24} color={colors.muted} weight="regular" />
                  )}
                  <View style={styles.itemBody}>
                    <View style={styles.itemHead}>
                      <Text style={styles.itemDate}>{formatDateBR(r.date)}</Text>
                      <View style={styles.itemHeadRight}>
                        <Text style={styles.itemTotal}>{total > 0 ? money(total) : "Valor não informado"}</Text>
                        <Pressable
                          onPress={() => router.push({ pathname: "/abastecimento-form", params: { id: r.id } })}
                          hitSlop={8}
                          testID={`refuel-edit-${r.id}`}
                          accessibilityRole="button"
                          // @ts-expect-error react-native-web maps dataSet to data-* attributes
                          dataSet={{ printHide: "true" }}
                        >
                          <PencilSimple size={18} color={colors.brandPrimary} weight="bold" />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.itemSub} numberOfLines={1}>
                      {(r.station_place || "Local não informado") + " • " + formatDecimal(r.diesel_liters) + " L"}
                    </Text>
                  </View>
                </Pressable>
              </ReanimatedSwipeable>
            );
          })}

        {!invalid && inPeriod.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum abastecimento no período.</Text>
        ) : null}

        <View style={styles.totalsCard} testID="refuel-report-totals">
          <Text style={styles.totalsTitle}>TOTAIS DOS SELECIONADOS</Text>
          <Row label="Gasto Diesel" value={money(ft.dieselTotal)} />
          <Row label="Gasto ARLA 32" value={money(ft.arlaTotal)} />
          <Row label="Total" value={money(ft.grandTotal)} />
          <View style={styles.gap} />
          <Row label="Litros Diesel" value={`${formatDecimal(ft.dieselLiters)} L`} />
          <Row label="Média de consumo" value={`${media} km/L`} />
        </View>

        <Pressable
          style={[styles.pdfBtn, (exporting || invalid) && styles.pdfBtnDisabled]}
          onPress={exportPdf}
          disabled={exporting || invalid}
          testID="export-refuel-pdf"
          accessibilityRole="button"
        >
          {exporting ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <FilePdf size={22} color={colors.onBrandPrimary} weight="bold" />
              <Text style={styles.pdfText}>Exportar PDF</Text>
            </>
          )}
        </Pressable>
        {Platform.OS === "web" ? (
          <Text style={styles.webHint}>No app (Expo Go) o PDF abre para compartilhar/salvar.</Text>
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
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  countLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  selectActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  selectAction: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.brandPrimary },
  selectSep: { color: colors.muted },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    opacity: 0.55,
  },
  itemActive: { opacity: 1, borderColor: colors.brandPrimary },
  itemBody: { flex: 1 },
  itemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemHeadRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemDate: { fontFamily: fonts.displaySemiBold, fontSize: 18, color: colors.onSurface },
  itemTotal: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.brandPrimary },
  itemSub: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  deleteAction: {
    backgroundColor: colors.error,
    justifyContent: "center",
    alignItems: "center",
    width: 88,
    marginLeft: 10,
    marginBottom: 10,
    borderRadius: 12,
    gap: 4,
  },
  deleteActionText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700", color: colors.onError },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginVertical: 16,
  },
  totalsCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 6,
    marginBottom: 16,
  },
  totalsTitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.8,
    color: colors.brandPrimary,
    marginBottom: 4,
  },
  gap: { height: 8 },
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
  pdfText: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.5, color: colors.onBrandPrimary },
  webHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 10 },
}));
