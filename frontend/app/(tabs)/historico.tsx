import { useRouter } from "expo-router";
import { CaretRight, CalendarCheck, ChartBar, GasPump, Gauge, Package, Receipt, Truck, Wrench } from "phosphor-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function HistoricoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  return (
    <View style={styles.screen} testID="historico-screen">
      <ScreenHeader title={t("Histórico")} subtitle={t("Relatórios de Viagens, Fretes e Despesas")} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Pressable
          style={styles.reportBtn}
          onPress={() => router.push("/relatorio-historico")}
          testID="menu-relatorio-geral"
          accessibilityRole="button"
        >
          <ChartBar size={22} color={colors.onBrandPrimary} weight="fill" />
          <Text style={styles.reportBtnText}>{t("Relatório Geral (escolher itens)")}</Text>
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/relatorios")}
          testID="menu-relatorio-viagens"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Truck size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Viagens")}</Text>
            <Text style={styles.itemSub}>{t("Datas, KM inicial/final, KM rodados, locais e totais")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/relatorio-controle-diario")}
          testID="menu-relatorio-controle-diario"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <CalendarCheck size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Controle Diário")}</Text>
            <Text style={styles.itemSub}>{t("KM do dia, locais, horários e paradas")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/controle-mensal-lista")}
          testID="menu-controle-mensal-lista"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Gauge size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Controle Mensal de KM")}</Text>
            <Text style={styles.itemSub}>{t("KM inicial/final de cada mês fechado")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/relatorio-fretes")}
          testID="menu-relatorio-fretes"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Package size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Fretes")}</Text>
            <Text style={styles.itemSub}>{t("Cliente, origem/destino, valor, peso e totais")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/relatorio-abastecimentos")}
          testID="menu-relatorio-abastecimentos"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <GasPump size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Abastecimento")}</Text>
            <Text style={styles.itemSub}>{t("Diesel, ARLA, litros, KM e total gasto")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/relatorio-pedagios")}
          testID="menu-relatorio-pedagios"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Receipt size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Pedágios")}</Text>
            <Text style={styles.itemSub}>{t("Local, valor e total no período")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/relatorio-manutencao")}
          testID="menu-relatorio-manutencao"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Wrench size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Manutenção")}</Text>
            <Text style={styles.itemSub}>{t("Categoria, descrição, KM e total gasto")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
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
  itemHighlight: { borderColor: colors.brandPrimary, borderWidth: 1.5 },
  itemTitle: { fontFamily: fonts.displaySemiBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.3 },
  itemSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
  },
  reportBtnText: {
    fontFamily: fonts.displayBold,
    fontSize: 17,
    letterSpacing: 0.3,
    color: colors.onBrandPrimary,
  },
}));
