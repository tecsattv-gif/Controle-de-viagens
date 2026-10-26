import { useLocalSearchParams, useRouter } from "expo-router";
import { PencilSimple, Truck, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Tire, useSaveTireConfig, useTireConfigs, useTireSettings, useTires } from "@/src/api/tires";
import { useVehicles, vehicleLabel, vehicleTitle } from "@/src/api/vehicles";
import { SelectField } from "@/src/components/SelectField";
import { TireMap } from "@/src/components/TireMap";
import { TrailerAxleEditor } from "@/src/components/TrailerAxleEditor";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import {
  CUSTOM_LAYOUT,
  ConfigUnit,
  DOLLY_LAYOUTS,
  TRUCK_LAYOUTS,
  configPositions,
  tireCount,
  unitAxleDefs,
} from "@/src/utils/axleMaps";

type Slot = { role: string; label: string; kind: "truck" | "trailer" | "dolly" };
type Axle = { dual: boolean };

const DEFAULT_TRAILER: Axle[] = [{ dual: true }, { dual: true }, { dual: true }];

export default function PneusMapaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ vehicleId?: string }>();

  const { data: vehicles, isLoading: loadingV } = useVehicles();
  const { data: configs } = useTireConfigs();
  const { data: settings } = useTireSettings();
  const saveConfig = useSaveTireConfig();

  const [vehicleId, setVehicleId] = useState("");
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [trailerAxles, setTrailerAxles] = useState<Record<string, Axle[]>>({});

  useEffect(() => {
    if (!vehicleId && vehicles && vehicles.length > 0) {
      setVehicleId(params.vehicleId || vehicles[0].id);
    }
  }, [vehicles, vehicleId, params.vehicleId]);

  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const { data: tires } = useTires(vehicleId);
  const config = configs?.find((c) => c.vehicle_id === vehicleId);

  // Slots (unidades) derivados do cadastro do veículo.
  const slots: Slot[] = useMemo(() => {
    if (!vehicle) return [];
    const out: Slot[] = [{ role: "truck", label: vehicle.truck_plate || t("Cavalo"), kind: "truck" }];
    const trailers = (vehicle.trailers || []).filter(Boolean);
    trailers.forEach((p, i) => out.push({ role: `trailer${i + 1}`, label: p, kind: "trailer" }));
    if (vehicle.uses_dolly) {
      out.push({ role: "dolly", label: vehicle.dolly_plate || t("Dolly"), kind: "dolly" });
      if (vehicle.dolly_trailer_plate)
        out.push({ role: `trailer${trailers.length + 1}`, label: vehicle.dolly_trailer_plate, kind: "trailer" });
    }
    return out;
  }, [vehicle, t]);

  // Eixos de um reboque: config deste veículo > mesma placa noutro veículo > padrão.
  const axlesForTrailer = (s: Slot): Axle[] => {
    const own = config?.units.find((u) => u.role === s.role);
    if (own) {
      const defs = unitAxleDefs(own.layout_key, own.axles);
      if (defs.length) return defs.map((d) => ({ dual: d.dual }));
    }
    for (const c of configs || []) {
      const u = c.units.find((x) => x.role.startsWith("trailer") && x.label && x.label === s.label);
      if (u) {
        const defs = unitAxleDefs(u.layout_key, u.axles);
        if (defs.length) return defs.map((d) => ({ dual: d.dual }));
      }
    }
    return DEFAULT_TRAILER;
  };

  const initEditor = () => {
    const init: Record<string, string> = {};
    const tAx: Record<string, Axle[]> = {};
    slots.forEach((s) => {
      if (s.kind === "trailer") {
        tAx[s.role] = axlesForTrailer(s);
        return;
      }
      const existing = config?.units.find((u) => u.role === s.role);
      init[s.role] = existing?.layout_key || (s.kind === "truck" ? "truck_6x2" : "dolly_2");
    });
    setSel(init);
    setTrailerAxles(tAx);
    setEditing(true);
  };

  // Abre o editor automaticamente quando não há configuração salva.
  useEffect(() => {
    if (!vehicleId) return;
    if (config) {
      setEditing(false);
    } else if (configs) {
      initEditor();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, configs, vehicleId, slots]);

  const openEditor = initEditor;

  const saveUnits = () => {
    const units: ConfigUnit[] = slots
      .filter((s) => (s.kind === "trailer" ? (trailerAxles[s.role] || []).length > 0 : sel[s.role]))
      .map((s) =>
        s.kind === "trailer"
          ? { role: s.role, label: s.label, layout_key: CUSTOM_LAYOUT, axles: trailerAxles[s.role] }
          : { role: s.role, label: s.label, layout_key: sel[s.role] },
      );
    saveConfig.mutate({ vehicle_id: vehicleId, units }, { onSuccess: () => setEditing(false) });
  };

  const positions = useMemo(() => (config ? configPositions(config.units) : []), [config]);
  const tiresByPos = useMemo(() => {
    const map: Record<string, Tire> = {};
    (tires || []).forEach((ti) => {
      if (ti.status === "installed" && ti.position_code) map[ti.position_code] = ti;
    });
    return map;
  }, [tires]);

  // Pneus instalados em posições que já não existem no mapa (ex.: eixo passou de duplo a simples).
  const orphanTires = useMemo(() => {
    const codes = new Set(positions.map((p) => p.code));
    return (tires || []).filter((ti) => ti.status === "installed" && ti.position_code && !codes.has(ti.position_code));
  }, [tires, positions]);

  const editorTotal = slots.reduce((n, s) => {
    if (s.kind === "trailer") return n + tireCount(trailerAxles[s.role] || []);
    return n + tireCount(unitAxleDefs(sel[s.role] || ""));
  }, 0);

  const onPressPosition = (code: string, tire?: Tire) => {
    if (tire) router.push({ pathname: "/pneu-detalhe", params: { id: tire.id } });
    else router.push({ pathname: "/pneu-form", params: { vehicleId, position: code } });
  };

  const vehicleOptions = (vehicles || []).map((v) => ({ id: v.id, title: vehicleTitle(v), subtitle: vehicleLabel(v) }));

  return (
    <View style={styles.screen} testID="pneus-mapa-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="mapa-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Mapa dos Pneus")}</Text>
      </View>

      {loadingV ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : !vehicles || vehicles.length === 0 ? (
        <View style={styles.centered}>
          <Truck size={54} color={colors.muted} weight="regular" />
          <Text style={styles.dim}>{t("Cadastre um veículo primeiro em Cadastros.")}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        >
          <SelectField
            label={t("Veículo")}
            placeholder={t("Selecione o veículo")}
            value={vehicleId}
            options={vehicleOptions}
            onChange={(id) => id && setVehicleId(id)}
            testID="mapa-vehicle-select"
          />

          {vehicle ? (
            <View style={styles.vehicleCard}>
              <Text style={styles.vehiclePlate}>{vehicle.truck_plate || t("Sem placa")}</Text>
              {vehicle.truck_brand || vehicle.truck_model ? (
                <Text style={styles.vehicleSub}>{[vehicle.truck_brand, vehicle.truck_model].filter(Boolean).join(" · ")}</Text>
              ) : null}
              <Text style={styles.vehicleSub}>{vehicleLabel(vehicle)}</Text>
            </View>
          ) : null}

          {editing ? (
            <View style={styles.editor} testID="axle-config-editor">
              <Text style={styles.section}>{t("Configuração dos eixos")}</Text>
              <Text style={styles.hint}>{t("Escolha o modelo de eixos de cada unidade da composição.")}</Text>
              {slots.map((s) => {
                if (s.kind === "trailer") {
                  return (
                    <TrailerAxleEditor
                      key={s.role}
                      title={`${t("Reboque")} · ${s.label}`}
                      roleKey={s.role}
                      axles={trailerAxles[s.role] || DEFAULT_TRAILER}
                      onChange={(ax) => setTrailerAxles((prev) => ({ ...prev, [s.role]: ax }))}
                    />
                  );
                }
                const list = s.kind === "truck" ? TRUCK_LAYOUTS : DOLLY_LAYOUTS;
                return (
                  <SelectField
                    key={s.role}
                    label={`${s.kind === "truck" ? t("Cavalo") : t("Dolly")} · ${s.label}`}
                    placeholder={t("Selecione o modelo")}
                    value={sel[s.role] || ""}
                    options={list.map((l) => ({ id: l.key, title: t(l.name) }))}
                    onChange={(id) => setSel((prev) => ({ ...prev, [s.role]: id }))}
                    testID={`axle-select-${s.role}`}
                  />
                );
              })}
              <Text style={styles.editorTotal} testID="editor-total-tires">
                {t("Total de pneus da composição: {n}", { n: editorTotal })}
              </Text>
              <Pressable style={styles.saveBtn} onPress={saveUnits} disabled={saveConfig.isPending} testID="save-axle-config">
                {saveConfig.isPending ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.saveText}>{t("Salvar configuração")}</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.mapHead}>
                <Text style={styles.hint}>{t("Toque numa posição vazia para cadastrar; num pneu para ver detalhes.")}</Text>
                <Pressable style={styles.editAxleBtn} onPress={openEditor} testID="edit-axle-config">
                  <PencilSimple size={16} color={colors.brandPrimary} weight="bold" />
                  <Text style={styles.editAxleTxt}>{t("Editar eixos")}</Text>
                </Pressable>
              </View>
              {positions.length > 0 && settings ? (
                <TireMap positions={positions} tiresByPos={tiresByPos} settings={settings} onPressPosition={onPressPosition} />
              ) : (
                <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
              )}
              {orphanTires.length > 0 ? (
                <View style={styles.orphanBox} testID="orphan-tires">
                  <Text style={styles.orphanTitle}>⚠️ {t("Pneus fora do mapa atual")}</Text>
                  <Text style={styles.hint}>
                    {t("Estes pneus estão em posições que deixaram de existir após editar os eixos. Os dados e o histórico foram preservados — toque para mover para uma nova posição.")}
                  </Text>
                  {orphanTires.map((ti) => (
                    <Pressable
                      key={ti.id}
                      style={styles.orphanRow}
                      onPress={() => router.push({ pathname: "/pneu-detalhe", params: { id: ti.id } })}
                      testID={`orphan-tire-${ti.id}`}
                    >
                      <Text style={styles.orphanText}>
                        {ti.number || "—"} · {ti.brand || "—"} · {ti.position_code}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  dim: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center" },
  content: { padding: 16, gap: 8 },
  vehicleCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  vehiclePlate: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.5 },
  vehicleSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  editor: { gap: 2 },
  section: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.brandPrimary, letterSpacing: 0.3 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginBottom: 8, flex: 1 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    marginTop: 6,
  },
  saveText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.3, color: colors.onBrandPrimary },
  mapHead: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6 },
  editAxleBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 },
  editAxleTxt: { fontFamily: fonts.displaySemiBold, fontSize: 13, color: colors.brandPrimary },
  editorTotal: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface, textAlign: "center", marginTop: 8 },
  orphanBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surfaceSecondary,
    gap: 6,
  },
  orphanTitle: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface },
  orphanRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  orphanText: { fontFamily: fonts.body, fontSize: 14, color: colors.brandPrimary },
}));
