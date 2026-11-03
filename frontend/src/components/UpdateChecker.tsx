// Atualização pelo próprio app (igual ao SpeedGuard).
//
// Cada build do GitHub publica o APK numa "Release" chamada build-<número>.
// O app compara esse número com o do build instalado e, se houver um mais
// novo, pergunta ao usuário. Com "Atualizar", baixa o APK e abre o
// instalador do Android, que pede a confirmação final. Os dados ficam no
// telefone e continuam lá depois da atualização.
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Text, View } from "react-native";

const API =
  "https://api.github.com/repos/tecsattv-gif/Controle-de-viagens/releases/latest";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // no máximo a cada 6 h

type UpdateInfo = { build: number; url: string; size: number };

/** Número do build instalado (gravado pelo GitHub em app.json → extra). */
export function installedBuild(): number {
  const n = Number((Constants.expoConfig?.extra as any)?.buildNumber ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function latest(): Promise<UpdateInfo | null> {
  const r = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) return null;
  const j = await r.json();
  const m = /(\d+)/.exec(String(j?.tag_name ?? ""));
  const apk = (j?.assets ?? []).find((a: any) => String(a?.name).endsWith(".apk"));
  if (!m || !apk) return null;
  return { build: Number(m[1]), url: apk.browser_download_url, size: apk.size ?? 0 };
}

// Pequeno arquivo com a hora da última verificação e a versão recusada.
const stateFile = () => new File(Paths.document, "update-state.json");
async function readState(): Promise<{ last?: number; skipped?: number }> {
  try {
    const f = stateFile();
    return f.exists ? JSON.parse(await f.text()) : {};
  } catch {
    return {};
  }
}
async function writeState(s: { last?: number; skipped?: number }) {
  try {
    const f = stateFile();
    if (f.exists) f.delete();
    f.create();
    await f.write(JSON.stringify(s));
  } catch {}
}

let setBusyGlobal: ((v: string | null) => void) | null = null;

async function install(info: UpdateInfo) {
  setBusyGlobal?.(`Baixando a atualização${info.size ? ` (${Math.round(info.size / 1048576)} MB)` : ""}…`);
  try {
    const dest = new File(Paths.cache, `ControleViagens-${info.build}.apk`);
    if (dest.exists) dest.delete();
    const file = await File.downloadFileAsync(info.url, dest);
    setBusyGlobal?.(null);
    // Abre o instalador do Android. Na 1ª vez ele pede para liberar
    // "Instalar apps desconhecidos" para o Controle de Viagens.
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: (file as any).contentUri ?? file.uri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: "application/vnd.android.package-archive",
    });
  } catch (e: any) {
    setBusyGlobal?.(null);
    Alert.alert("Atualização", `Falha ao baixar ou abrir a atualização. Tente de novo.\n\n${e?.message ?? ""}`);
  }
}

function ask(info: UpdateInfo, onLater?: () => void) {
  Alert.alert(
    "Nova versão do Controle de Viagens",
    `Há uma versão nova (build ${info.build}; você tem o ${installedBuild()}).\n\n` +
      "Quer baixar e instalar agora? Seus dados continuam no telefone.",
    [
      { text: "Agora não", style: "cancel", onPress: onLater },
      { text: "Atualizar", onPress: () => install(info) },
    ],
  );
}

/** Botão "Procurar atualização" (Cadastros). */
export async function checkForUpdateManual() {
  if (Platform.OS !== "android") return;
  try {
    const info = await latest();
    if (!info || info.build <= installedBuild()) {
      Alert.alert("Atualização", `Você já está na versão mais nova (build ${installedBuild()}).`);
      return;
    }
    ask(info);
  } catch {
    Alert.alert("Atualização", "Sem conexão para procurar atualização.");
  }
}

/** Verifica sozinho ao abrir o app e mostra o "Baixando…" na tela. */
export function UpdateChecker() {
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setBusyGlobal = setBusy;
    if (Platform.OS !== "android") return;
    const timer = setTimeout(async () => {
      const st = await readState();
      if (st.last && Date.now() - st.last < CHECK_EVERY_MS) return;
      await writeState({ ...st, last: Date.now() });
      try {
        const info = await latest();
        if (!info || info.build <= installedBuild()) return;
        if (st.skipped === info.build) return; // "Agora não" para este build
        ask(info, async () => writeState({ ...(await readState()), skipped: info.build }));
      } catch {}
    }, 5000);
    return () => {
      clearTimeout(timer);
      setBusyGlobal = null;
    };
  }, []);

  return (
    <Modal visible={busy !== null} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
        <View style={{ backgroundColor: "#1E1E1E", padding: 24, borderRadius: 16, alignItems: "center", minWidth: 240 }}>
          <ActivityIndicator size="large" color="#00BCD4" />
          <Text style={{ color: "#fff", marginTop: 14, fontSize: 16, textAlign: "center" }}>{busy}</Text>
        </View>
      </View>
    </Modal>
  );
}
