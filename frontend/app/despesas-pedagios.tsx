import { useRouter } from "expo-router";
import { CaretLeft, CaretRight, MapPin, Plus, Receipt, X } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TollExpense, useDeleteTollExpense, useTollExpenses } from "@/src/api/tollExpenses";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { SortMode, SortToggle, sortItems } from "@/src/components/SortToggle";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { ReportButton } from "@/src/components/ReportButton";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import {
  currentMonthKey,
  formatDateBR,
  formatMonthLabel,
  money,
  monthKey,
  shiftMonth,
} from "@/src/utils/format";

export default function DespesasPedagiosScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, isError, refetch } = useTollExpenses();
  const deleteToll = useDeleteTollExpense();
  const removeWithUndo = useUndoableDelete();

  const [mk, setMk] = useState(currentMonthKey());
  const [sortMode, setSortMode] = useState<SortMode>("created");
  const items = sortItems(data ?? [], sortMode);
  const monthItems = items.filter((t) => monthKey(t.date) === mk);
  const total = monthItems.reduce((s, t) => s + (t.value || 0), 0);

  const openForm = (id?: string) => {
    if (id) router.push({ pathname: "/pedagio-form", params: { id } });
    else router.push("/pedagio-form");
  };

  const Summary = (
    <View style={styles.summaryCard} testID="pedagio-month-summary">
      <View style={styles.sumNav}>
        <Pressable onPress={() => setMk((m) => shiftMonth(m, -1))} hitSlop={10} testID="pedagio-month-prev">
          <CaretLeft size={20} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.sumTitle}>{t("TOTAL DO MÊS • {month}", { month: formatMonthLabel(mk) })}</Text>
        <Pressable onPress={() => setMk((m) => shiftMonth(m, 1))} hitSlop={10} testID="pedagio-month-next">
          <CaretRight size={20} color={colors.onSurface} weight="bold" />
        </Pressable>
      </View>
      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>{t("GASTO COM PEDÁGIOS")}</Text>
        <Text style={styles.totalValue} testID="pedagio-month-total">
          {money(total)}
        </Text>
        <Text style={styles.totalHint}>
          {t("{n} pedágio(s) no mês", { n: monthItems.length })}
        </Text>
      </View>
    </View>
  );

  let emptyNode: React.ReactNode;
  if (isLoading) {
    emptyNode = (
      <View style={styles.centered} testID="pedagio-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  } else if (isError) {
    emptyNode = (
      <View style={styles.centered}>
        <Text style={styles.dimText}>{t("Falha ao carregar os pedágios.")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()} testID="pedagio-retry">
          <Text style={styles.retryText}>{t("Tentar novamente")}</Text>
        </Pressable>
      </View>
    );
  } else {
    emptyNode = (
      <View style={styles.centered} testID="pedagio-empty">
        <Receipt size={56} color={colors.muted} weight="regular" />
        <Text style={styles.emptyTitle}>{t("Nenhum pedágio")}</Text>
        <Text style={styles.dimText}>{t("Toque em “Novo” para registrar o primeiro.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="despesas-pedagios-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="pedagio-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Pedágios")}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <TollCard item={item} onEdit={openForm} onDelete={(id) => removeWithUndo({ queryKey: ["toll-expenses"], id, run: () => deleteToll.mutateAsync(id) })} />
        )}
        ListHeaderComponent={
          <>
            <ReportButton route="/relatorio-pedagios" label={t("Relatório de Pedágios")} testID="open-toll-report" />
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
        testID="new-pedagio-fab"
        accessibilityRole="button"
      >
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" />
        <Text style={styles.fabText}>{t("Novo")}</Text>
      </Pressable>
    </View>
  );
}

function TollCard({
  item,
  onEdit,
  onDelete,
}: {
  item: TollExpense;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <SwipeableRow
      onEdit={() => onEdit(item.id)}
      onDelete={() => onDelete(item.id)}
      testID={`pedagio-card-${item.id}`}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardDate}>{formatDateBR(item.date)}</Text>
        <Text style={styles.cardValue}>{money(item.value)}</Text>
      </View>
      {item.place ? (
        <View style={styles.placeRow}>
          <MapPin size={15} color={colors.muted} weight="regular" />
          <Text style={styles.placeText} numberOfLines={2}>
            {item.place}
          </Text>
        </View>
      ) : null}
    </SwipeableRow>
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
  sumNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sumTitle: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 1, color: colors.muted },
  totalBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
  },
  totalLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: "700",
    color: colors.onBrandTertiary,
  },
  totalValue: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 40, color: colors.onBrandTertiary },
  totalHint: { fontFamily: fonts.body, fontSize: 11, color: colors.onBrandTertiary, opacity: 0.8 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardDate: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.3 },
  cardValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.brandPrimary },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  placeText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceSecondary },
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
