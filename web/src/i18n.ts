import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, es: { translation: es } },
    fallbackLng: "en",
    supportedLngs: LANGUAGES,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: { order: ["navigator"], caches: [] },
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

/** Apply the user's saved language, or fall back to the browser language when null. */
export function applyLocale(locale: Language | null) {
  const target = locale ?? (navigator.languages.find((l) => l.toLowerCase().startsWith("es")) ? "es" : "en");
  if (i18n.resolvedLanguage !== target) void i18n.changeLanguage(target);
}

export default i18n;
