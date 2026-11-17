import { useEffect, useState } from "react";
import type { Locale } from "@garage/domain";

const key = "garage-os-locale";

export function savedLocale(): Locale {
  return typeof window !== "undefined" && window.localStorage.getItem(key) === "en" ? "en" : "ar";
}

export function useSavedLocale() {
  const [locale, setLocaleState] = useState<Locale>(savedLocale);
  useEffect(() => {
    const update = () => setLocaleState(savedLocale());
    window.addEventListener("storage", update);
    window.addEventListener("garage-locale-change", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("garage-locale-change", update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  const setLocale = (next: Locale) => {
    window.localStorage.setItem(key, next);
    window.dispatchEvent(new Event("garage-locale-change"));
  };
  return { locale, setLocale };
}
