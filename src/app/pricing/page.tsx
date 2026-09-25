"use client";

// صفحة الأسعار (Pricing) — عامة تمامًا وخارج نطاق (app):
// عرض الخطط الأربع FREE · BASIC · BUSINESS · PRO بأسعار شهرية/سنوية،
// مع تبديل فوري للخطة عند تسجيل الدخول — بدون أي بوابة دفع (جاهزية Stripe).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, Check, LogIn, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/ar";
import { cn, formatMoney } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";
import { getProvider, isApiMode } from "@/lib/data";
import {
  PLAN_LIMITS,
  PLAN_ORDER,
  PLAN_PRICES,
  type PlanId,
  type SubscriptionInfo,
} from "@/lib/plans";

const FEATURE_KEYS = ["limit.users", "limit.products", "limit.customers", "limit.invoices", "limit.storage"] as const satisfies readonly MessageKey[];

export default function PricingPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [yearly, setYearly] = useState(false);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [busy, setBusy] = useState<PlanId | null>(null);
  // وقت القراءة يُؤخذ داخل الأثر (pure render — قاعدة React Compiler)
  const [nowTs, setNowTs] = useState(0);

  useEffect(() => {
    let alive = true;
    setNowTs(Date.now());
    (async () => {
      try {
        if (!isApiMode) {
          const info = await getProvider().getSubscription();
          if (alive) setSub(info);
          return;
        }
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (res.ok) {
          const info = await getProvider().getSubscription();
          if (alive) setSub(info);
        }
      } catch {
        /* زائر — يبقى sub = null */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const trialLive =
    sub?.status === "trial" && sub.trialEndsAt != null && new Date(sub.trialEndsAt).getTime() > nowTs;

  const choose = async (plan: PlanId) => {
    if (!sub) {
      // زائر → الدخول لاختيار الخطة (الوضع المحلي يعمل مباشرة)
      if (isApiMode) {
        router.push("/login");
      }
      return;
    }
    setBusy(plan);
    try {
      const info = await getProvider().setPlan(plan);
      setSub(info);
      toast.success(t("toast.updated"));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("toast.error"));
    } finally {
      setBusy(null);
    }
  };

  const featureValue = (plan: PlanId, idx: number): string => {
    const keys = ["users", "products", "customers", "invoices", "storageMB"] as const;
    const v = PLAN_LIMITS[plan][keys[idx]];
    if (v === null) return t("limit.unlimited");
    if (keys[idx] === "storageMB") return `${v} ${lang === "ar" ? "م.ب" : "MB"}`;
    return `${v}`;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* الترويسة */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-600 text-white">
              <Boxes className="size-5" />
            </span>
            <span className="text-base font-extrabold text-slate-900">AKMA Business</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-4" />
                {t("common.back")}
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="sm">
                <LogIn className="size-4" />
                {t("auth.signIn")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* البطل */}
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-12 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 ring-1 ring-inset ring-indigo-100">
          <Sparkles className="size-3.5" />
          {t("pricing.trialHint")}
        </span>
        <h1 className="mt-4 text-3xl font-black text-slate-900 sm:text-4xl">{t("pricing.title")}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
          {t("pricing.subtitle")}
        </p>

        {/* شهري/سنوي */}
        <div className="mt-6 inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              "rounded-lg px-4 py-1.5 transition-colors",
              !yearly ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t("pricing.monthly")}
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-1.5 transition-colors",
              yearly ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t("pricing.yearly")}
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              {t("pricing.saveYearly")}
            </span>
          </button>
        </div>
      </section>

      {/* البطاقات */}
      <section className="mx-auto max-w-6xl px-4 pb-10">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((plan) => {
            const price = yearly ? PLAN_PRICES[plan].yearly : PLAN_PRICES[plan].monthly;
            const popular = plan === "business";
            const best = plan === "pro";
            const current = sub != null && sub.plan === plan && (sub.status === "active" || sub.status === "trial");
            const ctaLabel = current
              ? t("pricing.currentPlan")
              : plan === "free"
                ? t("pricing.startFree")
                : sub && trialLive
                  ? t("pricing.chooseTrial")
                  : t("pricing.choose");

            return (
              <div
                key={plan}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-white p-6 shadow-card transition-shadow",
                  popular
                    ? "border-indigo-500 ring-2 ring-indigo-500/40"
                    : "border-slate-200 hover:shadow-lg",
                )}
              >
                {(popular || best) && (
                  <span
                    className={cn(
                      "absolute -top-3 start-4 rounded-full px-2.5 py-0.5 text-[11px] font-black text-white shadow",
                      popular ? "bg-indigo-600" : "bg-violet-600",
                    )}
                  >
                    {popular ? t("pricing.popular") : t("pricing.bestValue")}
                  </span>
                )}

                <p className="text-lg font-black uppercase tracking-wider text-slate-900">
                  {t(`plan.${plan}` as MessageKey)}
                </p>
                <p className="mt-1 text-xs text-slate-400">{t(`plan.tagline.${plan}` as MessageKey)}</p>

                <div className="mt-4 flex items-end gap-1.5">
                  <span className="text-3xl font-black text-slate-900">
                    {plan === "free" ? "0" : formatMoney(price, "DZD", lang)}
                  </span>
                  <span className="pb-1 text-xs text-slate-400">
                    {yearly ? t("pricing.perYear") : t("pricing.perMonth")}
                  </span>
                </div>

                <div className="my-4 h-px bg-slate-100" />

                <ul className="mb-5 flex-1 space-y-2.5">
                  {FEATURE_KEYS.map((fk, idx) => (
                    <li key={fk} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 text-slate-600">
                        <Check className="size-4 shrink-0 text-emerald-500" />
                        {t(fk)}
                      </span>
                      <span className="font-bold text-slate-800 tabular-nums" dir="ltr">
                        {featureValue(plan, idx)}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={current ? "secondary" : popular ? "primary" : "secondary"}
                  className="w-full"
                  disabled={current || busy === plan}
                  onClick={() => choose(plan)}
                >
                  {ctaLabel}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ملاحظات الدفع */}
      <section className="mx-auto max-w-6xl px-4 pb-14 text-center">
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5 text-xs leading-relaxed text-slate-500">
          <p>{t("pricing.trialHint")}</p>
          <p className="font-semibold text-slate-600">{t("pricing.noCard")}</p>
          <p>{t("pricing.paymentsSoon")}</p>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 sm:flex-row">
          <span>AKMA Business — {t("app.tagline")}</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
