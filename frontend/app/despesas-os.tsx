import { useRouter } from "expo-router";
import { CaretRight, ClipboardText, ListChecks, PlusCircle, X } from "phosphor-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

export default function OsMenuScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  return (
    <View style={styles.screen} testID="os-menu-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="os-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("OS – Ordem de Serviço")}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <Pressable
          style={styles.item}
          onPress={() => router.push("/os-form")}
          testID="menu-nova-os"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <PlusCircle size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Nova OS")}</Text>
            <Text style={styles.itemSub}>{t("Crie uma ordem de serviço com descrições")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <Pressable
          style={styles.item}
          onPress={() => router.push("/os-historico")}
          testID="menu-historico-os"
          accessibilityRole="button"
        >
          <View style={styles.iconBox}>
            <ListChecks size={26} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>{t("Histórico de OS")}</Text>
            <Text style={styles.itemSub}>{t("Ordens de serviço cadastradas, editar e PDF")}</Text>
          </View>
          <CaretRight size={22} color={colors.muted} weight="bold" />
        </Pressable>

        <View style={styles.hintBox}>
          <ClipboardText size={18} color={colors.muted} weight="fill" />
          <Text style={styles.hintText}>
            {t("Cada OS recebe um número sequencial automático (OS Nº 0001).")}
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
  hintText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.muted },
}));
