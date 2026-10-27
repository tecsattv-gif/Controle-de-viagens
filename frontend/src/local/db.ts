// Banco de dados LOCAL do aplicativo — tudo fica guardado só no telefone.
//
// Cada "chave" (ex.: "trips", "settings") guarda um valor JSON.
//  - Celular (Android/iOS): um arquivo .json por chave na pasta privada do app
//    (Paths.document/db). A escrita é feita num arquivo temporário e depois
//    trocada, para não corromper os dados se o app fechar no meio.
//  - Web (apenas pré-visualização): AsyncStorage / localStorage.
//
// Os valores ficam também em memória (cache) para leituras rápidas, e as
// escritas são enfileiradas para nunca acontecerem duas ao mesmo tempo.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";
const WEB_PREFIX = "localdb:";

const cache = new Map<string, unknown>();
let writeQueue: Promise<unknown> = Promise.resolve();

function dbDir(): Directory {
  const dir = new Directory(Paths.document, "db");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function readRaw(key: string): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(WEB_PREFIX + key);
  const dir = dbDir();
  const f = new File(dir, `${key}.json`);
  if (f.exists) return f.text();
  // Recuperação: o app fechou entre apagar o antigo e renomear o temporário.
  const tmp = new File(dir, `${key}.tmp`);
  if (tmp.exists) {
    const text = await tmp.text();
    try {
      JSON.parse(text);
      return text;
    } catch {
      return null;
    }
  }
  return null;
}

async function writeRaw(key: string, text: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.setItem(WEB_PREFIX + key, text);
    return;
  }
  const dir = dbDir();
  const tmp = new File(dir, `${key}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  await tmp.write(text);
  const target = new File(dir, `${key}.json`);
  if (target.exists) target.delete();
  await tmp.move(target);
}

async function removeRaw(key: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(WEB_PREFIX + key);
    return;
  }
  const f = new File(dbDir(), `${key}.json`);
  if (f.exists) f.delete();
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Lê o valor guardado numa chave (cópia independente). */
export async function load<T>(key: string, fallback: T): Promise<T> {
  if (!cache.has(key)) {
    let value: unknown = undefined;
    try {
      const raw = await readRaw(key);
      if (raw != null && raw !== "") value = JSON.parse(raw);
    } catch (e) {
      console.warn(`[localdb] falha ao ler ${key}`, e);
    }
    if (value === undefined) return clone(fallback);
    cache.set(key, value);
  }
  return clone(cache.get(key) as T);
}

/** Grava o valor de uma chave (substitui o anterior). */
export function save<T>(key: string, value: T): Promise<void> {
  const copy = clone(value);
  cache.set(key, copy);
  const text = JSON.stringify(copy);
  const job = writeQueue.then(() => writeRaw(key, text));
  writeQueue = job.catch((e) => console.warn(`[localdb] falha ao gravar ${key}`, e));
  return job;
}

/** Apaga uma chave. */
export function remove(key: string): Promise<void> {
  cache.delete(key);
  const job = writeQueue.then(() => removeRaw(key));
  writeQueue = job.catch((e) => console.warn(`[localdb] falha ao apagar ${key}`, e));
  return job;
}

/** Lista todas as chaves existentes (usado no backup). */
export async function listKeys(): Promise<string[]> {
  await writeQueue;
  if (isWeb) {
    const all = await AsyncStorage.getAllKeys();
    return all.filter((k) => k.startsWith(WEB_PREFIX)).map((k) => k.slice(WEB_PREFIX.length));
  }
  return dbDir()
    .list()
    .filter((e): e is File => e instanceof File && e.name.endsWith(".json"))
    .map((f) => f.name.slice(0, -".json".length));
}

/** Espera todas as gravações pendentes terminarem. */
export function flush(): Promise<unknown> {
  return writeQueue;
}

export function newId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
