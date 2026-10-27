import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// A stable per-installation identifier. The backend binds an account to the
// first device_id it sees; a different id later requires admin authorization.
let deviceId: string | null = null;
const KEY = "app_device_id";

export function getDeviceId(): string | null {
  return deviceId;
}

export async function loadDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    if (Platform.OS === "web") {
      let v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
      if (!v) {
        v = Crypto.randomUUID();
        if (typeof localStorage !== "undefined") localStorage.setItem(KEY, v);
      }
      deviceId = v;
    } else {
      let v = await SecureStore.getItemAsync(KEY);
      if (!v) {
        v = Crypto.randomUUID();
        await SecureStore.setItemAsync(KEY, v);
      }
      deviceId = v;
    }
  } catch {
    deviceId = deviceId || Crypto.randomUUID();
  }
  return deviceId as string;
}
