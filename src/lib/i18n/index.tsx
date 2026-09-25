"use client";

// ============================================================
// مزوّد الترجمة (i18n) — العربية (RTL) افتراضيًا، مع دعم
// الإنجليزية والفرنسية (LTR). لإضافة لغة جديدة: أنشئ ملف
// dict جديد وأضفه في `dictionaries` أسفله.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ar, type MessageKey } from "./ar";
import { en } from "./en";
import { fr } from "./fr";

export type Lang = "ar" | "en" | "fr";

export const LANGS: Array<{ code: Lang; label: string; dir: "rtl" | "ltr" }> = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
];

export type { MessageKey } from "./ar";

const dictionaries: Record<Lang, Record<string, string>> = { ar, en, fr };

const STORAGE_KEY = "akma:lang";

type TranslateVars = Record<string, string | number>;

interface I18nValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: TranslateVars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function detectLang(): Lang {
  if (typeof window === "undefined") return "ar";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en" || stored === "fr") return stored;
  } catch {
    /* ignore */
  }
  return "ar";
}

function applyDocumentLang(lang: Lang): void {
  if (typeof document === "undefined") return;
  const meta = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  document.documentElement.lang = lang;
  document.documentElement.dir = meta.dir;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  // تطبيق اللغة المحفوظة بعد التحميل (يتجنب عدم تطابق Hydration)
  useEffect(() => {
    const stored = detectLang();
    setLangState(stored);
    applyDocumentLang(stored);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    applyDocumentLang(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  const t = useCallback(
    (key: MessageKey, vars?: TranslateVars): string => {
      let text = dictionaries[lang][key] ?? dictionaries.ar[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        }
      }
      return text;
    },
    [lang],
  );

  const value = useMemo<I18nValue>(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
