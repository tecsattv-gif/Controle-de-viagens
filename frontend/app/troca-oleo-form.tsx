import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckSquare, FloppyDisk, Square, Warning, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDailyLogs } from "@/src/api/dailyLogs";
import {
  ControlMode,
  FILTER_KINDS,
  FILTER_LABELS,
  FilterKind,
  OIL_LABELS,
  OilChangeInput,
  OilComponent,
  OilKind,
  TimeUnit,
  computeNextDate,
  computeNextKm,
  maxKmFrom,
  oilChangeTotal,
  useCreateOilChange,
  useOilChanges,
  useUpdateOilChange,
} from "@/src/api/oilChanges";
import { useTrips } from "@/src/api/trips";
import { Vehicle, useVehicles, vehicleLabel, vehicleTitle } from "@/src/api/vehicles";
import { DateInputField } from "@/src/components/DateInputField";
import { SelectField } from "@/src/components/SelectField";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { money, parseISODate, parseNumberInput, toISODate } from "@/src/utils/format";

type OilDraft = {
  enabled: boolean;
  oil_type: string;
  brand: string;
  liters: string;
  value: string;
  control: ControlMode;
  interval_km: string;
  interval_time: string;
  time_unit: TimeUnit;
  alert_km: string;
  alert_days: string;
  label: string;
};

const emptyOil = (): OilDraft => ({
  enabled: false,
  oil_type: "",
  brand: "",
  liters: "",
  value: "",
  control: "km",
  interval_km: "",
  interval_time: "",
  time_unit: "months",
  alert_km: "",
  alert_days: "",
  label: "",
});

type FilterDraft = { enabled: boolean; brand: string; oil_type: string; quantity: string; value: string };
const emptyFilter = (): FilterDraft => ({ enabled: false, brand: "", oil_type: "", quantity: "", value: "" });

const numDec = (s: string) => {
  const n = parseNumberInput(s);
  return isNaN(n) ? 0 : n;
};
const numInt = (s: string) => {
  const n = parseInt(String(s).replace(/\D/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

export default function TrocaOleoFormScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;

  const { data: list, isLoading: loadingList } = useOilChanges();
  const existing = editing ? list?.find((x) => x.id === params.id) : undefined;
  const { data: vehicles } = useVehicles();
  const { data: trips } = useTrips();
  const { data: dailyLogs } = useDailyLogs();
  const suggestedKm = maxKmFrom(trips, dailyLogs, list);

  const createM = useCreateOilChange();
  const updateM = useUpdateOilChange();
  const saving = createM.isPending || updateM.isPending;

  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState(new Date());
  const [km, setKm] = useState("");
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");

  const [engine, setEngine] = useState<OilDraft>({ ...emptyOil(), enabled: true });
  const [gearbox, setGearbox] = useState<OilDraft>(emptyOil());
  const [diffEnabled, setDiffEnabled] = useState(false);
  const [traction, setTraction] = useState<"6x2" | "6x4">("6x2");
  const [diff1, setDiff1] = useState<OilDraft>({ ...emptyOil(), enabled: true });
  const [diff2, setDiff2] = useState<OilDraft>({ ...emptyOil(), enabled: true });
  const [steering, setSteering] = useState<OilDraft>(emptyOil());
  const [other, setOther] = useState<OilDraft>(emptyOil());

  const [filters, setFilters] = useState<Record<FilterKind, FilterDraft>>(() => {
    const o = {} as Record<FilterKind, FilterDraft>;
    FILTER_KINDS.forEach((k) => (o[k] = emptyFilter()));
    return o;
  });

  const [labor, setLabor] = useState("");
  const [otherCosts, setOtherCosts] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill suggested KM when creating.
  useEffect(() => {
    if (!editing && !km && suggestedKm > 0) setKm(String(suggestedKm));
  }, [editing, suggestedKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill when editing.
  useEffect(() => {
    if (!editing || !existing || prefilled) return;
    const toDraft = (c?: OilComponent): OilDraft =>
      c
        ? {
            enabled: c.enabled,
            oil_type: c.oil_type || "",
            brand: c.brand || "",
            liters: c.liters ? String(c.liters).replace(".", ",") : "",
            value: c.value ? String(c.value).replace(".", ",") : "",
            control: (c.control as ControlMode) || "km",
            interval_km: c.interval_km ? String(c.interval_km) : "",
            interval_time: c.interval_time ? String(c.interval_time) : "",
            time_unit: (c.time_unit as TimeUnit) || "months",
            alert_km: c.alert_km ? String(c.alert_km) : "",
            alert_days: c.alert_days ? String(c.alert_days) : "",
            label: c.label || "",
          }
        : emptyOil();
    const find = (k: OilKind) => existing.components?.find((c) => c.kind === k);
    setVehicleId(existing.vehicle_id || "");
    setDate(existing.date ? parseISODate(existing.date) : new Date());
    setKm(existing.km ? String(existing.km) : "");
    setPlace(existing.place || "");
    setNotes(existing.notes || "");
    setEngine(find("engine") ? toDraft(find("engine")) : { ...emptyOil(), enabled: true });
    const gb = find("gearbox");
    setGearbox(gb ? toDraft(gb) : emptyOil());
    const d1 = find("diff1");
    const d2 = find("diff2");
    setDiffEnabled(!!d1);
    setTraction(existing.traction === "6x4" ? "6x4" : "6x2");
    if (d1) setDiff1(toDraft(d1));
    if (d2) setDiff2(toDraft(d2));
    const st = find("steering");
    setSteering(st ? toDraft(st) : emptyOil());
    const ot = find("other");
    setOther(ot ? toDraft(ot) : emptyOil());
    const nf = {} as Record<FilterKind, FilterDraft>;
    FILTER_KINDS.forEach((k) => {
      const f = existing.filters?.find((x) => x.kind === k);
      nf[k] = f
        ? { enabled: true, brand: f.brand || "", oil_type: f.oil_type || "", quantity: f.quantity || "", value: f.value ? String(f.value).replace(".", ",") : "" }
        : emptyFilter();
    });
    setFilters(nf);
    setLabor(existing.labor_value ? String(existing.labor_value).replace(".", ",") : "");
    setOtherCosts(existing.other_costs ? String(existing.other_costs).replace(".", ",") : "");
    setPrefilled(true);
  }, [editing, existing, prefilled]);

  const mainKm = numInt(km);
  const mainDateISO = toISODate(date);

  const buildComponent = (kind: OilKind, d: OilDraft, withInterval: boolean): OilComponent => {
    const interval_km = withInterval ? numInt(d.interval_km) : 0;
    const interval_time = withInterval ? numInt(d.interval_time) : 0;
    const usesKm = withInterval && (d.control === "km" || d.control === "both");
    const usesTime = withInterval && (d.control === "time" || d.control === "both");
    return {
      kind,
      label: d.label || OIL_LABELS[kind],
      enabled: true,
      oil_type: d.oil_type.trim(),
      brand: d.brand.trim(),
      liters: numDec(d.liters),
      value: numDec(d.value),
      km: mainKm,
      date: mainDateISO,
      control: withInterval ? d.control : "km",
      interval_km,
      next_km: usesKm ? computeNextKm(mainKm, interval_km) : 0,
      interval_time,
      time_unit: d.time_unit,
      next_date: usesTime ? computeNextDate(mainDateISO, interval_time, d.time_unit) : "",
      alert_km: withInterval ? numInt(d.alert_km) : 0,
      alert_days: withInterval ? numInt(d.alert_days) : 0,
    };
  };

  const components = useMemo<OilComponent[]>(() => {
    const out: OilComponent[] = [];
    out.push(buildComponent("engine", engine, true));
    if (gearbox.enabled) out.push(buildComponent("gearbox", gearbox, true));
    if (diffEnabled) {
      out.push(buildComponent("diff1", diff1, true));
      if (traction === "6x4") out.push(buildComponent("diff2", diff2, true));
    }
    if (steering.enabled) out.push(buildComponent("steering", steering, false));
    if (other.enabled) out.push(buildComponent("other", other, false));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, gearbox, diffEnabled, traction, diff1, diff2, steering, other, km, date]);

  const filterItems = useMemo(
    () =>
      FILTER_KINDS.filter((k) => filters[k].enabled).map((k) => ({
        kind: k,
        label: FILTER_LABELS[k],
        brand: filters[k].brand.trim(),
        oil_type: filters[k].oil_type.trim(),
        quantity: filters[k].quantity.trim(),
        value: numDec(filters[k].value),
      })),
    [filters],
  );

  const total = oilChangeTotal(components, filterItems, numDec(labor), numDec(otherCosts));

  const handleSave = () => {
    if (!mainKm) {
      setBanner(t("Informe o KM da troca."));
      return;
    }
    setBanner(null);
    const vehicle = vehicles?.find((v) => v.id === vehicleId);
    const input: OilChangeInput = {
      vehicle_id: vehicleId,
      vehicle_label: vehicle ? vehicleLabel(vehicle) : "",
      vehicle_plate: vehicle ? vehicleTitle(vehicle) : "",
      current_km: suggestedKm,
      date: mainDateISO,
      km: mainKm,
      place: place.trim(),
      notes: notes.trim(),
      traction: diffEnabled ? traction : "",
      components,
      filters: filterItems,
      labor_value: numDec(labor),
      other_costs: numDec(otherCosts),
      total,
    };
    const onSuccess = () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };
    const onError = (err: any) => setBanner(err?.message ?? t("Não foi possível salvar a troca."));
    if (editing && params.id) updateM.mutate({ id: params.id, input }, { onSuccess, onError });
    else createM.mutate(input, { onSuccess, onError });
  };

  const vehicleOptions = (vehicles ?? []).map((v: Vehicle) => ({
    id: v.id,
    title: vehicleTitle(v),
    subtitle: vehicleLabel(v),
  }));

  const notFound = editing && !loadingList && !existing;

  return (
    <View style={styles.screen} testID="troca-oleo-form-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="troca-oleo-form-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{editing ? t("Editar troca") : t("Cadastrar Troca")}</Text>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Troca não encontrada.")}</Text>
        </View>
      ) : editing && loadingList && !prefilled ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : (
        <>
          <KeyboardAwareScrollView bottomOffset={92} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {banner ? (
              <View style={styles.banner} testID="troca-oleo-form-banner">
                <Warning size={18} color={colors.error} weight="bold" />
                <Text style={styles.bannerText}>{banner}</Text>
              </View>
            ) : null}

            {/* 1. Veículo */}
            <Text style={styles.section}>{t("Identificação do veículo")}</Text>
            <SelectField
              label={t("Veículo")}
              placeholder={t("Selecionar veículo")}
              value={vehicleId}
              options={vehicleOptions}
              onChange={setVehicleId}
              emptyHint={t("Nenhum veículo cadastrado.")}
              testID="field-oil-vehicle"
            />
            <View style={styles.kmHint}>
              <Text style={styles.kmHintText}>
                {t("KM atual estimado do veículo")}: {suggestedKm.toLocaleString("pt-BR")} km
              </Text>
              <Pressable onPress={() => setKm(String(suggestedKm))} testID="oil-use-current-km">
                <Text style={styles.kmHintLink}>{t("Usar")}</Text>
              </Pressable>
            </View>

            {/* 2. Dados da troca */}
            <Text style={styles.section}>{t("Dados da troca")}</Text>
            <View style={styles.row}>
              <DateInputField label={t("Data da troca")} value={date} onChange={setDate} testID="field-oil-date" />
            </View>
            <TextField label={t("KM da troca")} value={km} onChangeText={setKm} keyboardType="number-pad" placeholder="0" testID="field-oil-km" />
            <TextField label={t("Local / oficina")} value={place} onChangeText={setPlace} placeholder={t("Oficina ou local do serviço")} testID="field-oil-place" />
            <TextField label={t("Observações")} value={notes} onChangeText={setNotes} placeholder={t("Informações adicionais (opcional)")} multiline numberOfLines={2} style={styles.multi} testID="field-oil-notes" />

            {/* 3. Óleo do motor */}
            <OilCard kind="engine" title={t("Óleo do motor")} draft={engine} setDraft={setEngine} withInterval withToggle={false} baseKm={mainKm} baseDate={mainDateISO} testPrefix="engine" />

            {/* 4. Outros óleos */}
            <Text style={styles.section}>{t("Outros óleos")}</Text>

            <OilCard kind="gearbox" title={t("Óleo da caixa de marchas")} draft={gearbox} setDraft={setGearbox} withInterval withToggle baseKm={mainKm} baseDate={mainDateISO} testPrefix="gearbox" />

            {/* Diferencial */}
            <Pressable style={styles.checkRow} onPress={() => setDiffEnabled((v) => !v)} testID="toggle-diff">
              {diffEnabled ? <CheckSquare size={24} color={colors.brandPrimary} weight="fill" /> : <Square size={24} color={colors.muted} weight="regular" />}
              <Text style={styles.checkLabel}>{t("Óleo do diferencial")}</Text>
            </Pressable>
            {diffEnabled ? (
              <View style={styles.nested}>
                <Text style={styles.subLabel}>{t("Configuração de tração")}</Text>
                <View style={styles.optionRow}>
                  {(["6x2", "6x4"] as const).map((tr) => {
                    const active = traction === tr;
                    return (
                      <Pressable key={tr} style={[styles.optionBtn, active && styles.optionBtnActive]} onPress={() => setTraction(tr)} testID={`traction-${tr}`}>
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>{tr}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <OilCard kind="diff1" title={traction === "6x4" ? t("1º Diferencial") : t("Diferencial")} draft={diff1} setDraft={setDiff1} withInterval withToggle={false} baseKm={mainKm} baseDate={mainDateISO} testPrefix="diff1" />
                {traction === "6x4" ? (
                  <>
                    <Pressable style={styles.copyBtn} onPress={() => setDiff2({ ...diff1 })} testID="copy-diff">
                      <Text style={styles.copyText}>{t("Usar os mesmos dados do 1º diferencial")}</Text>
                    </Pressable>
                    <OilCard kind="diff2" title={t("2º Diferencial")} draft={diff2} setDraft={setDiff2} withInterval withToggle={false} baseKm={mainKm} baseDate={mainDateISO} testPrefix="diff2" />
                  </>
                ) : null}
              </View>
            ) : null}

            <OilCard kind="steering" title={t("Óleo da direção hidráulica")} draft={steering} setDraft={setSteering} withInterval={false} withToggle baseKm={mainKm} baseDate={mainDateISO} testPrefix="steering" />
            <OilCard kind="other" title={t("Outro óleo")} draft={other} setDraft={setOther} withInterval={false} withToggle withCustomLabel baseKm={mainKm} baseDate={mainDateISO} testPrefix="other-oil" />

            {/* Filtros */}
            <Text style={styles.section}>{t("Filtros")}</Text>
            {FILTER_KINDS.map((k) => {
              const f = filters[k];
              const set = (patch: Partial<FilterDraft>) => setFilters((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
              return (
                <View key={k}>
                  <Pressable style={styles.checkRow} onPress={() => set({ enabled: !f.enabled })} testID={`filter-${k}`}>
                    {f.enabled ? <CheckSquare size={24} color={colors.brandPrimary} weight="fill" /> : <Square size={24} color={colors.muted} weight="regular" />}
                    <Text style={styles.checkLabel}>{t(FILTER_LABELS[k])}</Text>
                  </Pressable>
                  {f.enabled ? (
                    <View style={styles.nested}>
                      <TextField label={t("Marca")} value={f.brand} onChangeText={(v) => set({ brand: v })} placeholder={t("Marca do filtro")} testID={`filter-${k}-brand`} />
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <TextField label={t("Quantidade")} value={f.quantity} onChangeText={(v) => set({ quantity: v })} placeholder="1" testID={`filter-${k}-qty`} />
                        </View>
                        <View style={{ width: 12 }} />
                        <View style={{ flex: 1 }}>
                          <TextField label={t("Valor")} value={f.value} onChangeText={(v) => set({ value: v })} keyboardType="decimal-pad" placeholder="0,00" testID={`filter-${k}-value`} />
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {/* Mão de obra e total */}
            <Text style={styles.section}>{t("Mão de obra e total")}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField label={t("Mão de obra")} value={labor} onChangeText={setLabor} keyboardType="decimal-pad" placeholder="0,00" testID="field-oil-labor" />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <TextField label={t("Outros custos")} value={otherCosts} onChangeText={setOtherCosts} keyboardType="decimal-pad" placeholder="0,00" testID="field-oil-other-costs" />
              </View>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalRowLabel}>{t("Valor total")}</Text>
              <Text style={styles.totalRowValue} testID="oil-total">{money(total)}</Text>
            </View>
          </KeyboardAwareScrollView>

          <KeyboardStickyView>
            <View style={styles.saveBar}>
              <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving} testID="save-troca-button">
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <FloppyDisk size={22} color={colors.onBrandPrimary} weight="bold" />
                    <Text style={styles.saveText}>{t("Salvar Troca")}</Text>
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

function OilCard({
  kind,
  title,
  draft,
  setDraft,
  withInterval,
  withToggle,
  withCustomLabel,
  baseKm,
  baseDate,
  testPrefix,
}: {
  kind: OilKind;
  title: string;
  draft: OilDraft;
  setDraft: (updater: (d: OilDraft) => OilDraft) => void;
  withInterval: boolean;
  withToggle: boolean;
  withCustomLabel?: boolean;
  baseKm: number;
  baseDate: string;
  testPrefix: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const set = (patch: Partial<OilDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const open = withToggle ? draft.enabled : true;

  const nextKm = withInterval && (draft.control === "km" || draft.control === "both") ? computeNextKm(baseKm, numInt(draft.interval_km)) : 0;
  const nextDate = withInterval && (draft.control === "time" || draft.control === "both") ? computeNextDate(baseDate, numInt(draft.interval_time), draft.time_unit) : "";

  return (
    <View style={styles.oilCard}>
      {withToggle ? (
        <Pressable style={styles.checkRow} onPress={() => set({ enabled: !draft.enabled })} testID={`toggle-${testPrefix}`}>
          {draft.enabled ? <CheckSquare size={24} color={colors.brandPrimary} weight="fill" /> : <Square size={24} color={colors.muted} weight="regular" />}
          <Text style={styles.checkLabel}>{title}</Text>
        </Pressable>
      ) : (
        <Text style={styles.oilTitle}>{title}</Text>
      )}

      {open ? (
        <View style={withToggle ? styles.nested : undefined}>
          {withCustomLabel ? (
            <TextField label={t("Nome do óleo")} value={draft.label} onChangeText={(v) => set({ label: v })} placeholder={t("Identificação")} testID={`${testPrefix}-label`} />
          ) : null}
          <TextField label={t("Tipo do óleo")} value={draft.oil_type} onChangeText={(v) => set({ oil_type: v })} placeholder={t("Ex.: 15W40")} testID={`${testPrefix}-type`} />
          <TextField label={t("Marca")} value={draft.brand} onChangeText={(v) => set({ brand: v })} placeholder={t("Marca do óleo")} testID={`${testPrefix}-brand`} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <TextField label={t("Quantidade (litros)")} value={draft.liters} onChangeText={(v) => set({ liters: v })} keyboardType="decimal-pad" placeholder="0" testID={`${testPrefix}-liters`} />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <TextField label={t("Valor")} value={draft.value} onChangeText={(v) => set({ value: v })} keyboardType="decimal-pad" placeholder="0,00" testID={`${testPrefix}-value`} />
            </View>
          </View>

          {withInterval ? (
            <>
              <Text style={styles.subLabel}>{t("Controlar próxima troca por")}</Text>
              <View style={styles.optionRow}>
                {(["km", "time", "both"] as ControlMode[]).map((m) => {
                  const active = draft.control === m;
                  const lbl = m === "km" ? t("Quilometragem") : m === "time" ? t("Tempo") : t("Quilometragem e tempo");
                  return (
                    <Pressable key={m} style={[styles.optionBtn, active && styles.optionBtnActive]} onPress={() => set({ control: m })} testID={`${testPrefix}-control-${m}`}>
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>{lbl}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {draft.control === "km" || draft.control === "both" ? (
                <>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <TextField label={t("Intervalo de troca (KM)")} value={draft.interval_km} onChangeText={(v) => set({ interval_km: v })} keyboardType="number-pad" placeholder="0" testID={`${testPrefix}-interval-km`} />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <TextField label={t("Avisar antes (KM)")} value={draft.alert_km} onChangeText={(v) => set({ alert_km: v })} keyboardType="number-pad" placeholder="0" testID={`${testPrefix}-alert-km`} />
                    </View>
                  </View>
                  {nextKm > 0 ? <Text style={styles.nextText}>{t("Próxima troca")}: {nextKm.toLocaleString("pt-BR")} km</Text> : null}
                </>
              ) : null}

              {draft.control === "time" || draft.control === "both" ? (
                <>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <TextField label={t("Trocar a cada")} value={draft.interval_time} onChangeText={(v) => set({ interval_time: v })} keyboardType="number-pad" placeholder="0" testID={`${testPrefix}-interval-time`} />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={{ flex: 1 }}>
                      <TextField label={t("Avisar antes (dias)")} value={draft.alert_days} onChangeText={(v) => set({ alert_days: v })} keyboardType="number-pad" placeholder="0" testID={`${testPrefix}-alert-days`} />
                    </View>
                  </View>
                  <View style={styles.optionRow}>
                    {(["months", "years"] as TimeUnit[]).map((u) => {
                      const active = draft.time_unit === u;
                      return (
                        <Pressable key={u} style={[styles.optionBtn, active && styles.optionBtnActive]} onPress={() => set({ time_unit: u })} testID={`${testPrefix}-unit-${u}`}>
                          <Text style={[styles.optionText, active && styles.optionTextActive]}>{u === "months" ? t("Meses") : t("Anos")}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {nextDate ? <Text style={styles.nextText}>{t("Próxima troca")}: {nextDate.split("-").reverse().join("/")}</Text> : null}
                </>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
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
  content: { padding: 16, paddingBottom: 120 },
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
  section: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    color: colors.brandPrimary,
    letterSpacing: 0.3,
    marginTop: 14,
    marginBottom: 10,
  },
  kmHint: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, marginTop: -4 },
  kmHintText: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  kmHintLink: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.brandPrimary },
  multi: { minHeight: 64, textAlignVertical: "top", paddingTop: 12 },
  oilCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  oilTitle: { fontFamily: fonts.displaySemiBold, fontSize: 17, color: colors.onSurface, marginBottom: 10 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  checkLabel: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  nested: { paddingLeft: 4, marginTop: 6 },
  subLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 6, marginTop: 4 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  optionBtn: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 90,
    height: 42,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  optionBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary, textAlign: "center" },
  optionTextActive: { color: colors.onBrandPrimary },
  nextText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.brandPrimary, marginBottom: 8 },
  copyBtn: { paddingVertical: 10, alignItems: "center", marginBottom: 6 },
  copyText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.brandPrimary },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.brandTertiary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  totalRowLabel: { fontFamily: fonts.body, fontSize: 13, fontWeight: "700", color: colors.onBrandTertiary },
  totalRowValue: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onBrandTertiary },
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
