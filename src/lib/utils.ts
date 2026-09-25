import { CURRENCIES, type CurrencyCode } from "@/lib/types";

/** دمج أصناف Tailwind مع تجنب التعارضات */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** معرّف فريد بسيط */
export function uid(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}-${rand}`;
}

const LOCALES: Record<string, string> = {
  ar: "ar-DZ",
  en: "en-US",
  fr: "fr-FR",
};

/** تنسيق المبالغ حسب عملة الإعدادات */
export function formatMoney(value: number, currency: CurrencyCode = "DZD", lang = "ar"): string {
  const symbol = CURRENCIES[currency]?.symbol ?? currency;
  const locale = LOCALES[lang] ?? "en-US";
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0,
  );
  return lang === "ar" ? `${num} ${symbol}` : `${num} ${symbol}`;
}

/** تنسيق التاريخ حسب لغة الواجهة */
export function formatDate(iso: string, lang = "ar", opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = LOCALES[lang] ?? "en-US";
  return new Intl.DateTimeFormat(locale, opts ?? { year: "numeric", month: "short", day: "numeric" }).format(d);
}

/** تاريخ اليوم بصيغة YYYY-MM-DD (لحقول date) */
export function todayISO(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** اليوم قبل N يوم */
export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** حساب إجمالي مستند (بيع/شراء) */
export function docTotal(
  items: Array<{ quantity: number; price: number }> = [],
  discount = 0,
): number {
  const sub = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
  return Math.max(0, sub - (Number(discount) || 0));
}

/** توليد رقم مستند تسلسلي: SAL-0001 */
export function nextDocNumber(rows: Array<{ number?: string }>, prefix: string): string {
  let max = 0;
  for (const r of rows) {
    const match = /(\d+)$/.exec(r.number ?? "");
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** تحميل ملف JSON (تصدير البيانات) */
export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** الحروف الأولى للاسم (للأفاتار) */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
