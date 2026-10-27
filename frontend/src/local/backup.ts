// Backup e restauração: um único arquivo .json com todos os dados do app
// e as fotos (em base64). Pode ser guardado no Google Drive, enviado por
// WhatsApp/e-mail e restaurado noutro telefone.

import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { LOCAL_PREFIX, localFile } from "@/src/utils/upload";

import { flush, listKeys, load, nowIso, remove, save } from "./db";

const APP_ID = "controle-de-viagens";
const FORMAT = 1;
const SKIP_KEYS = new Set(["migration"]);

type BackupFile = {
  app: string;
  format: number;
  created_at: string;
  data: Record<string, unknown>;
  files: Record<string, string>; // caminho local -> base64
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function referencedFiles(data: Record<string, unknown>): string[] {
  const text = JSON.stringify(data);
  const re = new RegExp(`${LOCAL_PREFIX}files/[A-Za-z0-9._-]+`, "g");
  return Array.from(new Set(text.match(re) ?? []));
}

async function buildBackup(): Promise<BackupFile> {
  await flush();
  const data: Record<string, unknown> = {};
  for (const key of await listKeys()) {
    if (SKIP_KEYS.has(key)) continue;
    data[key] = await load<unknown>(key, null);
  }
  const files: Record<string, string> = {};
  if (Platform.OS !== "web") {
    for (const p of referencedFiles(data)) {
      try {
        const f = localFile(p);
        if (f.exists) files[p] = await f.base64();
      } catch (e) {
        console.warn("[backup] foto ignorada", p, e);
      }
    }
  }
  return { app: APP_ID, format: FORMAT, created_at: nowIso(), data, files };
}

export type BackupSummary = { records: number; photos: number };

function summarize(b: BackupFile): BackupSummary {
  let records = 0;
  for (const v of Object.values(b.data)) if (Array.isArray(v)) records += v.length;
  return { records, photos: Object.keys(b.files || {}).length };
}

/** Gera o arquivo de backup e abre o "Compartilhar" (Drive, WhatsApp, e-mail...). */
export async function exportBackup(): Promise<BackupSummary> {
  const b = await buildBackup();
  const name = `controle-viagens-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const text = JSON.stringify(b);
  if (Platform.OS === "web") {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    await f.write(text);
    await Sharing.shareAsync(f.uri, {
      mimeType: "application/json",
      dialogTitle: "Backup do Controle de Viagens",
      UTI: "public.json",
    });
  }
  return summarize(b);
}

/** Escolhe um arquivo de backup e devolve o conteúdo (ainda sem restaurar). */
export async function pickBackup(): Promise<{ backup: BackupFile; summary: BackupSummary } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "application/octet-stream", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const uri = res.assets[0].uri;
  const text = Platform.OS === "web" ? await (await fetch(uri)).text() : await new File(uri).text();
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Este arquivo não é um backup do Controle de Viagens.");
  }
  if (parsed?.app !== APP_ID || typeof parsed.data !== "object" || !parsed.data) {
    throw new Error("Este arquivo não é um backup do Controle de Viagens.");
  }
  if ((parsed.format ?? 0) > FORMAT) {
    throw new Error("Este backup foi feito numa versão mais nova do app. Atualize o aplicativo.");
  }
  return { backup: parsed, summary: summarize(parsed) };
}

/** Substitui os dados atuais pelos do backup. */
export async function restoreBackup(b: BackupFile): Promise<void> {
  // Fotos primeiro (se falhar aqui, os dados atuais continuam intactos).
  if (Platform.OS !== "web") {
    const dir = new Directory(Paths.document, "files");
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    for (const [p, b64] of Object.entries(b.files || {})) {
      if (!p.startsWith(`${LOCAL_PREFIX}files/`)) continue;
      const f = localFile(p);
      if (f.exists) f.delete();
      f.create();
      await f.write(base64ToBytes(b64));
    }
  }
  const current = await listKeys();
  for (const key of current) {
    if (!SKIP_KEYS.has(key) && !(key in b.data)) await remove(key);
  }
  for (const [key, value] of Object.entries(b.data)) {
    if (SKIP_KEYS.has(key)) continue;
    await save(key, value);
  }
  await save("migration", { done: true, at: nowIso(), source: "skipped" });
  await flush();
}
