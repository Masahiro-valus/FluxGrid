import React, { createContext, useContext, useMemo } from "react";
import en from "../../../webview/i18n/en.json";
import ja from "../../../webview/i18n/ja.json";

type Locale = "en" | "ja";
type Messages = Record<string, string>;

const translations: Record<Locale, Messages> = {
  en,
  ja
};

interface I18nContextValue {
  locale: Locale;
  messages: Messages;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  messages: translations.en
});

interface I18nProviderProps {
  locale?: string;
  children: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ locale, children }) => {
  const normalizedLocale: Locale = locale && locale.startsWith("ja") ? "ja" : "en";
  const value = useMemo<I18nContextValue>(
    () => ({
      locale: normalizedLocale,
      messages: translations[normalizedLocale]
    }),
    [normalizedLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n() {
  const { messages } = useContext(I18nContext);
  return (key: string, replacements?: Record<string, string | number>) => {
    const template = messages[key] ?? key;
    if (!replacements) {
      return template;
    }
    return Object.keys(replacements).reduce((acc, current) => {
      const value = replacements[current];
      return acc.replace(new RegExp(`{${current}}`, "g"), String(value));
    }, template);
  };
}
