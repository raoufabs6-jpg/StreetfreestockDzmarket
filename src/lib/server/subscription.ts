// ============================================================
// منطق الاشتراكات (SaaS) — الخادم:
//  • افتراضي: كل مؤسسة جديدة تبدأ بتجربة14 يومًا (خطة BUSINESS)
//  • فرض حدود الخطة عند إنشاء: مستخدمين/منتجات/عملاء/فواتير
//  • استهلاك التخزين = حجم فعلي محسوب بـ pg_column_size لكل
//    جداول المؤسسة (تقدير حقيقي من قاعدة البيانات، لا أرقام ثابتة)
//  • لا بوابة دفع هنا: الخطة المدفوعة بعد انتهاء التجربة تُرفض
//    بـ403 — نقطة الربط المستقبلية بـ Stripe موسومة في switchPlan
// ============================================================

import { prisma } from "@/lib/server/db";
import { ApiError } from "@/lib/server/errors";
import { BillingNotConfiguredError, getBillingProvider } from "@/lib/server/billing";
import {
  PLAN_LIMITS,
  TRIAL_DAYS,
  TRIAL_PLAN,
  effectivePlan,
  planSwitch,
  type PlanId,
  type SubscriptionInfo,
  type SubscriptionStatus,
} from "@/lib/plans";

const DAY_MS = 86_400_000;

export type LimitedResource = "users" | "products" | "customers" | "invoices";

/** نهاية التجربة (من تاريخ معطى) */
export function trialEndDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
}

/** حقول التجربة لـcreate المتداخل داخل organization.create (setup/register) */
export function trialSubscriptionFields(now: Date = new Date()) {
  return {
    plan: TRIAL_PLAN,
    status: "trial" as const,
    trialUsedAt: now,
    trialEndsAt: trialEndDate(now),
  };
}

/** اشتراك كامل بمؤسسة محددة — للاستعلامات المباشرة */
export function newTrialSubscription(organizationId: string, now: Date = new Date()) {
  return { organizationId, ...trialSubscriptionFields(now) };
}

/** جلب سجل الاشتراك (أو إنشاؤه للمؤسسات القديمة) + ترقية تجربة منتهية إلى expired */
async function loadRow(orgId: string) {
  let row = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
  if (!row) {
    row = await prisma.subscription.create({ data: newTrialSubscription(orgId) });
  }
  if (row.status === "trial" && row.trialEndsAt && row.trialEndsAt.getTime() <= Date.now()) {
    row = await prisma.subscription.update({
      where: { id: row.id },
      data: { status: "expired" },
    });
  }
  return row;
}

/** حجم بيانات المؤسسة بالبايت — مجموع pg_column_size لكل صفوف الجداول التي تحمل organizationId */
async function orgStorageBytes(orgId: string): Promise<number> {
  try {
    const cols = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'organizationId'`;
    let total = 0;
    for (const { table_name } of cols) {
      const rows = await prisma.$queryRawUnsafe<Array<{ s: bigint | number | null }>>(
        `SELECT COALESCE(SUM(pg_column_size(t)), 0) AS s FROM "${table_name}" t WHERE "organizationId" = $1`,
        orgId,
      );
      total += Number(rows[0]?.s ?? 0);
    }
    return total;
  } catch {
    return 0;
  }
}

async function usageOf(orgId: string) {
  const [users, products, customers, invoices, storageBytes] = await Promise.all([
    prisma.user.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.customer.count({ where: { organizationId: orgId } }),
    prisma.invoice.count({ where: { organizationId: orgId } }),
    orgStorageBytes(orgId),
  ]);
  return { users, products, customers, invoices, storageBytes };
}

/** صورة الاشتراك الكاملة (الخطة، الحالة، التجربة، الحدود، الاستخدام، المتبقي) */
export async function getSubscriptionInfo(orgId: string): Promise<SubscriptionInfo> {
  const row = await loadRow(orgId);
  const plan = row.plan as PlanId;
  const status = row.status as SubscriptionStatus;
  const ePlan = effectivePlan(plan, status, row.trialEndsAt);
  const limits = PLAN_LIMITS[ePlan];
  const usage = await usageOf(orgId);
  const now = Date.now();

  const daysLeft =
    status === "trial" && row.trialEndsAt
      ? Math.max(0, Math.ceil((row.trialEndsAt.getTime() - now) / DAY_MS))
      : null;

  const mb = 1024 * 1024;
  return {
    plan,
    status,
    effectivePlan: ePlan,
    trialUsed: row.trialUsedAt != null,
    trialUsedAt: row.trialUsedAt?.toISOString() ?? null,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    daysLeft,
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    limits,
    usage,
    remaining: {
      users: limits.users === null ? null : limits.users - usage.users,
      products: limits.products === null ? null : limits.products - usage.products,
      customers: limits.customers === null ? null : limits.customers - usage.customers,
      invoices: limits.invoices === null ? null : limits.invoices - usage.invoices,
      storageMB:
        limits.storageMB === null ? null : Math.round((limits.storageMB - usage.storageBytes / mb) * 10) / 10,
    },
  };
}

const RESOURCE_AR: Record<LimitedResource, string> = {
  users: "المستخدمين",
  products: "المنتجات",
  customers: "العملاء",
  invoices: "الفواتير",
};

/** رفض الإنشاء عند بلوغ حد الخطة الحالية — 403 + SUBSCRIPTION_LIMIT_REACHED */
export async function assertPlanLimit(orgId: string, resource: LimitedResource): Promise<void> {
  const result = await checkSubscriptionLimit(orgId, resource);
  if (!result.allowed) {
    throw new ApiError(
      403,
      "SUBSCRIPTION_LIMIT_REACHED",
      `لقد وصلت إلى الحد الأقصى في خطتك الحالية: ${RESOURCE_AR[resource]} (${result.limit}) — ترقية الخطة من صفحة الأسعار`,
    );
  }
}

/* ==== أدوات الاشتراك القابلة لإعادة الاستخدام (§6) ==== */

/** سجل اشتراك المؤسسة (يُنشئه مبدئيًا إن لم يوجد) */
export async function getOrganizationSubscription(orgId: string) {
  return loadRow(orgId);
}

/** الخطة الفعلية المطبَّقة */
export function getEffectivePlan(sub: { plan: PlanId; status: SubscriptionStatus; trialEndsAt: Date | null }): PlanId {
  return effectivePlan(sub.plan, sub.status, sub.trialEndsAt);
}

/** حدود خطة معيّنة */
export function getPlanLimits(plan: PlanId) {
  return PLAN_LIMITS[plan];
}

/** استهلاك المؤسسة الفعلي (عدادات + بايتات تخزين) */
export async function getOrganizationUsage(orgId: string) {
  return usageOf(orgId);
}

/** فحص غير رافض: هل يمكن إنشاء مورد جديد؟ */
export async function checkSubscriptionLimit(orgId: string, resource: LimitedResource): Promise<{
  allowed: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  effectivePlan: PlanId;
}> {
  const info = await getSubscriptionInfo(orgId);
  const limit = info.limits[resource];
  const used = info.usage[resource];
  return {
    allowed: limit === null || used < limit,
    limit,
    used,
    remaining: limit === null ? null : limit - used,
    effectivePlan: info.effectivePlan,
  };
}

/**
 * تبديل خطة المؤسسة.
 * • FREE → فوري (status active).
 * • مدفوعة داخل فترة التجربة → تبديل فوري بنفس التجربة.
 * • مدفوعة بعد انتهاء التجربة → 403: هنا نقطة ربط Stripe
 *   المستقبلية: تُستبدل بـ创建 Checkout Session ثم redirect.
 */
export async function switchPlan(orgId: string, plan: PlanId): Promise<SubscriptionInfo> {
  const row = await loadRow(orgId);
  // قواعد التبديل نقية في planSwitch (مصدر واحد للحقيقة مع الوضع المحلي)
  const result = planSwitch(row, plan);
  if (!result.ok) {
    // [نقطة Stripe] — البنية جاهزة: BillingProvider هو نقطة الربط الوحيدة.
    // NoopBillingProvider حاليًا (بلا مفاتيح وبلا شبكة) → نرفض بـ403 PAYMENT_REQUIRED.
    // لاحقًا مع مزوّد حقيقي: createCheckoutSession → redirect(session.url)
    // → Webhook يفعّل الاشتراك ويملأ currentPeriodStart/currentPeriodEnd.
    try {
      await getBillingProvider().createCheckoutSession({ organizationId: orgId, plan });
    } catch (err) {
      if (err instanceof BillingNotConfiguredError) {
        throw new ApiError(
          403,
          "PAYMENT_REQUIRED",
          "الخطط المدفوعة تحتاج تفعيل الدفع — بوابة الدفع (Stripe/PayPal) ستُربط في تحديث قادم. يمكنك الاستمرار بخطة FREE",
        );
      }
      throw err;
    }
    // مزوّد متصل لكن لم يصل Webhook بعد → لا نفعّل الاشتراك بدونه
    throw new ApiError(
      403,
      "PAYMENT_REQUIRED",
      "الخطط المدفوعة تحتاج تفعيل الدفع — بوابة الدفع ستُربط في تحديث قادم. يمكنك الاستمرار بخطة FREE",
    );
  }
  await prisma.subscription.update({
    where: { id: row.id },
    data: {
      plan: result.next.plan,
      status: result.next.status,
      trialUsedAt: result.next.trialUsedAt,
      trialEndsAt: result.next.trialEndsAt,
    },
  });
  return getSubscriptionInfo(orgId);
}
