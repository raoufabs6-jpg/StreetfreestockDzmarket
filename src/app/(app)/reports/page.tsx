"use client";

// التقارير — ملخص مالي حسب الفترة + مبيعات شهريًا + أفضل المنتجات

import { useCallback, useMemo, useState } from "react";
import { TrendingUp, ShoppingBag, Receipt, Wallet, BarChart3 } from "lucide-react";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useCollection, useCurrentUser, useSettings } from "@/lib/hooks";
import { cn, daysAgoISO, docTotal, formatMoney, todayISO } from "@/lib/utils";
import type { Expense, Product, Purchase, Sale } from "@/lib/types";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";

type Period = "all" | "month" | "30" | "year";

const PERIODS: Array<{ value: Period; labelKey: MessageKey }> = [
  { value: "month", labelKey: "common.thisMonth" },
  { value: "30", labelKey: "common.last30" },
  { value: "year", labelKey: "common.thisYear" },
  { value: "all", labelKey: "common.allTime" },
];

export default function ReportsPage() {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const { can } = useCurrentUser();

  const { rows: sales } = useCollection<Sale>("sales");
  const { rows: purchases } = useCollection<Purchase>("purchases");
  const { rows: expenses } = useCollection<Expense>("expenses");
  const { rows: products } = useCollection<Product>("products");

  const [period, setPeriod] = useState<Period>("30");

  const currency = settings?.currency ?? "DZD";
  const money = (v: number) => formatMoney(v, currency, lang);

  const inPeriod = useCallback(
    (date: string): boolean => {
      if (period === "all") return true;
      if (period === "month") return date.startsWith(todayISO().slice(0, 7));
      if (period === "year") return date.startsWith(todayISO().slice(0, 4));
      return date >= daysAgoISO(30);
    },
    [period],
  );

  const pSales = useMemo(() => sales.filter((s) => inPeriod(s.date)), [sales, inPeriod]);
  const pPurchases = useMemo(() => purchases.filter((p) => inPeriod(p.date)), [purchases, inPeriod]);
  const pExpenses = useMemo(() => expenses.filter((e) => inPeriod(e.date)), [expenses, inPeriod]);

  const salesTotal = pSales.reduce((s, r) => s + docTotal(r.items, r.discount), 0);
  const purchasesTotal = pPurchases.reduce((s, r) => s + docTotal(r.items, r.discount), 0);
  const expensesTotal = pExpenses.reduce((s, r) => s + r.amount, 0);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const cogs = pSales.reduce(
    (s, r) =>
      s + r.items.reduce((is, it) => is + it.quantity * (productMap.get(it.productId)?.costPrice ?? 0), 0),
    0,
  );
  const netProfit = salesTotal - cogs - expensesTotal;

  // المبيعات حسب الشهر (آخر 6 أشهر)
  const monthly = useMemo(() => {
    const buckets: Array<{ key: string; label: string; total: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({
        key,
        label: new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : lang, { month: "short" }).format(d),
        total: 0,
      });
    }
    for (const s of sales) {
      const b = buckets.find((x) => s.date.startsWith(x.key));
      if (b) b.total += docTotal(s.items, s.discount);
    }
    return buckets;
  }, [sales, lang]);

  const maxMonth = Math.max(...monthly.map((m) => m.total), 1);

  // أفضل المنتجات
  const topProducts = useMemo(() => {
    const agg = new Map<string, { qty: number; revenue: number }>();
    for (const s of pSales) {
      for (const it of s.items) {
        const cur = agg.get(it.productId) ?? { qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += it.quantity * it.price;
        agg.set(it.productId, cur);
      }
    }
    return [...agg.entries()]
      .map(([id, v]) => ({
        id,
        name: productMap.get(id)?.name ?? "—",
        ...v,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [pSales, productMap]);

  if (!can("reports.view")) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
        <p className="text-sm font-bold text-slate-700">{t("error.forbidden")}</p>
      </div>
    );
  }

  const summary = [
    { label: t("reports.salesTotal"), value: salesTotal, icon: TrendingUp, tone: "text-emerald-600 bg-emerald-50" },
    { label: t("reports.purchasesTotal"), value: purchasesTotal, icon: ShoppingBag, tone: "text-sky-600 bg-sky-50" },
    { label: t("reports.expensesTotal"), value: expensesTotal, icon: Receipt, tone: "text-rose-600 bg-rose-50" },
    { label: t("reports.profit"), value: netProfit, icon: Wallet, tone: netProfit >= 0 ? "text-primary-600 bg-primary-50" : "text-rose-600 bg-rose-50" },
  ];

  return (
    <div>
      <PageHeader
        title={t("page.reports")}
        subtitle={t("reports.profitHint")}
        actions={
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition",
                  period === p.value
                    ? "bg-white text-primary-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        }
      />

      {/* ملخص الفترة */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {summary.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">{s.label}</p>
                <span className={cn("flex size-8 items-center justify-center rounded-lg", s.tone)}>
                  <Icon className="size-4" />
                </span>
              </div>
              <p className="mt-2 truncate text-lg font-extrabold text-slate-900">
                {money(s.value)}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* المبيعات حسب الشهر */}
        <Card>
          <CardTitle>{t("reports.salesByMonth")}</CardTitle>
          <div className="flex h-56 items-end gap-2 px-5 pt-6 pb-4 sm:gap-4">
            {monthly.map((m) => {
              const height = Math.max(4, Math.round((m.total / maxMonth) * 100));
              return (
                <div key={m.key} className="group flex flex-1 flex-col items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 opacity-0 transition group-hover:opacity-100">
                    {money(m.total)}
                  </span>
                  <div
                    className="w-full max-w-10 rounded-t-lg bg-gradient-to-t from-primary-600 to-primary-400 transition-all group-hover:from-primary-700"
                    style={{ height: `${height}%` }}
                    title={money(m.total)}
                  />
                  <span className="text-[11px] font-medium text-slate-400">{m.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* أفضل المنتجات */}
        <Card>
          <CardTitle>{t("reports.topProducts")}</CardTitle>
          <div className="mt-3 px-5 pb-5">
            {topProducts.length === 0 ? (
              <EmptyState icon={<BarChart3 className="size-6" />} title={t("reports.noDataInPeriod")} />
            ) : (
              <ul className="space-y-3">
                {topProducts.map((p, idx) => {
                  const max = topProducts[0].revenue || 1;
                  return (
                    <li key={p.id}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <Badge tone="primary">{idx + 1}</Badge>
                          <span className="truncate font-semibold text-slate-700">{p.name}</span>
                        </span>
                        <span className="shrink-0 font-bold text-slate-900">{money(p.revenue)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-primary-500"
                          style={{ width: `${Math.max(6, (p.revenue / max) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {t("reports.unitsSold")}: {p.qty}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
