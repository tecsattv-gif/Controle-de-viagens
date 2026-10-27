import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { FilePdf, Warning, X } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useFreights } from "@/src/api/freights";
import { useMaintenances } from "@/src/api/maintenance";
import { useOilChanges } from "@/src/api/oilChanges";
import { useRefuelings } from "@/src/api/refuelings";
import { useTollExpenses } from "@/src/api/tollExpenses";
import { useTrips } from "@/src/api/trips";
import { DateInputField } from "@/src/components/DateInputField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, money, toISODate } from "@/src/utils/format";
import { htmlToPdf } from "@/src/utils/pdf";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
const litros = (n: number) =>
  `${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;

export default function RelatorioGeralScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const { data: trips } = useTrips();
  const { data: freights } = useFreights();
  const { data: refuelings } = useRefuelings();
  const { data: tolls } = useTollExpenses();
  const { data: maints } = useMaintenances();
  const { data: oilChanges } = useOilChanges();

  const now = new Date();
  const [start, setStart] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [end, setEnd] = useState(now);
  const [exporting, setExporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const startISO = toISODate(start);
  const endISO = toISODate(end);
  const invalid = endISO < startISO;

  const s = useMemo(() => {
    const tr = (trips ?? []).filter((x) => inRange(x.date, startISO, endISO));
    const fr = (freights ?? []).filter((x) => inRange(x.date, startISO, endISO));
    const rf = (refuelings ?? []).filter((x) => inRange(x.date, startISO, endISO));
    const pd = (tolls ?? []).filter((x) => inRange(x.date, startISO, endISO));
    const mt = (maints ?? []).filter((x) => inRange(x.date, startISO, endISO));
    const oc = (oilChanges ?? []).filter((x) => inRange(x.date, startISO, endISO));

    const kmRun = tr.reduce((a, x) => a + (x.km || Math.max(0, (x.km_end || 0) - (x.km_start || 0))), 0);
    const freightValue = fr.reduce((a, x) => a + (x.value || 0), 0);
    const freightWeight = fr.reduce((a, x) => a + (x.weight || 0), 0);
    const dieselL = rf.reduce((a, x) => a + (x.diesel_liters || 0), 0);
    const arlaL = rf.reduce((a, x) => a + (x.arla_liters || 0), 0);
    const dieselCost = rf.reduce((a, x) => a + (x.diesel_liters || 0) * (x.diesel_price || 0), 0);
    const arlaCost = rf.reduce((a, x) => a + (x.arla_liters || 0) * (x.arla_price || 0), 0);
    const fuelCost = dieselCost + arlaCost;
    const tollCost = pd.reduce((a, x) => a + (x.value || 0), 0);
    const maintCost = mt.reduce((a, x) => a + (x.price || 0), 0);
    const oilCost = oc.reduce((a, x) => a + (x.total || 0), 0);
    const expenses = fuelCost + tollCost + maintCost + oilCost;
    return {
      trips: tr.length, kmRun,
      freights: fr.length, freightValue, freightWeight,
      refuelings: rf.length, dieselL, arlaL, dieselCost, arlaCost, fuelCost,
      tolls: pd.length, tollCost,
      maints: mt.length, maintCost,
      oils: oc.length, oilCost,
      expenses, balance: freightValue - expenses,
    };
  }, [trips, freights, refuelings, tolls, maints, oilChanges, startISO, endISO]);

  const periodo = `${formatDateBR(startISO)} a ${formatDateBR(endISO)}`;

  const exportPdf = async () => {
    if (invalid) {
      setBanner(t("A data final deve ser igual ou posterior à data inicial."));
      return;
    }
    setBanner(null);
    setExporting(true);
    const rowsHtml = [
      [t("Viagens"), String(s.trips), `${s.kmRun} km`],
      [t("Fretes"), String(s.freights), money(s.freightValue)],
      [t("Peso transportado"), "", `${s.freightWeight} kg`],
      [t("Abastecimento"), String(s.refuelings), money(s.fuelCost)],
      [`  ${t("Diesel")} — ${t("Total de litros")}`, "", litros(s.dieselL)],
      [`  ${t("Diesel")} — ${t("Valor total")}`, "", money(s.dieselCost)],
      [`  ${t("ARLA 32")} — ${t("Total de litros")}`, "", litros(s.arlaL)],
      [`  ${t("ARLA 32")} — ${t("Valor total")}`, "", money(s.arlaCost)],
      [t("Pedágios"), String(s.tolls), money(s.tollCost)],
      [t("Manutenção"), String(s.maints), money(s.maintCost)],
      [t("Troca de Óleo"), String(s.oils), money(s.oilCost)],
    ]
      .map((r) => `<tr><td>${esc(r[0])}</td><td class="r">${esc(r[1])}</td><td class="r">${esc(r[2])}</td></tr>`)
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>
        *{font-family:-apple-system,Roboto,Arial,sans-serif;box-sizing:border-box}
        body{color:#1A1C19;font-size:11pt;margin:24px}
        .title{color:#E65C00;font-size:18pt;font-weight:800}
        .sub{color:#555;font-size:10pt;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:10pt}
        th{background:#F5F5F5;color:#555;text-align:left;padding:7px;border-bottom:1px solid #ddd}
        td{padding:7px;border-bottom:1px solid #f0f0f0}
        .r{text-align:right;white-space:nowrap}
        .grand{margin-top:12px;background:#121212;color:#fff;border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;font-weight:700}
        .grand .val{color:#FF8A3D}
      </style></head><body>
      <div class="title">${t("RELATÓRIO GERAL")}</div>
      <div class="sub"><b>${t("Período:")}</b> ${esc(periodo)}</div>
      <table>
        <thead><tr><th>${t("Item")}</th><th class="r">${t("Qtd.")}</th><th class="r">${t("Total")}</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="grand"><span>${t("Receitas (Fretes)")}</span><span class="val">${money(s.freightValue)}</span></div>
      <div class="grand"><span>${t("Despesas totais")}</span><span class="val">${money(s.expenses)}</span></div>
      <div class="grand"><span>${t("Saldo")}</span><span class="val">${money(s.balance)}</span></div>
    </body></html>`;
    try {
      const { uri } = await htmlToPdf(html);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: t("Relatório Geral"), UTI: "com.adobe.pdf" });
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

  const Line = ({ label, count, value }: { label: string; count?: number; value: string }) => (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}{count !== undefined ? `  (${count})` : ""}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.screen} testID="relatorio-geral-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="geral-report-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Relatório Geral")}</Text>
      </View>

      <KeyboardAwareScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.presetRow}>
          {([
            ["Este mês", () => { const d = new Date(); setStart(new Date(d.getFullYear(), d.getMonth(), 1)); setEnd(d); }],
            ["Este ano", () => { const d = new Date(); setStart(new Date(d.getFullYear(), 0, 1)); setEnd(d); }],
          ] as const).map(([label, fn]) => (
            <Pressable key={label} style={styles.presetBtn} onPress={fn} testID={`geral-preset-${label}`}>
              <Text style={styles.presetText}>{t(label)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <DateInputField label={t("Data inicial")} value={start} onChange={setStart} testID="geral-report-start" />
          <View style={{ width: 12 }} />
          <DateInputField label={t("Data final")} value={end} onChange={setEnd} error={invalid ? t("Deve ser ≥ inicial") : undefined} testID="geral-report-end" />
        </View>

        {banner ? (
          <View style={styles.banner}>
            <Warning size={18} color={colors.error} weight="bold" />
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}

        {!invalid ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("Operação")}</Text>
              <Line label={t("Viagens")} count={s.trips} value={`${s.kmRun} km`} />
              <Line label={t("Fretes")} count={s.freights} value={money(s.freightValue)} />
              {s.freightWeight > 0 ? <Line label={t("Peso transportado")} value={`${s.freightWeight} kg`} /> : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("Despesas")}</Text>
              <Line label={t("Abastecimento")} count={s.refuelings} value={money(s.fuelCost)} />
              <Line label={t("Pedágios")} count={s.tolls} value={money(s.tollCost)} />
              <Line label={t("Manutenção")} count={s.maints} value={money(s.maintCost)} />
              <Line label={t("Troca de Óleo")} count={s.oils} value={money(s.oilCost)} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("Resumo de abastecimentos")}</Text>
              <Text style={styles.subTitle}>{t("Diesel")}</Text>
              <Line label={t("Total de litros")} value={litros(s.dieselL)} />
              <Line label={t("Valor total")} value={money(s.dieselCost)} />
              <Text style={styles.subTitle}>{t("ARLA 32")}</Text>
              <Line label={t("Total de litros")} value={litros(s.arlaL)} />
              <Line label={t("Valor total")} value={money(s.arlaCost)} />
            </View>

            <View style={styles.totalCard}>
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>{t("Receitas (Fretes)")}</Text>
                <Text style={styles.totalValue}>{money(s.freightValue)}</Text>
              </View>
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>{t("Despesas totais")}</Text>
                <Text style={styles.totalValue}>{money(s.expenses)}</Text>
              </View>
              <View style={styles.totalLine}>
                <Text style={styles.totalLabelBig}>{t("Saldo")}</Text>
                <Text style={styles.totalValueBig}>{money(s.balance)}</Text>
              </View>
            </View>

            <Pressable style={[styles.pdfBtn, exporting && styles.disabled]} onPress={exportPdf} disabled={exporting} testID="geral-export-pdf">
              {exporting ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <FilePdf size={22} color={colors.onBrandPrimary} weight="bold" />
                  <Text style={styles.pdfText}>{t("Exportar PDF")}</Text>
                </>
              )}
            </Pressable>
            {Platform.OS === "web" ? <Text style={styles.webHint}>{t("No app (Expo Go) o PDF abre para compartilhar/salvar.")}</Text> : null}
          </>
        ) : (
          <Text style={styles.countLabel}>{t("Período inválido")}</Text>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3, flex: 1 },
  content: { padding: 16 },
  row: { flexDirection: "row" },
  presetRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  presetBtn: {
    flex: 1, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceTertiary, borderColor: colors.border, borderWidth: 1,
  },
  presetText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  banner: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12,
  },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  countLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginBottom: 12 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1,
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  cardTitle: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.brandPrimary, marginBottom: 8 },
  subTitle: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface, marginTop: 8, marginBottom: 2 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  lineLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceSecondary },
  lineValue: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.onSurface },
  totalCard: { backgroundColor: colors.surfaceInverse, borderRadius: 12, padding: 16, marginTop: 4, marginBottom: 16, gap: 10 },
  totalLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceInverse },
  totalValue: { fontFamily: fonts.displaySemiBold, fontSize: 17, color: colors.brandPrimary },
  totalLabelBig: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.onSurfaceInverse },
  totalValueBig: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.brandPrimary },
  pdfBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    height: 54, borderRadius: 12, backgroundColor: colors.brandPrimary,
  },
  disabled: { opacity: 0.5 },
  pdfText: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.5, color: colors.onBrandPrimary },
  webHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 10 },
}));
