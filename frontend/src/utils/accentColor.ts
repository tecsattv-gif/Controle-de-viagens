import { storage } from "@/src/utils/storage";
import { DEFAULT_ACCENT, DEFAULT_MODE, ThemeMode, setAccentColor, setThemeMode } from "@/src/theme";

const ACCENT_KEY = "accent_color_v1";
const MODE_KEY = "theme_mode_v1";

// Load saved accent + mode on app start and apply to the global theme store.
export async function loadAppTheme(): Promise<void> {
  const hex = await storage.getItem<string>(ACCENT_KEY, DEFAULT_ACCENT);
  if (hex) setAccentColor(hex);
  const mode = await storage.getItem<string>(MODE_KEY, DEFAULT_MODE);
  if (mode === "light" || mode === "dark" || mode === "auto") setThemeMode(mode);
}

// Apply + persist a chosen accent and mode.
export async function saveAppTheme(hex: string, mode: ThemeMode): Promise<void> {
  setAccentColor(hex);
  setThemeMode(mode);
  await storage.setItem(ACCENT_KEY, hex);
  await storage.setItem(MODE_KEY, mode);
}

// Back to the default orange + dark.
export async function resetAppTheme(): Promise<void> {
  setAccentColor(DEFAULT_ACCENT);
  setThemeMode(DEFAULT_MODE);
  await storage.removeItem(ACCENT_KEY);
  await storage.removeItem(MODE_KEY);
}
