"use client";

// بحث شامل في العملاء والمنتجات والفواتير والمبيعات والمصاريف

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, FileText, Users, Package, ShoppingCart, Receipt } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCollection, useSettings } from "@/lib/hooks";
import { formatDate, formatMoney, docTotal } from "@/lib/utils";
import type { Customer, Expense, Invoice, Product, Sale } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";

interface Hit {
  id: string;
  title: string;
  subtitle: string;
  right?: string;
  href: string;
}

export default function SearchPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { settings } = useSettings();
  const currency = settings?.currency ?? "DZD";

  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");

  const { rows: customers } = useCollection<Customer>("customers");
  const { rows: products } = useCollection<Product>("products");
  const { rows: invoices } = useCollection<Invoice>("invoices");
  const { rows: sales } = useCollection<Sale>("sales");
  const { rows: expenses } = useCollection<Expense>("expenses");

  // قراءة ?q= من الرابط بعد التحميل (بدون useSearchParams)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("q") ?? "";
    setTerm(initial);
    setQ(initial);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = q.trim();
    setTerm(next);
    router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  };

  const needle = term.trim().toLowerCase();
  const match = (...vals: string[]) => vals.some((v) => v.toLowerCase().includes(needle));

  const groups: Array<{
    key: string;
    label: string;
    icon: typeof Users;
    href: string;
    hits: Hit[];
  }> = [];

  if (needle) {
    groups.push({
      key: "customers",
      label: t("page.customers"),
      icon: Users,
      href: "/customers",
      hits: customers
        .filter((c) => match(c.name, c.email, c.phone, c.address))
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: [c.email, c.phone].filter(Boolean).join(" · "),
          href: "/customers",
        })),
    });
    groups.push({
      key: "products",
      label: t("page.products"),
      icon: Package,
      href: "/products",
      hits: products
        .filter((p) => match(p.name, p.sku, p.category))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: `${p.sku} · ${p.category}`,
          right: formatMoney(p.unitPrice, currency, lang),
          href: "/products",
        })),
    });
    groups.push({
      key: "sales",
      label: t("page.sales"),
      icon: ShoppingCart,
      href: "/sales",
      hits: sales
        .filter((s) => match(s.number, s.note))
        .slice(0, 5)
        .map((s) => ({
          id: s.id,
          title: s.number,
          subtitle: formatDate(s.date, lang),
          right: formatMoney(docTotal(s.items, s.discount), currency, lang),
          href: "/sales",
        })),
    });
    groups.push({
      key: "invoices",
      label: t("page.invoices"),
      icon: FileText,
      href: "/invoices",
      hits: invoices
        .filter((i) => match(i.number, i.note))
        .slice(0, 5)
        .map((i) => ({
          id: i.id,
          title: i.number,
          subtitle: formatDate(i.date, lang),
          right: formatMoney(i.amount, currency, lang),
          href: "/invoices",
        })),
    });
    groups.push({
      key: "expenses",
      label: t("page.expenses"),
      icon: Receipt,
      href: "/expenses",
      hits: expenses
        .filter((e) => match(e.description, e.note))
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          title: e.description,
          subtitle: formatDate(e.date, lang),
          right: formatMoney(e.amount, currency, lang),
          href: "/expenses",
        })),
    });
  }

  const totalHits = groups.reduce((s, g) => s + g.hits.length, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("page.search")}
        subtitle={term ? t("search.resultsFor", { q: term }) : t("search.placeholder")}
      />

      <form onSubmit={submit} className="relative mb-5">
        <SearchIcon className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          autoFocus
          className="h-12 w-full rounded-2xl border border-slate-300 bg-white ps-12 pe-4 text-sm shadow-card outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        />
      </form>

      {!needle ? (
        <Card>
          <EmptyState icon={<SearchIcon className="size-6" />} title={t("search.placeholder")} />
        </Card>
      ) : totalHits === 0 ? (
        <Card>
          <EmptyState
            icon={<SearchIcon className="size-6" />}
            title={t("common.noResults")}
            description={t("common.trySearch")}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-bold text-slate-400">
            {t("search.found", { count: totalHits })}
          </p>
          {groups
            .filter((g) => g.hits.length > 0)
            .map((g) => {
              const Icon = g.icon;
              return (
                <Card key={g.key}>
                  <div className="flex items-center justify-between px-5 pt-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Icon className="size-4 text-primary-500" />
                      {g.label}
                    </p>
                    <Link href={g.href} className="text-xs font-bold text-primary-600">
                      {t("dashboard.viewAll")}
                    </Link>
                  </div>
                  <ul className="mt-2 divide-y divide-slate-50 px-2 pb-2">
                    {g.hits.map((hit) => (
                      <li key={`${g.key}-${hit.id}`}>
                        <Link
                          href={hit.href}
                          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-800">
                              {hit.title}
                            </span>
                            {hit.subtitle && (
                              <span className="block truncate text-xs text-slate-400">
                                {hit.subtitle}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {hit.right && (
                              <span className="text-sm font-bold text-slate-700">{hit.right}</span>
                            )}
                            <Badge tone="primary">{t("search.in")} {g.label}</Badge>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
