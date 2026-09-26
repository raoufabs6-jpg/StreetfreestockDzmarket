"use client";

// لوحات الاشتراك (SaaS): شارة الحالة، حدود الاستخدام، الخطة الحالية،
// ولوحة مصغّرة للوحة التحكم (Current Plan · Usage · Remaining).
// بيانات حية عبر DataProvider — تعمل في الوضعين local و api.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  HardDrive,
  Package,
  Receipt,
  UserRound,
  Users,
  ArrowUpCircle,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/ar";
import { useCurrentUser } from "@/lib/hooks";
import { cn, formatDate } from "@/lib/utils";
import { getProvider } from "@/lib/data";
import {
  TRIAL_DAYS,
  formatStorage,
  type LimitKey,
  type SubscriptionInfo,
  type SubscriptionStatus,
} from "@/lib/plans";
import { Badge, Button, Card, CardTitle, type BadgeTone } from "@/components/ui/primitives";

/* -------------------------------- شارة -------------------------------- */

const STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  trial: "sky",
  active: "emerald",
  expired: "rose",
  cancelled: "slate",
};

export function PlanStatusBadge({ info }: { info: SubscriptionInfo }) {
  const { t } = useI18n();
  return (
    <Badge tone={STATUS_TONE[info.status]}>
      {t(`plan.${info.plan}` as MessageKey)} · {t(`status.${info.status}` as MessageKey)}
    </Badge>
  );
}

/* ------------------------------ حدود الخطة ----------------------------- */

interface RowDef {
  key: LimitKey;
  icon: LucideIcon;
  labelKey: MessageKey;
}

const LIMIT_ROWS: RowDef[] = [
  { key: "users", icon: Users, labelKey: "limit.users" },
  { key: "products", icon: Package, labelKey: "limit.products" },
  { key: "customers", icon: UserRound, labelKey: "limit.customers" },
  { key: "invoices", icon: Receipt, labelKey: "limit.invoices" },
  { key: "storageMB", icon: HardDrive, labelKey: "limit.storage" },
];

const COUNT_ROWS = LIMIT_ROWS.filter((r) => r.key !== "storageMB");

function rowStats(info: SubscriptionInfo, key: LimitKey) {
  const limit = info.limits[key];
  const used = key === "storageMB" ? info.usage.storageBytes : info.usage[key];
  const cap = key === "storageMB" ? (limit === null ? null : limit * 1024 * 1024) : limit;
  const pct = cap === null || cap === 0 ? 0 : Math.min(100, Math.max(0, (used / cap) * 100));
  const over = cap !== null && used > cap;
  return { limit, used, pct, over };
}

/** أشرطة الاستخدام/المتبقي — compact تُخفّف الأيقونات للوحة التحكم */
export function UsagePanel({ info, compact = false }: { info: SubscriptionInfo; compact?: boolean }) {
  const { t, lang } = useI18n();
  const rows = compact ? COUNT_ROWS : LIMIT_ROWS;

  return (
    <ul className={cn("space-y-3", compact && "space-y-2.5")}>
      {rows.map(({ key, icon: Icon, labelKey }) => {
        const { limit, used, pct, over } = rowStats(info, key);
        const rem = info.remaining[key];
        const usedLabel = key === "storageMB" ? formatStorage(used, lang) : String(used);
        const limitLabel = key === "storageMB" && limit !== null ? formatStorage(limit * 1024 * 1024, lang) : limit === null ? "" : String(limit);
        const remLabel =
          rem === null
            ? t("limit.unlimited")
            : key === "storageMB"
              ? `${rem > 0 ? rem : 0} MB`
              : String(rem);
        return (
          <li key={key}>
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-1.5 font-medium text-slate-600">
                {!compact && <Icon className="size-3.5 text-slate-400" />}
                {t(labelKey)}
              </span>
              <span className="font-bold text-slate-800 tabular-nums" dir="ltr">
                {usedLabel}
                {limit !== null && ` / ${limitLabel}`}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    over
                      ? "bg-rose-500"
                      : limit === null
                        ? "bg-emerald-400"
                        : pct >= 80
                          ? "bg-amber-500"
                          : "bg-gradient-to-l from-primary-500 to-primary-400 ltr:bg-gradient-to-r",
                  )}
                  style={{ width: limit === null ? "100%" : `${Math.max(pct, used > 0 ? 3 : 0)}%` }}
                />
              </div>
              <span
                className={cn(
                  "w-20 shrink-0 text-end text-[11px] font-bold tabular-nums",
                  rem === null ? "text-emerald-600" : over || (rem ?? 1) <= 0 ? "text-rose-600" : "text-slate-500",
                )}
                dir="ltr"
              >
                {rem === null ? `∞ ${t("subscription.remaining")}` : `${remLabel} ⟵`}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** المتبقي كقائمة (عمود ثالث في لوحة التحكم) */
export function RemainingList({ info }: { info: SubscriptionInfo }) {
  const { t, lang } = useI18n();
  return (
    <ul className="space-y-1.5 text-[13px]">
      {LIMIT_ROWS.map(({ key, icon: Icon, labelKey }) => {
        const rem = info.remaining[key];
        return (
          <li key={key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-slate-500">
              <Icon className="size-3.5 text-slate-400" />
              {t(labelKey)}
            </span>
            <span
              className={cn(
                "font-bold tabular-nums",
                rem === null ? "text-emerald-600" : rem <= 0 ? "text-rose-600" : rem <= 5 ? "text-amber-600" : "text-slate-700",
              )}
              dir="ltr"
            >
              {rem === null
                ? t("limit.unlimited")
                : key === "storageMB"
                  ? formatStorage(Math.max(0, rem) * 1024 * 1024, lang)
                  : rem}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------- الخطة الحالية (صفحة) --------------------------- */

export function CurrentPlanCard({ info }: { info: SubscriptionInfo }) {
  const { t, lang } = useI18n();
  const inTrial = info.status === "trial" && info.daysLeft !== null;
  const elapsed = inTrial ? Math.min(TRIAL_DAYS, TRIAL_DAYS - (info.daysLeft ?? 0)) : 0;

  return (
    <Card>
      <CardTitle action={<PlanStatusBadge info={info} />}>{t("subscription.currentPlan")}</CardTitle>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-black text-slate-900">{t(`plan.${info.plan}` as MessageKey)}</p>
            <p className="mt-0.5 text-sm text-slate-500">{t(`plan.tagline.${info.plan}` as MessageKey)}</p>
          </div>
          <div className="text-end text-xs text-slate-500">
            <p className="font-semibold text-slate-600">{t("subscription.status")}</p>
            <p>{t(`status.${info.status}` as MessageKey)}</p>
          </div>
        </div>

        {inTrial && (
          <div className="rounded-xl bg-sky-50 p-3 ring-1 ring-sky-100">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-sky-800">
                <CalendarDays className="size-4" />
                {t("subscription.trial")}
              </span>
              <span className="font-bold text-sky-900">
                {info.daysLeft} {t("subscription.daysLeft")}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
              <div
                className="h-full rounded-full bg-gradient-to-l from-sky-500 to-sky-400 ltr:bg-gradient-to-r"
                style={{ width: `${Math.max(4, (elapsed / TRIAL_DAYS) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-sky-700">
              {t("subscription.trialEndsOn")} {info.trialEndsAt ? formatDate(info.trialEndsAt, lang) : "—"}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-100">
          <span className="font-semibold text-slate-600">{t("subscription.billingPeriod")}</span>
          <span className="text-slate-500" dir="ltr">
            {info.currentPeriodEnd
              ? `${info.currentPeriodStart ? formatDate(info.currentPeriodStart, lang) : "—"} → ${formatDate(info.currentPeriodEnd, lang)}`
              : t("subscription.noBilling")}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          {info.status === "trial"
            ? t("subscription.effectiveNote")
            : info.status === "expired" || info.status === "cancelled"
              ? t("subscription.trialUsedNote")
              : t("pricing.paymentsSoon")}
        </p>
      </div>
    </Card>
  );
}

/* --------------------- لوحة مصغّرة للوحة التحكم --------------------- */

/** Current Plan · Usage · Remaining — جلب ذاتي عبر DataProvider */
export function DashboardPlanCard() {
  const { t } = useI18n();
  const { can } = useCurrentUser();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    let alive = true;
    getProvider()
      .getSubscription()
      .then((s) => {
        if (alive) setInfo(s);
      })
      .catch(() => {
        if (alive) setInfo(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!info) return null;

  const anyOver = (["users", "products", "customers", "invoices"] as const).some(
    (k) => info.remaining[k] !== null && (info.remaining[k] as number) <= 0,
  );

  return (
    <Card>
      <CardTitle action={<PlanStatusBadge info={info} />}>{t("dashboard.currentPlan")}</CardTitle>
      <div className="grid gap-5 p-5 lg:grid-cols-3">
        {/* Current Plan */}
        <div className="space-y-3">
          <div>
            <p className="text-2xl font-black text-slate-900">{t(`plan.${info.plan}` as MessageKey)}</p>
            {info.status === "trial" && info.daysLeft !== null ? (
              <p className="mt-1 text-sm font-semibold text-sky-700">
                <span className="text-lg font-black">{info.daysLeft}</span> {t("subscription.daysLeft")}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">{t(`plan.tagline.${info.plan}` as MessageKey)}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/subscription">
              <Button variant="secondary" size="sm">
                {t("pricing.manage")}
              </Button>
            </Link>
            {can("settings.manage") && (
              <Link href="/pricing">
                <Button size="sm">
                  <ArrowUpCircle className="size-4" />
                  {t("subscription.upgrade")}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Usage */}
        <div>
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            {t("subscription.usage")}
          </p>
          <UsagePanel info={info} compact />
        </div>

        {/* Remaining */}
        <div>
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            {t("subscription.remaining")}
          </p>
          <RemainingList info={info} />
          {anyOver && (
            <p className="mt-2 text-[11px] font-semibold text-rose-600">{t("subscription.overLimit")}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
