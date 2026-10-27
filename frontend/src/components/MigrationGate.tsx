// Tela exibida UMA VEZ, na primeira abertura da versão sem servidor:
// traz os dados da conta online antiga para o telefone.
//  - Se a sessão antiga ainda estiver salva no aparelho, importa sozinho.
//  - Senão pergunta se a pessoa já tinha conta; se sim, pede login só para trazer os dados.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { useT } from "@/src/i18n";
import {
  consumeWebGoogleRedirect,
  getMigrationState,
  importFromServer,
  legacyLoginEmail,
  legacyLoginGoogle,
  legacyServerConfigured,
  loadLegacyToken,
  markMigration,
  Progress,
  SessionExpiredError,
} from "@/src/local/migrate";
import { queryClient } from "@/src/query-client";
import { fonts, makeStyles, useTheme } from "@/src/theme";

type Phase = "checking" | "ask" | "login" | "importing" | "error" | "done";

export function MigrationGate({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { refreshMe } = useAuth();

  const [phase, setPhase] = useState<Phase>("checking");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const runImport = useCallback(
    async (token: string) => {
      setPhase("importing");
      setError("");
      setProgress(null);
      try {
        await importFromServer(token, setProgress);
        queryClient.clear();
        await refreshMe();
        setPhase("done");
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          setError(t("A sessão expirou. Entre com a sua conta para trazer os dados."));
          setPhase("login");
        } else {
          setError(e?.message || t("Não foi possível baixar os dados."));
          setPhase("error");
        }
      }
    },
    [refreshMe, t],
  );

  useEffect(() => {
    (async () => {
      const st = await getMigrationState();
      if (st.done || !legacyServerConfigured()) {
        setPhase("done");
        return;
      }
      try {
        const webToken = await consumeWebGoogleRedirect();
        if (webToken) return runImport(webToken);
      } catch (e: any) {
        setError(e?.message || "");
        setPhase("login");
        return;
      }
      const token = await loadLegacyToken();
      if (token) runImport(token);
      else setPhase("ask");
    })();
  }, [runImport]);

  const skip = async () => {
    await markMigration({ done: true, source: "skipped" });
    setPhase("done");
  };

  const loginEmail = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError(t("Informe o e-mail e a senha da sua conta."));
      return;
    }
    setBusy(true);
    try {
      const token = await legacyLoginEmail(email, password);
      await runImport(token);
    } catch (e: any) {
      setError(e?.message || t("Não foi possível entrar."));
    } finally {
      setBusy(false);
    }
  };

  const loginGoogle = async () => {
    setError("");
    setBusy(true);
    try {
      const token = await legacyLoginGoogle();
      if (token) await runImport(token);
    } catch (e: any) {
      setError(e?.message || t("Não foi possível entrar com o Google."));
    } finally {
      setBusy(false);
    }
  };

  if (phase === "done") return <>{children}</>;

  const header = (
    <>
      <Image source={require("../../assets/images/truck-logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t("CONTROLE DE VIAGENS")}</Text>
    </>
  );

  if (phase === "checking" || phase === "importing") {
    const pct = progress ? Math.round((progress.step / progress.total) * 100) : 0;
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]} testID="migration-importing">
        {header}
        {phase === "importing" ? (
          <>
            <Text style={styles.subtitle}>{t("Trazendo os seus dados para este telefone…")}</Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.hint}>{t("Não feche o aplicativo. Isto só acontece uma vez.")}</Text>
          </>
        ) : (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID={`migration-${phase}`}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {header}

          {phase === "ask" ? (
            <>
              <Text style={styles.subtitle}>{t("Novidade: agora os seus dados ficam guardados só neste telefone.")}</Text>
              <Text style={styles.body}>
                {t("Já usava o Controle de Viagens com uma conta (e-mail ou Google)? Traga os seus dados para este telefone.")}
              </Text>
              <Pressable style={styles.primaryBtn} onPress={() => setPhase("login")} testID="migration-yes">
                <Text style={styles.primaryText}>{t("Sim, trazer os meus dados")}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={skip} testID="migration-no">
                <Text style={styles.secondaryText}>{t("Não, começar do zero")}</Text>
              </Pressable>
            </>
          ) : null}

          {phase === "login" ? (
            <>
              <Text style={styles.subtitle}>{t("Entre na sua conta antiga")}</Text>
              <Text style={styles.body}>{t("Só uma vez, para copiar os seus dados para este telefone.")}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t("E-mail")}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
                testID="migration-email"
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t("Senha")}
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                style={styles.input}
                onSubmitEditing={loginEmail}
                testID="migration-password"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable style={[styles.primaryBtn, busy && styles.disabled]} onPress={loginEmail} disabled={busy} testID="migration-login">
                {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.primaryText}>{t("Entrar e trazer os dados")}</Text>}
              </Pressable>
              <Pressable style={[styles.secondaryBtn, busy && styles.disabled]} onPress={loginGoogle} disabled={busy} testID="migration-google">
                <Text style={styles.secondaryText}>{t("Continuar com Google")}</Text>
              </Pressable>
              <Pressable style={styles.linkBtn} onPress={() => setPhase("ask")} disabled={busy} testID="migration-back">
                <Text style={styles.linkText}>{t("Voltar")}</Text>
              </Pressable>
            </>
          ) : null}

          {phase === "error" ? (
            <>
              <Text style={styles.subtitle}>{t("Não foi possível trazer os dados")}</Text>
              <Text style={styles.error}>{error}</Text>
              <Text style={styles.body}>{t("Verifique a internet e tente novamente. Os seus dados continuam guardados na conta.")}</Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={async () => {
                  const token = await loadLegacyToken();
                  if (token) runImport(token);
                  else setPhase("login");
                }}
                testID="migration-retry"
              >
                <Text style={styles.primaryText}>{t("Tentar novamente")}</Text>
              </Pressable>
              <Pressable style={styles.linkBtn} onPress={skip} testID="migration-skip">
                <Text style={styles.linkText}>{t("Fazer depois (em Cadastros → Backup)")}</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 },
  logo: { width: 120, height: 120, borderRadius: 20, alignSelf: "center", marginBottom: 8 },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 28,
    color: colors.onSurface,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  subtitle: { fontFamily: fonts.displaySemiBold, fontSize: 18, color: colors.onSurface, textAlign: "center", marginTop: 8 },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, textAlign: "center", lineHeight: 21 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 12 },
  bar: {
    alignSelf: "stretch",
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceSecondary,
    marginTop: 20,
    overflow: "hidden",
  },
  barFill: { height: 8, backgroundColor: colors.brandPrimary },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
  },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.error, textAlign: "center" },
  primaryBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
    marginTop: 8,
  },
  primaryText: { fontFamily: fonts.displaySemiBold, fontSize: 17, color: colors.onBrandPrimary },
  secondaryBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  linkBtn: { alignItems: "center", paddingVertical: 12 },
  linkText: { fontFamily: fonts.body, fontSize: 14, color: colors.brandPrimary },
  disabled: { opacity: 0.6 },
}));
