// Assistente IA — fala DIRETO do telefone com o serviço de IA escolhido,
// usando a chave (API key) que o próprio utilizador configura.
//  - Google Gemini (tem faixa gratuita): chave em https://aistudio.google.com/apikey
//  - OpenAI (ChatGPT, pago por uso): chave em https://platform.openai.com/api-keys
// O histórico da conversa e as configurações ficam guardados no telefone.

import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

import { loadSettings } from "@/src/context/AuthContext";
import { load, newId, nowIso, save } from "@/src/local/db";
import { storage } from "@/src/utils/storage";

export type AIMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

export type AIProvider = "gemini" | "openai";

export const AI_PROVIDERS: Record<
  AIProvider,
  { label: string; url: string; defaultModel: string; keyUrl: string; free: boolean }
> = {
  gemini: {
    label: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    free: true,
  },
  openai: {
    label: "OpenAI (ChatGPT)",
    url: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-5-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    free: false,
  },
};

export type AIConfig = { provider: AIProvider; model: string; apiKey: string };

const CFG_KEY = "ai_config";
const SECRET_KEY = "ai_api_key";
const MSG_KEY = "ai_messages";

// Chave do Gemini que já vem no app (definida no build pelo segredo
// GEMINI_API_KEY do GitHub). Use uma chave de um projeto SEM faturamento:
// assim, mesmo que alguém a extraia do APK, não há custo. Se o utilizador
// configurar a própria chave, ela tem prioridade.
const BUILTIN_GEMINI_KEY = (process.env.EXPO_PUBLIC_GEMINI_KEY || "").trim();

export function hasBuiltinKey(): boolean {
  return !!BUILTIN_GEMINI_KEY;
}

export async function getAIConfig(): Promise<AIConfig> {
  const cfg = await load<{ provider?: AIProvider; model?: string }>(CFG_KEY, {});
  const provider: AIProvider = cfg.provider === "openai" ? "openai" : "gemini";
  const apiKey = ((await storage.secureGet<string>(SECRET_KEY, "")) as string) || "";
  return { provider, model: cfg.model || "", apiKey };
}

export async function saveAIConfig(c: AIConfig): Promise<void> {
  await save(CFG_KEY, { provider: c.provider, model: (c.model || "").trim() });
  const key = (c.apiKey || "").trim();
  if (key) await storage.secureSet(SECRET_KEY, key);
  else await storage.secureRemove(SECRET_KEY);
}

export async function fetchAIMessages(): Promise<AIMessage[]> {
  const all = await load<AIMessage[]>(MSG_KEY, []);
  return all.slice(-100);
}

export async function clearAIMessages(): Promise<void> {
  await save(MSG_KEY, []);
}

async function appendMessage(role: AIMessage["role"], content: string) {
  const all = await load<AIMessage[]>(MSG_KEY, []);
  all.push({ id: newId(), role, content, created_at: nowIso() });
  await save(MSG_KEY, all.slice(-200));
}

// ---------------------------------------------------------------------------
// Contexto: os dados do próprio utilizador (lidos do banco local)
// ---------------------------------------------------------------------------
const CONTEXT_KEYS: Record<string, string> = {
  viagens: "trips", fretes: "freights", abastecimentos: "refuelings", portagens: "toll_expenses",
  outras_despesas: "other_expenses", manutencoes: "maintenances", trocas_de_oleo: "oil_changes",
  ordens_de_servico: "service_orders", pneus: "tires", controle_diario_km: "daily_logs",
  controle_mensal_km: "monthly_km", veiculos: "vehicles", motoristas: "drivers",
};
const DROP = new Set(["id", "created_at", "photo_path", "photos", "photo_paths", "receipt_path", "receipt_paths", "logo_path", "movements", "cpf"]);
const LANG: Record<string, string> = {
  "pt-BR": "português do Brasil", "pt-PT": "português de Portugal", es: "espanhol", en: "inglês", fr: "francês",
};

function clean(v: any): any {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") {
    const o: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) {
      if (DROP.has(k) || x === "" || x === null || x === 0 || (Array.isArray(x) && !x.length)) continue;
      o[k] = clean(x);
    }
    return o;
  }
  return v;
}

async function dataContext(): Promise<string> {
  const out: Record<string, any[]> = {};
  for (const [label, key] of Object.entries(CONTEXT_KEYS)) {
    const items = await load<any[]>(key, []);
    if (!items.length) continue;
    const sorted = [...items].sort(
      (a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
    out[label] = sorted.slice(0, 60).map(clean);
  }
  return JSON.stringify(out).slice(0, 60000);
}

async function systemPrompt(): Promise<string> {
  const s = await loadSettings();
  const lang = LANG[s.app_language] || "português";
  return (
    "Você é o Assistente IA do aplicativo 'Controle de Viagens', usado por motoristas e transportadores. " +
    `Responda sempre em ${lang}, de forma curta, clara e prática (use listas quando ajudar). ` +
    `Hoje é ${new Date().toISOString().slice(0, 10)}. ` +
    "O app tem: Resumo (dashboard), Viagens (KM inicial/final, origem, destino, frete, diesel, ARLA, portagens), " +
    "Fretes, Despesas (abastecimentos, portagens, outras despesas, manutenção, Troca de Óleo e Filtros, " +
    "OS – Ordem de Serviço, Controle de Pneus com mapa de eixos e sulco), Controle Diário e Mensal de KM, " +
    "Relatórios com PDF/CSV, Cadastros (motoristas, veículos, reboques, empresa/logo, cores, idioma, moeda, " +
    "backup e restauração) e Central de Ajuda. Os dados ficam guardados só no telefone do utilizador. " +
    "Você pode explicar como usar o app e analisar os dados do utilizador abaixo (JSON, mais recentes primeiro, " +
    "até 60 por tipo). KM rodados de uma viagem = km_end - km_start (km_end 0 = viagem em aberto). " +
    "Os valores têm moedas próprias (EUR/BRL); nunca converta nem misture moedas. " +
    "Se a informação não estiver nos dados, diga isso; não invente números. " +
    "Você não pode criar, alterar nem apagar registos — oriente o utilizador a fazê-lo no app.\n\n" +
    `DADOS DO UTILIZADOR:\n${await dataContext()}`
  );
}

export class AINotConfiguredError extends Error {}

function friendlyError(status: number, detail: string): string {
  if (status === 401 || status === 403) return "Chave da IA inválida ou sem permissão. Confira a chave nas configurações do assistente.";
  if (status === 429) return "Limite de uso da IA atingido. Aguarde um pouco ou confira o seu plano/créditos.";
  if (status === 404) return "Modelo de IA não encontrado. Deixe o campo 'Modelo' vazio para usar o padrão.";
  return detail || `Erro ${status}`;
}

// Envia a pergunta e vai devolvendo a resposta aos pedaços (streaming).
export async function streamAIChat(text: string, onDelta: (chunk: string) => void): Promise<void> {
  const question = text.trim().slice(0, 2000);
  if (!question) throw new Error("Escreva uma pergunta.");
  let cfg = await getAIConfig();
  if (!cfg.apiKey && BUILTIN_GEMINI_KEY) {
    cfg = { provider: "gemini", model: cfg.provider === "gemini" ? cfg.model : "", apiKey: BUILTIN_GEMINI_KEY };
  }
  if (!cfg.apiKey) throw new AINotConfiguredError("Configure a chave da IA para usar o assistente.");
  const prov = AI_PROVIDERS[cfg.provider];

  const history = (await fetchAIMessages()).slice(-20);
  const messages = [
    { role: "system", content: await systemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];
  await appendMessage("user", question);

  const doFetch = Platform.OS === "web" ? fetch : (expoFetch as unknown as typeof fetch);
  let res: Response;
  try {
    res = await doFetch(prov.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model || prov.defaultModel, messages, stream: true }),
    });
  } catch {
    throw new Error("Sem ligação à internet. O assistente IA precisa de internet.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const b = await res.json();
      const e = Array.isArray(b) ? b[0]?.error : b?.error;
      detail = e?.message || "";
    } catch {
      // ignore
    }
    throw new Error(friendlyError(res.status, detail));
  }

  const parts: string[] = [];
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Resposta inválida da IA.");
  const decoder = new TextDecoder();
  let buf = "";
  let finished = false;
  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        finished = true;
        break;
      }
      try {
        const ev = JSON.parse(payload);
        if (ev.error) throw new Error(ev.error.message || "Erro da IA.");
        const delta: string = ev.choices?.[0]?.delta?.content || "";
        if (delta) {
          parts.push(delta);
          onDelta(delta);
        }
      } catch (e: any) {
        if (e?.message && !(e instanceof SyntaxError)) throw e;
      }
    }
  }
  const answer = parts.join("").trim();
  if (answer) await appendMessage("assistant", answer);
}
