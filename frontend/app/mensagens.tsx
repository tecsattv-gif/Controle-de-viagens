import { useRouter } from "expo-router";
import { Trash, X } from "phosphor-react-native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Message, useDeleteMessage, useMarkRead, useMessages } from "@/src/api/messages";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const TYPE_META: Record<string, { emoji: string; key: string }> = {
  info: { emoji: "ℹ️", key: "Informação" },
  warning: { emoji: "⚠️", key: "Aviso" },
  payment: { emoji: "💳", key: "Pagamento/Assinatura" },
  update: { emoji: "📱", key: "Atualização do aplicativo" },
};

function formatDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function MensagensScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { data, isLoading, refetch, isRefetching } = useMessages();
  const markRead = useMarkRead();
  const del = useDeleteMessage();

  const open = (m: Message) => {
    if (!m.read) markRead.mutate(m.message_id);
  };

  return (
    <View style={styles.screen} testID="mensagens-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10} testID="mensagens-close">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Mensagens")}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
        >
          {(data ?? []).length === 0 ? (
            <Text style={styles.empty}>{t("Você não tem mensagens.")}</Text>
          ) : (
            (data ?? []).map((m) => {
              const meta = TYPE_META[m.type] || TYPE_META.info;
              return (
                <Pressable
                  key={m.message_id}
                  style={[styles.card, !m.read && styles.cardUnread]}
                  onPress={() => open(m)}
                  testID={`message-${m.message_id}`}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.type}>{meta.emoji} {t(meta.key)}</Text>
                    {!m.read ? <View style={styles.dot} testID="message-unread-dot" /> : null}
                    <Pressable onPress={() => del.mutate(m.message_id)} hitSlop={10} testID={`message-delete-${m.message_id}`}>
                      <Trash size={18} color={colors.error} weight="bold" />
                    </Pressable>
                  </View>
                  <Text style={[styles.msgTitle, !m.read && styles.bold]}>{m.title}</Text>
                  <Text style={styles.body}>{m.body}</Text>
                  <Text style={styles.date}>{formatDateTime(m.created_at)}</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
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
  title: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3, flex: 1 },
  content: { padding: 16, gap: 12 },
  empty: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  cardUnread: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  type: { flex: 1, fontFamily: fonts.body, fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  msgTitle: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  bold: { fontFamily: fonts.displayBold },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 20 },
  date: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
}));
