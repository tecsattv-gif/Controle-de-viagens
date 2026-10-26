import { useRouter } from "expo-router";
import { CaretRight, CalendarCheck, Gauge, Package, Truck } from "phosphor-react-native";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useAuth } from "@/src/context/AuthContext";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function NovoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { user } = useAuth();

  const canWrite = user?.is_admin || user?.can_write !== false;

  const go = (path: string) => {
    if (!canWrite) {
      Alert.alert(
        t("Ativar versão completa"),
        t("Sua versão de teste terminou ou a conta não está ativa. Ative para cadastrar ou alterar dados."),
        [
          { text: t("Cancelar"), style: "cancel" },
          { text: t("Ativar versão completa"), onPress: () => router.push("/ativar") },
        ],
      );
      return;
    }
    router.push(path);
  };

  return (
    <View style={styles.screen} testID="novo-screen">
      <ScreenHeader title={t("Novo")} subtitle={t("Cadastre uma viagem ou um frete")} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Pressable
          style={styles.item}
          onPress={() => go("/viagem-form")}
          testID="menu-cadastrar-viagem"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Truck size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Cadastrar Nova Viagem")}</Text>
            <Text style={styles.itemSub}>{t("Data, KM, origem/destino e dados operacionais")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => go("/frete-form")}
          testID="menu-cadastrar-frete"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Package size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Cadastrar Frete")}</Text>
            <Text style={styles.itemSub}>{t("Cliente, origem/destino, valor e referência")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => go("/controle-diario-form")}
          testID="menu-controle-diario"
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
          onPress={() => go("/controle-mensal-form")}
          testID="menu-controle-mensal"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <Gauge size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Controle mensal de KM")}</Text>
            <Text style={styles.itemSub}>{t("KM inicial e final do mês")}</Text>
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
  itemTitle: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 20,
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  itemSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    marginTop: 4,
  },
  linkText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.brandPrimary },
}));
