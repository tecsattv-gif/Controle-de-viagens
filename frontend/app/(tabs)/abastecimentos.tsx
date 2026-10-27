import { useRouter } from "expo-router";
import { CaretRight, ChartBar, CircleIcon as Circle, ClipboardText, DotsThreeOutline, Drop, GasPump, Receipt, Wrench } from "phosphor-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function DespesasScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  return (
    <View style={styles.screen} testID="despesas-screen">
      <ScreenHeader title={t("Despesas")} subtitle={t("Abastecimento e pedágios")} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Pressable
          style={styles.item}
          onPress={() => router.push("/despesas-abastecimento")}
          testID="menu-abastecimento"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <GasPump size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Abastecimento")}</Text>
            <Text style={styles.itemSub}>{t("Diesel e ARLA 32, com histórico")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/despesas-pedagios")}
          testID="menu-pedagios"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Receipt size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Pedágios")}</Text>
            <Text style={styles.itemSub}>{t("Registre pedágios e veja o total")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/despesas-manutencao")}
          testID="menu-manutencao"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Wrench size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Manutenção")}</Text>
            <Text style={styles.itemSub}>{t("Mecânica, elétrica, borracharia e outros")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/despesas-outros")}
          testID="menu-outros"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <DotsThreeOutline size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Outros")}</Text>
            <Text style={styles.itemSub}>{t("Local, serviço prestado e valor")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/despesas-troca-oleo")}
          testID="menu-troca-oleo"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Drop size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Troca de Óleo e Filtros")}</Text>
            <Text style={styles.itemSub}>{t("Óleos, filtros e próximas trocas")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/despesas-pneus")}
          testID="menu-pneus"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Circle size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Controle de Pneus")}</Text>
            <Text style={styles.itemSub}>{t("Mapa, cadastro, medições e trocas")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/despesas-os")}
          testID="menu-os"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <ClipboardText size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("OS – Ordem de Serviço")}</Text>
            <Text style={styles.itemSub}>{t("Crie e controle ordens de serviço")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.reportBtn}
          onPress={() => router.push("/relatorio-despesas")}
          testID="menu-relatorio-despesas"
          accessibilityRole="button"
        >
          <ChartBar size={22} color={colors.onBrandPrimary} weight="fill" />
          <Text style={styles.reportBtnText}>{t("Relatório de Despesas")}</Text>
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
  itemTitle: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 20,
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  itemSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 14,
    marginTop: 4,
    backgroundColor: colors.brandPrimary,
  },
  reportBtnText: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.5,
    color: colors.onBrandPrimary,
  },
}));
