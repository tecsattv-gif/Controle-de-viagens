import { useRouter } from "expo-router";
import { CloudArrowDown, CloudArrowUp, FolderSimple, ShieldCheck, UserSwitch, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/context/AuthContext";
import { useT } from "@/src/i18n";
import { backupFolderLabel, exportBackup, pickBackup, restoreBackup, saveBackupToFolder } from "@/src/local/backup";
import {
  getMigrationState,
  importFromServer,
  legacyLoginEmail,
  legacyLoginGoogle,
  legacyServerConfigured,
  loadLegacyToken,
  SessionExpiredError,
} from "@/src/local/migrate";
import { queryClient } from "@/src/query-client";
import { fonts, makeStyles, useTheme } from "@/src/theme";

function notify(title: string, msg: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

function confirm(title: string, msg: string, ok: string, cancel: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((resolve) =>
    Alert.alert(title, msg, [
      { text: cancel, style: "cancel", onPress: () => resolve(false) },
      { text: ok, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export default function BackupScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { refreshMe } = useAuth();

  const [busy, setBusy] = useState<"" | "export" | "restore" | "import" | "folder">("");
  const [showImport, setShowImport] = useState(false);
  const [importedFromServer, setImportedFromServer] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [importError, setImportError] = useState("");

  useEffect(() => {
    getMigrationState().then((s) => setImportedFromServer(s.done && s.source === "server"));
  }, []);

  const reloadAll = async () => {
    queryClient.clear();
    await queryClient.invalidateQueries();
    await refreshMe();
  };

  const [folderName, setFolderName] = useState("");
  useEffect(() => {
    backupFolderLabel().then(setFolderName);
  }, []);

  // Grava na pasta escolhida, substituindo o backup anterior.
  const doSaveFolder = async (pickNew = false) => {
    setBusy("folder");
    try {
      const r = await saveBackupToFolder(pickNew);
      if (!r) return;
      setFolderName(r.folder);
      notify(
        t("Backup salvo"),
        t("Backup salvo na pasta \"{f}\" ({r} registro(s), {p} foto(s)). O backup anterior foi substituído.", {
          f: r.folder,
          r: r.records,
          p: r.photos,
        }),
      );
    } catch (e: any) {
      notify(t("Erro"), e?.message || t("Não foi possível criar o backup."));
    } finally {
      setBusy("");
    }
  };

  const doExport = async () => {
    setBusy("export");
    try {
      const s = await exportBackup();
      if (Platform.OS === "web") {
        notify(t("Backup criado"), t("{r} registro(s) e {p} foto(s) salvos no arquivo.", { r: s.records, p: s.photos }));
      }
    } catch (e: any) {
      notify(t("Erro"), e?.message || t("Não foi possível criar o backup."));
    } finally {
      setBusy("");
    }
  };

  const doRestore = async () => {
    setBusy("restore");
    try {
      const picked = await pickBackup();
      if (!picked) return;
      const ok = await confirm(
        t("Restaurar backup"),
        t("O backup tem {r} registro(s) e {p} foto(s). Os dados atuais deste telefone serão SUBSTITUÍDOS pelos do backup. Continuar?", {
          r: picked.summary.records,
          p: picked.summary.photos,
        }),
        t("Restaurar"),
        t("Cancelar"),
      );
      if (!ok) return;
      await restoreBackup(picked.backup);
      await reloadAll();
      notify(t("Backup restaurado"), t("Os seus dados foram restaurados com sucesso."));
    } catch (e: any) {
      notify(t("Erro"), e?.message ? t(e.message) : t("Não foi possível restaurar o backup."));
    } finally {
      setBusy("");
    }
  };

  const runServerImport = async (token: string) => {
    const counts = await importFromServer(token);
    await reloadAll();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    setImportedFromServer(true);
    setShowImport(false);
    notify(t("Dados importados"), t("{n} registro(s) trazidos da conta online.", { n: total }));
  };

  const importWithSavedSession = async () => {
    setImportError("");
    setBusy("import");
    try {
      const token = await loadLegacyToken();
      if (token) await runServerImport(token);
      else setShowImport(true);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) setShowImport(true);
      else setImportError(e?.message || t("Não foi possível baixar os dados."));
    } finally {
      setBusy("");
    }
  };

  const importWithEmail = async () => {
    setImportError("");
    if (!email.trim() || !password) {
      setImportError(t("Informe o e-mail e a senha da sua conta."));
      return;
    }
    setBusy("import");
    try {
      await runServerImport(await legacyLoginEmail(email, password));
    } catch (e: any) {
      setImportError(e?.message || t("Não foi possível entrar."));
    } finally {
      setBusy("");
    }
  };

  const importWithGoogle = async () => {
    setImportError("");
    setBusy("import");
    try {
      const token = await legacyLoginGoogle();
      if (token) await runServerImport(token);
    } catch (e: any) {
      setImportError(e?.message || t("Não foi possível entrar com o Google."));
    } finally {
      setBusy("");
    }
  };

  return (
    <View style={styles.screen} testID="backup-screen">
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} testID="backup-back">
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{t("Backup e restauração")}</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.info}>
          <ShieldCheck size={22} color={colors.brandPrimary} weight="fill" />
          <Text style={styles.infoText}>
            {t("Os seus dados ficam guardados só neste telefone. Faça um backup de vez em quando e guarde o arquivo no Google Drive, e-mail ou WhatsApp. Se trocar ou perder o telefone, é com ele que recupera tudo.")}
          </Text>
        </View>

        {Platform.OS === "android" ? (
          <View>
            <Pressable style={styles.card} onPress={() => doSaveFolder(false)} disabled={!!busy} testID="backup-folder">
              <View style={styles.cardIcon}>
                {busy === "folder" ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <FolderSimple size={26} color={colors.onBrandPrimary} weight="fill" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t("Fazer backup na pasta")}</Text>
                <Text style={styles.cardSub}>
                  {folderName
                    ? t("Salva em \"{f}\" e substitui o backup anterior", { f: folderName })
                    : t("Na primeira vez escolha a pasta; depois o backup é salvo nela, substituindo o anterior")}
                </Text>
              </View>
            </Pressable>
            {folderName ? (
              <Pressable onPress={() => doSaveFolder(true)} disabled={!!busy} hitSlop={8} style={styles.changeFolder}>
                <Text style={styles.changeFolderText}>{t("Trocar pasta")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable style={styles.card} onPress={doExport} disabled={!!busy} testID="backup-export">
          <View style={styles.cardIcon}>
            {busy === "export" ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <CloudArrowUp size={26} color={colors.onBrandPrimary} weight="fill" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{t("Enviar backup")}</Text>
            <Text style={styles.cardSub}>{t("Cria um arquivo com todos os dados e fotos e abre as opções para guardar ou enviar (Drive, WhatsApp, e-mail)")}</Text>
          </View>
        </Pressable>

        <Pressable style={styles.card} onPress={doRestore} disabled={!!busy} testID="backup-restore">
          <View style={styles.cardIcon}>
            {busy === "restore" ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <CloudArrowDown size={26} color={colors.onBrandPrimary} weight="fill" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{t("Restaurar backup")}</Text>
            <Text style={styles.cardSub}>{t("Escolha um arquivo de backup (.json) para trazer os dados de volta")}</Text>
          </View>
        </Pressable>

        {legacyServerConfigured() ? (
          <View style={styles.legacy}>
            <View style={styles.legacyHead}>
              <UserSwitch size={22} color={colors.brandPrimary} weight="fill" />
              <Text style={styles.legacyTitle}>{t("Conta online antiga")}</Text>
            </View>
            <Text style={styles.cardSub}>
              {importedFromServer
                ? t("Os dados da sua conta online já foram trazidos para este telefone. Pode importar de novo: nada é duplicado.")
                : t("Se usava o app com uma conta (e-mail ou Google), traga os dados dela para este telefone.")}
            </Text>
            {!showImport ? (
              <Pressable style={styles.outlineBtn} onPress={importWithSavedSession} disabled={!!busy} testID="backup-import-server">
                {busy === "import" ? (
                  <ActivityIndicator color={colors.brandPrimary} />
                ) : (
                  <Text style={styles.outlineText}>{t("Trazer dados da conta online")}</Text>
                )}
              </Pressable>
            ) : (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t("E-mail")}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                  testID="backup-email"
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t("Senha")}
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  style={styles.input}
                  testID="backup-password"
                />
                <Pressable style={styles.primaryBtn} onPress={importWithEmail} disabled={!!busy} testID="backup-import-login">
                  {busy === "import" ? (
                    <ActivityIndicator color={colors.onBrandPrimary} />
                  ) : (
                    <Text style={styles.primaryText}>{t("Entrar e trazer os dados")}</Text>
                  )}
                </Pressable>
                <Pressable style={styles.outlineBtn} onPress={importWithGoogle} disabled={!!busy} testID="backup-import-google">
                  <Text style={styles.outlineText}>{t("Continuar com Google")}</Text>
                </Pressable>
              </>
            )}
            {importError ? <Text style={styles.error}>{importError}</Text> : null}
          </View>
        ) : null}
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
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: fonts.displayBold, fontSize: 22, color: colors.onSurface, letterSpacing: 0.3 },
  content: { padding: 16, gap: 14 },
  info: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.onSurface },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  changeFolder: { alignSelf: "flex-end", marginTop: 6, marginBottom: 4 },
  changeFolderText: { fontFamily: fonts.body, fontSize: 13, color: colors.brandPrimary, textDecorationLine: "underline" },
  cardTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface },
  cardSub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  legacy: {
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  legacyHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  legacyTitle: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onSurface },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.onSurface,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  primaryText: { fontFamily: fonts.displaySemiBold, fontSize: 16, color: colors.onBrandPrimary },
  outlineBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  outlineText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.brandPrimary },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.error, textAlign: "center" },
}));
