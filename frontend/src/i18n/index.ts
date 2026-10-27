import { useCallback } from "react";

import { useAuth } from "@/src/context/AuthContext";

export type LangCode = "pt-BR" | "pt-PT" | "es" | "en" | "fr";

export const LANGUAGES: { code: LangCode; label: string }[] = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

// The base language of the source strings is pt-BR. For every other language we
// map the pt-BR source string to its translation. Missing entries fall back to
// the source string so the UI is never blank (graceful degradation).
import { dict } from "./translations";

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function translate(
  lang: LangCode,
  source: string,
  vars?: Record<string, string | number>,
): string {
  if (lang === "pt-BR") return interpolate(source, vars);
  const table = dict[lang];
  const translated = table?.[source];
  return interpolate(translated ?? source, vars);
}

// Reactive translator hook: it reads the current user's language from the auth
// context, so switching language re-renders every component that uses it.
export function useT() {
  const { user } = useAuth();
  const lang = (user?.app_language as LangCode) ?? "pt-BR";
  return useCallback(
    (source: string, vars?: Record<string, string | number>) =>
      translate(lang, source, vars),
    [lang],
  );
}
