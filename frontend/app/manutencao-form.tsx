import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FloppyDisk, Warning, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MAINTENANCE_CATEGORIES,
  MaintenanceCategory,
  useCreateMaintenance,
  useMaintenances,
  useUpdateMaintenance,
} from "@/src/api/maintenance";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { money, parseISODate, parseNumberInput, toISODate } from "@/src/utils/format";
export default function ManutencaoFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string; category?: string }>();
  const editing = !!params.id;

  const { data: list, isLoading: loadingList } = useMaintenances();
  const existing = editing ? list?.find((m) => m.id === params.id) : undefined;

  const createM = useCreateMaintenance();
  const updateM = useUpdateMaintenance();
  const saving = createM.isPending || updateM.isPending;

  const initialCategory = (MAINTENANCE_CATEGORIES as readonly string[]).includes(params.category || "")
    ? (params.category as MaintenanceCategory)
    : "Mecânica";

  const [category, setCategory] = useState<MaintenanceCategory>(initialCategory);
  const [date, setDate] = useState(new Date());
  const [place, setPlace] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const priceN = parseNumberInput(price);

  useEffect(() => {
    if (editing && existing && !prefilled) {
      const cat = (MAINTENANCE_CATEGORIES as readonly string[]).includes(existing.category)
        ? (existing.category as MaintenanceCategory)
        : "Mecânica";
      setCategory(cat);
      setDate(parseISODate(existing.date));
      setPlace(existing.place || "");
      setDescription(existing.description || "");
      setPrice(existing.price ? String(existing.price).replace(".", ",") : "");
      setKm(existing.km ? String(existing.km) : "");
      setNotes(existing.notes || "");
      setPrefilled(true);
    }
  }, [editing, existing, prefilled]);

  const handleSave = () => {
    const next: Record<string, string> = {};
    if (!description.trim()) next.description = t("Informe a discriminação do serviço");
    const kmN = parseInt(km, 10);
    if (!km.trim() || isNaN(kmN)) next.km = t("Informe o KM");

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setBanner(t("Verifique os campos destacados."));
      return;
    }
    setErrors({});
    setBanner(null);

    const input = {
      category,
      date: toISODate(date),
      place: place.trim(),
      description: description.trim(),
      price: isNaN(priceN) ? 0 : priceN,
      km: kmN,
      notes: notes.trim(),
    };

    const onSuccess = () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    };
    const onError = (err: any) =>
      setBanner(err?.message ?? t("Não foi possível salvar a manutenção."));

    if (editing && params.id) {
      updateM.mutate({ id: params.id, input }, { onSuccess, onError });
    } else {
      createM.mutate(input, { onSuccess, onError });
    }
  };

  const notFound = editing && !loadingList && !existing;

  return (
    <View style={styles.screen} testID="manutencao-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="manutencao-form-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar manutenção") : t("Nova manutenção")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Manutenção não encontrada.")}</Text>
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
              <View style={styles.banner} testID="manutencao-form-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <Text style={styles.groupLabel}>{t("Categoria")}</Text>
            <View style={styles.optionRow}>
              {MAINTENANCE_CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <Pressable
                    key={c}
                    style={[styles.optionBtn, active && styles.optionBtnActive]}
                    onPress={() => setCategory(c)}
                    testID={`category-${c}`}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{t(c)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.row}>
              <DateInputField label={t("Data")} value={date} onChange={setDate} testID="field-manutencao-date" />
            </View>

            <TextField
              label={t("Local")}
              value={place}
              onChangeText={setPlace}
              placeholder={t("Local ou oficina do serviço")}
              testID="field-manutencao-place"
            />
            <TextField
              label={t("Discriminação")}
              value={description}
              onChangeText={setDescription}
              placeholder={t("Serviço, peça, material ou reparo")}
              error={errors.description}
              multiline
              numberOfLines={2}
              style={styles.multi}
              testID="field-manutencao-description"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("Preço")}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  error={errors.price}
                  testID="field-manutencao-price"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <TextField
                  label="KM"
                  value={km}
                  onChangeText={setKm}
                  keyboardType="number-pad"
                  placeholder="0"
                  error={errors.km}
                  testID="field-manutencao-km"
                />
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalRowLabel}>{t("Valor da manutenção")}</Text>
              <Text style={styles.totalRowValue}>{money(isNaN(priceN) ? 0 : priceN)}</Text>
            </View>

            <TextField
              label={t("Observação")}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("Informações adicionais (opcional)")}
              multiline
              numberOfLines={3}
              style={styles.multi}
              testID="field-manutencao-notes"
            />
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                testID="save-manutencao-button"
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar manutenção")}</Text>
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
  },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  optionBtn: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  optionBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary },
  optionTextActive: { color: colors.onBrandPrimary },
  multi: { minHeight: 76, textAlignVertical: "top", paddingTop: 12 },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.brandTertiary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  totalRowLabel: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onBrandTertiary },
  totalRowValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onBrandTertiary },
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
