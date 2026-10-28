import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { X } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { TUTORIAL_VIDEOS } from "@/src/utils/videoContent";

export default function VideoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ id?: string }>();
  const video = TUTORIAL_VIDEOS.find((v) => v.id === params.id);

  const player = useVideoPlayer(video?.source ?? null, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <View style={styles.screen} testID="video-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="video-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {video ? t(video.title) : t("Vídeos")}
        </Text>
      </View>

      {!video ? (
        <View style={styles.centered}>
          <Text style={styles.dim}>{t("Conteúdo não encontrado.")}</Text>
        </View>
      ) : (
        <View style={[styles.body, { paddingBottom: insets.bottom + 12 }]}>
          <VideoView
            style={styles.video}
            player={player}
            nativeControls
            contentFit="contain"
            allowsFullscreen
            testID="video-player"
          />
          <Text style={styles.desc}>{t(video.description)}</Text>
        </View>
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
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3 },
  body: { flex: 1, backgroundColor: "#000" },
  video: { flex: 1, width: "100%" },
  desc: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: "#bdbdc2",
    paddingHorizontal: 16,
    paddingTop: 10,
    textAlign: "center",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dim: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
}));
