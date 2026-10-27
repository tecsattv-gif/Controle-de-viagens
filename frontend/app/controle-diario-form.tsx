import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Clock, FloppyDisk, PathIcon as Path, Plus, Warning, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DailyLog,
  DailyStop,
  useCreateDailyLog,
  useDailyLogs,
  useUpdateDailyLog,
} from "@/src/api/dailyLogs";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import {
  formatInt,
  formatTimeHM,
  maskTimeInput,
  parseISODate,
  toISODate,
} from "@/src/utils/format";

// Considera incompleto quando falta o local E o KM final.
function isIncomplete(d: DailyLog): boolean {
  const noPlace = !d.end_place || d.end_place.trim() === "";
  const noKm = !d.end_km || d.end_km === 0;
  return noPlace && noKm;
}

export default function ControleDiarioFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();

  const { data: list, isLoading: loadingList } = useDailyLogs();
  // Sem id explícito: se o último controle diário estiver incompleto (falta local/KM final),
  // retoma esse para o usuário terminar; caso contrário, abre um novo.
  const latestIncomplete = useMemo(() => {
    if (params.id) return undefined;
    const sorted = [...(list ?? [])].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    const last = sorted[0];
    return last && isIncomplete(last) ? last : undefined;
  }, [list, params.id]);
  const editId = params.id || latestIncomplete?.id;
  const editing = !!editId;
  const existing = editId ? list?.find((d) => d.id === editId) : undefined;

  const createD = useCreateDailyLog();
  const updateD = useUpdateDailyLog();
  const saving = createD.isPending || updateD.isPending;

  const nowHM = formatTimeHM(new Date());
  const [date, setDate] = useState(new Date());
  const [startPlace, setStartPlace] = useState("");
  const [startKm, setStartKm] = useState("");
  const [startTime, setStartTime] = useState(nowHM);
  const [endPlace, setEndPlace] = useState("");
  const [endKm, setEndKm] = useState("");
  const [endTime, setEndTime] = useState(nowHM);
  const [stops, setStops] = useState<DailyStop[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (editing && existing && !prefilled) {
      setDate(parseISODate(existing.date));
      setStartPlace(existing.start_place || "");
      setStartKm(existing.start_km != null ? String(existing.start_km) : "");
      setStartTime(existing.start_time || "");
      setEndPlace(existing.end_place || "");
      setEndKm(existing.end_km ? String(existing.end_km) : "");
      setEndTime(existing.end_time || "");
      setStops(existing.stops || []);
      setPrefilled(true);
    }
  }, [editing, existing, prefilled]);

  const a = parseInt(startKm, 10);
  const b = parseInt(endKm, 10);
  const bothValid = !isNaN(a) && !isNaN(b);
  const dayKm = bothValid && b > a ? b - a : 0;
  const endKmEnabled = endPlace.trim().length > 0;
  const kmError =
    bothValid && b <= a ? t("O KM final deve ser maior que o KM inicial") : undefined;

  const updateStopPlace = (i: number, v: string) =>
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, place: v } : s)));
  const updateStopTime = (i: number, v: string) =>
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, time: maskTimeInput(v) } : s)));
  const addStop = () =>
    setStops((prev) => [...prev, { place: "", time: formatTimeHM(new Date()) }]);
  const removeStop = (i: number) => setStops((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = () => {
    const next: Record<string, string> = {};
    if (!startKm.trim() || isNaN(a)) next.startKm = t("Informe o KM inicial");
    // Local de fim e KM final são opcionais. Se o KM final for informado, deve ser maior que o inicial.
    if (endKm.trim() && !isNaN(b) && !isNaN(a) && b <= a) {
      next.endKm = t("O KM final deve ser maior que o KM inicial");
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      setBanner(t("Verifique os campos destacados."));
      return;
    }
    setErrors({});
    setBanner(null);

    const hasEndKm = endKm.trim() !== "" && !isNaN(b);
    const input = {
      date: toISODate(date),
      start_place: startPlace.trim(),
      start_km: a,
      start_time: startTime.trim(),
      end_place: endPlace.trim(),
      end_km: hasEndKm ? b : 0,
      end_time: endTime.trim(),
      stops: stops
        .map((s) => ({ place: s.place.trim(), time: (s.time || "").trim() }))
        .filter((s) => s.place || s.time),
      notes: "",
    };

    const onSuccess = () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    };
    const onError = (err: any) =>
      setBanner(err?.message ?? t("Não foi possível salvar o controle diário."));

    if (editing && editId) {
      updateD.mutate({ id: editId, input }, { onSuccess, onError });
    } else {
      createD.mutate(input, { onSuccess, onError });
    }
  };

  const notFound = editing && !loadingList && !existing;

  return (
    <View style={styles.screen} testID="controle-diario-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="controle-diario-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar controle diário") : t("Novo controle diário")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Controle diário não encontrado.")}</Text>
        </View>
      ) : editing && loadingList && !prefilled ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : (
        <>
          <KeyboardAwareScrollView
            bottomOffset={92}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {banner ? (
              <View style={styles.banner} testID="controle-diario-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <DateInputField label={t("Data")} value={date} onChange={setDate} testID="field-cd-date" />
            </View>

            <Text style={styles.groupLabel}>{t("Início")}</Text>
            <TextField
              label={t("Local de início")}
              value={startPlace}
              onChangeText={setStartPlace}
              placeholder={t("Ex.: Garagem / origem")}
              testID="field-cd-start-place"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("KM inicial")}
                  value={startKm}
                  onChangeText={setStartKm}
                  keyboardType="number-pad"
                  placeholder="0"
                  error={errors.startKm}
                  testID="field-cd-start-km"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("Hora de início")}
                  value={startTime}
                  onChangeText={(v) => setStartTime(maskTimeInput(v))}
                  keyboardType="number-pad"
                  placeholder="00:00"
                  testID="field-cd-start-time"
                />
              </View>
            </View>

            <Text style={styles.groupLabel}>{t("Fim")}</Text>
            <TextField
              label={t("Local de fim")}
              value={endPlace}
              onChangeText={setEndPlace}
              placeholder={t("Ex.: Garagem / destino")}
              error={errors.endPlace}
              testID="field-cd-end-place"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("KM final")}
                  value={endKm}
                  onChangeText={setEndKm}
                  keyboardType="number-pad"
                  editable={endKmEnabled}
                  placeholder={endKmEnabled ? "0" : t("Preencha o local de fim")}
                  style={endKmEnabled ? undefined : styles.disabledInput}
                  error={errors.endKm ?? kmError}
                  testID="field-cd-end-km"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("Hora de fim")}
                  value={endTime}
                  onChangeText={(v) => setEndTime(maskTimeInput(v))}
                  keyboardType="number-pad"
                  placeholder="00:00"
                  testID="field-cd-end-time"
                />
              </View>
            </View>

            <View style={styles.drivenField} testID="cd-km-day">
              <View style={styles.drivenLabelRow}>
                <Path size={16} color={colors.onBrandTertiary} weight="bold" />
                <Text style={styles.drivenLabel}>{t("KM DO DIA (automático)")}</Text>
              </View>
              <View style={styles.drivenValueRow}>
                <Text style={styles.drivenValue}>{formatInt(dayKm)}</Text>
                <Text style={styles.drivenUnit}>km</Text>
              </View>
            </View>

            <Text style={styles.groupLabel}>{t("Paradas")}</Text>
            {stops.map((stop, i) => (
              <View key={i} style={styles.stopCard}>
                <View style={styles.stopTimeRow}>
                  <Clock size={16} color={colors.brandPrimary} weight="bold" />
                  <TextInput
                    value={stop.time}
                    onChangeText={(v) => updateStopTime(i, v)}
                    placeholder="00:00"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    style={styles.stopTimeInput}
                    testID={`field-cd-stop-time-${i}`}
                  />
                  <Pressable onPress={() => removeStop(i)} style={styles.removeBtn} hitSlop={8} testID={`cd-remove-stop-${i}`}>
                    <X size={18} color={colors.error} weight="bold" />
                  </Pressable>
                </View>
                <TextInput
                  value={stop.place}
                  onChangeText={(v) => updateStopPlace(i, v)}
                  placeholder={t("Local da parada {n}", { n: i + 1 })}
                  placeholderTextColor={colors.muted}
                  style={styles.stopInput}
                  testID={`field-cd-stop-place-${i}`}
                />
              </View>
            ))}
            <Pressable onPress={addStop} style={styles.addBtn} testID="cd-add-stop">
              <Plus size={18} color={colors.brandPrimary} weight="bold" />
              <Text style={styles.addBtnText}>{t("Adicionar parada")}</Text>
            </Pressable>
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                testID="save-controle-diario-button"
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar controle diário")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </KeyboardStickyView>
        </>
      )}
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dimText: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  content: { padding: 16, paddingBottom: 110 },
  row: { flexDirection: "row" },
  disabledInput: { opacity: 0.5 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  groupLabel: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 16,
    color: colors.brandPrimary,
    letterSpacing: 0.3,
    marginBottom: 8,
    marginTop: 4,
  },
  drivenField: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    marginTop: 2,
  },
  drivenLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  drivenLabel: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.8, fontWeight: "700", color: colors.onBrandTertiary },
  drivenValueRow: { flexDirection: "row", alignItems: "flex-end" },
  drivenValue: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 34, color: colors.onBrandTertiary },
  drivenUnit: { fontFamily: fonts.display, fontSize: 16, color: colors.onBrandTertiary, marginLeft: 6, marginBottom: 3 },
  stopCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  stopTimeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stopTimeInput: {
    width: 90,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
  },
  stopInput: {
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
    minHeight: 48,
  },
  removeBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    marginLeft: "auto",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 2,
    marginBottom: 14,
  },
  addBtnText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.brandPrimary },
  saveBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.5, color: colors.onBrandPrimary },
}));
