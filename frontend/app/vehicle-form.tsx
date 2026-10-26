import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckSquare, FloppyDisk, Plus, Square, Warning, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCreateVehicle, useUpdateVehicle, useVehicles } from "@/src/api/vehicles";
import { PhotoPicker } from "@/src/components/PhotoPicker";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function VehicleFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;

  const { data: vehicles, isLoading } = useVehicles();
  const existing = editing ? vehicles?.find((v) => v.id === params.id) : undefined;

  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const saving = createVehicle.isPending || updateVehicle.isPending;

  const [truckBrand, setTruckBrand] = useState("");
  const [company, setCompany] = useState("");
  const [truckPlate, setTruckPlate] = useState("");
  const [truckModel, setTruckModel] = useState("");
  const [trailers, setTrailers] = useState<string[]>([""]);
  const [usesDolly, setUsesDolly] = useState(false);
  const [dollyPlate, setDollyPlate] = useState("");
  const [dollyTrailerPlate, setDollyTrailerPlate] = useState("");
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (editing && existing && !prefilled) {
      setCompany(existing.company);
      setTruckBrand(existing.truck_brand);
      setTruckPlate(existing.truck_plate);
      setTruckModel(existing.truck_model);
      setTrailers(existing.trailers?.length ? existing.trailers : [""]);
      setUsesDolly(existing.uses_dolly);
      setDollyPlate(existing.dolly_plate);
      setDollyTrailerPlate(existing.dolly_trailer_plate);
      setPhoto(existing.photo_path || "");
      setPrefilled(true);
    }
  }, [editing, existing, prefilled]);

  const updateTrailer = (i: number, v: string) =>
    setTrailers((prev) => prev.map((t, idx) => (idx === i ? v : t)));
  const addTrailer = () => setTrailers((prev) => [...prev, ""]);
  const removeTrailer = (i: number) =>
    setTrailers((prev) => (prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i)));

  const handleSave = () => {
    if (!truckPlate.trim()) {
      setError(t("Informe a matrícula/placa do cavalo."));
      return;
    }
    setError(null);
    const input = {
      company: company.trim(),
      truck_brand: truckBrand.trim(),
      truck_plate: truckPlate.trim().toUpperCase(),
      truck_model: truckModel.trim(),
      trailers: trailers.map((t) => t.trim().toUpperCase()).filter(Boolean),
      uses_dolly: usesDolly,
      dolly_plate: usesDolly ? dollyPlate.trim().toUpperCase() : "",
      dolly_trailer_plate: usesDolly ? dollyTrailerPlate.trim().toUpperCase() : "",
      photo_path: photo,
    };
    const onSuccess = () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };
    const onError = (err: any) => setError(err?.message ?? t("Não foi possível salvar."));
    if (editing && params.id) {
      updateVehicle.mutate({ id: params.id, input }, { onSuccess, onError });
    } else {
      createVehicle.mutate(input, { onSuccess, onError });
    }
  };

  const notFound = editing && !isLoading && !existing;

  return (
    <View style={styles.screen} testID="vehicle-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="vehicle-form-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar veículo") : t("Novo veículo")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Veículo não encontrado.")}</Text>
        </View>
      ) : (
        <>
          <KeyboardAwareScrollView bottomOffset={92} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {error ? (
              <View style={styles.banner}>
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.groupLabel}>{t("Cavalo mecânico")}</Text>
            <PhotoPicker label={t("Foto do veículo")} value={photo} onChange={setPhoto} testID="vehicle-photo" />
            <TextField label={t("Empresa")} value={company} onChangeText={setCompany} placeholder={t("Ex.: Transportes Silva")} testID="field-company" />
            <TextField label={t("Marca do cavalo")} value={truckBrand} onChangeText={setTruckBrand} placeholder={t("Ex.: Volvo, Scania")} testID="field-truck-brand" />
            <TextField label={t("Matrícula / placa do cavalo")} value={truckPlate} onChangeText={setTruckPlate} placeholder={t("Ex.: ABC-1234")} autoCapitalize="characters" testID="field-truck-plate" />
            <TextField label={t("Marca / modelo (opcional)")} value={truckModel} onChangeText={setTruckModel} placeholder={t("Ex.: FH 540")} testID="field-truck-model" />

            <Text style={styles.groupLabel}>{t("Reboques")}</Text>
            {trailers.map((tr, i) => (
              <View key={i} style={styles.trailerRow}>
                <TextInput
                  value={tr}
                  onChangeText={(v) => updateTrailer(i, v)}
                  placeholder={t("Placa do reboque {n}", { n: i + 1 })}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  style={styles.trailerInput}
                  testID={`field-trailer-${i}`}
                />
                {trailers.length > 1 ? (
                  <Pressable onPress={() => removeTrailer(i)} style={styles.removeBtn} hitSlop={8} testID={`remove-trailer-${i}`}>
                    <X size={18} color={colors.error} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
            ))}
            <Pressable onPress={addTrailer} style={styles.addBtn} testID="add-trailer">
              <Plus size={18} color={colors.brandPrimary} weight="bold" />
              <Text style={styles.addBtnText}>{t("Adicionar outro reboque")}</Text>
            </Pressable>

            <Pressable style={styles.checkRow} onPress={() => setUsesDolly((v) => !v)} testID="toggle-dolly">
              {usesDolly ? (
                <CheckSquare size={24} color={colors.brandPrimary} weight="fill" />
              ) : (
                <Square size={24} color={colors.muted} weight="regular" />
              )}
              <Text style={styles.checkLabel}>{t("Usa Dolly")}</Text>
            </Pressable>

            {usesDolly ? (
              <>
                <TextField label={t("Matrícula / placa do Dolly")} value={dollyPlate} onChangeText={setDollyPlate} placeholder={t("Ex.: DLY-0001")} autoCapitalize="characters" testID="field-dolly-plate" />
                <TextField label={t("Placa do reboque ligado ao Dolly")} value={dollyTrailerPlate} onChangeText={setDollyTrailerPlate} placeholder={t("Opcional")} autoCapitalize="characters" testID="field-dolly-trailer" />
              </>
            ) : null}
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving} testID="save-vehicle-button">
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar veículo")}</Text>
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
    marginTop: 4,
    marginBottom: 8,
  },
  trailerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  trailerInput: {
    flex: 1,
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
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
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
    marginBottom: 16,
  },
  addBtnText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.brandPrimary },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, marginBottom: 8 },
  checkLabel: { fontFamily: fonts.body, fontSize: 16, color: colors.onSurface },
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
