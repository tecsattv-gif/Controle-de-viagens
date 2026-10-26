import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { FloppyDisk, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSaveTireSettings, useTireSettings } from "@/src/api/tires";
import { TextField } from "@/src/components/TextField";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { DOLLY_LAYOUTS, TRAILER_LAYOUTS, TRUCK_LAYOUTS, UnitLayout } from "@/src/utils/axleMaps";
import { parseNumberInput } from "@/src/utils/format";

export default function PneusConfigScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const { data: settings, isLoading } = useTireSettings();
  const saveM = useSaveTireSettings();

  const [green, setGreen] = useState("5");
  const [yellow, setYellow] = useState("3");
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (settings && !prefilled) {
      setGreen(String(settings.green_min_mm ?? 5));
      setYellow(String(settings.yellow_min_mm ?? 3));
      setPrefilled(true);
    }
  }, [settings, prefilled]);

  const save = () => {
    const g = parseNumberInput(green);
    const y = parseNumberInput(yellow);
    saveM.mutate(
      { green_min_mm: isNaN(g) ? 5 : g, yellow_min_mm: isNaN(y) ? 3 : y },
      {
        onSuccess: () => {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
      },
    );
  };

  const renderGroup = (title: string, list: UnitLayout[]) => (
    <View style={styles.libGroup}>
      <Text style={styles.libGroupTitle}>{title}</Text>
      {list.map((l) => {
        const tires = l.axles.reduce((acc, a) => acc + (a.dual ? 4 : 2), 0);
        return (
          <View key={l.key} style={styles.libRow}>
            <Text style={styles.libName}>{t(l.name)}</Text>
            <Text style={styles.libMeta}>{t("{a} eixos · {p} pneus", { a: l.axles.length, p: tires })}</Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.screen} testID="pneus-config-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="config-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Configurações dos Pneus")}</Text>
      </View>

      {isLoading && !prefilled ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        >
          <Text style={styles.section}>{t("Limites de desgaste (sulco)")}</Text>
          <Text style={styles.hint}>{t("Verde ≥ mínimo bom · Amarelo entre atenção e bom · Vermelho abaixo da atenção.")}</Text>
          <TextField
            label={t("Mínimo para Bom (mm)")}
            value={green}
            onChangeText={setGreen}
            keyboardType="decimal-pad"
            hint={t("Sulco igual ou acima deste valor é exibido em verde (bom estado).")}
            testID="field-green-mm"
          />
          <TextField
            label={t("Mínimo para Atenção (mm)")}
            value={yellow}
            onChangeText={setYellow}
            keyboardType="decimal-pad"
            hint={t("Entre este valor e o mínimo bom, o pneu fica amarelo. Abaixo dele, fica vermelho (trocar).")}
            testID="field-yellow-mm"
          />
          <Pressable style={styles.saveBtn} onPress={save} disabled={saveM.isPending} testID="save-tire-settings">
            {saveM.isPending ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <FloppyDisk size={20} color={colors.onBrandPrimary} weight="bold" />
                <Text style={styles.saveText}>{t("Salvar")}</Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.section, { marginTop: 20 }]}>{t("Biblioteca de Mapas de Eixos")}</Text>
          <Text style={styles.hint}>{t("Configurações padrão disponíveis ao montar o mapa do veículo.")}</Text>
          {renderGroup(t("Caminhões / Cavalos"), TRUCK_LAYOUTS)}
          {renderGroup(t("Reboques / Semirreboques"), TRAILER_LAYOUTS)}
          <Text style={styles.hint}>
            {t("Reboques: configure a quantidade de eixos e o rodado (simples/duplo) de cada eixo no Mapa dos Pneus.")}
          </Text>
          {renderGroup(t("Dollys"), DOLLY_LAYOUTS)}
        </ScrollView>
      )}
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 10 },
  section: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.brandPrimary, letterSpacing: 0.3 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginBottom: 4 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    marginTop: 6,
  },
  saveText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.3, color: colors.onBrandPrimary },
  libGroup: { marginTop: 8, gap: 6 },
  libGroupTitle: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.onSurface },
  libRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  libName: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface, flex: 1 },
  libMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
}));
