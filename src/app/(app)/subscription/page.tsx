"use client";

// صفحة الاشتراك — الخطة الحالية، حالة الاشتراك، فترة التجربة، حدود الاستخدام

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpCircle, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/hooks";
import { getProvider } from "@/lib/data";
import type { SubscriptionInfo } from "@/lib/plans";
import { Button, Card, CardTitle, EmptyState, PageHeader, Spinner } from "@/components/ui/primitives";
import {
  CurrentPlanCard,
  PlanStatusBadge,
  RemainingList,
  UsagePanel,
} from "@/components/subscription/plan-panels";

export default function SubscriptionPage() {
  const { t } = useI18n();
  const { can } = useCurrentUser();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getProvider()
      .getSubscription()
      .then((s) => {
        if (alive) {
          setInfo(s);
          setError(false);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("subscription.title")}
        subtitle={t("pricing.subtitle")}
        actions={
          can("settings.manage") ? (
            <Link href="/pricing">
              <Button>
                <ArrowUpCircle className="size-4" />
                {t("subscription.upgrade")}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {!info && !error && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Spinner className="size-4" /> {t("common.loading")}
        </div>
      )}
      {error && (
        <EmptyState
          icon={<RefreshCw className="size-6" />}
          title={t("common.error")}
          description={t("toast.error")}
          action={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {t("common.refresh")}
            </Button>
          }
        />
      )}

      {info && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <CurrentPlanCard info={info} />

            <Card>
              <CardTitle action={<PlanStatusBadge info={info} />}>{t("subscription.planLimits")}</CardTitle>
              <div className="space-y-4 p-5">
                <UsagePanel info={info} />
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    {t("subscription.remaining")}
                  </p>
                  <RemainingList info={info} />
                </div>
              </div>
            </Card>
          </div>

          {info.status === "trial" && (
            <p className="text-xs text-slate-500">{t("subscription.effectiveNote")}</p>
          )}
        </>
      )}
    </div>
  );
}
