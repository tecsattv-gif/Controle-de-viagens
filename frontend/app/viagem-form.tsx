import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { FloppyDisk, PathIcon as Path, Warning, X } from "phosphor-react-native";
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

import { useCreateTrip, useTrips } from "@/src/api/trips";
import { useVehicles, vehicleLabel, vehicleTitle } from "@/src/api/vehicles";
import { useDrivers } from "@/src/api/drivers";
import { DateInputField } from "@/src/components/DateInputField";
import { SelectField } from "@/src/components/SelectField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatInt, toISODate } from "@/src/utils/format";
import { emptyFreight, freightToInput } from "@/src/utils/freight";

export default function ViagemFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const createTrip = useCreateTrip();
  const { data: trips } = useTrips();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();

  const [redirected, setRedirected] = useState(false);

  // Se houver uma viagem "em aberto" (sem KM final), abre-a para edição.
  useEffect(() => {
    if (redirected || !trips) return;
    const open = [...trips]
      .sort((x, y) => (y.created_at || "").localeCompare(x.created_at || ""))
      .find((tp) => !tp.km_end || tp.km_end === 0);
    if (open) {
      setRedirected(true);
      router.replace({ pathname: "/editar-viagem", params: { id: open.id } });
    }
  }, [trips, redirected, router]);

  const [date, setDate] = useState(new Date());
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const [loading, setLoading] = useState("");
  const [unload, setUnload] = useState("");
  const [notes, setNotes] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const a = parseInt(kmStart, 10);
  const b = parseInt(kmEnd, 10);
  const bothValid = !isNaN(a) && !isNaN(b);
  // Live "KM rodados": KM final - KM inicial, never negative.
  const drivenKm = bothValid && b >= a ? b - a : 0;
  const kmError =
    bothValid && b < a
      ? "O KM final deve ser igual ou superior ao KM inicial"
      : undefined;

  const resetForm = () => {
    setKmStart("");
    setKmEnd("");
    setLoading("");
    setUnload("");
    setNotes("");
    setVehicleId("");
    setDriverId("");
    setDate(new Date());
    setErrors({});
  };

  const handleSave = () => {
    const next: Record<string, string> = {};
    if (!kmStart.trim()) next.kmStart = t("Informe o KM inicial");
    if (!loading.trim()) next.loading = t("Informe o local de carregamento");
    if (!isNaN(a) && !isNaN(b) && b < a) {
      next.kmEnd = t("O KM final deve ser igual ou superior ao KM inicial");
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setBanner(t("Verifique os campos destacados."));
      return;
    }

    setErrors({});
    setBanner(null);

    const vehicle = (vehicles ?? []).find((v) => v.id === vehicleId);
    const driver = (drivers ?? []).find((d) => d.id === driverId);

    createTrip.mutate(
      {
        date: toISODate(date),
        end_date: toISODate(date),
        km_start: a,
        km_end: isNaN(b) ? 0 : b,
        start_time: "",
        end_time: "",
        loading_place: loading.trim(),
        unloading_place: unload.trim(),
        rest_stops: [],
        notes: notes.trim(),
        ...freightToInput(emptyFreight),
        vehicle_id: vehicleId,
        vehicle_label: vehicle ? vehicleLabel(vehicle) : "",
        driver_id: driverId,
        driver_name: driver ? driver.full_name : "",
        driver_license: driver ? driver.license_number : "",
      },
      {
        onSuccess: () => {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          resetForm();
          router.back();
        },
        onError: (err: any) => {
          setBanner(err?.message ?? t("Não foi possível salvar a viagem."));
        },
      },
    );
  };

  return (
    <View style={styles.screen} testID="viagem-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={10}
          testID="viagem-form-close"
          accessibilityRole="button"
        >
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("Cadastrar Nova Viagem")}</Text>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={92}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {banner ? (
          <View style={styles.banner} testID="nova-banner">
            <Warning size={18} color={colors.error} weight="bold" />
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <DateInputField
            label={t("Data de Carregamento")}
            value={date}
            onChange={setDate}
            testID="field-start-date"
          />
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextField
              label={t("KM inicial")}
              value={kmStart}
              onChangeText={setKmStart}
              keyboardType="number-pad"
              placeholder="0"
              error={errors.kmStart}
              testID="field-km-start"
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <TextField
              label={t("KM final")}
              value={kmEnd}
              onChangeText={setKmEnd}
              keyboardType="number-pad"
              placeholder="0"
              error={errors.kmEnd ?? kmError}
              testID="field-km-end"
            />
          </View>
        </View>

        {/* KM rodados — read-only, auto-calculated */}
        <View style={styles.drivenField} testID="km-driven">
          <View style={styles.drivenLabelRow}>
            <Path size={16} color={colors.onBrandTertiary} weight="bold" />
            <Text style={styles.drivenLabel}>{t("KM RODADOS (automático)")}</Text>
          </View>
          <View style={styles.drivenValueRow}>
            <Text style={styles.drivenValue} testID="km-driven-value">
              {formatInt(drivenKm)}
            </Text>
            <Text style={styles.drivenUnit}>km</Text>
          </View>
        </View>

        <TextField
          label={t("Local de carregamento")}
          value={loading}
          onChangeText={setLoading}
          placeholder={t("Ex.: Centro de distribuição")}
          error={errors.loading}
          testID="field-loading"
        />
        <TextField
          label={t("Local de descarga")}
          value={unload}
          onChangeText={setUnload}
          placeholder={t("Ex.: Cliente / destino")}
          testID="field-unloading"
        />
        <TextField
          label={t("Observações")}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("Opcional")}
          multiline
          numberOfLines={3}
          style={styles.notesInput}
          testID="field-notes"
        />

        <Text style={styles.sectionLabel}>{t("Veículo e motorista")}</Text>
        <SelectField
          label={t("Veículo / composição")}
          placeholder={t("Selecionar veículo (opcional)")}
          value={vehicleId}
          onChange={setVehicleId}
          options={(vehicles ?? []).map((v) => ({
            id: v.id,
            title: vehicleTitle(v),
            subtitle: vehicleLabel(v),
          }))}
          emptyHint={t("Cadastre um veículo na aba Cadastros.")}
          testID="select-vehicle"
        />
        <SelectField
          label={t("Motorista")}
          placeholder={t("Selecionar motorista (opcional)")}
          value={driverId}
          onChange={setDriverId}
          options={(drivers ?? []).map((d) => ({
            id: d.id,
            title: d.full_name || t("Motorista"),
            subtitle: d.license_number ? t("CNH {n}", { n: d.license_number }) : undefined,
          }))}
          emptyHint={t("Cadastre um motorista na aba Cadastros.")}
          testID="select-driver"
        />
      </KeyboardAwareScrollView>

      <KeyboardStickyView>
        <View style={[styles.saveBar, { paddingBottom: 14 + (insets.bottom > 0 ? 0 : 0) }]}>
          <Pressable
            style={[styles.saveBtn, createTrip.isPending && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={createTrip.isPending}
            testID="save-trip-button"
            accessibilityRole="button"
          >
            {createTrip.isPending ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                <Text style={styles.saveText}>{t("Salvar Viagem")}</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardStickyView>
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
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 22,
    color: colors.onSurface,
    letterSpacing: 0.3,
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
  inlineError: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.error,
    marginTop: -6,
    marginBottom: 12,
  },
  drivenField: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandPrimary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  drivenLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  drivenLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: "700",
    color: colors.onBrandTertiary,
  },
  drivenValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  drivenValue: {
    fontFamily: fonts.displayBold,
    fontSize: 32,
    lineHeight: 34,
    color: colors.onBrandTertiary,
  },
  drivenUnit: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.onBrandTertiary,
    marginLeft: 6,
    marginBottom: 3,
  },
  notesInput: {
    minHeight: 84,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  sectionLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    marginBottom: 6,
  },
  subLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    marginBottom: 6,
  },
  currencyRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
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
  currencyBtnActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  currencyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
  },
  currencyTextActive: {
    color: colors.onBrandPrimary,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
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
  addBtnText: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "700",
    color: colors.brandPrimary,
  },
  saveBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
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
