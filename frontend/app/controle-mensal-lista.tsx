import { useRouter } from "expo-router";
import { CalendarBlank, PathIcon as Path, X } from "phosphor-react-native";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable } from "react-native";

import {
  MonthlyKm,
  isMonthlyOpen,
  useDeleteMonthlyKm,
  useMonthlyKm,
} from "@/src/api/monthlyKm";
import { SwipeableRow } from "@/src/components/SwipeableRow";
import { useUndoableDelete } from "@/src/context/UndoDelete";
import { ReportButton } from "@/src/components/ReportButton";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { formatDateBR, formatInt } from "@/src/utils/format";

function MonthlyCard({
  item,
  onEdit,
  onDelete,
}: {
  item: MonthlyKm;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const open = isMonthlyOpen(item);
  const km = !open && item.end_km > item.start_km ? item.end_km - item.start_km : 0;
  return (
    <SwipeableRow onEdit={() => onEdit(item.id)} onDelete={() => onDelete(item.id)} testID={`mensal-card-${item.id}`}>
      <View style={styles.cardHead}>
        <View style={styles.periodRow}>
          <CalendarBlank size={15} color={colors.muted} weight="bold" />
          <Text style={styles.cardDate}>
            {formatDateBR(item.start_date)}
            {item.end_date ? ` → ${formatDateBR(item.end_date)}` : ""}
          </Text>
        </View>
        {open ? (
          <View style={styles.openPill}>
            <Text style={styles.openPillText}>{t("Em aberto")}</Text>
          </View>
        ) : (
          <View style={styles.kmBadge}>
            <Path size={13} color={colors.onBrandTertiary} weight="bold" />
            <Text style={styles.kmText}>{formatInt(km)} km</Text>
          </View>
        )}
      </View>
      <View style={styles.divider} />
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{t("KM inicial")}</Text>
        <Text style={styles.infoValue}>{formatInt(item.start_km)}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{t("KM final")}</Text>
        <Text style={styles.infoValue}>{open ? "—" : formatInt(item.end_km)}</Text>
      </View>
    </SwipeableRow>
  );
}

export default function ControleMensalListaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data, isLoading } = useMonthlyKm();
  const del = useDeleteMonthlyKm();
  const removeWithUndo = useUndoableDelete();

  const items = data ?? [];

  return (
    <View style={styles.screen} testID="controle-mensal-lista-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="mensal-lista-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Histórico mensal de KM")}</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <ReportButton route="/relatorio-controle-mensal" label={t("Relatório do Controle Mensal")} testID="open-monthly-report" />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.dimText}>{t("Nenhum controle mensal registrado.")}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <MonthlyCard
              item={item}
              onEdit={(id) => router.push({ pathname: "/controle-mensal-form", params: { id } })}
              onDelete={(id) => removeWithUndo({ queryKey: ["monthly-km"], id, run: () => del.mutateAsync(id) })}
            />
          )}
        />
      )}
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
  dimText: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, textAlign: "center" },
  listContent: { padding: 16 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  periodRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  cardDate: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  kmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.brandTertiary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kmText: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.onBrandTertiary },
  openPill: {
    backgroundColor: colors.brandPrimary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  openPillText: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: colors.onBrandPrimary },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  infoLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  infoValue: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurfaceSecondary },
}));
