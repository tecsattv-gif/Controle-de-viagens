import { Image } from "expo-image";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CaretLeft,
  CaretRight,
  CalendarCheck,
  Check,
  GasPump,
  PathIcon as Path,
  Warning,
  PlusCircle,
  Swap,
  Truck,
  User,
  X,
} from "phosphor-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTrips } from "@/src/api/trips";
import { useDailyLogs, dailyKm } from "@/src/api/dailyLogs";
import { useMonthlyKm } from "@/src/api/monthlyKm";
import { maxKmFrom, oilChangeAlerts, useOilChanges } from "@/src/api/oilChanges";
import { useRefuelings } from "@/src/api/refuelings";
import { useVehicles } from "@/src/api/vehicles";
import { useDrivers } from "@/src/api/drivers";
import { HELP_WIZARD_KEY } from "@/src/utils/wizard";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { fileUrl } from "@/src/utils/upload";
import { computeFreightTotals } from "@/src/utils/freight";
import { ProfitChart } from "@/src/components/ProfitChart";
import { useT } from "@/src/i18n";
import {
  currentMonthKey,
  formatDecimal,
  formatInt,
  formatMonthLabel,
  getAppCurrencySymbol,
  money,
  monthKey,
  shiftMonth,
  todayISODate,
} from "@/src/utils/format";

const SELECTED_VEHICLE_KEY = "selectedVehicleId";

// Dynamic font sizing so long numbers never get cut / ellipsized.
function heroFontSize(value: string): number {
  const len = value.length;
  if (len <= 4) return 64;
  if (len <= 6) return 52;
  if (len <= 8) return 42;
  return 34;
}

function totalFontSize(value: string): number {
  const len = value.length;
  if (len <= 6) return 30;
  if (len <= 8) return 24;
  return 19;
}

function statValueSize(value: string): number {
  const len = value.length;
  if (len <= 4) return 30;
  if (len <= 6) return 25;
  if (len <= 8) return 20;
  return 16;
}

function StatCard({
  label,
  value,
  unit,
  testID,
}: {
  label: string;
  value: string;
  unit?: string;
  testID?: string;
}) {
  const styles = useStyles();
  const size = statValueSize(value);
  return (
    <View style={styles.statCard} testID={testID}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { fontSize: size, lineHeight: size + 2 }]}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function FinTable({
  rows,
  strong,
}: {
  rows: [string, number][];
  strong?: boolean;
}) {
  const styles = useStyles();
  return (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.finLine}>
          <Text style={[styles.finLineLabel, strong && styles.finLineStrong]}>{label}</Text>
          <Text style={[styles.finLineVal, strong && styles.finLineStrong]}>{money(value)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ResumoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, isError, refetch, isRefetching } = useTrips();
  const { data: refuelData } = useRefuelings();
  const { data: vehicleData } = useVehicles();
  const { data: driverData } = useDrivers();
  const { data: dailyLogData } = useDailyLogs();
  const { data: monthlyData } = useMonthlyKm();
  const { data: oilData } = useOilChanges();

  const oilCurrentKm = maxKmFrom(data, dailyLogData, oilData);
  const oilAlerts = oilChangeAlerts(oilData ?? [], oilCurrentKm);
  const oilOverdue = oilAlerts.filter((a) => a.status === "overdue").length;
  const oilUpcoming = oilAlerts.filter((a) => a.status === "upcoming").length;

  const trips = data ?? [];
  const vehicles = vehicleData ?? [];
  const driverName = driverData?.[0]?.full_name ?? "";
  const driver = driverData?.[0];
  const today = todayISODate();
  const [mk, setMk] = useState(currentMonthKey());
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SELECTED_VEHICLE_KEY).then((v) => {
      if (v) setSelectedVehicleId(v);
    });
  }, []);

  // Assistente de primeira configuração: abre automaticamente apenas na
  // primeira vez (após a sessão carregar), sem apagar nada.
  useEffect(() => {
    if (isLoading) return;
    AsyncStorage.getItem(HELP_WIZARD_KEY).then((done) => {
      if (!done) router.push("/assistente");
    });
  }, [isLoading, router]);

  useEffect(() => {
    if (!selectedVehicleId && (vehicleData?.length ?? 0) > 0) {
      setSelectedVehicleId(vehicleData![0].id);
    }
  }, [vehicleData, selectedVehicleId]);

  const changeVehicle = (id: string) => {
    setSelectedVehicleId(id);
    AsyncStorage.setItem(SELECTED_VEHICLE_KEY, id);
  };

  const selectedVehicle =
    vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];

  let todayKm = 0;
  let monthKm = 0;
  let tripsThisMonth = 0;
  let totalKm = 0;
  for (const t of trips) {
    totalKm += t.km;
    if (monthKey(t.date) === mk) {
      monthKm += t.km;
      tripsThisMonth += 1;
    }
    if (t.date === today) todayKm += t.km;
  }

  // Soma o KM do dia dos controles diários de hoje ao "KM de hoje".
  for (const d of dailyLogData ?? []) {
    if (d.date === today) todayKm += dailyKm(d);
  }

  // Controle Mensal de KM: quando existe um registro para o MÊS SELECIONADO,
  // "KM rodados no mês" e "Distância total registrada" passam a mostrar o KM
  // desse mês. Enquanto não há KM final do mês, mostra (último KM do controle
  // diário − KM inicial do mês).
  const monthlyList = monthlyData ?? [];
  const monthlyForSelected = monthlyList.find((m) => monthKey(m.start_date) === mk);
  if (monthlyForSelected) {
    const startM = monthlyForSelected.start_km || 0;
    const tripBasedMonthKm = monthKm; // KM somado pelas viagens do mês
    let result: number;
    if (monthlyForSelected.end_km && monthlyForSelected.end_km > 0) {
      result = monthlyForSelected.end_km - startM;
    } else {
      // Mês em aberto: combina vários sinais para NUNCA zerar quando há
      // qualquer registro no mês (mesmo com controle diário em aberto):
      //  - soma dos KM rodados em cada controle diário do mês;
      //  - maior odômetro registrado (controle diário ou viagens) menos o
      //    KM inicial do mês;
      //  - KM somado pelas viagens do mês.
      let sumDaily = 0;
      let maxOdo = startM;
      for (const d of dailyLogData ?? []) {
        if (monthKey(d.date) === mk) {
          sumDaily += dailyKm(d);
          maxOdo = Math.max(maxOdo, d.end_km || 0, d.start_km || 0);
        }
      }
      for (const tr of trips) {
        if (monthKey(tr.date) === mk) {
          maxOdo = Math.max(maxOdo, tr.km_end || 0, tr.km_start || 0);
        }
      }
      const odoResult = maxOdo > startM ? maxOdo - startM : 0;
      result = Math.max(tripBasedMonthKm, sumDaily, odoResult);
    }
    if (result < 0) result = 0;
    // Nunca ficar abaixo do KM já rodado pelas viagens do mês.
    if (result < tripBasedMonthKm) result = tripBasedMonthKm;
    monthKm = result;
    totalKm = result;
  }
  const monthlyOpen =
    !!monthlyForSelected && (!monthlyForSelected.end_km || monthlyForSelected.end_km === 0);

  const refuels = refuelData ?? [];
  let monthDiesel = 0;
  let monthArla = 0;
  let refuelCount = 0;
  for (const r of refuels) {
    if (monthKey(r.date) === mk) {
      monthDiesel += r.diesel_liters;
      monthArla += r.arla_liters;
      refuelCount += 1;
    }
  }

  const monthTrips = trips.filter((t) => monthKey(t.date) === mk);
  const fin = computeFreightTotals(monthTrips);
  const showFin =
    fin.grossEur || fin.grossBrl || fin.expensesEur || fin.expensesBrl || fin.netEur || fin.netBrl;

  // Profit per month for the last 6 months (net = gross - expenses), by currency.
  const profitData = (() => {
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) keys.push(shiftMonth(currentMonthKey(), -i));
    return keys.map((k) => {
      const mt = trips.filter((t) => monthKey(t.date) === k);
      const f = computeFreightTotals(mt);
      return { label: formatMonthLabel(k), eur: f.resultEur, brl: f.resultBrl };
    });
  })();
  const hasChart = profitData.some((d) => d.eur + d.brl !== 0);

  if (isLoading) {
    return (
      <View style={styles.centered} testID="resumo-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t("Falha ao carregar os dados.")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()} testID="resumo-retry">
          <Text style={styles.retryText}>{t("Tentar novamente")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="resumo-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.brandPrimary}
          />
        }
      >
        {oilAlerts.length > 0 ? (
          <Pressable
            style={styles.oilAlert}
            onPress={() => router.push("/troca-oleo-historico")}
            testID="dashboard-oil-alert"
            accessibilityRole="button"
          >
            <Warning size={20} color={colors.error} weight="fill" />
            <Text style={styles.oilAlertText}>
              {oilOverdue > 0 ? t("{n} troca(s) de óleo vencida(s)", { n: oilOverdue }) : ""}
              {oilOverdue > 0 && oilUpcoming > 0 ? " · " : ""}
              {oilUpcoming > 0 ? t("{n} troca(s) próxima(s)", { n: oilUpcoming }) : ""}
            </Text>
            <CaretRight size={18} color={colors.error} weight="bold" />
          </Pressable>
        ) : null}
        {/* Compact vehicle photo + plate on top */}
        <View style={[styles.vehicleTop, { paddingTop: insets.top + 10 }]}>
          <View style={styles.topRow}>
            <View style={styles.topCol}>
              {selectedVehicle?.photo_path ? (
                <Image
                  source={{ uri: fileUrl(selectedVehicle.photo_path) }}
                  style={styles.vehiclePhoto}
                  contentFit="cover"
                  testID="resumo-vehicle-photo"
                />
              ) : (
                <View style={styles.vehiclePlaceholder} testID="resumo-vehicle-placeholder">
                  <Truck size={40} color={colors.muted} weight="regular" />
                </View>
              )}
              <View style={styles.plateRow}>
                {selectedVehicle?.truck_plate ? (
                  <View style={styles.plateCol} testID="resumo-vehicle-plate">
                    <Text style={styles.plateLabel}>{t("Matrícula")}</Text>
                    <Text style={styles.plateValue}>{selectedVehicle.truck_plate}</Text>
                  </View>
                ) : (
                  <Text style={styles.plateText} testID="resumo-vehicle-plate">
                    {t("Sem veículo")}
                  </Text>
                )}
                {vehicles.length > 1 ? (
                  <Pressable
                    onPress={() => setShowVehiclePicker(true)}
                    hitSlop={10}
                    style={styles.switchBtn}
                    testID="resumo-vehicle-switch"
                    accessibilityRole="button"
                  >
                    <Swap size={16} color={colors.brandPrimary} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {driver ? (
              <View style={styles.topCol}>
                {driver.photo_path ? (
                  <Image
                    source={{ uri: fileUrl(driver.photo_path) }}
                    style={styles.driverPhoto}
                    contentFit="cover"
                    testID="resumo-driver-photo"
                  />
                ) : (
                  <View style={styles.driverPlaceholder} testID="resumo-driver-placeholder">
                    <User size={40} color={colors.muted} weight="regular" />
                  </View>
                )}
                {driverName ? (
                  <Text style={styles.driverName} testID="resumo-driver-name">
                    {driverName}
                  </Text>
                ) : null}
                {driver.license_number ? (
                  <Text style={styles.driverLicense} testID="resumo-driver-license">
                    {t("CNH: {n}", { n: driver.license_number })}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <Modal
          visible={showVehiclePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowVehiclePicker(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setShowVehiclePicker(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{t("Selecionar veículo")}</Text>
                <Pressable onPress={() => setShowVehiclePicker(false)} hitSlop={10}>
                  <X size={22} color={colors.onSurface} weight="bold" />
                </Pressable>
              </View>
              {vehicles.map((v) => (
                <Pressable
                  key={v.id}
                  style={styles.vehicleOption}
                  onPress={() => {
                    changeVehicle(v.id);
                    setShowVehiclePicker(false);
                  }}
                  testID={`resumo-vehicle-opt-${v.id}`}
                >
                  <Text style={styles.vehicleOptText} numberOfLines={1}>
                    {v.truck_plate || v.truck_brand || t("Veículo")}
                  </Text>
                  {v.id === selectedVehicleId ? (
                    <Check size={18} color={colors.brandPrimary} weight="bold" />
                  ) : null}
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <Truck size={22} color={colors.brandPrimary} weight="fill" />
              <Text style={styles.heroBrand}>{t("CONTROLE DE VIAGENS")}</Text>
            </View>
            <View style={styles.monthNav}>
              <Pressable
                onPress={() => setMk((m) => shiftMonth(m, -1))}
                hitSlop={10}
                testID="month-prev"
                accessibilityRole="button"
              >
                <CaretLeft size={22} color={colors.onSurface} weight="bold" />
              </Pressable>
              <Text style={styles.heroLabel} testID="month-label">
                {t("RESUMO DE {month}", { month: formatMonthLabel(mk) })}
              </Text>
              <Pressable
                onPress={() => setMk((m) => shiftMonth(m, 1))}
                hitSlop={10}
                testID="month-next"
                accessibilityRole="button"
              >
                <CaretRight size={22} color={colors.onSurface} weight="bold" />
              </Pressable>
            </View>
            <View style={styles.heroValueRow}>
              <Text
                style={[styles.heroValue, { fontSize: heroFontSize(formatInt(monthKm)) }]}
                testID="month-km"
              >
                {formatInt(monthKm)}
              </Text>
              <Text style={styles.heroUnit}>km</Text>
            </View>
            <Text style={styles.heroCaption}>{t("quilômetros rodados no mês")}</Text>
          </View>
        </View>

        <Pressable
          style={styles.shortcutBtn}
          onPress={() => router.push("/controle-diario-form")}
          testID="shortcut-controle-diario"
          accessibilityRole="button"
        >
          <CalendarCheck size={22} color={colors.onBrandPrimary} weight="fill" />
          <Text style={styles.shortcutBtnText}>{t("Controle Diário")}</Text>
        </Pressable>

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <StatCard label={t("KM DE HOJE")} value={formatInt(todayKm)} unit="km" testID="today-km" />
          <StatCard label={t("VIAGENS NO MÊS")} value={String(tripsThisMonth)} testID="trips-month" />
        </View>

        <View style={styles.totalCard} testID="total-km-card">
          <View style={styles.totalIcon}>
            <Path size={22} color={colors.brandPrimary} weight="bold" />
          </View>
          <View style={styles.totalTextWrap}>
            <Text style={styles.totalLabel}>{t("DISTÂNCIA TOTAL REGISTRADA")}</Text>
            <View style={styles.totalValueRow}>
              <Text
                style={[styles.totalValue, { fontSize: totalFontSize(formatInt(totalKm)) }]}
              >
                {formatInt(totalKm)}
              </Text>
              <Text style={styles.totalUnit}>km</Text>
            </View>
          </View>
        </View>

        {monthlyOpen ? (
          <Pressable
            style={styles.monthlyOpenCard}
            onPress={() => router.push("/controle-mensal-form")}
            testID="monthly-open-badge"
            accessibilityRole="button"
          >
            <Warning size={18} color={colors.onBrandPrimary} weight="bold" />
            <Text style={styles.monthlyOpenText}>{t("Mês em aberto — toque para informar o KM final")}</Text>
            <CaretRight size={18} color={colors.onBrandPrimary} weight="bold" />
          </Pressable>
        ) : null}

        {/* Monthly fuel summary */}
        <View style={styles.fuelHeaderRow}>
          <GasPump size={18} color={colors.brandPrimary} weight="bold" />
          <Text style={styles.fuelSectionLabel}>{t("ABASTECIMENTOS DE {month}", { month: formatMonthLabel(mk) })}</Text>
        </View>
        <View style={styles.fuelList}>
          <View style={styles.fuelRow} testID="month-diesel">
            <Text style={styles.fuelRowLabel} numberOfLines={1}>{t("DIESEL")}</Text>
            <View style={styles.fuelValueRow}>
              <Text style={styles.fuelValue} numberOfLines={1}>{formatDecimal(monthDiesel)}</Text>
              <Text style={styles.fuelUnit}>L</Text>
            </View>
          </View>
          <View style={styles.fuelRow} testID="month-arla">
            <Text style={styles.fuelRowLabel} numberOfLines={1}>ARLA 32</Text>
            <View style={styles.fuelValueRow}>
              <Text style={styles.fuelValue} numberOfLines={1}>{formatDecimal(monthArla)}</Text>
              <Text style={styles.fuelUnit}>L</Text>
            </View>
          </View>
          <View style={styles.fuelRow} testID="month-refuels">
            <Text style={styles.fuelRowLabel} numberOfLines={1}>{t("ABASTECIMENTOS")}</Text>
            <View style={styles.fuelValueRow}>
              <Text style={styles.fuelValue} numberOfLines={1}>{String(refuelCount)}</Text>
            </View>
          </View>
        </View>

        {showFin ? (
          <View style={styles.finCard} testID="month-finance">
            <Text style={styles.finCardTitle}>{t("RESUMO FINANCEIRO DE {month}", { month: formatMonthLabel(mk) })}</Text>
            <FinTable
              rows={[
                [t("Frete bruto"), fin.grossEur + fin.grossBrl],
                [t("Diesel"), fin.dieselEur + fin.dieselBrl],
                ["ARLA 32", fin.arlaEur + fin.arlaBrl],
                [t("Pedágios"), fin.tollsEur + fin.tollsBrl],
                [t("Total despesas"), fin.expensesEur + fin.expensesBrl],
              ]}
            />
            <View style={styles.finDivider} />
            <FinTable
              strong
              rows={[
                [t("Líquido do mês"), fin.resultEur + fin.resultBrl],
                [t("A receber"), fin.toReceiveEur + fin.toReceiveBrl],
              ]}
            />
          </View>
        ) : null}

        {hasChart ? (
          <View style={styles.chartCard} testID="profit-chart-card">
            <Text style={styles.finCardTitle}>{t("LUCRO DOS ÚLTIMOS 6 MESES")}</Text>
            <ProfitChart
              symbol={getAppCurrencySymbol()}
              data={profitData.map((d) => ({ label: d.label, value: d.eur + d.brl }))}
            />
          </View>
        ) : null}

        {trips.length === 0 ? (
          <View style={styles.emptyBox} testID="resumo-empty">
            <Text style={styles.emptyText}>
              {t("Nenhuma viagem registrada ainda. Comece adicionando a sua primeira viagem.")}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  content: {
    paddingBottom: 28,
  },
  hero: {
    justifyContent: "flex-end",
  },
  vehicleTop: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  oilAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error,
    borderWidth: 1,
  },
  oilAlertText: { flex: 1, fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.error },
  vehiclePhoto: {
    width: 112,
    height: 80,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 20,
  },
  topCol: { alignItems: "center", maxWidth: 150 },
  driverPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceSecondary,
  },
  driverPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  vehiclePlaceholder: {
    width: 112,
    height: 80,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  plateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  plateText: {
    fontFamily: fonts.body,
    fontSize: 13,
    letterSpacing: 0.3,
    color: colors.brandPrimary,
    textAlign: "center",
  },
  plateCol: { alignItems: "center" },
  plateLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.brandPrimary,
    textAlign: "center",
  },
  plateValue: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.5,
    color: colors.brandPrimary,
    textAlign: "center",
    marginTop: 2,
  },
  driverName: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    letterSpacing: 0.3,
    color: colors.brandPrimary,
    textAlign: "center",
    marginTop: 3,
  },
  driverLicense: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.3,
    color: colors.brandPrimary,
    textAlign: "center",
    marginTop: 2,
  },
  switchBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: "70%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface },
  vehicleOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  vehicleOptText: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.onSurface },
  heroContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    alignItems: "center",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  heroBrand: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
  },
  heroLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.muted,
    marginBottom: 2,
    textAlign: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    alignSelf: "center",
    marginBottom: 2,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  heroValue: {
    flexShrink: 1,
    fontFamily: fonts.displayBold,
    lineHeight: 68,
    color: colors.onSurface,
  },
  heroUnit: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 24,
    color: colors.brandPrimary,
    marginLeft: 8,
    marginBottom: 12,
  },
  heroCaption: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    flexBasis: 0,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3,
    color: colors.muted,
    marginBottom: 8,
    minHeight: 30,
    textAlign: "center",
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    flexWrap: "nowrap",
  },
  statValue: {
    fontFamily: fonts.displayBold,
    color: colors.onSurface,
  },
  statUnit: {
    fontFamily: fonts.display,
    fontSize: 13,
    color: colors.muted,
    marginLeft: 4,
    marginBottom: 3,
  },
  finCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  chartCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  chartSub: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    marginBottom: 10,
  },
  chartSubSpaced: {
    marginTop: 18,
  },
  finCardTitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.8,
    color: colors.brandPrimary,
    marginBottom: 8,
  },
  finDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 8,
  },
  finLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  finLineLabel: { flex: 1.4, fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  finLineVal: {
    flex: 1,
    textAlign: "right",
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
  },
  finLineStrong: {
    fontFamily: fonts.displaySemiBold,
    color: colors.onSurface,
  },
  fuelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: -4,
  },
  fuelSectionLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.muted,
  },
  fuelList: {
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  fuelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  fuelRowLabel: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    letterSpacing: 0.6,
    color: colors.muted,
    marginRight: 10,
  },
  fuelValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  fuelValue: {
    fontFamily: fonts.displayBold,
    fontSize: 26,
    lineHeight: 28,
    color: colors.onSurface,
  },
  fuelUnit: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.muted,
    marginLeft: 4,
    marginBottom: 2,
  },
  totalCard: {
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
  },
  totalTextWrap: {
    alignItems: "center",
  },
  monthlyOpenCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
  },
  monthlyOpenText: {
    flex: 1,
    fontFamily: fonts.displaySemiBold,
    fontSize: 14,
    color: colors.onBrandPrimary,
  },
  totalIcon: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  totalLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.muted,
    marginBottom: 2,
    textAlign: "center",
  },
  totalValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  totalValue: {
    flexShrink: 1,
    fontFamily: fonts.displayBold,
    color: colors.onSurface,
  },
  totalUnit: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.muted,
    marginLeft: 4,
    marginBottom: 3,
  },
  emptyBox: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 20,
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
  },
  ctaText: {
    fontFamily: fonts.displayBold,
    fontSize: 20,
    letterSpacing: 0.5,
    color: colors.onBrandPrimary,
  },
  shortcutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    shadowColor: colors.brandPrimary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  shortcutBtnText: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.5,
    color: colors.onBrandPrimary,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.onSurfaceSecondary,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
  },
  retryText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "700",
    color: colors.onBrandPrimary,
  },
}));
