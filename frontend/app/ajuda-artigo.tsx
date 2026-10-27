import { useLocalSearchParams, useRouter } from "expo-router";
import { X } from "phosphor-react-native";
import { ScrollView, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { HELP_ARTICLES } from "@/src/utils/helpContent";

export default function AjudaArtigoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();
  const article = HELP_ARTICLES.find((a) => a.id === params.id);

  return (
    <View style={styles.screen} testID="ajuda-artigo-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="artigo-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{article ? t(article.title) : t("Ajuda")}</Text>
      </View>

      {!article ? (
        <View style={styles.centered}>
          <Text style={styles.dim}>{t("Conteúdo não encontrado.")}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.intro}>{t(article.intro)}</Text>
          {article.steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumTxt}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{t(s)}</Text>
            </View>
          ))}
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dim: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  content: { padding: 16, gap: 12 },
  intro: { fontFamily: fonts.body, fontSize: 15, color: colors.onSurfaceSecondary, lineHeight: 22, marginBottom: 4 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumTxt: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.onBrandPrimary },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.onSurface, lineHeight: 22, paddingTop: 2 },
}));
