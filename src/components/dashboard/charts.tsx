"use client";

// ============================================================
// رسوم بيانية خفيفة للوحة التحكم — SVG/CSS يدويًا بدون أي
// مكتبات خارجية: تعمل مع RTL والعربية وتُطبع بشكل نظيف.
// جميع القيم تصل من الصفحة المحسوبة من بيانات Provider الحقيقية.
// ============================================================

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export interface ChartDatum {
  /** تسمية محورية (يوم/شهر/اسم منتج/فئة) */
  label: string;
  /** القيمة الرقمية الخام (تُنسّق داخل المكوّن) */
  value: number;
  /** نص التلميح الكامل (عنوان يظهر عند المرور) */
  hint?: string;
}

/** ألوان ثابتة للمخطط — متغيّرات ثيم Tailwind مع بدائل */
const PALETTE = [
  "var(--color-primary-600, #4f46e5)",
  "#10b981",
  "#f59e0b",
  "#0ea5e9",
  "#f43f5e",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

function compact(value: number, lang: string): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  try {
    return new Intl.NumberFormat(lang === "ar" ? "ar" : lang, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <p className="py-12 text-center text-xs text-slate-400">{label}</p>
  );
}

/** إزاحات تراكمية لنقاط الدونات — دالة نقية خارج مكوّن العرض */
function cumulativeOffsets(values: number[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const v of values) {
    offsets.push(running);
    running += v;
  }
  return offsets;
}

/* -------------------- أعمدة رأسية (أيام/أشهر) -------------------- */

export function BarSeriesChart({
  data,
  emptyLabel,
  height = 11,
}: {
  data: ChartDatum[];
  emptyLabel: string;
  /** ارتفاع المكان (rem) */
  height?: number;
}) {
  const { lang } = useI18n();
  const max = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0 || max <= 0) return <ChartEmpty label={emptyLabel} />;

  return (
    <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: `${height}rem` }}>
      {data.map((d, i) => {
        const pct = max > 0 ? Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0) : 0;
        return (
          <div
            key={`${d.label}-${i}`}
            title={d.hint ?? `${d.label}: ${compact(d.value, lang)}`}
            className="group flex h-full min-w-0 flex-1 flex-col gap-1"
          >
            <span className="truncate text-center text-[10px] font-bold text-slate-500">
              {d.value > 0 ? compact(d.value, lang) : ""}
            </span>
            <div className="relative min-h-0 flex-1 border-b border-slate-200">
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-md bg-primary-500 transition-all duration-300 group-hover:bg-primary-600"
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="truncate text-center text-[10px] leading-tight text-slate-400">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- أعمدة أفقية (ترتيب) -------------------- */

export function RankBarsChart({
  data,
  emptyLabel,
  maxRows = 5,
  renderItemLabel,
}: {
  data: ChartDatum[];
  emptyLabel: string;
  maxRows?: number;
  /** تسمياً إضافية (مثل اسم القسم) */
  renderItemLabel?: (index: number) => ReactNode;
}) {
  const { lang } = useI18n();
  const rows = data.slice(0, maxRows);
  const max = Math.max(...rows.map((d) => d.value), 0);

  if (rows.length === 0 || max <= 0) return <ChartEmpty label={emptyLabel} />;

  return (
    <ul className="space-y-3">
      {rows.map((d, i) => (
        <li key={`${d.label}-${i}`} title={d.hint ?? `${d.label}: ${compact(d.value, lang)}`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[10px] font-black text-primary-700">
                {i + 1}
              </span>
              <span className="truncate font-bold text-slate-700">{d.label}</span>
              {renderItemLabel?.(i)}
            </span>
            <span className="shrink-0 font-black text-slate-900" dir="auto">
              {compact(d.value, lang)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-l from-primary-500 to-primary-400 transition-all duration-500 ltr:bg-gradient-to-r"
              style={{ width: `${max > 0 ? (d.value / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------- دونات (نِسَب) -------------------- */

export function DonutChart({
  data,
  emptyLabel,
  centerLabel,
}: {
  data: ChartDatum[];
  emptyLabel: string;
  centerLabel?: string;
}) {
  const { t, lang } = useI18n();
  const total = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0 || total <= 0) return <ChartEmpty label={emptyLabel} />;

  // أكبر5 فئات + مجموع الباقي في «أخرى» حتى تبقى القراءة واضحة
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const segments =
    rest.length > 0
      ? [
          ...top,
          { label: t("dashboard.other"), value: rest.reduce((s, d) => s + d.value, 0) },
        ]
      : top;

  const R = 45;
  const C = 2 * Math.PI * R;
  const lengths = segments.map((s) => (s.value / total) * C);
  const offsets = cumulativeOffsets(lengths);

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <svg
        viewBox="0 0 120 120"
        className="size-36 shrink-0"
        role="img"
        aria-label={t("dashboard.chartCategory")}
      >
        <circle cx="60" cy="60" r={R} fill="none" stroke="#e2e8f0" strokeWidth="16" />
        {segments.map((s, i) => {
          const len = lengths[i];
          const offset = -offsets[i];
          return (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
            >
              <title>{`${s.label}: ${compact(s.value, lang)}`}</title>
            </circle>
          );
        })}
        <text
          x="60"
          y="57"
          textAnchor="middle"
          className="fill-slate-900 text-[13px] font-black"
          style={{ fontSize: 13 }}
        >
          {compact(total, lang)}
        </text>
        <text
          x="60"
          y="71"
          textAnchor="middle"
          className="fill-slate-400"
          style={{ fontSize: 7.5 }}
        >
          {centerLabel ?? t("common.total")}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5" style={{ maxWidth: 240 }}>
        {segments.map((s, i) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li
              key={s.label}
              className="flex items-center gap-2 text-xs"
              title={`${s.label}: ${compact(s.value, lang)} (${Math.round(pct)}%)`}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-600">
                {s.label}
              </span>
              <span className="shrink-0 font-black text-slate-800" dir="auto">
                {Math.round(pct)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
