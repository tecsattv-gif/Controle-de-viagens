import { useRouter } from "expo-router";
import { CaretRight, ClockCounterClockwise, FilePdf, Gear, MapTrifold, Plus, X } from "phosphor-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function PneusMenuScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const options: { key: string; icon: React.ReactNode; title: string; sub: string; route: string; testID: string }[] = [
    {
      key: "mapa",
      icon: <MapTrifold size={26} color={colors.brandPrimary} weight="fill" />,
      title: t("Mapa dos Pneus"),
      sub: t("Veja os eixos e pneus do veículo"),
      route: "/pneus-mapa",
      testID: "menu-pneus-mapa",
    },
    {
      key: "cadastrar",
      icon: <Plus size={26} color={colors.brandPrimary} weight="bold" />,
      title: t("Cadastrar Pneu"),
      sub: t("Toque numa posição vazia do mapa"),
      route: "/pneus-mapa",
      testID: "menu-pneus-cadastrar",
    },
    {
      key: "historico",
      icon: <ClockCounterClockwise size={26} color={colors.brandPrimary} weight="fill" />,
      title: t("Histórico"),
      sub: t("Medições, trocas e movimentações"),
      route: "/pneus-historico",
      testID: "menu-pneus-historico",
    },
    {
      key: "relatorios",
      icon: <FilePdf size={26} color={colors.brandPrimary} weight="fill" />,
      title: t("Relatórios PDF"),
      sub: t("Relatório por veículo ou por pneu"),
      route: "/pneus-relatorios",
      testID: "menu-pneus-relatorios",
    },
  ];

  return (
    <View style={styles.screen} testID="pneus-menu-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="pneus-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Controle de Pneus")}</Text>
        <Pressable onPress={() => router.push("/pneus-config")} style={styles.iconBtn} hitSlop={10} testID="pneus-config-open">
          <Gear size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {options.map((o) => (
          <Pressable key={o.key} style={styles.item} onPress={() => router.push(o.route as any)} testID={o.testID} accessibilityRole="button">
            <View style={styles.iconBox}>{o.icon}</View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{o.title}</Text>
              <Text style={styles.itemSub}>{o.sub}</Text>
            </View>
            <CaretRight size={22} color={colors.muted} weight="bold" />
          </Pressable>
        ))}
      </ScrollView>
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
  content: { padding: 16, gap: 12 },
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
}));
