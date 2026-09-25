"use client";

// Header — البحث السريع + الإشعارات + حساب المستخدم

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Menu,
  Search,
  ChevronDown,
  UserRound,
  LogIn,
  Globe,
  PackageX,
  FileClock,
  AlarmClock,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useI18n, LANGS, type Lang } from "@/lib/i18n";
import { useCollection, useCurrentUser } from "@/lib/hooks";
import type { Invoice, Product } from "@/lib/types";
import { Badge } from "@/components/ui/primitives";

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const { user, users, switchUser, role, can } = useCurrentUser();
  const { rows: products } = useCollection<Product>("products");
  const { rows: invoices } = useCollection<Invoice>("invoices");

  const [q, setQ] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // إغلاق القوائم عند الضغط خارجها
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const notifications = useMemo(() => {
    const lowStock = products.filter((p) => p.stock <= p.minStock);
    const unpaid = invoices.filter((i) => i.status === "sent" || i.status === "draft");
    const overdue = invoices.filter((i) => i.status === "overdue");
    const list: Array<{ id: string; icon: typeof Bell; tone: string; text: string }> = [];
    if (lowStock.length)
      list.push({
        id: "low",
        icon: PackageX,
        tone: "text-amber-500 bg-amber-50",
        text: t("header.alertLowStock", { count: lowStock.length }),
      });
    if (overdue.length)
      list.push({
        id: "overdue",
        icon: AlarmClock,
        tone: "text-rose-500 bg-rose-50",
        text: t("header.alertOverdue", { count: overdue.length }),
      });
    if (unpaid.length)
      list.push({
        id: "unpaid",
        icon: FileClock,
        tone: "text-sky-500 bg-sky-50",
        text: t("header.alertUnpaid", { count: unpaid.length }),
      });
    return list;
  }, [products, invoices, t]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      {/* زر القائمة (هاتف) */}
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 md:hidden"
        aria-label="فتح القائمة"
      >
        <Menu className="size-5" />
      </button>

      {/* بحث سريع */}
      <form onSubmit={onSearch} className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("header.searchPlaceholder")}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
        />
      </form>

      <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
        {/* بحث أيقونة (هاتف) → صفحة البحث */}
        <Link
          href="/search"
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 sm:hidden"
          aria-label={t("nav.search")}
        >
          <Search className="size-5" />
        </Link>

        {/* الإشعارات */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label={t("header.notifications")}
          >
            <Bell className="size-5" />
            {notifications.length > 0 && (
              <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute end-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-scale-in">
              <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">
                {t("header.notifications")}
              </p>
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">
                  {t("header.noNotifications")}
                </p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {notifications.map((n) => {
                    const Icon = n.icon;
                    return (
                      <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                        <span className={cn("flex size-8 items-center justify-center rounded-lg", n.tone)}>
                          <Icon className="size-4" />
                        </span>
                        <span className="text-xs font-medium text-slate-600">{n.text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* حساب المستخدم */}
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-slate-100"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
              {initials(user?.name ?? "AK")}
            </span>
            <span className="hidden text-start leading-tight md:block">
              <span className="block text-xs font-bold text-slate-800">
                {user?.name ?? t("app.name")}
              </span>
              <span className="block text-[10px] text-slate-400">
                {t(`enum.role.${role}` as "enum.role.admin")}
              </span>
            </span>
            <ChevronDown className="hidden size-4 text-slate-400 md:block" />
          </button>

          {userOpen && (
            <div className="absolute end-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-scale-in">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-800">{user?.name ?? t("app.name")}</p>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>

              {can("settings.view") && (
                <>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                    {t("header.switchUser")}
                  </p>
                  <ul className="max-h-40 overflow-y-auto px-2 pb-2">
                    {users.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            void switchUser(u.id);
                            setUserOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition hover:bg-slate-50",
                            u.id === user?.id ? "bg-primary-50 text-primary-700" : "text-slate-600",
                          )}
                        >
                          <UserRound className="size-3.5 opacity-60" />
                          {u.name}
                          {u.id === user?.id && <LogIn className="ms-auto size-3.5" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="border-t border-slate-100 px-4 pt-3 pb-1 text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                {t("common.language")}
              </p>
              <div className="flex gap-1 px-3 pb-3">
                <Globe className="my-auto size-4 text-slate-300" />
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code as Lang)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-bold transition",
                      lang === l.code
                        ? "bg-primary-600 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                    )}
                  >
                    {l.code.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {can("settings.view") && (
          <Link
            href="/settings"
            className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 sm:block"
            aria-label={t("nav.settings")}
          >
            <Badge tone="primary">{t("header.adminPanel")}</Badge>
          </Link>
        )}
      </div>
    </header>
  );
}
