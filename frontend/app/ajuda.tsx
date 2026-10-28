import { useRouter } from "expo-router";
import { CaretRight, MagnifyingGlass, Play, Question, Rocket, VideoCamera, X } from "phosphor-react-native";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { HELP_ARTICLES, searchArticles } from "@/src/utils/helpContent";
import { TUTORIAL_VIDEOS } from "@/src/utils/videoContent";

export default function AjudaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const [query, setQuery] = useState("");

  const results = searchArticles(HELP_ARTICLES, query, t);

  return (
    <View style={styles.screen} testID="ajuda-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="ajuda-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Ajuda e Tutoriais")}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t("Buscar ajuda...")}
            placeholderTextColor={colors.muted}
            testID="ajuda-search"
          />
        </View>

        <Pressable style={styles.wizardCard} onPress={() => router.push("/assistente")} testID="ajuda-open-wizard">
          <View style={styles.wizardIcon}>
            <Rocket size={24} color={colors.onBrandPrimary} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.wizardTitle}>{t("Assistente de configuração")}</Text>
            <Text style={styles.wizardSub}>{t("Siga o passo a passo para configurar o aplicativo")}</Text>
          </View>
          <CaretRight size={22} color={colors.onBrandPrimary} weight="bold" />
        </Pressable>

        <Text style={styles.section}>{t("Tutoriais por módulo")}</Text>
        {results.length === 0 ? (
          <Text style={styles.dim}>{t("Nenhum resultado para a busca.")}</Text>
        ) : (
          results.map((a) => (
            <Pressable
              key={a.id}
              style={styles.item}
              onPress={() => router.push({ pathname: "/ajuda-artigo", params: { id: a.id } })}
              testID={`ajuda-article-${a.id}`}
            >
              <View style={styles.itemIcon}>
                <Question size={22} color={colors.brandPrimary} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{t(a.title)}</Text>
                <Text style={styles.itemSub} numberOfLines={2}>{t(a.intro)}</Text>
              </View>
              <CaretRight size={20} color={colors.muted} weight="bold" />
            </Pressable>
          ))
        )}

        <View style={styles.sectionRow}>
          <VideoCamera size={18} color={colors.brandPrimary} weight="fill" />
          <Text style={[styles.section, { marginTop: 0 }]}>{t("Vídeos")}</Text>
        </View>
        {TUTORIAL_VIDEOS.map((v, i) => (
          <Pressable
            key={v.id}
            style={styles.videoItem}
            onPress={() => router.push({ pathname: "/video", params: { id: v.id } })}
            testID={`ajuda-video-${v.id}`}
          >
            <View style={styles.thumbWrap}>
              <Image source={v.thumbnail} style={styles.thumb} resizeMode="cover" />
              <View style={styles.playBadge}>
                <Play size={18} color={colors.onBrandPrimary} weight="fill" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.videoNum}>{t("Vídeo {n}", { n: i + 1 })}</Text>
              <Text style={styles.itemTitle}>{t(v.title)}</Text>
              <Text style={styles.itemSub} numberOfLines={3}>{t(v.description)}</Text>
              <Text style={styles.videoDuration}>{v.duration}</Text>
            </View>
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
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.onSurface },
  wizardCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.brandPrimary,
    borderRadius: 14,
    padding: 14,
  },
  wizardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  wizardTitle: { fontFamily: fonts.displayBold, fontSize: 17, color: colors.onBrandPrimary },
  wizardSub: { fontFamily: fonts.body, fontSize: 12, color: colors.onBrandPrimary, opacity: 0.9, marginTop: 2 },
  section: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.brandPrimary, marginTop: 6 },
  dim: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
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
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
  },
  itemTitle: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  itemSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  videoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  thumbWrap: {
    width: 84,
    height: 112,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { position: "absolute", width: "100%", height: "100%" },
  playBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
    paddingLeft: 3,
  },
  videoNum: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: colors.brandPrimary, letterSpacing: 0.5 },
  videoDuration: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 4 },
}));
