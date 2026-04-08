import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';
import zh from './locales/zh.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
      de: { translation: de },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es', 'de', 'zh'],
    load: 'languageOnly',
    interpolation: {
      escapeValue: false,
    },
    initAsync: false,
    react: {
      useSuspense: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'dither3d-locale',
      caches: ['localStorage'],
    },
  });

export default i18n;
