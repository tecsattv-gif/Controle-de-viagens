import { useRouter } from "expo-router";
import { CaretRight, Drop, ListChecks, PlusCircle, Warning, X } from "phosphor-react-native";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable } from "react-native";

import { maxKmFrom, oilChangeAlerts, useOilChanges } from "@/src/api/oilChanges";
import { useDailyLogs } from "@/src/api/dailyLogs";
import { useTrips } from "@/src/api/trips";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function TrocaOleoMenuScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const { data: oilChanges } = useOilChanges();
  const { data: trips } = useTrips();
  const { data: dailyLogs } = useDailyLogs();
  const currentKm = maxKmFrom(trips, dailyLogs, oilChanges);
  const alerts = oilChangeAlerts(oilChanges ?? [], currentKm);
  const overdue = alerts.filter((a) => a.status === "overdue").length;
  const upcoming = alerts.filter((a) => a.status === "upcoming").length;

  return (
    <View style={styles.screen} testID="troca-oleo-menu-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="troca-oleo-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Troca de Óleo e Filtros")}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {alerts.length > 0 ? (
          <Pressable
            style={styles.alertBanner}
            onPress={() => router.push("/troca-oleo-historico")}
            testID="troca-oleo-alert-banner"
          >
            <Warning size={22} color={colors.error} weight="fill" />
            <Text style={styles.alertText}>
              {overdue > 0 ? t("{n} troca(s) vencida(s)", { n: overdue }) : ""}
              {overdue > 0 && upcoming > 0 ? " · " : ""}
              {upcoming > 0 ? t("{n} troca(s) próxima(s)", { n: upcoming }) : ""}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={styles.item}
          onPress={() => router.push("/troca-oleo-form")}
          testID="menu-cadastrar-troca"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <PlusCircle size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Cadastrar Troca")}</Text>
            <Text style={styles.itemSub}>{t("Óleos, filtros, mão de obra e próximas trocas")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/troca-oleo-historico")}
          testID="menu-historico-troca"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <ListChecks size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Histórico")}</Text>
            <Text style={styles.itemSub}>{t("Trocas registradas e próximas trocas")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <View style={styles.hintBox}>
          <Drop size={18} color={colors.muted} weight="fill" />
          <Text style={styles.hintText}>
            {t("KM atual estimado do veículo")}: {currentKm.toLocaleString("pt-BR")} km
          </Text>
        </View>
      </ScrollView>
    </View>
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
  content: { padding: 16, gap: 12 },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  alertText: { flex: 1, fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.error },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
  },
  itemBody: { flex: 1 },
  itemTitle: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.3 },
  itemSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  hintBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, marginTop: 4 },
  hintText: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
}));
