import * as Print from "expo-print";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { FilePdf, Table, Warning, X } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Freight, useFreights, useDeleteFreight } from "@/src/api/freights";
import { DateInputField } from "@/src/components/DateInputField";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, money, toISODate } from "@/src/utils/format";
import { useReportHeader } from "@/src/utils/reportHeader";
import { companyPdfHeaderHtml } from "@/src/utils/reportHeader";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { htmlToPdf } from "@/src/utils/pdf";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function RelatorioFretesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data } = useFreights();
  const { vehicleLabel, driverName, companyName, companyLogoUrl } = useReportHeader();
  const delFreight = useDeleteFreight();
  const removeWithUndo = useUndoableDelete();

  const now = new Date();
  const [start, setStart] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [end, setEnd] = useState(now);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  const startISO = toISODate(start);
  const endISO = toISODate(end);
  const invalid = endISO < startISO;

  const items = useMemo(
    () =>
      (data ?? [])
        .filter((f) => f.date >= startISO && f.date <= endISO)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data, startISO, endISO],
  );
  const totalValue = items.reduce((s, f) => s + (f.value || 0), 0);
  const totalWeight = items.reduce((s, f) => s + (f.weight || 0), 0);
  const periodo = `${formatDateBR(startISO)} a ${formatDateBR(endISO)}`;

  // Subtotal por cliente dentro do período.
  const clientKey = (f: Freight) => (f.client || "").trim() || t("Sem cliente");
  const byClient = useMemo(() => {
    const map = new Map<string, { count: number; value: number; weight: number }>();
    for (const f of items) {
      const key = clientKey(f);
      const cur = map.get(key) || { count: 0, value: 0, weight: 0 };
      cur.count += 1;
      cur.value += f.value || 0;
      cur.weight += f.weight || 0;
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].value - a[1].value);
  }, [items, t]);

  // When a client is selected in the summary, only show that client's freights.
  const visibleItems = useMemo(
    () => (selectedClient ? items.filter((f) => clientKey(f) === selectedClient) : items),
    [items, selectedClient, t],
  );

  const exportPdf = async () => {
    if (invalid) {
      setBanner(t("A data final deve ser igual ou posterior à data inicial."));
      return;
    }
    setBanner(null);
    setExporting(true);
    const rows = items.length
      ? items
          .map(
            (f) => `<tr>
        <td>${esc(formatDateBR(f.date))}</td>
        <td>${esc(f.client || "—")}</td>
        <td>${esc([f.origin, f.destination].filter(Boolean).join(" → ") || "—")}</td>
        <td class="r">${esc(f.reference || "—")}</td>
        <td class="r">${f.weight ? f.weight + " kg" : "—"}</td>
        <td class="r">${money(f.value)}</td>
      </tr>`,
          )
          .join("")
      : `<tr><td colspan="6" class="muted">${t("Nenhum frete no período.")}</td></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        *{font-family:-apple-system,Roboto,Arial,sans-serif;box-sizing:border-box}
        body{color:#1A1C19;font-size:11pt;margin:24px}
        .title{color:#E65C00;font-size:18pt;font-weight:800}
        .sub{color:#555;font-size:10pt;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:9.5pt}
        th{background:#F5F5F5;color:#555;text-align:left;padding:6px;border-bottom:1px solid #ddd}
        td{padding:6px;border-bottom:1px solid #f0f0f0}
        .r{text-align:right;white-space:nowrap}
        .muted{color:#888;text-align:center;padding:10px}
        .grand{margin-top:12px;background:#121212;color:#fff;border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;font-weight:700}
        .grand .val{color:#FF8A3D}
      </style></head><body>
      ${await companyPdfHeaderHtml(companyName, companyLogoUrl)}
      <div class="title">${t("RELATÓRIO DE FRETES")}</div>
      <div class="sub"><b>${t("Período:")}</b> ${esc(periodo)}</div>
      ${
        vehicleLabel || driverName
          ? `<div class="sub">${vehicleLabel ? `<b>${esc(t("Matrícula:"))}</b> ${esc(vehicleLabel)}` : ""}${vehicleLabel && driverName ? " &nbsp;&nbsp; " : ""}${driverName ? `<b>${esc(t("Motorista:"))}</b> ${esc(driverName)}` : ""}</div>`
          : ""
      }
      <table>
        <thead><tr>
          <th>${t("Data")}</th><th>${t("Cliente")}</th><th>${t("Origem / Destino")}</th>
          <th class="r">${t("Referência")}</th><th class="r">${t("Peso")}</th><th class="r">${t("Valor")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="grand"><span>${t("TOTAL DE FRETES")} (${items.length})</span><span class="val">${money(totalValue)}</span></div>
      <div class="grand"><span>${t("PESO TOTAL")}</span><span class="val">${totalWeight} kg</span></div>
      <div class="title" style="font-size:13pt;margin-top:16px">${t("Resumo por cliente")}</div>
      <table>
        <thead><tr><th>${t("Cliente")}</th><th class="r">${t("Fretes")}</th><th class="r">${t("Peso")}</th><th class="r">${t("Valor")}</th></tr></thead>
        <tbody>${
          byClient.length
            ? byClient
                .map(
                  ([name, g]) =>
                    `<tr><td>${esc(name)}</td><td class="r">${g.count}</td><td class="r">${g.weight ? g.weight + " kg" : "—"}</td><td class="r">${money(g.value)}</td></tr>`,
                )
                .join("")
            : `<tr><td colspan="4" class="muted">${t("Nenhum frete no período.")}</td></tr>`
        }</tbody>
      </table>
    </body></html>`;
    try {
      const { uri } = await htmlToPdf(html);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: t("Relatório de Fretes"), UTI: "com.adobe.pdf" });
      }
    } catch {
      try {
        await Print.printAsync({ html });
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
    if (items.length === 0) {
      setBanner(t("Nenhum frete no período para exportar."));
      return;
    }
    setBanner(null);
    setExportingCsv(true);
    const cell = (s: string) => {
      const v = s ?? "";
      return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const num = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2).replace(".", ",");
    const headers = [t("Data"), t("Cliente"), t("Origem"), t("Destino"), t("Referência"), t("Peso (kg)"), t("Valor")];
    const lines: string[] = [];
    if (vehicleLabel) lines.push([cell(t("Matrícula:")), cell(vehicleLabel)].join(";"));
    if (driverName) lines.push([cell(t("Motorista:")), cell(driverName)].join(";"));
    if (vehicleLabel || driverName) lines.push("");
    lines.push(headers.join(";"));
    for (const f of items) {
      lines.push(
        [
          formatDateBR(f.date),
          f.client || "",
          f.origin || "",
          f.destination || "",
          f.reference || "",
          f.weight ? String(f.weight) : "",
          num(f.value || 0),
        ]
          .map((c) => cell(String(c)))
          .join(";"),
      );
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    const filename = `fretes_${startISO}_a_${endISO}.csv`;
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
            dialogTitle: t("Planilha de Fretes"),
            UTI: "public.comma-separated-values-text",
          });
        }
      }
    } catch {
      setBanner(t("Não foi possível gerar a planilha neste dispositivo."));
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <View style={styles.screen} testID="relatorio-fretes-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="frete-report-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Relatório de Fretes")}</Text>
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
            <Pressable key={label} style={styles.presetBtn} onPress={fn} testID={`frete-preset-${label}`}>
              <Text style={styles.presetText}>{t(label)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <DateInputField label={t("Data inicial")} value={start} onChange={setStart} testID="frete-report-start" />
          <View style={{ width: 12 }} />
          <DateInputField label={t("Data final")} value={end} onChange={setEnd} error={invalid ? t("Deve ser ≥ inicial") : undefined} testID="frete-report-end" />
        </View>

        {banner ? (
          <View style={styles.banner}>
            <Warning size={18} color={colors.error} weight="bold" />
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}

        <Text style={styles.countLabel}>
          {invalid
            ? t("Período inválido")
            : selectedClient
              ? t("{n} frete(s)", { n: visibleItems.length })
              : t("{n} frete(s) no período", { n: items.length })}
        </Text>

        {!invalid && selectedClient ? (
          <Pressable
            style={styles.filterChip}
            onPress={() => setSelectedClient(null)}
            testID="frete-clear-filter"
            accessibilityRole="button"
          >
            <Text style={styles.filterChipText} numberOfLines={1}>
              {t("Mostrando apenas: {c}", { c: selectedClient })}
            </Text>
            <X size={16} color={colors.brandPrimary} weight="bold" />
          </Pressable>
        ) : null}

        {!invalid && visibleItems.map((f) => (
          <FreightRow
            key={f.id}
            f={f}
            onPress={() => router.push({ pathname: "/frete-form", params: { id: f.id } })}
            onDelete={() => removeWithUndo({ queryKey: ["freights"], id: f.id, run: () => delFreight.mutateAsync(f.id) })}
          />
        ))}

        {!invalid && byClient.length > 0 ? (
          <View style={styles.clientCard} testID="frete-by-client">
            <Text style={styles.clientTitle}>{t("Resumo por cliente")}</Text>
            <Text style={styles.clientHint}>{t("Toque num cliente para filtrar")}</Text>
            {byClient.map(([name, g]) => {
              const active = selectedClient === name;
              return (
                <Pressable
                  key={name}
                  style={[styles.clientRow, active && styles.clientRowActive]}
                  onPress={() => setSelectedClient(active ? null : name)}
                  testID={`frete-client-${name}`}
                  accessibilityRole="button"
                >
                  <View style={styles.clientInfo}>
                    <Text style={styles.clientName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.clientMeta}>
                      {t("{n} frete(s)", { n: g.count })}{g.weight ? ` • ${t("{w} kg", { w: g.weight })}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.clientValue}>{money(g.value)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.totalCard} testID="frete-report-total">
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>{t("TOTAL DE FRETES")}</Text>
            <Text style={styles.totalValue}>{money(totalValue)}</Text>
          </View>
          {totalWeight > 0 ? (
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>{t("PESO TOTAL")}</Text>
              <Text style={styles.totalWeight}>{t("{w} kg", { w: totalWeight })}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          style={[styles.pdfBtn, (exporting || invalid) && styles.disabled]}
          onPress={exportPdf}
          disabled={exporting || invalid}
          testID="frete-export-pdf"
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
          style={[styles.csvBtn, (exportingCsv || invalid) && styles.disabled]}
          onPress={exportCsv}
          disabled={exportingCsv || invalid}
          testID="frete-export-csv"
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
          <Text style={styles.webHint}>{t("No app (Expo Go) o PDF abre para compartilhar/salvar.")}</Text>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

function FreightRow({ f, onPress, onDelete }: { f: Freight; onPress: () => void; onDelete: () => void }) {
  const styles = useStyles();
  const t = useT();
  const route = [f.origin, f.destination].filter(Boolean).join(" → ");
  return (
    <View style={styles.rowWrap}>
      <SwipeableRow onEdit={onPress} onDelete={onDelete} testID={`frete-edit-${f.id}`}>
        <View style={styles.cardHead}>
          <Text style={styles.cardDate}>{formatDateBR(f.date)}</Text>
          <Text style={styles.cardValue}>{money(f.value)}</Text>
        </View>
        {f.client ? <Text style={styles.info}>{f.client}</Text> : null}
        {route ? <Text style={styles.info}>{route}</Text> : null}
        {f.reference ? <Text style={styles.info}>{t("Ref.:")} {f.reference}</Text> : null}
        {f.weight ? <Text style={styles.info}>{t("Peso: {w} kg", { w: f.weight })}</Text> : null}
      </SwipeableRow>
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
  rowWrap: { marginBottom: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardDate: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.onSurface },
  cardValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.brandPrimary },
  info: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 4 },
  totalCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
    marginBottom: 16,
    gap: 8,
  },
  totalLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.8, color: colors.onSurfaceInverse },
  totalValue: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.brandPrimary },
  totalWeight: { fontFamily: fonts.displaySemiBold, fontSize: 18, color: colors.brandPrimary },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
  },
  disabled: { opacity: 0.5 },
  pdfText: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.5, color: colors.onBrandPrimary },
  csvBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.brandPrimary,
    borderWidth: 1.5,
  },
  csvText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.5, color: colors.brandPrimary },
  clientCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  clientTitle: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurface, marginBottom: 10 },
  clientHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: -6, marginBottom: 6 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandTertiary,
    marginBottom: 12,
    maxWidth: "100%",
  },
  filterChipText: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "700",
    color: colors.brandPrimary,
  },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  clientRowActive: { backgroundColor: colors.brandTertiary },
  clientInfo: { flex: 1, paddingRight: 10 },
  clientName: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurface },
  clientMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  clientValue: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.brandPrimary },
  webHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 10 },
}));
