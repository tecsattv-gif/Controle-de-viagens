import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FloppyDisk, PlusCircle, Trash, Warning, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ServiceOrderInput,
  formatOsNumber,
  useCreateServiceOrder,
  useServiceOrders,
  useUpdateServiceOrder,
} from "@/src/api/serviceOrders";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { parseISODate, parseNumberInput, toISODate } from "@/src/utils/format";

export default function OsFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;

  const { data: list, isLoading: loadingList } = useServiceOrders();
  const existing = editing ? list?.find((x) => x.id === params.id) : undefined;

  const createM = useCreateServiceOrder();
  const updateM = useUpdateServiceOrder();
  const saving = createM.isPending || updateM.isPending;

  const [date, setDate] = useState(new Date());
  const [km, setKm] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [trailerPlate, setTrailerPlate] = useState("");
  const [descriptions, setDescriptions] = useState<string[]>([""]);
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill when editing.
  useEffect(() => {
    if (!editing || !existing || prefilled) return;
    setDate(existing.date ? parseISODate(existing.date) : new Date());
    setKm(existing.km ? String(existing.km) : "");
    setVehiclePlate(existing.vehicle_plate || "");
    setTrailerPlate(existing.trailer_plate || "");
    setDescriptions(existing.descriptions && existing.descriptions.length > 0 ? [...existing.descriptions] : [""]);
    setPrefilled(true);
  }, [editing, existing, prefilled]);

  const setDescAt = (i: number, text: string) => {
    setDescriptions((arr) => arr.map((d, idx) => (idx === i ? text : d)));
  };

  const addDescription = () => {
    setDescriptions((arr) => [...arr, ""]);
  };

  const removeDescription = (i: number) => {
    setDescriptions((arr) => {
      const next = arr.filter((_, idx) => idx !== i);
      return next.length > 0 ? next : [""];
    });
  };

  const handleSave = () => {
    const cleaned = descriptions.map((d) => d.trim()).filter((d) => d.length > 0);
    if (cleaned.length === 0) {
      setBanner(t("Adicione pelo menos uma descrição."));
      return;
    }
    setBanner(null);
    const kmNum = parseNumberInput(km);
    const input: ServiceOrderInput = {
      date: toISODate(date),
      km: isNaN(kmNum) ? 0 : Math.round(kmNum),
      vehicle_plate: vehiclePlate.trim(),
      trailer_plate: trailerPlate.trim(),
      descriptions: cleaned,
    };
    const onSuccess = () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };
    const onError = (err: any) => setBanner(err?.message ?? t("Não foi possível salvar a OS."));
    if (editing && params.id) updateM.mutate({ id: params.id, input }, { onSuccess, onError });
    else createM.mutate(input, { onSuccess, onError });
  };

  const notFound = editing && !loadingList && !existing;

  return (
    <View style={styles.screen} testID="os-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="os-form-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>
          {editing
            ? t("Editar OS Nº {n}", { n: existing ? formatOsNumber(existing.number) : "" })
            : t("Nova OS")}
        </Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("OS não encontrada.")}</Text>
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
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          >
            {banner ? (
              <View style={styles.banner} testID="os-form-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            <Text style={styles.section}>{t("Dados da OS")}</Text>
            <DateInputField label={t("Data")} value={date} onChange={setDate} testID="field-os-date" />
            <TextField
              label={t("KM")}
              value={km}
              onChangeText={setKm}
              keyboardType="number-pad"
              placeholder="0"
              hint={t("Quilometragem atual do veículo na abertura da ordem de serviço.")}
              testID="field-os-km"
            />
            <TextField
              label={t("Matrícula do veículo")}
              value={vehiclePlate}
              onChangeText={setVehiclePlate}
              autoCapitalize="characters"
              placeholder={t("Matrícula do veículo")}
              hint={t("Placa do cavalo/caminhão que receberá o serviço.")}
              testID="field-os-vehicle-plate"
            />
            <TextField
              label={t("Matrícula do reboque")}
              value={trailerPlate}
              onChangeText={setTrailerPlate}
              autoCapitalize="characters"
              placeholder={t("Matrícula do reboque")}
              hint={t("Placa do reboque, quando o serviço for na composição. Pode ficar em branco.")}
              testID="field-os-trailer-plate"
            />

            <Text style={styles.section}>{t("Descrição do que é para ser feito")}</Text>
            {descriptions.map((d, i) => (
              <View key={i} style={styles.descRow} testID={`os-desc-row-${i}`}>
                <View style={styles.descNumBox}>
                  <Text style={styles.descNum}>{i + 1}.</Text>
                </View>
                <View style={styles.descField}>
                  <TextField
                    label={t("Descrição {n}", { n: i + 1 })}
                    value={d}
                    onChangeText={(text) => setDescAt(i, text)}
                    placeholder={t("Descreva o serviço")}
                    multiline
                    numberOfLines={2}
                    style={styles.multi}
                    testID={`field-os-desc-${i}`}
                  />
                </View>
                {descriptions.length > 1 ? (
                  <Pressable
                    onPress={() => removeDescription(i)}
                    style={styles.descDelBtn}
                    hitSlop={8}
                    testID={`os-desc-del-${i}`}
                  >
                    <Trash size={20} color={colors.error} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
            ))}

            <Pressable style={styles.addBtn} onPress={addDescription} testID="os-add-description">
              <PlusCircle size={22} color={colors.brandPrimary} weight="fill" />
              <Text style={styles.addBtnText}>{t("Nova inserção")}</Text>
            </Pressable>
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                testID="save-os-button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{editing ? t("Salvar alterações") : t("Salvar OS")}</Text>
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
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3, flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  dimText: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center" },
  content: { padding: 16, gap: 12 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.error },
  section: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    color: colors.brandPrimary,
    letterSpacing: 0.3,
    marginTop: 8,
  },
  multi: { minHeight: 56, textAlignVertical: "top" },
  descRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  descNumBox: { paddingTop: 34 },
  descNum: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.onSurface, width: 22 },
  descField: { flex: 1 },
  descDelBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandTertiary,
    marginTop: 4,
  },
  addBtnText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.brandPrimary, letterSpacing: 0.3 },
  saveBar: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
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
