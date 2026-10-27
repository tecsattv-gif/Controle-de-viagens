import { useRouter } from "expo-router";
import { GearSixIcon, PaperPlaneRightIcon, SparkleIcon, TrashIcon, XIcon } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AI_PROVIDERS,
  AIMessage,
  AINotConfiguredError,
  AIProvider,
  clearAIMessages,
  fetchAIMessages,
  getAIConfig,
  hasBuiltinKey,
  saveAIConfig,
  streamAIChat,
} from "@/src/api/ai";
import { useT } from "@/src/i18n";
import { fonts, makeStyles, useTheme } from "@/src/theme";

const SUGGESTIONS = [
  "Quantos KM rodei este mês?",
  "Qual foi o meu gasto com diesel nas últimas viagens?",
  "Como registo uma nova viagem?",
  "Que pneus precisam de atenção?",
];

// Minimal **bold** renderer for assistant answers.
function RichText({ text, style, boldStyle }: { text: string; style: any; boldStyle: any }) {
  const parts = text.split("**");
  return (
    <Text style={style} selectable>
      {parts.map((p, i) => (i % 2 === 1 ? <Text key={i} style={boldStyle}>{p}</Text> : p))}
    </Text>
  );
}

export default function AssistenteIAScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    Promise.all([fetchAIMessages(), getAIConfig()])
      .then(([msgs, cfg]) => {
        setMessages(msgs);
        setProvider(cfg.provider);
        setApiKey(cfg.apiKey);
        setModel(cfg.model);
        setHasKey(!!cfg.apiKey || hasBuiltinKey());
        if (!cfg.apiKey && !hasBuiltinKey()) setShowConfig(true);
      })
      .catch(() => setError(t("Não foi possível carregar a conversa.")))
      .finally(() => setLoading(false));
  }, [t]);

  const saveConfig = async () => {
    await saveAIConfig({ provider, apiKey, model });
    setHasKey(!!apiKey.trim() || hasBuiltinKey());
    setError("");
    if (apiKey.trim() || hasBuiltinKey()) setShowConfig(false);
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || streaming) return;
    setError("");
    setInput("");
    const now = new Date().toISOString();
    const replyId = `a_${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u_${Date.now()}`, role: "user", content: text, created_at: now },
      { id: replyId, role: "assistant", content: "", created_at: now },
    ]);
    setStreaming(true);
    try {
      await streamAIChat(text, (chunk) =>
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: x.content + chunk } : x))),
      );
    } catch (e: any) {
      setMessages((m) => m.filter((x) => !(x.id === replyId && !x.content)));
      if (e instanceof AINotConfiguredError) setShowConfig(true);
      setError(e?.message?.startsWith("Erro") || !e?.message
        ? t("Não foi possível obter resposta da IA. Verifique a internet e tente novamente.")
        : e.message);
    } finally {
      setStreaming(false);
    }
  };

  const clear = async () => {
    const ok = Platform.OS === "web"
      ? window.confirm(t("Apagar toda a conversa com o assistente?"))
      : await new Promise<boolean>((resolve) =>
          Alert.alert(t("Limpar conversa"), t("Apagar toda a conversa com o assistente?"), [
            { text: t("Cancelar"), style: "cancel", onPress: () => resolve(false) },
            { text: t("Apagar"), style: "destructive", onPress: () => resolve(true) },
          ]),
        );
    if (!ok) return;
    try {
      await clearAIMessages();
      setMessages([]);
    } catch {
      setError(t("Não foi possível limpar a conversa."));
    }
  };

  return (
    <View style={styles.screen} testID="ai-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="ai-back">
          <XIcon size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Assistente IA")}</Text>
        <Pressable onPress={() => setShowConfig((v) => !v)} style={styles.iconBtn} hitSlop={10} testID="ai-config">
          <GearSixIcon size={22} color={showConfig ? colors.brandPrimary : colors.muted} weight="bold" />
        </Pressable>
        {messages.length > 0 ? (
          <Pressable onPress={clear} style={styles.iconBtn} hitSlop={10} disabled={streaming} testID="ai-clear">
            <TrashIcon size={20} color={colors.muted} weight="bold" />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="translate-with-padding">
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {showConfig && !loading ? (
            <View style={styles.config} testID="ai-config-panel">
              <Text style={styles.configTitle}>{t("Configurar a IA")}</Text>
              <Text style={styles.configText}>
                {t("O assistente usa a sua própria chave de IA. As perguntas vão direto do telefone para o serviço escolhido.")}
              </Text>
              <View style={styles.chips}>
                {(Object.keys(AI_PROVIDERS) as AIProvider[]).map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.chip, provider === p && styles.chipOn]}
                    onPress={() => setProvider(p)}
                    testID={`ai-provider-${p}`}
                  >
                    <Text style={[styles.chipText, provider === p && styles.chipTextOn]}>
                      {AI_PROVIDERS[p].label}
                      {AI_PROVIDERS[p].free ? ` · ${t("grátis")}` : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.configText}>
                {provider === "gemini"
                  ? t("Crie a chave grátis com a sua conta Google em aistudio.google.com/apikey e cole abaixo.")
                  : t("Crie a chave em platform.openai.com/api-keys (pago por uso) e cole abaixo.")}
              </Text>
              <Pressable onPress={() => Linking.openURL(AI_PROVIDERS[provider].keyUrl)} testID="ai-get-key">
                <Text style={styles.link}>{t("Obter chave")} →</Text>
              </Pressable>
              <TextInput
                style={styles.configInput}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder={t("Cole aqui a chave (API key)")}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                testID="ai-key-input"
              />
              <TextInput
                style={styles.configInput}
                value={model}
                onChangeText={setModel}
                placeholder={t("Modelo (opcional) — padrão: {m}", { m: AI_PROVIDERS[provider].defaultModel })}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                testID="ai-model-input"
              />
              <Pressable style={styles.saveBtn} onPress={saveConfig} testID="ai-save-config">
                <Text style={styles.saveText}>{t("Salvar")}</Text>
              </Pressable>
              <Text style={styles.configHint}>{t("A chave fica guardada só neste telefone.")}</Text>
            </View>
          ) : null}
          {loading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 32 }} />
          ) : messages.length === 0 ? (
            <View style={styles.empty} testID="ai-empty">
              <View style={styles.emptyIcon}>
                <SparkleIcon size={32} color={colors.brandPrimary} weight="fill" />
              </View>
              <Text style={styles.emptyTitle}>{t("Olá! Como posso ajudar?")}</Text>
              <Text style={styles.emptySub}>
                {t("Pergunte sobre o uso do app ou sobre os seus dados: viagens, despesas, pneus e KM.")}
              </Text>
              {SUGGESTIONS.map((s, i) => (
                <Pressable key={s} style={styles.suggestion} onPress={() => (hasKey ? send(t(s)) : setShowConfig(true))} testID={`ai-suggestion-${i}`}>
                  <Text style={styles.suggestionText}>{t(s)}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            messages.map((m) => (
              <View
                key={m.id}
                style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.botBubble]}
                testID={`ai-msg-${m.role}`}
              >
                {m.role === "assistant" && !m.content ? (
                  <ActivityIndicator size="small" color={colors.brandPrimary} />
                ) : m.role === "assistant" ? (
                  <RichText text={m.content} style={styles.botText} boldStyle={styles.bold} />
                ) : (
                  <Text style={styles.userText} selectable>{m.content}</Text>
                )}
              </View>
            ))
          )}
          {error ? <Text style={styles.error} testID="ai-error">{error}</Text> : null}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t("Escreva a sua pergunta…")}
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
            testID="ai-input"
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || streaming || !hasKey) && styles.disabled]}
            onPress={() => send()}
            disabled={!input.trim() || streaming || !hasKey}
            testID="ai-send"
            accessibilityLabel={t("Enviar")}
          >
            {streaming ? (
              <ActivityIndicator color={colors.onBrandPrimary} size="small" />
            ) : (
              <PaperPlaneRightIcon size={20} color={colors.onBrandPrimary} weight="fill" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { alignItems: "center", gap: 10, marginTop: 24 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
  },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  emptySub: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 8 },
  suggestion: {
    alignSelf: "stretch",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  suggestionText: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface },
  bubble: { maxWidth: "88%", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary },
  botBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.onBrandPrimary },
  botText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.onSurface },
  bold: { fontWeight: "700" },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.error, textAlign: "center" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.onSurface,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  disabled: { opacity: 0.5 },
  config: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  configTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  configText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
  configHint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurface },
  chipTextOn: { color: colors.onBrandPrimary, fontWeight: "700" },
  link: { fontFamily: fonts.body, fontSize: 14, color: colors.brandPrimary, fontWeight: "700" },
  configInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.onSurface,
  },
  saveBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  saveText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onBrandPrimary },
}));
