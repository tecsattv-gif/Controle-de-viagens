import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { FilePdf, Table, Warning, X } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DateInputField } from "@/src/components/DateInputField";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, toISODate } from "@/src/utils/format";
import { companyPdfHeaderHtml, useReportHeader } from "@/src/utils/reportHeader";
import { htmlToPdf } from "@/src/utils/pdf";

export type ReportRow = { left: string; right?: string; infos?: string[] };
export type ReportTotal = { label: string; value: string };

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Props<T> = {
  title: string;
  pdfTitle: string;
  screenTestId: string;
  idPrefix: string;
  fileBase: string;
  data: T[] | undefined;
  getDate: (x: T) => string;
  renderRow: (x: T) => ReportRow;
  totals: (items: T[]) => ReportTotal[];
  pdfHeaders: string[];
  pdfCells: (x: T) => string[];
  alignRight: boolean[];
  csvHeaders: string[];
  csvCells: (x: T) => string[];
  emptyLabel: string;
  countLabel: (n: number) => string;
  onEditItem?: (x: T) => void;
  onDeleteItem?: (x: T) => void;
  topContent?: React.ReactNode;
};

export function PeriodReport<T>({
  title,
  pdfTitle,
  screenTestId,
  idPrefix,
  fileBase,
  data,
  getDate,
  renderRow,
  totals,
  pdfHeaders,
  pdfCells,
  alignRight,
  csvHeaders,
  csvCells,
  emptyLabel,
  countLabel,
  onEditItem,
  onDeleteItem,
  topContent,
}: Props<T>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { vehicleLabel, driverName, companyName, companyLogoUrl } = useReportHeader();

  const now = new Date();
  const [start, setStart] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [end, setEnd] = useState(now);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const startISO = toISODate(start);
  const endISO = toISODate(end);
  const invalid = endISO < startISO;

  const items = useMemo(
    () =>
      (data ?? [])
        .filter((x) => getDate(x) >= startISO && getDate(x) <= endISO)
        .sort((a, b) => getDate(a).localeCompare(getDate(b))),
    [data, startISO, endISO],
  );
  const periodo = `${formatDateBR(startISO)} a ${formatDateBR(endISO)}`;
  const totalLines = totals(items);

  const exportPdf = async () => {
    if (invalid) {
      setBanner(t("A data final deve ser igual ou posterior à data inicial."));
      return;
    }
    setBanner(null);
    setExporting(true);
    const cls = (i: number) => (alignRight[i] ? ' class="r"' : "");
    const head = pdfHeaders.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join("");
    const rows = items.length
      ? items
          .map((x) => `<tr>${pdfCells(x).map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join("")}</tr>`)
          .join("")
      : `<tr><td colspan="${pdfHeaders.length}" class="muted">${esc(emptyLabel)}</td></tr>`;
    const grand = totalLines
      .map((tl) => `<div class="grand"><span>${esc(tl.label)}</span><span class="val">${esc(tl.value)}</span></div>`)
      .join("");
    const companyHtml = await companyPdfHeaderHtml(companyName, companyLogoUrl);
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
      ${companyHtml}
      <div class="title">${esc(pdfTitle)}</div>
      <div class="sub"><b>${t("Período:")}</b> ${esc(periodo)}</div>
      ${
        vehicleLabel || driverName
          ? `<div class="sub">${vehicleLabel ? `<b>${esc(t("Matrícula:"))}</b> ${esc(vehicleLabel)}` : ""}${vehicleLabel && driverName ? " &nbsp;&nbsp; " : ""}${driverName ? `<b>${esc(t("Motorista:"))}</b> ${esc(driverName)}` : ""}</div>`
          : ""
      }
      <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
      ${grand}
    </body></html>`;
    try {
      const { uri } = await htmlToPdf(html);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
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
      setBanner(t("Nenhum registro no período para exportar."));
      return;
    }
    setBanner(null);
    setExportingCsv(true);
    const cell = (s: string) => {
      const v = s ?? "";
      return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [] as string[];
    if (vehicleLabel) lines.push([cell(t("Matrícula:")), cell(vehicleLabel)].join(";"));
    if (driverName) lines.push([cell(t("Motorista:")), cell(driverName)].join(";"));
    if (vehicleLabel || driverName) lines.push("");
    lines.push(csvHeaders.map((h) => cell(h)).join(";"));
    for (const x of items) lines.push(csvCells(x).map((c) => cell(String(c))).join(";"));
    const csv = "\uFEFF" + lines.join("\r\n");
    const filename = `${fileBase}_${startISO}_a_${endISO}.csv`;
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
            dialogTitle: title,
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
    <View style={styles.screen} testID={screenTestId}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID={`${idPrefix}-report-close`}>
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>

      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {topContent}
        <View style={styles.presetRow}>
          {([
            ["Este mês", () => { const d = new Date(); setStart(new Date(d.getFullYear(), d.getMonth(), 1)); setEnd(d); }],
            ["Este ano", () => { const d = new Date(); setStart(new Date(d.getFullYear(), 0, 1)); setEnd(d); }],
          ] as const).map(([label, fn]) => (
            <Pressable key={label} style={styles.presetBtn} onPress={fn} testID={`${idPrefix}-preset-${label}`}>
              <Text style={styles.presetText}>{t(label)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <DateInputField label={t("Data inicial")} value={start} onChange={setStart} testID={`${idPrefix}-report-start`} />
          <View style={{ width: 12 }} />
          <DateInputField label={t("Data final")} value={end} onChange={setEnd} error={invalid ? t("Deve ser ≥ inicial") : undefined} testID={`${idPrefix}-report-end`} />
        </View>

        {banner ? (
          <View style={styles.banner}>
            <Warning size={18} color={colors.error} weight="bold" />
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}

        {vehicleLabel || driverName ? (
          <View style={styles.headerInfo} testID={`${idPrefix}-report-headerinfo`}>
            {vehicleLabel ? (
              <Text style={styles.headerInfoText}>{t("Matrícula:")} {vehicleLabel}</Text>
            ) : null}
            {driverName ? (
              <Text style={styles.headerInfoText}>{t("Motorista:")} {driverName}</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.countLabel}>{invalid ? t("Período inválido") : countLabel(items.length)}</Text>

        {!invalid && items.map((x, i) => {
          const r = renderRow(x);
          return (
            <View key={i} style={styles.rowWrap}>
              <SwipeableRow
                onEdit={onEditItem ? () => onEditItem(x) : undefined}
                onDelete={onDeleteItem ? () => onDeleteItem(x) : undefined}
                testID={`${idPrefix}-edit-${i}`}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cardDate}>{r.left}</Text>
                  {r.right ? <Text style={styles.cardValue}>{r.right}</Text> : null}
                </View>
                {(r.infos ?? []).filter(Boolean).map((info, j) => (
                  <Text key={j} style={styles.info}>{info}</Text>
                ))}
              </SwipeableRow>
            </View>
          );
        })}

        <View style={styles.totalCard} testID={`${idPrefix}-report-total`}>
          {totalLines.map((tl, i) => (
            <View key={i} style={styles.totalLine}>
              <Text style={styles.totalLabel}>{tl.label}</Text>
              <Text style={styles.totalValue}>{tl.value}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.pdfBtn, (exporting || invalid) && styles.disabled]}
          onPress={exportPdf}
          disabled={exporting || invalid}
          testID={`${idPrefix}-export-pdf`}
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
          testID={`${idPrefix}-export-csv`}
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
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3, flex: 1 },
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
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardDate: { fontFamily: fonts.displaySemiBold, fontSize: 18, color: colors.onSurface, flex: 1 },
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
  totalValue: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.brandPrimary },
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
  webHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 10 },
}));
