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
  useCreateFreight,
  useFreights,
  useUpdateFreight,
} from "@/src/api/freights";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useAuth } from "@/src/context/AuthContext";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import {
  currencySymbolFor,
  money,
  parseISODate,
  parseNumberInput,
  toISODate,
} from "@/src/utils/format";

export default function FreteFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;
  const { user } = useAuth();
  const t = useT();

  const { data: list, isLoading: loadingList } = useFreights();
  const existing = editing ? list?.find((f) => f.id === params.id) : undefined;

  const createFreight = useCreateFreight();
  const updateFreight = useUpdateFreight();
  const saving = createFreight.isPending || updateFreight.isPending;

  const [date, setDate] = useState(new Date());
  const [client, setClient] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [value, setValue] = useState("");
  const [weight, setWeight] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const currency = user?.app_currency ?? "EUR";
  const sym = currencySymbolFor(currency);
  const valueN = parseNumberInput(value);
  const weightN = parseNumberInput(weight);

  useEffect(() => {
    if (editing && existing && !prefilled) {
      setDate(parseISODate(existing.date));
      setClient(existing.client || "");
      setOrigin(existing.origin || "");
      setDestination(existing.destination || "");
      setValue(existing.value ? String(existing.value).replace(".", ",") : "");
      setWeight(existing.weight ? String(existing.weight).replace(".", ",") : "");
      setReference(existing.reference || "");
      setNotes(existing.notes || "");
      setPrefilled(true);
    }
  }, [editing, existing, prefilled]);

  const handleSave = () => {
    setErrors({});
    setBanner(null);

    const input = {
      date: toISODate(date),
      client: client.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      value: isNaN(valueN) ? 0 : valueN,
      currency,
      weight: isNaN(weightN) ? 0 : weightN,
      reference: reference.trim(),
      notes: notes.trim(),
    };

    const onSuccess = () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    };
    const onError = (err: any) =>
      setBanner(err?.message ?? t("Não foi possível salvar o frete."));

    if (editing && params.id) {
      updateFreight.mutate({ id: params.id, input }, { onSuccess, onError });
    } else {
      createFreight.mutate(input, { onSuccess, onError });
    }
  };

  const notFound = editing && !loadingList && !existing;

  return (
    <View style={styles.screen} testID="frete-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="frete-form-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar frete") : t("Cadastrar Frete")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Frete não encontrado.")}</Text>
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
              <View style={styles.banner} testID="frete-form-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <DateInputField label={t("Data do frete")} value={date} onChange={setDate} testID="field-frete-date" />
            </View>

            <TextField
              label={t("Cliente / empresa")}
              value={client}
              onChangeText={setClient}
              placeholder={t("Ex.: Transportadora XYZ")}
              testID="field-frete-client"
            />
            <TextField
              label={t("Origem")}
              value={origin}
              onChangeText={setOrigin}
              placeholder={t("Ex.: Lisboa")}
              testID="field-frete-origin"
            />
            <TextField
              label={t("Destino")}
              value={destination}
              onChangeText={setDestination}
              placeholder={t("Ex.: Madrid")}
              testID="field-frete-destination"
            />
            <TextField
              label={t("Valor do frete ({sym})", { sym })}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0,00"
              error={errors.value}
              testID="field-frete-value"
            />
            <View style={styles.totalRow}>
              <Text style={styles.totalRowLabel}>{t("Valor do frete")}</Text>
              <Text style={styles.totalRowValue}>{money(isNaN(valueN) ? 0 : valueN)}</Text>
            </View>
            <TextField
              label={t("Peso da carga (kg)")}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="Ex.: 24000"
              testID="field-frete-weight"
            />
            <TextField
              label={t("Referência / documento")}
              value={reference}
              onChangeText={setReference}
              placeholder={t("Ex.: CMR, nº da carga")}
              testID="field-frete-reference"
            />
            <TextField
              label={t("Observações")}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("Opcional")}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
              testID="field-frete-notes"
            />
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                testID="save-frete-button"
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar Frete")}</Text>
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
  notesInput: { minHeight: 84, textAlignVertical: "top", paddingTop: 12 },
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
