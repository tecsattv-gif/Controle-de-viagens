import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { CheckCircle, CircleIcon as Circle, Rocket, X } from "phosphor-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDrivers } from "@/src/api/drivers";
import { useTrips } from "@/src/api/trips";
import { useVehicles } from "@/src/api/vehicles";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { useReportHeader } from "@/src/utils/reportHeader";
import { HELP_WIZARD_KEY } from "@/src/utils/wizard";

export default function AssistenteScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const { companyName } = useReportHeader();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: trips } = useTrips();

  const steps = [
    {
      key: "empresa",
      title: t("Dados da empresa"),
      sub: t("Nome e logo para os relatórios"),
      done: !!(companyName && companyName.trim()),
      action: () => router.push("/(tabs)/cadastros"),
    },
    {
      key: "veiculo",
      title: t("Cadastrar veículo"),
      sub: t("Cavalo, reboques e dolly"),
      done: !!(vehicles && vehicles.length > 0),
      action: () => router.push("/vehicle-form"),
    },
    {
      key: "motorista",
      title: t("Cadastrar motorista"),
      sub: t("Responsável pelas viagens"),
      done: !!(drivers && drivers.length > 0),
      action: () => router.push("/driver-form"),
    },
    {
      key: "viagem",
      title: t("Registrar a primeira viagem"),
      sub: t("Comece a acompanhar a quilometragem"),
      done: !!(trips && trips.length > 0),
      action: () => router.push("/(tabs)/nova"),
    },
  ];

  const allDone = steps.every((s) => s.done);

  const finish = async () => {
    await AsyncStorage.setItem(HELP_WIZARD_KEY, "1");
    // Depois da configuração inicial, voltar sempre ao Resumo.
    router.dismissTo("/");
  };

  return (
    <View style={styles.screen} testID="assistente-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.iconBtn}>
          <Rocket size={22} color={colors.brandPrimary} weight="fill" />
        </View>
        <Text style={styles.title}>{t("Assistente de configuração")}</Text>
        <Pressable onPress={finish} style={styles.iconBtn} hitSlop={10} testID="assistente-skip">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.lead}>
          {t("Vamos deixar o aplicativo pronto para uso. Os dados que você já tem são mantidos — nada é apagado.")}
        </Text>

        {steps.map((s) => (
          <Pressable key={s.key} style={styles.item} onPress={s.action} testID={`wizard-step-${s.key}`}>
            {s.done ? (
              <CheckCircle size={28} color={colors.success} weight="fill" />
            ) : (
              <Circle size={28} color={colors.muted} weight="regular" />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{s.title}</Text>
              <Text style={styles.itemSub}>{s.sub}</Text>
            </View>
            <Text style={[styles.itemAction, s.done && styles.itemActionDone]}>{s.done ? t("Concluído") : t("Abrir")}</Text>
          </Pressable>
        ))}

        <Pressable style={styles.finishBtn} onPress={finish} testID="wizard-finish">
          <Text style={styles.finishText}>{allDone ? t("Concluir") : t("Concluir depois")}</Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/ajuda")} style={styles.helpLink} testID="wizard-open-help">
          <Text style={styles.helpLinkText}>{t("Ver todos os tutoriais")}</Text>
        </Pressable>
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
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 20, color: colors.onSurface, letterSpacing: 0.3 },
  content: { padding: 16, gap: 12 },
  lead: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 21 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  itemTitle: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  itemSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  itemAction: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.brandPrimary },
  itemActionDone: { color: colors.success },
  finishBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  finishText: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onBrandPrimary, letterSpacing: 0.3 },
  helpLink: { alignItems: "center", paddingVertical: 10 },
  helpLinkText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.brandPrimary },
}));
