import { useRouter } from "expo-router";
import { CaretLeft, CaretRight, FileText, GasPump, Plus, X } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDeleteRefueling, useRefuelings } from "@/src/api/refuelings";
import { useTrips } from "@/src/api/trips";
import { RefuelingCard } from "@/src/components/RefuelingCard";
import { SortMode, SortToggle, sortItems } from "@/src/components/SortToggle";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import {
  currentMonthKey,
  formatInt,
  formatMonthLabel,
  money,
  monthKey,
  shiftMonth,
} from "@/src/utils/format";
import { computeConsumption, computeFuelTotals } from "@/src/utils/fuel";

export default function DespesasAbastecimentoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, isError, refetch } = useRefuelings();
  const { data: tripsData } = useTrips();
  const deleteRefueling = useDeleteRefueling();
  const removeWithUndo = useUndoableDelete();

  const [mk, setMk] = useState(currentMonthKey());
  const [sortMode, setSortMode] = useState<SortMode>("created");

  const items = sortItems(data ?? [], sortMode);
  const trips = tripsData ?? [];

  const monthRefuels = items.filter((r) => monthKey(r.date) === mk);
  const ft = computeFuelTotals(monthRefuels);
  let kmMonth = 0;
  for (const t of trips) {
    if (monthKey(t.date) === mk) kmMonth += t.km;
  }
  const media = computeConsumption(monthRefuels, kmMonth);

  const openForm = (id?: string) => {
    if (id) {
      router.push({ pathname: "/abastecimento-form", params: { id } });
    } else {
      router.push("/abastecimento-form");
    }
  };

  const Summary = (
    <View>
      <View style={styles.summaryCard} testID="abastec-month-summary">
        <View style={styles.sumNav}>
          <Pressable onPress={() => setMk((m) => shiftMonth(m, -1))} hitSlop={10} testID="sum-month-prev">
            <CaretLeft size={20} color={colors.onSurface} weight="bold" />
          </Pressable>
          <Text style={styles.sumTitle} testID="sum-month-label">
            {t("RESUMO DO MÊS • {month}", { month: formatMonthLabel(mk) })}
          </Text>
          <Pressable onPress={() => setMk((m) => shiftMonth(m, 1))} hitSlop={10} testID="sum-month-next">
            <CaretRight size={20} color={colors.onSurface} weight="bold" />
          </Pressable>
        </View>

        <View style={styles.statList}>
          <StatRow label={t("DIESEL")} value={formatInt(ft.dieselLiters)} unit="L" testID="sum-diesel" />
          <StatRow label="ARLA 32" value={formatInt(ft.arlaLiters)} unit="L" testID="sum-arla" />
          <StatRow label={t("ABASTECIMENTOS")} value={String(ft.count)} testID="sum-count" />
          <StatRow label={t("KM NO MÊS")} value={formatInt(kmMonth)} unit="km" testID="sum-km" />
        </View>

        <View style={styles.moneyTable}>
          <MoneyRow label={t("Gasto Diesel")} value={ft.dieselTotal} testID="money-diesel" />
          <MoneyRow label={t("Gasto ARLA 32")} value={ft.arlaTotal} testID="money-arla" />
          <MoneyRow label={t("Total do mês")} value={ft.grandTotal} strong testID="money-total" />
        </View>

        <View style={styles.mediaBox} testID="sum-media">
          <Text style={styles.mediaLabel} numberOfLines={1} adjustsFontSizeToFit>
            {t("MÉDIA DE CONSUMO")}
          </Text>
          <View style={styles.mediaValueRow}>
            <Text style={styles.mediaValue} numberOfLines={1} adjustsFontSizeToFit testID="sum-media-value">
              {media}
            </Text>
            <Text style={styles.mediaUnit}>km/L</Text>
          </View>
          <Text style={styles.mediaHint} numberOfLines={1} adjustsFontSizeToFit>
            {t("KM rodados ÷ litros de Diesel")}
          </Text>
        </View>
      </View>

      <Pressable
        style={styles.reportBtn}
        onPress={() => router.push("/relatorio-abastecimentos")}
        testID="open-refuel-reports"
        accessibilityRole="button"
      >
        <FileText size={20} color={colors.brandPrimary} weight="bold" />
        <Text style={styles.reportBtnText}>{t("Relatório de Abastecimentos")}</Text>
      </Pressable>
    </View>
  );

  let emptyNode: React.ReactNode;
  if (isLoading) {
    emptyNode = (
      <View style={styles.centered} testID="abastec-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  } else if (isError) {
    emptyNode = (
      <View style={styles.centered}>
        <Text style={styles.dimText}>{t("Falha ao carregar os abastecimentos.")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()} testID="abastec-retry">
          <Text style={styles.retryText}>{t("Tentar novamente")}</Text>
        </Pressable>
      </View>
    );
  } else {
    emptyNode = (
      <View style={styles.centered} testID="abastec-empty">
        <GasPump size={56} color={colors.muted} weight="regular" />
        <Text style={styles.emptyTitle}>{t("Nenhum abastecimento")}</Text>
        <Text style={styles.dimText}>{t("Toque em “Novo” para registrar o primeiro.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="despesas-abastec-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="abastec-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Abastecimento")}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <RefuelingCard item={item} onEdit={openForm} onDelete={(id) => removeWithUndo({ queryKey: ["refuelings"], id, run: () => deleteRefueling.mutateAsync(id) })} />
        )}
        ListHeaderComponent={
          <>
            {Summary}
            <SortToggle mode={sortMode} onChange={setSortMode} />
          </>
        }
        ListEmptyComponent={emptyNode}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
      />

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => openForm()}
        testID="new-refueling-fab"
        accessibilityRole="button"
      >
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" />
        <Text style={styles.fabText}>{t("Novo")}</Text>
      </Pressable>
    </View>
  );
}

function StatRow({
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
  return (
    <View style={styles.statRow} testID={testID}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function MoneyRow({
  label,
  value,
  strong,
  testID,
}: {
  label: string;
  value: number;
  strong?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.moneyRow} testID={testID}>
      <Text style={[styles.moneyLabel, strong && styles.moneyStrong]}>{label}</Text>
      <Text style={[styles.moneyNum, strong && styles.moneyStrong]}>{money(value)}</Text>
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5 },
  dimText: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.brandPrimary },
  retryText: { fontFamily: fonts.body, fontSize: 15, fontWeight: "700", color: colors.onBrandPrimary },
  listContent: { padding: 16 },
  summaryCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  reportBtnText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.5, color: colors.brandPrimary },
  sumNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sumTitle: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 1, color: colors.muted },
  statList: { gap: 10 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  statLabel: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.muted,
    marginRight: 10,
  },
  statValueRow: { flexDirection: "row", alignItems: "flex-end" },
  statValue: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 24, color: colors.onSurface },
  statUnit: { fontFamily: fonts.display, fontSize: 13, color: colors.muted, marginLeft: 4, marginBottom: 2 },
  moneyTable: { marginTop: 14, borderTopColor: colors.divider, borderTopWidth: 1, paddingTop: 8 },
  moneyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  moneyLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  moneyNum: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceSecondary },
  moneyStrong: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  mediaBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
  },
  mediaLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: "700",
    textAlign: "center",
    color: colors.onBrandTertiary,
  },
  mediaHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: "center",
    color: colors.onBrandTertiary,
    opacity: 0.8,
    marginTop: 2,
  },
  mediaValueRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center" },
  mediaValue: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 38, color: colors.onBrandTertiary },
  mediaUnit: { fontFamily: fonts.display, fontSize: 16, color: colors.onBrandTertiary, marginLeft: 4, marginBottom: 5 },
  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.brandPrimary,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.5, color: colors.onBrandPrimary },
}));
