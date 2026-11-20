import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  localeTag,
  type Language,
  type TranslationKey,
  type TranslationParams,
  translations,
} from "@/i18n/translations";

const STORAGE_KEY = "clio-language";

function detectInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "ja" || stored === "en" || stored === "zh") return stored;
  } catch {
    // localStorage unavailable
  }
  const browser = typeof navigator !== "undefined" ? navigator.language : "ja";
  const normalized = browser.toLowerCase();
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("zh")) return "zh";
  return "en";
}

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  locale: string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguage] = useState<Language>(detectInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // localStorage unavailable
    }
  }, [language]);

  const value = useMemo<LanguageContextType>(() => {
    const dictionary = translations[language];
    return {
      language,
      setLanguage,
      locale: localeTag(language),
      t: (key, params) => {
        const template = dictionary[key];
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, name: string) =>
          Object.prototype.hasOwnProperty.call(params, name)
            ? String(params[name])
            : match
        );
      },
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
