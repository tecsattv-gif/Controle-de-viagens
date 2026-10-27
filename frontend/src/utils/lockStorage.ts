import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// App-wide local lock. No backend, no accounts. The plaintext password is
// never stored — only a salted SHA-256 verifier kept in the OS keystore.
const MODE = "app_lock_mode";
const SALT = "app_lock_salt_v1";
const VERIFIER = "app_lock_verifier_v1";

export type LockMode = "passcode" | "device";

const webUnsupported = Platform.OS === "web";

async function sha256(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

async function randomSalt() {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeVerifier(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

export async function getLockMode(): Promise<LockMode | null> {
  if (webUnsupported) return null;
  try {
    return (await SecureStore.getItemAsync(MODE)) as LockMode | null;
  } catch {
    return null;
  }
}

export async function setDeviceMode() {
  if (webUnsupported) throw new Error("Disponível apenas no aplicativo (celular).");
  await SecureStore.setItemAsync(MODE, "device");
  await SecureStore.deleteItemAsync(SALT);
  await SecureStore.deleteItemAsync(VERIFIER);
}

export async function setPasscode(password: string) {
  if (password.length < 4) throw new Error("Use pelo menos 4 caracteres.");
  if (webUnsupported) throw new Error("Disponível apenas no aplicativo (celular).");
  const salt = await randomSalt();
  const verifier = await makeVerifier(password, salt);
  await SecureStore.setItemAsync(SALT, salt);
  await SecureStore.setItemAsync(VERIFIER, verifier);
  await SecureStore.setItemAsync(MODE, "passcode");
}

export async function verifyPasscode(password: string) {
  if (webUnsupported) return false;
  try {
    const [salt, expected] = await Promise.all([
      SecureStore.getItemAsync(SALT),
      SecureStore.getItemAsync(VERIFIER),
    ]);
    if (!salt || !expected) return false;
    return (await makeVerifier(password, salt)) === expected;
  } catch {
    return false;
  }
}

export async function clearLock() {
  if (webUnsupported) return;
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(MODE),
      SecureStore.deleteItemAsync(SALT),
      SecureStore.deleteItemAsync(VERIFIER),
    ]);
  } catch {
    // ignore
  }
}
