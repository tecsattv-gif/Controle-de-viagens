// Migração ÚNICA dos dados da conta online (servidor antigo) para o telefone.
//
// Na primeira abertura da versão sem servidor, o app baixa tudo o que o
// utilizador tinha na conta (viagens, despesas, pneus, fotos, configurações...)
// e grava no banco local. Depois disso o servidor não é mais usado.
//
// O endereço do servidor antigo vem de EXPO_PUBLIC_BACKEND_URL (o mesmo das
// versões anteriores) ou, se não estiver definido, de LEGACY_BACKEND_URL abaixo.

import { Directory, File, Paths } from "expo-file-system";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { getDeviceId, loadDeviceId } from "@/src/utils/deviceId";
import { LOCAL_PREFIX } from "@/src/utils/upload";

import { load, newId, nowIso, save } from "./db";

WebBrowser.maybeCompleteAuthSession();

// Endereço de PRODUÇÃO do servidor antigo (o mesmo gravado no APK oficial 1.0.29).
// Não usar o endereço de pré-visualização (*.preview.emergentagent.com): lá não há dados.
export const LEGACY_BACKEND_URL = "https://app-builder-demo-579.emergent.host";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || LEGACY_BACKEND_URL || "").replace(/\/+$/, "");
const API = `${BASE}/api`;
const TOKEN_KEY = "app_auth_token"; // mesma chave usada pelas versões antigas
const MIGRATION_KEY = "migration";

export type MigrationState = { done: boolean; at?: string; source?: "server" | "skipped"; counts?: Record<string, number> };

export function legacyServerConfigured(): boolean {
  return !!BASE;
}

export async function getMigrationState(): Promise<MigrationState> {
  return load<MigrationState>(MIGRATION_KEY, { done: false });
}

export async function markMigration(state: MigrationState): Promise<void> {
  await save(MIGRATION_KEY, state);
}

// ---------------------------------------------------------------------------
// Token da sessão antiga
// ---------------------------------------------------------------------------
export async function loadLegacyToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function storeLegacyToken(value: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") return;
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } else if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export class SessionExpiredError extends Error {}
/** O telefone já recebeu os dados de outra conta. */
export class OtherAccountError extends Error {}

const ACCOUNT_KEY = "migration_account";

function headers(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  const d = getDeviceId();
  if (d) h["X-Device-Id"] = d;
  return h;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const b = await res.json();
    const d = b?.detail;
    if (typeof d === "string") return d;
    if (d?.message) return d.message;
  } catch {
    // ignore
  }
  return statusMessage(res.status);
}

// Mensagens claras quando o servidor não devolve um texto de erro próprio.
function statusMessage(status: number): string {
  if (status === 404) return "Servidor da conta antiga não encontrado. Tente novamente mais tarde.";
  if (status === 401 || status === 403) return "E-mail ou senha incorretos, ou a sessão expirou.";
  if (status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (status >= 500) return "O servidor da conta antiga está com problemas. Tente novamente mais tarde.";
  return `Erro ${status} ao falar com o servidor da conta antiga.`;
}

const OFFLINE_MSG = "Sem ligação com o servidor da conta antiga. Verifique a internet e tente de novo.";

// fetch que troca o erro genérico de rede ("Network request failed") por uma mensagem clara.
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(OFFLINE_MSG);
  }
}

async function postAuth(path: string, body: Record<string, unknown>) {
  if (!BASE) throw new Error("Endereço do servidor antigo não configurado.");
  await loadDeviceId();
  const res = await safeFetch(`${API}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...body, device_id: getDeviceId() }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

/** Login com e-mail/senha na conta antiga (só para trazer os dados). */
export async function legacyLoginEmail(email: string, password: string): Promise<string> {
  const data = await postAuth("/auth/login", { email: email.trim(), password });
  await storeLegacyToken(data.access_token);
  return data.access_token;
}

/** Login com Google na conta antiga (mesmo fluxo das versões anteriores). */
export async function legacyLoginGoogle(): Promise<string | null> {
  const redirectUrl = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
  const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  if (Platform.OS === "web") {
    window.location.href = authUrl;
    return null;
  }
  let captured: string | null = null;
  const sub = Linking.addEventListener("url", (e) => {
    captured = e.url;
  });
  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let url: string | null = result.type === "success" ? result.url : null;
    if (!url) url = captured;
    if (!url) url = await Linking.getInitialURL();
    const m = url?.match(/[?#&]session_id=([^&#]+)/);
    if (!m) return null;
    const data = await postAuth("/auth/session", { session_id: decodeURIComponent(m[1]) });
    await storeLegacyToken(data.session_token);
    return data.session_token;
  } finally {
    sub.remove();
  }
}

/** Web: ao voltar do login Google o session_id vem na URL. */
export async function consumeWebGoogleRedirect(): Promise<string | null> {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const raw = window.location.hash + " " + window.location.search;
  const m = raw.match(/[?#&]session_id=([^&#\s]+)/);
  if (!m) return null;
  window.history.replaceState(window.history.state, "", window.location.origin + window.location.pathname);
  const data = await postAuth("/auth/session", { session_id: decodeURIComponent(m[1]) });
  await storeLegacyToken(data.session_token);
  return data.session_token;
}

// ---------------------------------------------------------------------------
// Download dos dados
// ---------------------------------------------------------------------------
async function getJson(path: string, token: string): Promise<any> {
  const res = await safeFetch(`${API}${path}`, { headers: headers(token) });
  if (res.status === 401) throw new SessionExpiredError("Sessão expirada");
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json();
}

// endpoint antigo -> chave do banco local
const LISTS: [string, string][] = [
  ["/trips", "trips"],
  ["/refuelings", "refuelings"],
  ["/toll-expenses", "toll_expenses"],
  ["/other-expenses", "other_expenses"],
  ["/maintenances", "maintenances"],
  ["/oil-changes", "oil_changes"],
  ["/service-orders", "service_orders"],
  ["/daily-logs", "daily_logs"],
  ["/monthly-km", "monthly_km"],
  ["/freights", "freights"],
  ["/vehicles", "vehicles"],
  ["/drivers", "drivers"],
  ["/tires", "tires"],
  ["/tire-configs", "tire_configs"],
];

function strip(d: any): any {
  if (!d || typeof d !== "object") return d;
  const { user_id: _u, deleted_at: _d, _id, ...rest } = d;
  return rest;
}

const isRemote = (p: string) => !!p && !p.startsWith(LOCAL_PREFIX) && !p.startsWith("data:");

// Baixa um arquivo (foto/logo) do servidor antigo para o telefone.
async function downloadFile(path: string): Promise<string> {
  const url = /^https?:/.test(path) ? path : `${API}/files/${path}`;
  if (Platform.OS === "web") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  const dir = new Directory(Paths.document, "files");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const m = path.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  const name = `${newId()}.${m ? m[1] : "jpg"}`;
  const dest = new File(dir, name);
  await File.downloadFileAsync(url, dest);
  return `${LOCAL_PREFIX}files/${name}`;
}

// Junta registros: mantém os locais e acrescenta os do servidor que ainda não existem.
function mergeById(local: any[], incoming: any[]): any[] {
  const ids = new Set(local.map((x) => x.id));
  return [...local, ...incoming.filter((x) => x?.id && !ids.has(x.id))];
}

export type Progress = { step: number; total: number; label: string };

/**
 * Baixa todos os dados da conta antiga e grava no telefone.
 * Lança SessionExpiredError se o token não for mais válido.
 */
export async function importFromServer(
  token: string,
  onProgress?: (p: Progress) => void,
): Promise<Record<string, number>> {
  if (!BASE) throw new Error("Endereço do servidor antigo não configurado.");
  await loadDeviceId();
  const total = LISTS.length + 4;
  let step = 0;
  const tick = (label: string) => onProgress?.({ step: ++step, total, label });
  const counts: Record<string, number> = {};

  tick("Conta");
  const me = await getJson("/auth/me", token);

  // Cada telefone recebe os dados de UMA só conta: a primeira importada.
  const owner = await load<{ user_id?: string; email?: string } | null>(ACCOUNT_KEY, null);
  if (owner?.user_id && me?.user_id && owner.user_id !== me.user_id) {
    await storeLegacyToken(null);
    throw new OtherAccountError(
      `Este telefone já recebeu os dados da conta ${owner.email || ""}. ` +
        "Para importar outra conta, use outro telefone.",
    );
  }

  // 1) Baixa tudo primeiro (se falhar no meio, nada é gravado pela metade).
  const fetched: Record<string, any[]> = {};
  for (const [path, key] of LISTS) {
    tick(key);
    const items = await getJson(path, token);
    fetched[key] = Array.isArray(items) ? items.map(strip) : [];
    // "km" das viagens é calculado (km_end - km_start); não é guardado.
    if (key === "trips") fetched[key].forEach((t) => delete t.km);
  }
  tick("tire_settings");
  const tireSettings = await getJson("/tire-settings", token).catch(() => null);
  tick("ai_messages");
  const aiMessages: any[] = await getJson("/ai/messages", token).catch(() => []);

  // 2) Fotos e logo da empresa.
  tick("fotos");
  const fileCache = new Map<string, string>();
  const localize = async (p: string): Promise<string> => {
    if (!isRemote(p)) return p;
    if (fileCache.has(p)) return fileCache.get(p) as string;
    let out = "";
    try {
      out = await downloadFile(p);
    } catch (e) {
      console.warn("[migrate] foto não baixada", p, e);
      out = "";
    }
    fileCache.set(p, out);
    return out;
  };
  for (const key of ["vehicles", "drivers"]) {
    for (const d of fetched[key]) {
      if (d.photo_path) d.photo_path = await localize(d.photo_path);
    }
  }
  const logo = me?.company_logo_path ? await localize(me.company_logo_path) : "";

  // 3) Grava no banco local (juntando com o que já existir no telefone).
  for (const [, key] of LISTS) {
    const local = await load<any[]>(key, []);
    const merged = mergeById(local, fetched[key]);
    await save(key, merged);
    counts[key] = fetched[key].length;
  }
  const maxOs = (await load<any[]>("service_orders", [])).reduce((m, x) => Math.max(m, x.number || 0), 0);
  await save("seq_service_orders", Math.max(maxOs, await load<number>("seq_service_orders", 0)));
  if (tireSettings && typeof tireSettings === "object") await save("tire_settings", tireSettings);
  if (Array.isArray(aiMessages) && aiMessages.length) {
    const localAi = await load<any[]>("ai_messages", []);
    await save("ai_messages", mergeById(localAi, aiMessages.map(strip)));
  }

  const settings = await load<Record<string, string>>("settings", {});
  await save("settings", {
    app_currency: me?.app_currency || settings.app_currency || "EUR",
    app_language: me?.app_language || settings.app_language || "pt-BR",
    company_name: me?.company_name || settings.company_name || "",
    company_logo_path: logo || settings.company_logo_path || "",
  });

  await save(ACCOUNT_KEY, { user_id: me?.user_id || "", email: me?.email || "" });
  await markMigration({ done: true, at: nowIso(), source: "server", counts });
  // A sessão antiga não é mais necessária.
  await storeLegacyToken(null);
  return counts;
}
