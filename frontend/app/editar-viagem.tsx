import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlagCheckered, FloppyDisk, PathIcon as Path, Warning, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDrivers } from "@/src/api/drivers";
import { useTrips, useUpdateTrip } from "@/src/api/trips";
import { useVehicles, vehicleLabel, vehicleTitle } from "@/src/api/vehicles";
import { DateInputField } from "@/src/components/DateInputField";
import { SelectField } from "@/src/components/SelectField";
import { useT } from "@/src/i18n";
import { TextField } from "@/src/components/TextField";
import { CoordsRow, useCoordsField } from "@/src/components/PlaceCoords";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import {
  formatInt,
  parseISODate,
  toISODate,
} from "@/src/utils/format";
import { emptyFreight, freightFromTrip, freightToInput } from "@/src/utils/freight";

export default function EditarViagemScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string; fechar?: string }>();
  // Modo "fechar viagem": aberto automaticamente quando há viagem em aberto.
  const closing = params.fechar === "1";

  const { data: trips, isLoading } = useTrips();
  const existing = trips?.find((t) => t.id === params.id);
  const updateTrip = useUpdateTrip();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();

  const [date, setDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const [loading, setLoading] = useState("");
  const [unload, setUnload] = useState("");
  const loadGps = useCoordsField();
  const unloadGps = useCoordsField();
  const [notes, setNotes] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [freight, setFreight] = useState(emptyFreight);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (existing && !prefilled) {
      setDate(parseISODate(existing.date));
      // Ao fechar, sugere hoje como data final (se não for antes do carregamento).
      const today = new Date();
      const startISO = existing.date;
      const savedEnd = existing.end_date || existing.date;
      setEndDate(
        closing && savedEnd === startISO && toISODate(today) >= startISO
          ? today
          : parseISODate(savedEnd),
      );
      setKmStart(String(existing.km_start));
      setKmEnd(existing.km_end ? String(existing.km_end) : "");
      setLoading(existing.loading_place);
      setUnload(existing.unloading_place);
      loadGps.setCoords({ lat: existing.loading_lat || "", lng: existing.loading_lng || "" });
      unloadGps.setCoords({ lat: existing.unloading_lat || "", lng: existing.unloading_lng || "" });
      setNotes(existing.notes);
      setVehicleId(existing.vehicle_id || "");
      setDriverId(existing.driver_id || "");
      setFreight(freightFromTrip(existing));
      setPrefilled(true);
    }
  }, [existing, prefilled, closing]);

  const a = parseInt(kmStart, 10);
  const b = parseInt(kmEnd, 10);
  const bothValid = !isNaN(a) && !isNaN(b);
  const drivenKm = bothValid && b >= a ? b - a : 0;
  const kmError =
    bothValid && b < a ? "O KM final deve ser igual ou superior ao KM inicial" : undefined;

  const doSave = () => {
    const vehicle = (vehicles ?? []).find((v) => v.id === vehicleId);
    const driver = (drivers ?? []).find((d) => d.id === driverId);
    const dateISO = toISODate(date);
    const endISO = toISODate(endDate);
    updateTrip.mutate(
      {
        id: params.id as string,
        input: {
          date: dateISO,
          end_date: endISO,
          km_start: a,
          km_end: isNaN(b) ? 0 : b,
          start_time: existing?.start_time || "",
          end_time: existing?.end_time || "",
          loading_place: loading.trim(),
          unloading_place: unload.trim(),
          loading_lat: loadGps.coords.lat,
          loading_lng: loadGps.coords.lng,
          unloading_lat: unloadGps.coords.lat,
          unloading_lng: unloadGps.coords.lng,
          rest_stops:
            existing?.rest_stops && existing.rest_stops.length > 0
              ? existing.rest_stops
              : existing?.rest_place
                ? [existing.rest_place]
                : [],
          notes: notes.trim(),
          ...freightToInput(freight),
          vehicle_id: vehicleId,
          vehicle_label: vehicle ? vehicleLabel(vehicle) : "",
          driver_id: driverId,
          driver_name: driver ? driver.full_name : "",
          driver_license: driver ? driver.license_number : "",
        },
      },
      {
        onSuccess: () => {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          router.back();
        },
        onError: (err: any) => setBanner(err?.message ?? t("Não foi possível salvar as alterações.")),
      },
    );
  };

  const handleSave = () => {
    const next: Record<string, string> = {};
    if (!kmStart.trim()) next.kmStart = t("Informe o KM inicial");
    if (!loading.trim()) next.loading = t("Informe o local de carregamento");
    if (!isNaN(a) && !isNaN(b) && b < a) {
      next.kmEnd = t("O KM final deve ser igual ou superior ao KM inicial");
    }
    if (toISODate(endDate) < toISODate(date)) {
      next.endDate = t("A data final não pode ser anterior à data de carregamento");
    }
    if (closing) {
      if (!kmEnd.trim()) next.kmEnd = t("Informe o KM final para fechar a viagem");
      if (!unload.trim()) next.unloading = t("Informe o local de descarga");
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      setBanner(t("Verifique os campos destacados."));
      return;
    }
    setErrors({});
    setBanner(null);

    if (Platform.OS === "web") {
      doSave();
      return;
    }
    Alert.alert(
      closing ? t("Fechar viagem") : t("Salvar alterações"),
      closing ? t("Deseja fechar esta viagem?") : t("Deseja salvar as alterações desta viagem?"),
      [
      { text: t("Cancelar"), style: "cancel" },
      { text: closing ? t("Fechar") : t("Salvar"), onPress: doSave },
    ]);
  };

  const notFound = !isLoading && !existing;

  return (
    <View style={styles.screen} testID="editar-viagem-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="edit-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{closing ? t("Fechar viagem em aberto") : t("Editar viagem")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Viagem não encontrada.")}</Text>
        </View>
      ) : isLoading && !prefilled ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : (
        <>
          <KeyboardAwareScrollView bottomOffset={92} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {banner ? (
              <View style={styles.banner} testID="edit-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            {closing ? (
              <View style={styles.infoBanner} testID="closing-banner">
                <FlagCheckered size={18} color={colors.brandPrimary} weight="bold" />
                <Text style={styles.bannerText}>
                  {t("Você tem uma viagem em aberto. Informe a data final, o KM final e o local de descarga para fechá-la antes de cadastrar uma nova.")}
                </Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <DateInputField label={t("Data de Carregamento")} value={date} onChange={setDate} testID="edit-start-date" />
            </View>
            <View style={styles.row}>
              <DateInputField label={t("Data final da viagem")} value={endDate} onChange={setEndDate} error={errors.endDate} testID="edit-end-date" />
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField label={t("KM inicial")} value={kmStart} onChangeText={setKmStart} keyboardType="number-pad" placeholder="0" error={errors.kmStart} testID="edit-km-start" />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <TextField label={t("KM final")} value={kmEnd} onChangeText={setKmEnd} keyboardType="number-pad" placeholder="0" error={errors.kmEnd ?? kmError} testID="edit-km-end" />
              </View>
            </View>

            <View style={styles.drivenField} testID="edit-km-driven">
              <View style={styles.drivenLabelRow}>
                <Path size={16} color={colors.onBrandTertiary} weight="bold" />
                <Text style={styles.drivenLabel}>{t("KM RODADOS (automático)")}</Text>
              </View>
              <View style={styles.drivenValueRow}>
                <Text style={styles.drivenValue}>{formatInt(drivenKm)}</Text>
                <Text style={styles.drivenUnit}>km</Text>
              </View>
            </View>

            <TextField label={t("Local de carregamento")} value={loading} onChangeText={setLoading} placeholder={t("Ex.: Centro de distribuição")} error={errors.loading} onFocus={() => loadGps.capture()} testID="edit-loading" />
            <CoordsRow coords={loadGps.coords} locating={loadGps.locating} error={loadGps.error} onRefresh={() => loadGps.capture(true)} onClear={loadGps.clear} testID="edit-coords-loading" />
            <TextField label={t("Local de descarga")} value={unload} onChangeText={setUnload} placeholder={t("Ex.: Cliente / destino")} error={errors.unloading} onFocus={() => unloadGps.capture()} testID="edit-unloading" />
            <CoordsRow coords={unloadGps.coords} locating={unloadGps.locating} error={unloadGps.error} onRefresh={() => unloadGps.capture(true)} onClear={unloadGps.clear} testID="edit-coords-unloading" />

            <TextField label={t("Observações")} value={notes} onChangeText={setNotes} placeholder={t("Opcional")} multiline numberOfLines={3} style={styles.notesInput} testID="edit-notes" />

            <Text style={styles.sectionLabel}>{t("Veículo e motorista")}</Text>
            <SelectField
              label={t("Veículo / composição")}
              placeholder={t("Selecionar veículo (opcional)")}
              value={vehicleId}
              onChange={setVehicleId}
              options={(vehicles ?? []).map((v) => ({ id: v.id, title: vehicleTitle(v), subtitle: vehicleLabel(v) }))}
              emptyHint={t("Cadastre um veículo na aba Cadastros.")}
              testID="edit-select-vehicle"
            />
            <SelectField
              label={t("Motorista")}
              placeholder={t("Selecionar motorista (opcional)")}
              value={driverId}
              onChange={setDriverId}
              options={(drivers ?? []).map((d) => ({ id: d.id, title: d.full_name || t("Motorista"), subtitle: d.license_number ? t("CNH {n}", { n: d.license_number }) : undefined }))}
              emptyHint={t("Cadastre um motorista na aba Cadastros.")}
              testID="edit-select-driver"
            />
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable style={[styles.saveBtn, updateTrip.isPending && styles.saveBtnDisabled]} onPress={handleSave} disabled={updateTrip.isPending} testID="save-edit-trip-button">
                {updateTrip.isPending ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{closing ? t("Fechar viagem") : t("Salvar alterações")}</Text>
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
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  drivenField: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  drivenLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  drivenLabel: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.8, fontWeight: "700", color: colors.onBrandTertiary },
  drivenValueRow: { flexDirection: "row", alignItems: "flex-end" },
  drivenValue: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 34, color: colors.onBrandTertiary },
  drivenUnit: { fontFamily: fonts.display, fontSize: 16, color: colors.onBrandTertiary, marginLeft: 6, marginBottom: 3 },
  notesInput: { minHeight: 84, textAlignVertical: "top", paddingTop: 12 },
  sectionLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 6, marginTop: 4 },
  subLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 6 },
  currencyRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  currencyBtn: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  currencyBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  currencyText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  currencyTextActive: { color: colors.onBrandPrimary },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  stopInput: {
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
