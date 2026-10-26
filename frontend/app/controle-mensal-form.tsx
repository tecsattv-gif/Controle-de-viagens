import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FloppyDisk, PathIcon as Path, Warning, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MonthlyKm,
  isMonthlyOpen,
  useCreateMonthlyKm,
  useMonthlyKm,
  useUpdateMonthlyKm,
} from "@/src/api/monthlyKm";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useDailyLogs } from "@/src/api/dailyLogs";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatInt, parseISODate, toISODate } from "@/src/utils/format";

export default function ControleMensalFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();

  const { data: list, isLoading: loadingList } = useMonthlyKm();
  // Sem id: se o último controle mensal estiver incompleto (sem KM final), retoma-o.
  const latestOpen = useMemo(() => {
    if (params.id) return undefined;
    const sorted = [...(list ?? [])].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    const last = sorted[0];
    return last && isMonthlyOpen(last) ? last : undefined;
  }, [list, params.id]);
  const editId = params.id || latestOpen?.id;
  const editing = !!editId;
  const existing: MonthlyKm | undefined = editId ? list?.find((d) => d.id === editId) : undefined;

  const createM = useCreateMonthlyKm();
  const updateM = useUpdateMonthlyKm();
  const saving = createM.isPending || updateM.isPending;

  const [startDate, setStartDate] = useState(new Date());
  const [startKm, setStartKm] = useState("");
  const [endDate, setEndDate] = useState(new Date());
  const [endKm, setEndKm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (editing && existing && !prefilled) {
      setStartDate(parseISODate(existing.start_date));
      setStartKm(existing.start_km != null ? String(existing.start_km) : "");
      if (existing.end_date) setEndDate(parseISODate(existing.end_date));
      setEndKm(existing.end_km ? String(existing.end_km) : "");
      setPrefilled(true);
    }
  }, [editing, existing, prefilled]);

  const a = parseInt(startKm, 10);
  const b = parseInt(endKm, 10);
  const bothValid = !isNaN(a) && !isNaN(b);
  const monthKm = bothValid && b > a ? b - a : 0;
  const endKmEnabled = true;
  const kmError = bothValid && b <= a ? t("O KM final deve ser maior que o KM inicial") : undefined;

  // Sugestão para "fechar o mês" com o último KM registrado no Controle Diário.
  const { data: dailyLogs } = useDailyLogs();
  const lastDailyKm = useMemo(() => {
    const d0 = (dailyLogs ?? [])[0];
    return d0 ? Math.max(d0.end_km || 0, d0.start_km || 0) : 0;
  }, [dailyLogs]);
  const canSuggest = !endKm.trim() && lastDailyKm > (isNaN(a) ? 0 : a);
  const useSuggestion = () => {
    setEndKm(String(lastDailyKm));
    setEndDate(new Date());
  };

  const handleSave = () => {
    const next: Record<string, string> = {};
    if (!startKm.trim() || isNaN(a)) next.startKm = t("Informe o KM inicial");
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
      start_date: toISODate(startDate),
      start_km: a,
      end_date: hasEndKm ? toISODate(endDate) : "",
      end_km: hasEndKm ? b : 0,
    };

    const onSuccess = () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };
    const onError = (err: any) =>
      setBanner(err?.message ?? t("Não foi possível salvar o controle mensal."));

    if (editing && editId) {
      updateM.mutate({ id: editId, input }, { onSuccess, onError });
    } else {
      createM.mutate(input, { onSuccess, onError });
    }
  };

  const notFound = editing && !loadingList && !existing;

  return (
    <View style={styles.screen} testID="controle-mensal-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="controle-mensal-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar controle mensal") : t("Novo controle mensal")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Controle mensal não encontrado.")}</Text>
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
              <View style={styles.banner} testID="controle-mensal-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <Text style={styles.groupLabel}>{t("Início do mês")}</Text>
            <View style={styles.row}>
              <DateInputField label={t("Data inicial")} value={startDate} onChange={setStartDate} testID="field-cm-start-date" />
            </View>
            <TextField
              label={t("KM inicial")}
              value={startKm}
              onChangeText={setStartKm}
              keyboardType="number-pad"
              placeholder="0"
              error={errors.startKm}
              testID="field-cm-start-km"
            />

            <Text style={styles.groupLabel}>{t("Fim do mês")}</Text>
            <View style={styles.row}>
              <DateInputField label={t("Data final")} value={endDate} onChange={setEndDate} testID="field-cm-end-date" />
            </View>
            <TextField
              label={t("KM final")}
              value={endKm}
              onChangeText={setEndKm}
              keyboardType="number-pad"
              editable={endKmEnabled}
              placeholder={t("Opcional")}
              error={errors.endKm ?? kmError}
              testID="field-cm-end-km"
            />

            {canSuggest ? (
              <Pressable style={styles.suggestBtn} onPress={useSuggestion} testID="cm-use-suggestion" accessibilityRole="button">
                <Path size={16} color={colors.brandPrimary} weight="bold" />
                <Text style={styles.suggestText}>{t("Fechar mês com último KM do diário: {km}", { km: formatInt(lastDailyKm) })}</Text>
              </Pressable>
            ) : null}

            <View style={styles.drivenField} testID="cm-driven">
              <View style={styles.drivenLabelRow}>
                <Path size={16} color={colors.onBrandTertiary} weight="bold" />
                <Text style={styles.drivenLabel}>{t("KM DO MÊS (automático)")}</Text>
              </View>
              <View style={styles.drivenValueRow}>
                <Text style={styles.drivenValue} testID="cm-driven-value">{formatInt(monthKm)}</Text>
                <Text style={styles.drivenUnit}>km</Text>
              </View>
            </View>
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                testID="save-controle-mensal-button"
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar controle mensal")}</Text>
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
  groupLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 6, marginTop: 6 },
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
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  suggestText: { flex: 1, fontFamily: fonts.displaySemiBold, fontSize: 13, color: colors.brandPrimary },
  drivenField: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  drivenLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  drivenLabel: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.8, fontWeight: "700", color: colors.onBrandTertiary },
  drivenValueRow: { flexDirection: "row", alignItems: "flex-end" },
  drivenValue: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 34, color: colors.onBrandTertiary },
  drivenUnit: { fontFamily: fonts.display, fontSize: 16, color: colors.onBrandTertiary, marginLeft: 6, marginBottom: 3 },
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
