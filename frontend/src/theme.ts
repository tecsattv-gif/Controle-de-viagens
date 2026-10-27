// Design tokens for "Controle de Viagens". Dark-first by default, with an
// optional light scheme (light / dark / auto) and a user-customizable accent.
//
// Use makeStyles((colors) => ({...})) for StyleSheets and useTheme().colors
// for color props. Never write color literals in components.

import { useMemo, useSyncExternalStore } from "react";
import { StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";
export type ThemeMode = "light" | "dark" | "auto";

export const fonts = {
  display: "BarlowCondensed",
  displaySemiBold: "BarlowCondensed-SemiBold",
  displayBold: "BarlowCondensed-Bold",
  body: "DMSans",
};

// Default industrial orange accent and default mode (current app look).
export const DEFAULT_ACCENT = "#FF6D00";
export const DEFAULT_MODE: ThemeMode = "dark";

// State colors — intentionally FIXED (never follow the accent or scheme).
const state = {
  success: "#00C853",
  onSuccess: "#000000",
  warning: "#FFD600",
  onWarning: "#000000",
  error: "#FF3D00",
  onError: "#000000",
  info: "#29B6F6",
  onInfo: "#000000",
};

// Obsidian dark surfaces.
const darkBase = {
  surface: "#121212",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1E1E1E",
  onSurfaceSecondary: "#E0E0E0",
  surfaceTertiary: "#2A2A2A",
  onSurfaceTertiary: "#D6D6D6",
  surfaceInverse: "#F5F5F5",
  onSurfaceInverse: "#121212",
  border: "#333333",
  borderStrong: "#4F4F4F",
  divider: "#2C2C2C",
  muted: "#9E9E9E",
  ...state,
};

// Light surfaces.
const lightBase = {
  surface: "#F5F5F5",
  onSurface: "#121212",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#2A2A2A",
  surfaceTertiary: "#ECECEC",
  onSurfaceTertiary: "#333333",
  surfaceInverse: "#1E1E1E",
  onSurfaceInverse: "#FFFFFF",
  border: "#E0E0E0",
  borderStrong: "#BDBDBD",
  divider: "#EEEEEE",
  muted: "#757575",
  ...state,
};

// Brand keys are added by buildColors.
export type ThemeColors = typeof darkBase & {
  brand: string;
  onBrand: string;
  brandPrimary: string;
  onBrandPrimary: string;
  brandSecondary: string;
  onBrandSecondary: string;
  brandTertiary: string;
  onBrandTertiary: string;
};

export const defaultScheme = "dark" satisfies ColorScheme;

export function setColorScheme() {
  // No-op: the scheme is driven by the theme store, not the native appearance.
}

// ---------------------------------------------------------------------------
// Color math helpers.
// ---------------------------------------------------------------------------
function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h || "000000", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
// Perceived relative luminance (0..1).
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Black or white text that keeps good contrast over the given color.
export function contrastOn(hex: string): string {
  return luminance(hex) > 0.45 ? "#000000" : "#FFFFFF";
}
export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((hex || "").trim());
}
export function normalizeHex(hex: string): string {
  let h = (hex || "").trim();
  if (!h.startsWith("#")) h = "#" + h;
  if (h.length === 4) h = "#" + h.slice(1).split("").map((c) => c + c).join("");
  return h.toUpperCase();
}

// Build the full color object for a given accent + scheme.
export function buildColors(accent: string, scheme: ColorScheme): ThemeColors {
  const b = scheme === "light" ? lightBase : darkBase;
  const onBrand = contrastOn(accent);
  return {
    ...b,
    brand: accent,
    onBrand,
    brandPrimary: accent,
    onBrandPrimary: onBrand,
    brandSecondary: mix(accent, "#000000", 0.12),
    onBrandSecondary: onBrand,
    brandTertiary: scheme === "light" ? mix(accent, "#FFFFFF", 0.85) : mix(accent, "#121212", 0.82),
    onBrandTertiary: scheme === "light" ? mix(accent, "#000000", 0.25) : mix(accent, "#FFFFFF", 0.4),
  };
}

// ---------------------------------------------------------------------------
// Reactive store for accent + mode (via useSyncExternalStore).
// ---------------------------------------------------------------------------
let currentAccent = DEFAULT_ACCENT;
let currentMode: ThemeMode = DEFAULT_MODE;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function getAccentColor(): string {
  return currentAccent;
}
export function setAccentColor(hex: string): void {
  const next = normalizeHex(hex || DEFAULT_ACCENT);
  if (next === currentAccent) return;
  currentAccent = next;
  notify();
}
export function getThemeMode(): ThemeMode {
  return currentMode;
}
export function setThemeMode(mode: ThemeMode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  notify();
}
// Combined snapshot string so useSyncExternalStore detects any change.
function getSnapshot(): string {
  return `${currentAccent}|${currentMode}`;
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme(): { scheme: ColorScheme; mode: ThemeMode; colors: ThemeColors } {
  const device = useColorScheme();
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const mode = currentMode;
  const scheme: ColorScheme = mode === "auto" ? (device === "light" ? "light" : "dark") : mode;
  const accent = currentAccent;
  const colors = useMemo(() => buildColors(accent, scheme), [accent, scheme]);
  return { scheme, mode, colors };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
