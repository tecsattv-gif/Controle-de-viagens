import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FloppyDisk, Warning, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  TireInput,
  useCreateTire,
  useTireConfigs,
  useTires,
  useUpdateTire,
} from "@/src/api/tires";
import { useVehicles, vehicleTitle } from "@/src/api/vehicles";
import { DateInputField } from "@/src/components/DateInputField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { configPositions, positionLabel } from "@/src/utils/axleMaps";
import { parseISODate, parseNumberInput, toISODate } from "@/src/utils/format";

export default function PneuFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string; vehicleId?: string; position?: string }>();
  const editing = !!params.id;

  const { data: tires, isLoading } = useTires();
  const existing = editing ? tires?.find((x) => x.id === params.id) : undefined;
  const { data: vehicles } = useVehicles();
  const { data: configs } = useTireConfigs();

  const createM = useCreateTire();
  const updateM = useUpdateTire();
  const saving = createM.isPending || updateM.isPending;

  const vehicleId = editing ? existing?.vehicle_id || "" : params.vehicleId || "";
  const positionCode = editing ? existing?.position_code || "" : params.position || "";
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const config = configs?.find((c) => c.vehicle_id === vehicleId);
  const posLabel = useMemo(() => {
    if (!config) return positionCode;
    return positionLabel(positionCode, configPositions(config.units));
  }, [config, positionCode]);

  const [number, setNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [installDate, setInstallDate] = useState(new Date());
  const [installKm, setInstallKm] = useState("");
  const [tread, setTread] = useState("");
  const [notes, setNotes] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!editing || !existing || prefilled) return;
    setNumber(existing.number || "");
    setBrand(existing.brand || "");
    setSize(existing.size || "");
    setInstallDate(existing.install_date ? parseISODate(existing.install_date) : new Date());
    setInstallKm(existing.install_km ? String(existing.install_km) : "");
    setTread(existing.current_tread_mm ? String(existing.current_tread_mm) : "");
    setNotes(existing.notes || "");
    setPrefilled(true);
  }, [editing, existing, prefilled]);

  const save = () => {
    if (!number.trim()) {
      setBanner(t("Informe o número do pneu."));
      return;
    }
    setBanner(null);
    const kmNum = parseNumberInput(installKm);
    const treadNum = parseNumberInput(tread);
    const onSuccess = () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };
    const onError = (err: any) => setBanner(err?.message ?? t("Não foi possível salvar o pneu."));
    if (editing && params.id) {
      const input: Partial<TireInput> = {
        number: number.trim(),
        brand: brand.trim(),
        size: size.trim(),
        install_date: toISODate(installDate),
        install_km: isNaN(kmNum) ? 0 : Math.round(kmNum),
        current_tread_mm: isNaN(treadNum) ? 0 : treadNum,
        notes: notes.trim(),
      };
      updateM.mutate({ id: params.id, input }, { onSuccess, onError });
    } else {
      const input: TireInput = {
        number: number.trim(),
        brand: brand.trim(),
        size: size.trim(),
        install_date: toISODate(installDate),
        install_km: isNaN(kmNum) ? 0 : Math.round(kmNum),
        current_tread_mm: isNaN(treadNum) ? 0 : treadNum,
        notes: notes.trim(),
        vehicle_id: vehicleId,
        position_code: positionCode,
      };
      createM.mutate(input, { onSuccess, onError });
    }
  };

  if (editing && isLoading && !prefilled) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="pneu-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="pneu-form-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar Pneu") : t("Cadastrar Pneu")}</Text>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={92}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {banner ? (
          <View style={styles.banner} testID="pneu-form-banner">
            <Warning size={18} color={colors.error} weight="bold" />
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        ) : null}

        <View style={styles.posCard}>
          <Text style={styles.posLabel}>{t("Veículo")}</Text>
          <Text style={styles.posValue}>{vehicle ? vehicleTitle(vehicle) : "—"}</Text>
          <Text style={[styles.posLabel, { marginTop: 8 }]}>{t("Posição")}</Text>
          <Text style={styles.posValue}>{posLabel || "—"}</Text>
        </View>

        <TextField label={t("Número do pneu")} value={number} onChangeText={setNumber} placeholder="001" hint={t("Identificação única do pneu. Use o número gravado ou um código que você controle.")} testID="field-tire-number" />
        <TextField label={t("Marca")} value={brand} onChangeText={setBrand} placeholder={t("Marca")} testID="field-tire-brand" />
        <TextField label={t("Medida")} value={size} onChangeText={setSize} placeholder="295/80 R22.5" hint={t("Dimensão do pneu, como 295/80 R22.5.")} testID="field-tire-size" />
        <DateInputField label={t("Data de instalação")} value={installDate} onChange={setInstallDate} testID="field-tire-date" />
        <TextField label={t("KM de instalação")} value={installKm} onChangeText={setInstallKm} keyboardType="number-pad" placeholder="0" hint={t("Quilometragem do veículo no dia em que o pneu foi instalado. Serve de base para calcular os KM percorridos.")} testID="field-tire-km" />
        <TextField label={t("Profundidade do sulco (mm)")} value={tread} onChangeText={setTread} keyboardType="decimal-pad" placeholder="0" hint={t("Altura atual do sulco em milímetros. Define a cor do pneu no mapa (verde/amarelo/vermelho).")} testID="field-tire-tread" />
        <TextField label={t("Observações (opcional)")} value={notes} onChangeText={setNotes} placeholder={t("Observações")} multiline numberOfLines={2} style={styles.multi} testID="field-tire-notes" />
      </KeyboardAwareScrollView>

      <KeyboardStickyView>
        <View style={styles.saveBar}>
          <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={save} disabled={saving} testID="save-tire-button">
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                <Text style={styles.saveText}>{t("Salvar")}</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3 },
  content: { padding: 16, gap: 4 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  bannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.error },
  posCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  posLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  posValue: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface, marginTop: 2 },
  multi: { minHeight: 56, textAlignVertical: "top" },
  saveBar: { padding: 16, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
  },
  disabled: { opacity: 0.6 },
  saveText: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.5, color: colors.onBrandPrimary },
}));
