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
  useCreateTollExpense,
  useTollExpenses,
  useUpdateTollExpense,
} from "@/src/api/tollExpenses";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { money, parseISODate, parseNumberInput, toISODate } from "@/src/utils/format";
export default function PedagioFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;

  const { data: list, isLoading: loadingList } = useTollExpenses();
  const existing = editing ? list?.find((t) => t.id === params.id) : undefined;

  const createToll = useCreateTollExpense();
  const updateToll = useUpdateTollExpense();
  const saving = createToll.isPending || updateToll.isPending;

  const [date, setDate] = useState(new Date());
  const [value, setValue] = useState("");
  const [place, setPlace] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const valueN = parseNumberInput(value);

  useEffect(() => {
    if (editing && existing && !prefilled) {
      setDate(parseISODate(existing.date));
      setValue(existing.value ? String(existing.value).replace(".", ",") : "");
      setPlace(existing.place || "");
      setPrefilled(true);
    }
  }, [editing, existing, prefilled]);

  const handleSave = () => {
    setErrors({});
    setBanner(null);

    const input = {
      date: toISODate(date),
      value: isNaN(valueN) ? 0 : valueN,
      place: place.trim(),
    };

    const onSuccess = () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    };
    const onError = (err: any) =>
      setBanner(err?.message ?? t("Não foi possível salvar o pedágio."));

    if (editing && params.id) {
      updateToll.mutate({ id: params.id, input }, { onSuccess, onError });
    } else {
      createToll.mutate(input, { onSuccess, onError });
    }
  };

  const notFound = editing && !loadingList && !existing;

  return (
    <View style={styles.screen} testID="pedagio-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="pedagio-form-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar pedágio") : t("Novo pedágio")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Pedágio não encontrado.")}</Text>
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
              <View style={styles.banner} testID="pedagio-form-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <DateInputField label={t("Data do pedágio")} value={date} onChange={setDate} testID="field-pedagio-date" />
            </View>

            <TextField
              label={t("Valor")}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0,00"
              error={errors.value}
              testID="field-pedagio-value"
            />

            <View style={styles.totalRow} testID="pedagio-total">
              <Text style={styles.totalRowLabel}>{t("Valor do pedágio")}</Text>
              <Text style={styles.totalRowValue}>{money(isNaN(valueN) ? 0 : valueN)}</Text>
            </View>

            <TextField
              label={t("Local (opcional)")}
              value={place}
              onChangeText={setPlace}
              placeholder={t("Ex.: autoestrada, cidade, praça, país")}
              testID="field-pedagio-place"
            />
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                testID="save-pedagio-button"
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar pedágio")}</Text>
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
