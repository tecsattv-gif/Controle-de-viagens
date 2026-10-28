import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { ArrowsLeftRight, FilePdf, PencilSimple, Ruler, Trash, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useAddMeasurement,
  useDeleteMeasurement,
  useTireConfigs,
  useTireSettings,
  useTires,
} from "@/src/api/tires";
import { useTrips } from "@/src/api/trips";
import { useVehicles, compositionPlates, vehicleName, vehicleTitle } from "@/src/api/vehicles";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { configPositions, positionLabel, stateColor, treadState } from "@/src/utils/axleMaps";
import { formatDateBR, formatInt, toISODate } from "@/src/utils/format";
import { companyPdfHeaderHtml, useReportHeader } from "@/src/utils/reportHeader";
import { tireKmRun, vehicleCurrentKm } from "@/src/utils/tireKm";
import { htmlToPdf } from "@/src/utils/pdf";
import { buildTireReportHtml } from "@/src/utils/tireReportHtml";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function PneuDetalheScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();

  const { data: tires, isLoading } = useTires();
  const tire = tires?.find((x) => x.id === params.id);
  const { data: vehicles } = useVehicles();
  const { data: configs } = useTireConfigs();
  const { data: settings } = useTireSettings();
  const { data: trips } = useTrips();
  const { companyName, companyLogoUrl } = useReportHeader();

  const addMeasure = useAddMeasurement();
  const delMeasure = useDeleteMeasurement();

  const [measureOpen, setMeasureOpen] = useState(false);

  // A janela "Medir Sulco" fica num Modal, que no Android não encolhe quando o
  // teclado abre. Medimos o teclado e empurramos a janela para cima.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s1 = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const s2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);
  const [mDate, setMDate] = useState(new Date());
  const [mTread, setMTread] = useState("");
  const [mNotes, setMNotes] = useState("");
  const [exporting, setExporting] = useState(false);

  const vehicle = vehicles?.find((v) => v.id === tire?.vehicle_id);
  const config = configs?.find((c) => c.vehicle_id === tire?.vehicle_id);
  const posLabel = useMemo(() => {
    if (!tire) return "";
    if (!config) return tire.position_code;
    return positionLabel(tire.position_code, configPositions(config.units));
  }, [tire, config]);

  const currentKm = vehicleCurrentKm(tire?.vehicle_id || "", trips);
  const kmRun = tire ? tireKmRun(tire, currentKm) : null;

  if (isLoading && !tire) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  if (!tire) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.dim}>{t("Pneu não encontrado.")}</Text>
      </View>
    );
  }

  const st = treadState(tire.current_tread_mm, settings?.green_min_mm ?? 5, settings?.yellow_min_mm ?? 3);
  const stColor = stateColor(st, colors);
  const stLabel = st === "green" ? t("Bom") : st === "yellow" ? t("Atenção") : t("Trocar");

  const saveMeasure = () => {
    const val = parseFloat(mTread.replace(",", "."));
    if (isNaN(val)) return;
    addMeasure.mutate(
      { id: tire.id, date: toISODate(mDate), tread_mm: val, notes: mNotes.trim() },
      {
        onSuccess: () => {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setMeasureOpen(false);
          setMTread("");
          setMNotes("");
        },
      },
    );
  };

  const exportPdf = async () => {
    setExporting(true);
    const header = await companyPdfHeaderHtml(companyName, companyLogoUrl);
    const html = buildTireReportHtml({
      t,
      header,
      tire,
      vehicleName: vehicle ? vehicleName(vehicle) || vehicleTitle(vehicle) : "",
      truckPlate: vehicle?.truck_plate || "",
      compositionPlates: vehicle ? compositionPlates(vehicle) : "",
      positionLabel: tire.status === "removed" ? t("Retirado") : posLabel,
      kmRun,
      state: st,
      stateLabel: stLabel,
    });
    try {
      const { uri } = await htmlToPdf(html);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch {
      try {
        await Print.printAsync({ html });
      } catch {
        // ignore
      }
    } finally {
      setExporting(false);
    }
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.screen} testID="pneu-detalhe-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="detalhe-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Pneu")} {tire.number}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.stateBadge}>
          <View style={[styles.stateDot, { backgroundColor: stColor }]} />
          <Text style={styles.stateTxt}>{stLabel} · {tire.current_tread_mm} mm</Text>
        </View>

        <View style={styles.card}>
          <Row label={t("Número")} value={tire.number || "—"} />
          <Row label={t("Marca")} value={tire.brand || "—"} />
          <Row label={t("Medida")} value={tire.size || "—"} />
          <Row label={t("Veículo")} value={vehicle ? vehicleTitle(vehicle) : "—"} />
          <Row label={t("Posição")} value={tire.status === "removed" ? t("Retirado") : posLabel || "—"} />
          <Row label={t("Data de instalação")} value={tire.install_date ? formatDateBR(tire.install_date) : "—"} />
          <Row label={t("KM de instalação")} value={tire.install_km ? formatInt(tire.install_km) : "—"} />
          <Row label={t("KM percorridos")} value={kmRun != null ? `${formatInt(kmRun)} km` : t("Indisponível")} />
          {tire.notes ? <Row label={t("Observações")} value={tire.notes} /> : null}
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={() => router.push({ pathname: "/pneu-form", params: { id: tire.id } })} testID="tire-edit">
            <PencilSimple size={20} color={colors.brandPrimary} weight="bold" />
            <Text style={styles.actionTxt}>{t("Editar")}</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => setMeasureOpen(true)} testID="tire-measure">
            <Ruler size={20} color={colors.brandPrimary} weight="bold" />
            <Text style={styles.actionTxt}>{t("Medir Sulco")}</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push({ pathname: "/pneu-trocar", params: { id: tire.id } })} testID="tire-move">
            <ArrowsLeftRight size={20} color={colors.brandPrimary} weight="bold" />
            <Text style={styles.actionTxt}>{t("Trocar Posição")}</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>{t("Histórico de medições")}</Text>
        {(tire.measurements || []).length === 0 ? (
          <Text style={styles.dim}>{t("Nenhuma medição registrada.")}</Text>
        ) : (
          [...tire.measurements]
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
            .map((m) => (
              <View key={m.id} style={styles.measRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.measDate}>{formatDateBR(m.date)}</Text>
                  {m.notes ? <Text style={styles.measNotes}>{m.notes}</Text> : null}
                </View>
                <Text style={styles.measMm}>{m.tread_mm} mm</Text>
                <Pressable onPress={() => delMeasure.mutate({ id: tire.id, mid: m.id })} hitSlop={8} style={styles.measDel} testID={`meas-del-${m.id}`}>
                  <Trash size={18} color={colors.error} weight="bold" />
                </Pressable>
              </View>
            ))
        )}

        <Pressable style={[styles.pdfBtn, exporting && styles.disabled]} onPress={exportPdf} disabled={exporting} testID="tire-pdf">
          {exporting ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <FilePdf size={20} color={colors.onBrandPrimary} weight="bold" />
              <Text style={styles.pdfTxt}>{t("Relatório do Pneu (PDF)")}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={measureOpen} transparent animationType="fade" onRequestClose={() => setMeasureOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMeasureOpen(false)}>
          <Pressable style={[styles.sheet, kbHeight > 0 && { paddingBottom: kbHeight + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{t("Medir Sulco")}</Text>
              <Pressable onPress={() => setMeasureOpen(false)} hitSlop={10}>
                <X size={22} color={colors.onSurface} weight="bold" />
              </Pressable>
            </View>
            <DateInputField label={t("Data da medição")} value={mDate} onChange={setMDate} style={{ flex: 0 }} testID="field-measure-date" />
            <TextField label={t("Profundidade do sulco (mm)")} value={mTread} onChangeText={setMTread} keyboardType="decimal-pad" placeholder="0" testID="field-measure-tread" />
            <TextField label={t("Observações (opcional)")} value={mNotes} onChangeText={setMNotes} placeholder={t("Observações")} testID="field-measure-notes" />
            <Pressable style={[styles.pdfBtn, addMeasure.isPending && styles.disabled]} onPress={saveMeasure} disabled={addMeasure.isPending} testID="save-measure">
              {addMeasure.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.pdfTxt}>{t("Salvar medição")}</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { alignItems: "center", justifyContent: "center", gap: 12 },
  dim: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
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
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3 },
  content: { padding: 16, gap: 12 },
  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  stateDot: { width: 14, height: 14, borderRadius: 7 },
  stateTxt: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  infoLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  infoValue: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface, flex: 1, textAlign: "right" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandTertiary,
  },
  actionTxt: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: colors.brandPrimary, textAlign: "center" },
  section: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.brandPrimary, marginTop: 4 },
  measRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  measDate: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface },
  measNotes: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  measMm: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.onSurface },
  measDel: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    marginTop: 10,
  },
  pdfTxt: { fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 0.3, color: colors.onBrandPrimary },
  disabled: { opacity: 0.6 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sheetTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
}));
