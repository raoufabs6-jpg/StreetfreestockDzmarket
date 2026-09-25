"use client";

// Customer Timeline — الخط الزمني لنشاط العميل
// مقصود بساطة تامة: نقطة + أيقونة + عنوان + تاريخ (+ مبلغ)، من الأحدث إلى الأقدم.
// يُغذّى ببيانات موجودة أصلًا (إنشاء العميل / المبيعات / الفواتير) — لا جداول جديدة.

import { FileText, ShoppingCart, UserPlus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import type { CurrencyCode } from "@/lib/types";

export type TimelineKind = "created" | "sale" | "invoice";

export interface TimelineItem {
  id: string;
  /** YYYY-MM-DD أو ISO — يُستخدم للترتيب وللعرض */
  date: string;
  kind: TimelineKind;
  title: string;
  /** رقم المستند (SAL-0001 / INV-0002) */
  meta?: string;
  amount?: number;
}

const KIND_STYLE: Record<TimelineKind, { icon: typeof UserPlus; dot: string; iconColor: string }> = {
  created: { icon: UserPlus, dot: "bg-primary-100", iconColor: "text-primary-600" },
  sale: { icon: ShoppingCart, dot: "bg-emerald-100", iconColor: "text-emerald-600" },
  invoice: { icon: FileText, dot: "bg-sky-100", iconColor: "text-sky-600" },
};

export function CustomerTimeline({
  items,
  currency,
}: {
  items: TimelineItem[];
  currency: CurrencyCode;
}) {
  const { t, lang } = useI18n();

  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-xs text-slate-400">{t("crm.noActivity")}</p>;
  }

  return (
    <ol className="relative px-5 py-4">
      {/* الخط الرأسي */}
      <span className="absolute bottom-6 top-6 right-8 w-px bg-slate-200" aria-hidden />
      <li key="hint" className="sr-only">
        {t("crm.timelineHint")}
      </li>
      {items.map((item) => {
        const style = KIND_STYLE[item.kind];
        const Icon = style.icon;
        return (
          <li key={item.id} className="relative flex gap-3 py-2.5">
            <span
              className={cn(
                "relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white",
                style.dot,
              )}
            >
              <Icon className={cn("size-3.5", style.iconColor)} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="truncate text-sm font-bold text-slate-800">
                  {item.title}
                  {item.meta && (
                    <span className="mr-2 text-xs font-semibold text-slate-400" dir="ltr">
                      {item.meta}
                    </span>
                  )}
                </p>
                {item.amount !== undefined && (
                  <span className="text-sm font-extrabold text-slate-700">
                    {formatMoney(item.amount, currency, lang)}
                  </span>
                )}
              </div>
              <time
                className="mt-0.5 block text-xs text-slate-400"
                dateTime={item.date.slice(0, 10)}
              >
                {formatDate(item.date, lang)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
