import { useRouter } from "expo-router";
import { useState } from "react";
import { MapPin, Plus, Package, X } from "phosphor-react-native";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Freight, useDeleteFreight, useFreights } from "@/src/api/freights";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { SortMode, SortToggle, sortItems } from "@/src/components/SortToggle";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { ReportButton } from "@/src/components/ReportButton";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, money } from "@/src/utils/format";

export default function FretesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, isError, refetch } = useFreights();
  const deleteFreight = useDeleteFreight();
  const removeWithUndo = useUndoableDelete();
  const [sortMode, setSortMode] = useState<SortMode>("created");

  const items = sortItems(data ?? [], sortMode);
  const total = items.reduce((s, f) => s + (f.value || 0), 0);
  const totalWeight = items.reduce((s, f) => s + (f.weight || 0), 0);

  const open = (id?: string) => {
    if (id) router.push({ pathname: "/frete-form", params: { id } });
    else router.push("/frete-form");
  };

  let emptyNode: React.ReactNode;
  if (isLoading) {
    emptyNode = (
      <View style={styles.centered} testID="fretes-loading">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  } else if (isError) {
    emptyNode = (
      <View style={styles.centered}>
        <Text style={styles.dimText}>{t("Falha ao carregar os fretes.")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()} testID="fretes-retry">
          <Text style={styles.retryText}>{t("Tentar novamente")}</Text>
        </Pressable>
      </View>
    );
  } else {
    emptyNode = (
      <View style={styles.centered} testID="fretes-empty">
        <Package size={56} color={colors.muted} weight="regular" />
        <Text style={styles.emptyTitle}>{t("Nenhum frete")}</Text>
        <Text style={styles.dimText}>{t("Toque em “Novo” para registrar o primeiro.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="fretes-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="fretes-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Fretes")}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <FreightCard item={item} onEdit={open} onDelete={(id) => removeWithUndo({ queryKey: ["freights"], id, run: () => deleteFreight.mutateAsync(id) })} />
        )}
        ListHeaderComponent={
          <>
            <ReportButton route="/relatorio-fretes" label={t("Relatório de Fretes")} testID="open-freight-report" />
            {items.length > 0 ? (
            <>
              <View style={styles.totalBar} testID="fretes-total">
                <View style={styles.totalBarRow}>
                  <Text style={styles.totalLabel}>{t("TOTAL DE FRETES")}</Text>
                  <Text style={styles.totalValue}>{money(total)}</Text>
                </View>
                {totalWeight > 0 ? (
                  <View style={styles.totalBarRow}>
                    <Text style={styles.totalLabel}>{t("PESO TOTAL")}</Text>
                    <Text style={styles.totalWeightValue}>{t("{w} kg", { w: totalWeight })}</Text>
                  </View>
                ) : null}
              </View>
              <SortToggle mode={sortMode} onChange={setSortMode} />
            </>
            ) : null}
          </>
        }
        ListEmptyComponent={emptyNode}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
      />

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => open()}
        testID="new-frete-fab"
        accessibilityRole="button"
      >
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" />
        <Text style={styles.fabText}>{t("Novo")}</Text>
      </Pressable>
    </View>
  );
}

function FreightCard({
  item,
  onEdit,
  onDelete,
}: {
  item: Freight;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const route = [item.origin, item.destination].filter(Boolean).join(" → ");
  return (
    <SwipeableRow
      onEdit={() => onEdit(item.id)}
      onDelete={() => onDelete(item.id)}
      testID={`frete-card-${item.id}`}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardDate}>{formatDateBR(item.date)}</Text>
        <Text style={styles.cardValue}>{money(item.value)}</Text>
      </View>
      {item.client ? <Text style={styles.cardClient} numberOfLines={1}>{item.client}</Text> : null}
      {route ? (
        <View style={styles.metaRow}>
          <MapPin size={14} color={colors.muted} weight="regular" />
          <Text style={styles.metaText} numberOfLines={1}>{route}</Text>
        </View>
      ) : null}
      {item.reference ? <Text style={styles.metaText}>{t("Ref.:")} {item.reference}</Text> : null}
      {item.weight ? <Text style={styles.metaText}>{t("Peso: {w} kg", { w: item.weight })}</Text> : null}
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, marginTop: 40 },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5 },
  dimText: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.brandPrimary },
  retryText: { fontFamily: fonts.body, fontSize: 15, fontWeight: "700", color: colors.onBrandPrimary },
  listContent: { padding: 16 },
  totalBar: {
    flexDirection: "column",
    gap: 6,
    backgroundColor: colors.brandTertiary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  totalBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.8, fontWeight: "700", color: colors.onBrandTertiary },
  totalValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onBrandTertiary },
  totalWeightValue: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onBrandTertiary },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardDate: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.3 },
  cardValue: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.brandPrimary },
  cardClient: { fontFamily: fonts.body, fontSize: 15, color: colors.onSurface, marginTop: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaText: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 4 },
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
