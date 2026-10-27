// Configurações do aplicativo (idioma, moeda, empresa) guardadas NO TELEFONE.
//
// Antes este contexto fazia login numa conta online. Agora não existe conta:
// o app abre direto e os dados são do próprio aparelho. O nome `useAuth` foi
// mantido para não ter que alterar todas as telas que leem `user`.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { load, save } from "@/src/local/db";
import { setAppCurrencySymbol } from "@/src/utils/format";

const SETTINGS_KEY = "settings";

export type AuthUser = {
  user_id: string;
  email: string;
  display_name: string;
  app_currency?: string;
  app_language?: string;
  company_name?: string;
  company_logo_path?: string;
};

type Settings = {
  app_currency: string;
  app_language: string;
  company_name: string;
  company_logo_path: string;
};

const DEFAULTS: Settings = {
  app_currency: "EUR",
  app_language: "pt-BR",
  company_name: "",
  company_logo_path: "",
};

const ALLOWED_CURRENCIES = ["EUR", "BRL", "USD", "GBP", "CHF"];
const ALLOWED_LANGUAGES = ["pt-BR", "pt-PT", "es", "en", "fr"];

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  updateCurrency: (code: string) => Promise<void>;
  updateLanguage: (code: string) => Promise<void>;
  updateCompany: (name: string, logoPath: string) => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function toUser(s: Settings): AuthUser {
  return { user_id: "local", email: "", display_name: "", ...s };
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULTS, ...(await load<Partial<Settings>>(SETTINGS_KEY, {})) };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);

  const refreshMe = useCallback(async () => {
    setSettings(await loadSettings());
  }, []);

  const patch = useCallback(async (p: Partial<Settings>) => {
    const next = { ...(await loadSettings()), ...p };
    await save(SETTINGS_KEY, next);
    setSettings(next);
  }, []);

  const updateCurrency = useCallback(
    async (code: string) => {
      const c = (code || "").trim().toUpperCase();
      if (!ALLOWED_CURRENCIES.includes(c)) throw new Error("Moeda inválida.");
      await patch({ app_currency: c });
    },
    [patch],
  );

  const updateLanguage = useCallback(
    async (code: string) => {
      const c = (code || "").trim();
      if (!ALLOWED_LANGUAGES.includes(c)) throw new Error("Idioma inválido.");
      await patch({ app_language: c });
    },
    [patch],
  );

  const updateCompany = useCallback(
    async (name: string, logoPath: string) => {
      await patch({ company_name: (name || "").trim().slice(0, 120), company_logo_path: (logoPath || "").trim() });
    },
    [patch],
  );

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // Mantém o símbolo da moeda (usado na formatação) sincronizado.
  useEffect(() => {
    setAppCurrencySymbol(settings?.app_currency);
  }, [settings?.app_currency]);

  return (
    <AuthContext.Provider
      value={{
        user: settings ? toUser(settings) : null,
        loading: settings === null,
        updateCurrency,
        updateLanguage,
        updateCompany,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
