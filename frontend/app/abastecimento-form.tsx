import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckSquare, FloppyDisk, Square, Warning, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useCreateRefueling,
  useRefuelings,
  useUpdateRefueling,
} from "@/src/api/refuelings";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { money, parseISODate, parseNumberInput, toISODate } from "@/src/utils/format";

export default function AbastecimentoFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;

  const { data: refuels, isLoading: loadingList } = useRefuelings();
  const existing = editing ? refuels?.find((r) => r.id === params.id) : undefined;

  const createRefueling = useCreateRefueling();
  const updateRefueling = useUpdateRefueling();
  const saving = createRefueling.isPending || updateRefueling.isPending;

  const [date, setDate] = useState(new Date());
  const [place, setPlace] = useState("");
  const [km, setKm] = useState("");
  const [diesel, setDiesel] = useState("");
  const [dieselPrice, setDieselPrice] = useState("");
  const [hasArla, setHasArla] = useState(false);
  const [arlaKm, setArlaKm] = useState("");
  const [arla, setArla] = useState("");
  const [arlaPrice, setArlaPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const dLitersN = parseNumberInput(diesel);
  const dPriceN = parseNumberInput(dieselPrice);
  const aLitersN = parseNumberInput(arla);
  const aPriceN = parseNumberInput(arlaPrice);
  const dieselTotal = !isNaN(dLitersN) && !isNaN(dPriceN) ? dLitersN * dPriceN : 0;
  const arlaTotal = hasArla && !isNaN(aLitersN) && !isNaN(aPriceN) ? aLitersN * aPriceN : 0;
  const grandTotal = dieselTotal + arlaTotal;

  useEffect(() => {
    if (editing && existing && !prefilled) {
      setDate(parseISODate(existing.date));
      setPlace(existing.station_place || existing.station_name || "");
      setKm(existing.km ? String(existing.km) : "");
      setDiesel(existing.diesel_liters ? String(existing.diesel_liters).replace(".", ",") : "");
      setDieselPrice(existing.diesel_price ? String(existing.diesel_price).replace(".", ",") : "");
      const arlaOn =
        (existing.arla_liters || 0) > 0 ||
        (existing.arla_price || 0) > 0 ||
        (existing.arla_km || 0) > 0;
      setHasArla(arlaOn);
      setArlaKm(existing.arla_km ? String(existing.arla_km) : "");
      setArla(existing.arla_liters ? String(existing.arla_liters).replace(".", ",") : "");
      setArlaPrice(existing.arla_price ? String(existing.arla_price).replace(".", ",") : "");
      setNotes(existing.notes || "");
      setPrefilled(true);
    }
  }, [editing, existing, prefilled]);

  const handleSave = () => {
    const next: Record<string, string> = {};
    if (!place.trim()) next.place = t("Informe o local do abastecimento");

    const dieselN = parseNumberInput(diesel);
    const dieselPriceN = parseNumberInput(dieselPrice);
    const kmN = parseInt(km, 10);

    if (!diesel.trim() || isNaN(dieselN) || dieselN <= 0) {
      next.diesel = t("Informe a quantidade de Diesel");
    }
    if (!km.trim() || isNaN(kmN)) {
      next.km = t("Informe o KM do Diesel");
    }

    let arlaN = 0;
    let arlaPriceN = 0;
    let arlaKmN = 0;
    if (hasArla) {
      arlaN = parseNumberInput(arla);
      arlaPriceN = parseNumberInput(arlaPrice);
      arlaKmN = parseInt(arlaKm, 10);
      if (!arla.trim() || isNaN(arlaN) || arlaN <= 0) {
        next.arla = t("Informe a quantidade de ARLA");
      }
      if (!arlaKm.trim() || isNaN(arlaKmN)) {
        next.arlaKm = t("Informe o KM do ARLA");
      }
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setBanner(t("Verifique os campos destacados."));
      return;
    }

    setErrors({});
    setBanner(null);

    const input = {
      date: toISODate(date),
      station_place: place.trim(),
      diesel_liters: dieselN,
      diesel_price: isNaN(dieselPriceN) ? 0 : dieselPriceN,
      arla_liters: hasArla ? arlaN : 0,
      arla_price: hasArla && !isNaN(arlaPriceN) ? arlaPriceN : 0,
      km: kmN,
      arla_km: hasArla ? arlaKmN : 0,
      notes: notes.trim(),
    };

    const onSuccess = () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    };
    const onError = (err: any) =>
      setBanner(err?.message ?? t("Não foi possível salvar o abastecimento."));

    if (editing && params.id) {
      updateRefueling.mutate({ id: params.id, input }, { onSuccess, onError });
    } else {
      createRefueling.mutate(input, { onSuccess, onError });
    }
  };

  const notFound = editing && !loadingList && !existing;

  return (
    <View style={styles.screen} testID="abastec-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={10}
          testID="form-close"
          accessibilityRole="button"
        >
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>
          {editing ? t("Editar abastecimento") : t("Novo abastecimento")}
        </Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Abastecimento não encontrado.")}</Text>
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
              <View style={styles.banner} testID="form-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <DateInputField
                label={t("Data do abastecimento")}
                value={date}
                onChange={setDate}
                testID="field-refuel-date"
              />
            </View>

            <TextField
              label={t("Local do abastecimento")}
              value={place}
              onChangeText={setPlace}
              placeholder={t("Ex.: Posto / cidade / autoestrada")}
              error={errors.place}
              testID="field-station-place"
            />

            <Text style={styles.groupLabel}>{t("Diesel")}</Text>
            <TextField
              label={t("KM do Diesel")}
              value={km}
              onChangeText={setKm}
              keyboardType="number-pad"
              placeholder="0"
              error={errors.km}
              testID="field-refuel-km"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("Preço/L")}
                  value={dieselPrice}
                  onChangeText={setDieselPrice}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  error={errors.dieselPrice}
                  testID="field-diesel-price"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("Quantidade (L)")}
                  value={diesel}
                  onChangeText={setDiesel}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  error={errors.diesel}
                  testID="field-diesel"
                />
              </View>
            </View>
            <View style={styles.totalRow} testID="diesel-total">
              <Text style={styles.totalRowLabel}>{t("Valor total do Diesel")}</Text>
              <Text style={styles.totalRowValue} testID="diesel-total-value">
                {money(dieselTotal)}
              </Text>
            </View>

            <Pressable
              style={styles.checkRow}
              onPress={() => setHasArla((v) => !v)}
              testID="toggle-arla"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: hasArla }}
            >
              {hasArla ? (
                <CheckSquare size={26} color={colors.brandPrimary} weight="fill" />
              ) : (
                <Square size={26} color={colors.muted} weight="regular" />
              )}
              <Text style={styles.checkLabel}>{t("Deseja acrescentar ARLA?")}</Text>
            </Pressable>

            {hasArla ? (
              <>
                <Text style={styles.groupLabel}>ARLA 32</Text>
                <TextField
                  label={t("KM do ARLA")}
                  value={arlaKm}
                  onChangeText={setArlaKm}
                  keyboardType="number-pad"
                  placeholder="0"
                  error={errors.arlaKm}
                  testID="field-arla-km"
                />
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label={t("Preço/L")}
                      value={arlaPrice}
                      onChangeText={setArlaPrice}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      error={errors.arlaPrice}
                      testID="field-arla-price"
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <TextField
                      label={t("Quantidade (L)")}
                      value={arla}
                      onChangeText={setArla}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      error={errors.arla}
                      testID="field-arla"
                    />
                  </View>
                </View>
                <View style={styles.totalRow} testID="arla-total">
                  <Text style={styles.totalRowLabel}>{t("Valor total do ARLA 32")}</Text>
                  <Text style={styles.totalRowValue} testID="arla-total-value">
                    {money(arlaTotal)}
                  </Text>
                </View>
              </>
            ) : null}

            <View style={styles.grandRow} testID="grand-total">
              <Text style={styles.grandLabel}>{t("Total do abastecimento")}</Text>
              <Text style={styles.grandValue} testID="grand-total-value">
                {money(grandTotal)}
              </Text>
            </View>

            <TextField
              label={t("Observações")}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("Opcional")}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
              testID="field-refuel-notes"
            />
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                testID="save-refueling-button"
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar abastecimento")}</Text>
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
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
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
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 22,
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dimText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
  },
  content: {
    padding: 16,
    paddingBottom: 110,
  },
  row: {
    flexDirection: "row",
  },
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
  bannerText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
  notesInput: {
    minHeight: 84,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  groupLabel: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 16,
    color: colors.brandPrimary,
    letterSpacing: 0.3,
    marginTop: 4,
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    marginBottom: 4,
  },
  checkLabel: {
    flex: 1,
    fontFamily: fonts.displaySemiBold,
    fontSize: 16,
    color: colors.onSurface,
  },
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
  totalRowLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "700",
    color: colors.onBrandTertiary,
  },
  totalRowValue: {
    fontFamily: fonts.displayBold,
    fontSize: 20,
    color: colors.onBrandTertiary,
  },
  grandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.brandPrimary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  grandLabel: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.onBrandPrimary,
  },
  grandValue: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    color: colors.onBrandPrimary,
  },
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
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontFamily: fonts.displayBold,
    fontSize: 20,
    letterSpacing: 0.5,
    color: colors.onBrandPrimary,
  },
}));
