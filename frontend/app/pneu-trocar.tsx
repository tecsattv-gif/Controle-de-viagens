import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Tire, useMoveTire, useTireConfigs, useTires } from "@/src/api/tires";
import { useTrips } from "@/src/api/trips";
import { useVehicles, vehicleTitle } from "@/src/api/vehicles";
import { DateInputField } from "@/src/components/DateInputField";
import { SelectField } from "@/src/components/SelectField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { configPositions, positionLabel } from "@/src/utils/axleMaps";
import { parseNumberInput, toISODate } from "@/src/utils/format";
import { vehicleCurrentKm } from "@/src/utils/tireKm";

export default function PneuTrocarScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();

  const { data: allTires } = useTires();
  const tire = allTires?.find((x) => x.id === params.id);
  const { data: vehicles } = useVehicles();
  const { data: configs } = useTireConfigs();
  const { data: trips } = useTrips();
  const moveM = useMoveTire();

  const [targetVehicle, setTargetVehicle] = useState("");
  const [targetPos, setTargetPos] = useState("");
  const [date, setDate] = useState(new Date());
  const [km, setKm] = useState("");
  const [kmTouched, setKmTouched] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (tire && !targetVehicle) setTargetVehicle(tire.vehicle_id);
  }, [tire, targetVehicle]);

  const currentKm = vehicleCurrentKm(targetVehicle, trips);
  useEffect(() => {
    if (!kmTouched && currentKm != null) setKm(String(currentKm));
  }, [currentKm, kmTouched]);

  const config = configs?.find((c) => c.vehicle_id === targetVehicle);
  const positions = useMemo(() => (config ? configPositions(config.units) : []), [config]);
  const occupied = useMemo(() => {
    const map: Record<string, Tire> = {};
    (allTires || []).forEach((ti) => {
      if (ti.vehicle_id === targetVehicle && ti.status === "installed" && ti.position_code && ti.id !== tire?.id) {
        map[ti.position_code] = ti;
      }
    });
    return map;
  }, [allTires, targetVehicle, tire]);

  if (!tire) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.dim}>{t("Pneu não encontrado.")}</Text>
      </View>
    );
  }

  const confirmMove = (toPosition: string) => {
    setBanner(null);
    const kmNum = parseNumberInput(km);
    moveM.mutate(
      {
        id: tire.id,
        to_position: toPosition,
        vehicle_id: targetVehicle,
        km: isNaN(kmNum) ? 0 : Math.round(kmNum),
        date: toISODate(date),
      },
      {
        onSuccess: () => {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: (err: any) => setBanner(err?.message ?? t("Não foi possível mover o pneu.")),
      },
    );
  };

  const vehicleOptions = (vehicles || []).map((v) => ({ id: v.id, title: vehicleTitle(v) }));
  const curPosLabel = tire.status === "removed" ? t("Retirado") : positionLabel(tire.position_code, positions);

  return (
    <View style={styles.screen} testID="pneu-trocar-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="trocar-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Trocar Posição")}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {banner ? <Text style={styles.banner}>{banner}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("Pneu")}</Text>
          <Text style={styles.cardValue}>{tire.number} · {tire.brand || "—"}</Text>
          <Text style={[styles.cardLabel, { marginTop: 8 }]}>{t("Posição atual")}</Text>
          <Text style={styles.cardValue}>{curPosLabel || "—"}</Text>
        </View>

        <SelectField
          label={t("Veículo de destino")}
          placeholder={t("Selecione o veículo")}
          value={targetVehicle}
          options={vehicleOptions}
          onChange={(id) => id && setTargetVehicle(id)}
          testID="trocar-vehicle-select"
        />
        <DateInputField label={t("Data")} value={date} onChange={setDate} testID="field-trocar-date" />
        <TextField
          label={t("KM do veículo")}
          value={km}
          onChangeText={(v) => {
            setKm(v);
            setKmTouched(true);
          }}
          keyboardType="number-pad"
          placeholder="0"
          testID="field-trocar-km"
        />

        <Text style={styles.section}>{t("Escolha a nova posição")}</Text>
        <Text style={styles.hint}>{t("Posições ocupadas farão a troca entre os dois pneus (mesmo veículo).")}</Text>
        <View style={styles.grid}>
          {positions.map((p) => {
            const occ = occupied[p.code];
            const isCurrent = tire.position_code === p.code && tire.vehicle_id === targetVehicle;
            return (
              <Pressable
                key={p.code}
                style={[styles.posBtn, occ && styles.posBtnOcc, isCurrent && styles.posBtnCurrent]}
                disabled={isCurrent || moveM.isPending}
                onPress={() => confirmMove(p.code)}
                testID={`trocar-pos-${p.code}`}
              >
                <Text style={styles.posCode}>{p.code}</Text>
                <Text style={styles.posSub} numberOfLines={1}>
                  {isCurrent ? t("Atual") : occ ? `${t("Ocupado")} ${occ.number}` : t("Livre")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tire.status === "installed" ? (
          <Pressable style={styles.removeBtn} onPress={() => confirmMove("")} disabled={moveM.isPending} testID="trocar-remove">
            {moveM.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.removeTxt}>{t("Retirar pneu do veículo")}</Text>}
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { alignItems: "center", justifyContent: "center" },
  dim: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
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
  content: { padding: 16, gap: 10 },
  banner: { fontFamily: fonts.body, fontSize: 13, color: colors.error },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  cardLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  cardValue: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface, marginTop: 2 },
  section: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.brandPrimary, marginTop: 6 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  posBtn: {
    width: "31%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  posBtnOcc: { borderColor: colors.warning },
  posBtnCurrent: { opacity: 0.45 },
  posCode: { fontFamily: fonts.displayBold, fontSize: 13, color: colors.onSurface },
  posSub: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 },
  removeBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  removeTxt: { fontFamily: fonts.displayBold, fontSize: 16, color: "#FFFFFF" },
}));
