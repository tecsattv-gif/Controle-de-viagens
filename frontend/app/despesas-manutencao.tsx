import { useRouter } from "expo-router";
import { Gauge, MapPin, Plus, Wrench, X } from "phosphor-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Maintenance,
  MAINTENANCE_CATEGORIES,
  useDeleteMaintenance,
  useMaintenances,
} from "@/src/api/maintenance";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { SortMode, SortToggle, sortItems } from "@/src/components/SortToggle";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatInt, money } from "@/src/utils/format";

const FILTERS = ["Todas", ...MAINTENANCE_CATEGORIES] as const;

export default function DespesasManutencaoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, isError, refetch } = useMaintenances();
  const deleteM = useDeleteMaintenance();
  const removeWithUndo = useUndoableDelete();

  const [filter, setFilter] = useState<string>("Todas");
  const [sortMode, setSortMode] = useState<SortMode>("created");
  const items = sortItems(data ?? [], sortMode);
  const filtered = filter === "Todas" ? items : items.filter((m) => m.category === filter);
  const total = filtered.reduce((s, m) => s + (m.price || 0), 0);

  const openForm = (id?: string) => {
    if (id) router.push({ pathname: "/manutencao-form", params: { id } });
    else router.push("/manutencao-form");
  };

  const Header = (
    <View>
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(f)}
                testID={`filter-${f}`}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(f)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {filtered.length > 0 ? (
        <View style={styles.totalBar} testID="manutencao-total">
          <Text style={styles.totalBarLabel}>{t("TOTAL")} {filter === "Todas" ? t("GERAL") : t(filter).toUpperCase()}</Text>
          <Text style={styles.totalBarValue}>{money(total)}</Text>
        </View>
      ) : null}
    </View>
  );

  let emptyNode: React.ReactNode;
  if (isLoading) {
    emptyNode = (
      <View style={styles.centered} testID="manutencao-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  } else if (isError) {
    emptyNode = (
      <View style={styles.centered}>
        <Text style={styles.dimText}>{t("Falha ao carregar as manutenções.")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()} testID="manutencao-retry">
          <Text style={styles.retryText}>{t("Tentar novamente")}</Text>
        </Pressable>
      </View>
    );
  } else {
    emptyNode = (
      <View style={styles.centered} testID="manutencao-empty">
        <Wrench size={56} color={colors.muted} weight="regular" />
        <Text style={styles.emptyTitle}>{t("Nenhuma manutenção")}</Text>
        <Text style={styles.dimText}>{t("Toque em “Novo” para registrar a primeira.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="despesas-manutencao-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="manutencao-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Manutenção")}</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <MaintenanceCard item={item} onEdit={openForm} onDelete={(id) => removeWithUndo({ queryKey: ["maintenances"], id, run: () => deleteM.mutateAsync(id) })} />
        )}
        ListHeaderComponent={
          <>
            {Header}
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
        testID="new-manutencao-fab"
        accessibilityRole="button"
      >
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" />
        <Text style={styles.fabText}>{t("Novo")}</Text>
      </Pressable>
    </View>
  );
}

function MaintenanceCard({
  item,
  onEdit,
  onDelete,
}: {
  item: Maintenance;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();

  return (
    <SwipeableRow
      onEdit={() => onEdit(item.id)}
      onDelete={() => onDelete(item.id)}
      testID={`manutencao-card-${item.id}`}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardDate}>{formatDateBR(item.date)}</Text>
        <View style={styles.catPill}>
          <Text style={styles.catText}>{t(item.category)}</Text>
        </View>
      </View>
      <Text style={styles.cardDesc} numberOfLines={2}>
        {item.description || "—"}
      </Text>
      {item.place ? (
        <View style={styles.metaRow}>
          <MapPin size={14} color={colors.muted} weight="regular" />
          <Text style={styles.metaText} numberOfLines={1}>
            {item.place}
          </Text>
        </View>
      ) : null}
      <View style={styles.footRow}>
        <View style={styles.metaRow}>
          <Gauge size={14} color={colors.muted} weight="bold" />
          <Text style={styles.metaText}>{formatInt(item.km)} km</Text>
        </View>
        <Text style={styles.price}>{money(item.price)}</Text>
      </View>
    </SwipeableRow>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, marginTop: 40 },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5 },
  dimText: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.brandPrimary },
  retryText: { fontFamily: fonts.body, fontSize: 15, fontWeight: "700", color: colors.onBrandPrimary },
  listContent: { padding: 16 },
  filterWrap: { marginBottom: 12 },
  filterContent: { gap: 8, paddingRight: 8 },
  chip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "600", color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onBrandPrimary },
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.brandTertiary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  totalBarLabel: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.8, fontWeight: "700", color: colors.onBrandTertiary },
  totalBarValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onBrandTertiary },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardDate: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.3 },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  catText: { fontFamily: fonts.body, fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary },
  cardDesc: { fontFamily: fonts.body, fontSize: 15, color: colors.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaText: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary },
  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  price: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.brandPrimary },
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
