"use client";

// لوحة التحكم — مركز التحكم الرئيسي: مؤشرات لحظية + رسوم بيانية
// جميع الأرقام محسوبة فعليًا من بيانات Provider (تأتي من قاعدة البيانات في وضع API)

import type { ReactNode } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Users,
  Package,
  Boxes,
  Receipt,
  Wallet,
  Plus,
  ArrowLeft,
  PackageX,
  ShoppingCart,
  UserPlus,
  CalendarDays,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCollection, useCurrentUser, useSettings } from "@/lib/hooks";
import { cn, docTotal, formatMoney, formatDate, todayISO, daysAgoISO } from "@/lib/utils";
import type { Customer, Expense, Invoice, Product, Sale } from "@/lib/types";
import { Badge, Button, Card, CardTitle, EmptyState, PageHeader, Spinner } from "@/components/ui/primitives";
import { BarSeriesChart, RankBarsChart, DonutChart, type ChartDatum } from "@/components/dashboard/charts";
import { DashboardPlanCard } from "@/components/subscription/plan-panels";

/* ------------------------------ بطاقة إحصائية ------------------------------ */

function StatCard({
  label,
  value,
  icon,
  tone = "primary",
  hint,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "primary" | "emerald" | "rose" | "amber" | "sky" | "violet";
  hint?: string;
}) {
  const tones = {
    primary: "bg-primary-50 text-primary-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 truncate text-lg font-extrabold text-slate-900" dir="auto">
            {value}
          </p>
          {hint && <p className="mt-1 truncate text-[11px] text-slate-400">{hint}</p>}
        </div>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
          {icon}
        </span>
      </div>
    </Card>
  );
}

/* -------------------------------- الصفحة --------------------------------- */

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const { can } = useCurrentUser();

  const { rows: sales, loading: loadingSales } = useCollection<Sale>("sales");
  const { rows: customers } = useCollection<Customer>("customers");
  const { rows: products } = useCollection<Product>("products");
  const { rows: expenses } = useCollection<Expense>("expenses");
  const { rows: invoices } = useCollection<Invoice>("invoices");

  const currency = settings?.currency ?? "DZD";
  const money = (v: number) => formatMoney(v, currency, lang);

  const loading = loadingSales;

  /* ----------------- الحسابات الفعلية من البيانات ----------------- */
  const saleSum = (rows: Sale[]) => rows.reduce((s, r) => s + docTotal(r.items, r.discount), 0);

  const salesTotal = saleSum(sales);
  const expensesTotal = expenses.reduce((s, r) => s + (r.amount || 0), 0);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const cogs = sales.reduce(
    (s, r) =>
      s +
      r.items.reduce(
        (is, it) => is + it.quantity * (productMap.get(it.productId)?.costPrice ?? 0),
        0,
      ),
    0,
  );
  const netProfit = salesTotal - cogs - expensesTotal;
  const stockValue = products.reduce((s, p) => s + p.stock * p.costPrice, 0);

  const today = todayISO();
  const monthPrefix = today.slice(0, 7);
  const todaySales = saleSum(sales.filter((r) => r.date === today));
  const monthSales = saleSum(sales.filter((r) => r.date.startsWith(monthPrefix)));
  const ordersCount = sales.length;

  const lowStock = products.filter((p) => p.stock <= p.minStock).sort((a, b) => a.stock - b.stock);
  const unpaidInvoices = invoices.filter((i) => i.status === "sent" || i.status === "draft");
  const recentSales = [...sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const recentCustomers = [...customers]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  /* --------------------------- سلاسل الرسوم --------------------------- */
  // المبيعات حسب الأيام — آخر 7 أيام (الأيام بلا مبيعات تظهر صفرًا)
  const daySeries: ChartDatum[] = Array.from({ length: 7 }, (_, i) => {
    const d = daysAgoISO(6 - i);
    const value = saleSum(sales.filter((r) => r.date === d));
    return {
      label: formatDate(d, lang, { weekday: "short" }),
      value,
      hint: `${formatDate(d, lang)} — ${money(value)}`,
    };
  });

  // المبيعات حسب الأشهر — آخر6 أشهر
  const now = new Date();
  const monthSeries: ChartDatum[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const value = saleSum(sales.filter((r) => r.date.startsWith(prefix)));
    const first = `${prefix}-01`;
    return {
      label: formatDate(first, lang, { month: "short" }),
      value,
      hint: `${formatDate(first, lang, { month: "long", year: "numeric" })} — ${money(value)}`,
    };
  });

  // المنتجات الأكثر مبيعًا (بالإيراد) + المبيعات حسب التصنيف
  const byProduct = new Map<string, { qty: number; revenue: number }>();
  for (const s of sales) {
    for (const it of s.items) {
      const cur = byProduct.get(it.productId) ?? { qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += it.quantity * it.price;
      byProduct.set(it.productId, cur);
    }
  }
  const topProducts: ChartDatum[] = [...byProduct.entries()]
    .map(([id, v]) => ({
      label: productMap.get(id)?.name ?? "—",
      value: v.revenue,
      hint: `${t("common.quantity")}: ${v.qty} — ${money(v.revenue)}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const byCategory = new Map<string, number>();
  for (const s of sales) {
    for (const it of s.items) {
      const cat =
        productMap.get(it.productId)?.category?.trim() || t("dashboard.uncategorized");
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + it.quantity * it.price);
    }
  }
  const categorySeries: ChartDatum[] = [...byCategory.entries()]
    .map(([label, value]) => ({ label, value, hint: `${label}: ${money(value)}` }))
    .sort((a, b) => b.value - a.value);

  if (!can("dashboard.view")) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
        <p className="text-sm font-bold text-slate-700">{t("error.forbidden")}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${t("dashboard.welcome")} ${settings?.businessName ?? t("app.name")}`}
        subtitle={t("app.tagline")}
        actions={
          can("sales.manage") ? (
            <Link href="/sales">
              <Button>
                <Plus className="size-4" />
                {t("dashboard.newSale")}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-8" />
        </div>
      ) : (
        <>
          {/* الإحصائيات — مؤشرات المركز */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label={t("dashboard.todaySales")}
              value={money(todaySales)}
              icon={<TrendingUp className="size-5" />}
            />
            <StatCard
              label={t("dashboard.monthSales")}
              value={money(monthSales)}
              icon={<CalendarDays className="size-5" />}
              tone="emerald"
              hint={`${t("dashboard.totalSales")}: ${money(salesTotal)}`}
            />
            <StatCard
              label={t("dashboard.expenses")}
              value={money(expensesTotal)}
              icon={<Receipt className="size-5" />}
              tone="rose"
              hint={`${t("dashboard.unpaidInvoices")}: ${unpaidInvoices.length}`}
            />
            <StatCard
              label={t("dashboard.netProfit")}
              value={money(netProfit)}
              icon={<Wallet className="size-5" />}
              tone={netProfit >= 0 ? "emerald" : "rose"}
            />
            <StatCard
              label={t("dashboard.customers")}
              value={String(customers.length)}
              icon={<Users className="size-5" />}
              tone="sky"
            />
            <StatCard
              label={t("dashboard.orders")}
              value={String(ordersCount)}
              icon={<ShoppingCart className="size-5" />}
              tone="violet"
            />
            <StatCard
              label={t("dashboard.products")}
              value={String(products.length)}
              icon={<Package className="size-5" />}
              tone="amber"
            />
            <StatCard
              label={t("dashboard.stockValue")}
              value={money(stockValue)}
              icon={<Boxes className="size-5" />}
              tone="primary"
            />
          </div>

          {/* إجراءات سريعة */}
          <div className="mt-5 flex flex-wrap gap-2">
            {can("sales.manage") && (
              <Link href="/sales">
                <Button variant="secondary" size="sm">
                  <ShoppingCart className="size-3.5" />
                  {t("dashboard.newSale")}
                </Button>
              </Link>
            )}
            {can("customers.manage") && (
              <Link href="/customers">
                <Button variant="secondary" size="sm">
                  <UserPlus className="size-3.5" />
                  {t("dashboard.newCustomer")}
                </Button>
              </Link>
            )}
            {can("products.manage") && (
              <Link href="/products">
                <Button variant="secondary" size="sm">
                  <Package className="size-3.5" />
                  {t("dashboard.newProduct")}
                </Button>
              </Link>
            )}
            {can("expenses.manage") && (
              <Link href="/expenses">
                <Button variant="secondary" size="sm">
                  <Receipt className="size-3.5" />
                  {t("dashboard.newExpense")}
                </Button>
              </Link>
            )}
          </div>

          {/* الاشتراك — الخطة الحالية · الاستخدام · المتبقي */}
          <div className="mt-5">
            <DashboardPlanCard />
          </div>

          {/* الرسوم البيانية */}
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle
                action={
                  <span className="text-[11px] font-semibold text-slate-400">
                    {t("dashboard.last7days")}
                  </span>
                }
              >
                {t("dashboard.chartDays")}
              </CardTitle>
              <div className="px-4 pb-5 pt-1">
                <BarSeriesChart data={daySeries} emptyLabel={t("common.noData")} />
              </div>
            </Card>

            <Card>
              <CardTitle
                action={
                  <span className="text-[11px] font-semibold text-slate-400">
                    {t("dashboard.last6months")}
                  </span>
                }
              >
                {t("dashboard.chartMonths")}
              </CardTitle>
              <div className="px-4 pb-5 pt-1">
                <BarSeriesChart data={monthSeries} emptyLabel={t("common.noData")} />
              </div>
            </Card>

            <Card>
              <CardTitle>{t("dashboard.chartTopProducts")}</CardTitle>
              <div className="px-4 pb-5 pt-1">
                <RankBarsChart data={topProducts} emptyLabel={t("common.noData")} />
              </div>
            </Card>

            <Card>
              <CardTitle>{t("dashboard.chartCategory")}</CardTitle>
              <div className="px-4 pb-5 pt-1">
                <DonutChart
                  data={categorySeries}
                  emptyLabel={t("common.noData")}
                  centerLabel={t("common.total")}
                />
              </div>
            </Card>
          </div>

          {/* آخر المبيعات + العملاء الجدد */}
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardTitle
                action={
                  <Link
                    href="/sales"
                    className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700"
                  >
                    {t("dashboard.viewAll")}
                    <ArrowLeft className="size-3.5 rtl:rotate-180" />
                  </Link>
                }
              >
                {t("dashboard.recentSales")}
              </CardTitle>
              <div className="mt-3 overflow-x-auto px-2 pb-3">
                {recentSales.length === 0 ? (
                  <EmptyState title={t("common.noData")} />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400">
                        <th className="px-3 py-2 text-start font-medium">{t("field.number")}</th>
                        <th className="px-3 py-2 text-start font-medium">{t("field.customer")}</th>
                        <th className="px-3 py-2 text-start font-medium">{t("common.date")}</th>
                        <th className="px-3 py-2 text-end font-medium">{t("common.total")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {recentSales.map((s) => (
                        <tr key={s.id}>
                          <td className="px-3 py-2.5 font-semibold text-slate-700" dir="ltr">
                            {s.number}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {customers.find((c) => c.id === s.customerId)?.name ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">{formatDate(s.date, lang)}</td>
                          <td className="px-3 py-2.5 text-end font-bold text-slate-900">
                            {money(docTotal(s.items, s.discount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            {/* العملاء الجدد */}
            <Card className="lg:col-span-2">
              <CardTitle
                action={
                  <Link
                    href="/customers"
                    className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700"
                  >
                    {t("dashboard.viewAll")}
                    <ArrowLeft className="size-3.5 rtl:rotate-180" />
                  </Link>
                }
              >
                {t("dashboard.recentCustomers")}
              </CardTitle>
              <div className="mt-2 px-4 pb-4">
                {recentCustomers.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">{t("common.noData")}</p>
                ) : (
                  <ul className="space-y-2">
                    {recentCustomers.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-500">
                            <Users className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-slate-700">
                              {c.name}
                            </span>
                            <span className="block truncate text-[10px] text-slate-400" dir="auto">
                              {c.phone || c.email || "—"}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatDate(c.createdAt.slice(0, 10), lang)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>

          {/* تنبيهات انخفاض المخزون */}
          <Card className="mt-4">
            <CardTitle
              action={
                <Link
                  href="/inventory"
                  className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700"
                >
                  {t("dashboard.viewAll")}
                  <ArrowLeft className="size-3.5 rtl:rotate-180" />
                </Link>
              }
            >
              <span className="flex items-center gap-2">
                <PackageX className="size-4 text-amber-500" />
                {t("dashboard.lowStock")}
              </span>
            </CardTitle>
            <div className="mt-3 px-4 pb-4">
              {lowStock.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  {t("dashboard.noLowStock")}
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {lowStock.slice(0, 9).map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                          <PackageX className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-slate-700">
                            {p.name}
                          </span>
                          <span className="text-[10px] text-slate-400" dir="ltr">
                            {p.sku}
                          </span>
                        </span>
                      </span>
                      <Badge tone={p.stock <= 0 ? "rose" : "amber"}>
                        {p.stock} / {p.minStock}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
