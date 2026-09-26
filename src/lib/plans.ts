// ============================================================
// خطط الاشتراك (Subscription Plans) — مصدر واحد للحقيقة
// يُستخدم من الخادم (فرض الحدود) ومن الواجهة (صفحة الأسعار
// ولوحة الاستخدام) — بيانات فقط، بلا أي منطق دفع.
//
// جاهزية الدفع لاحقًا (Stripe مثلاً):
//  • `PLAN_PRICES` أسعار عرض تجريبية — تُستبدل بأسعار Checkout
//  • `Subscription.currentPeriodEnd` يخزّن نهاية الدورة المدفوعة
//  • تبديل خطة مدفوعة بلا بوابة دفع يُرفض بـ403 (انظر
//    src/lib/server/subscription.ts — الفرع الذي يُستبدل بـredirect URL)
// ============================================================

export type PlanId = "free" | "basic" | "business" | "pro";
export type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled";

/** حدود الخطة — null = غير محدود */
export interface PlanLimits {
  users: number | null;
  products: number | null;
  customers: number | null;
  invoices: number | null;
  storageMB: number | null;
}

export type LimitKey = keyof PlanLimits;

export const PLAN_ORDER: PlanId[] = ["free", "basic", "business", "pro"];

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { users: 3, products: 25, customers: 25, invoices: 10, storageMB: 5 },
  basic: { users: 5, products: 500, customers: 500, invoices: 200, storageMB: 50 },
  business: { users: 15, products: 5000, customers: 5000, invoices: 5000, storageMB: 500 },
  pro: { users: null, products: null, customers: null, invoices: null, storageMB: 2048 },
};

/** أسعار العرض (دينار جزائري) — تجريبية حتى تفعيل بوابة الدفع */
export const PLAN_PRICES: Record<PlanId, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  basic: { monthly: 1900, yearly: 19000 },
  business: { monthly: 4900, yearly: 49000 },
  pro: { monthly: 9900, yearly: 99000 },
};

/** أيام التجربة المجانية لكل مؤسسة (تُطبَّق على خطة الأعمال) */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanId = "business";

/** صورة الاشتراك كما تعود للواجهة (من الخادم أو المخزن المحلي) */
export interface SubscriptionInfo {
  plan: PlanId;
  status: SubscriptionStatus;
  /** الخطة المطبَّقة فعليًا: انتهت التجربة/ملغاة → free */
  effectivePlan: PlanId;
  /** هل استُهلكت التجربة المجانية لهذه المؤسسة */
  trialUsed: boolean;
  trialUsedAt: string | null;
  trialEndsAt: string | null;
  /** أيام متبقية من التجربة (null إن لم تكن في تجربة) */
  daysLeft: number | null;
  /** بداية الدورة المدفوعة — تُملأ عند تفعيل الدفع لاحقًا */
  currentPeriodStart: string | null;
  /** نهاية الدورة المدفوعة — تُملأ عند تفعيل الدفع لاحقًا */
  currentPeriodEnd: string | null;
  limits: PlanLimits;
  usage: {
    users: number;
    products: number;
    customers: number;
    invoices: number;
    storageBytes: number;
  };
  /** null = غير محدود */
  remaining: Record<"users" | "products" | "customers" | "invoices" | "storageMB", number | null>;
}

/** سجل الاشتراك كما يُخزَّن (التاريخ أو نص ISO) */
export interface SubscriptionRecord {
  plan: PlanId;
  status: SubscriptionStatus;
  trialUsedAt: string | Date | null;
  trialEndsAt: string | Date | null;
}

export type PlanSwitchResult =
  | { ok: true; next: { plan: PlanId; status: SubscriptionStatus; trialUsedAt: Date; trialEndsAt: Date | null } }
  | { ok: false; code: "payment_required" };

/**
 * قواعد تبديل الخطة — دالّة نقية مشتركة بين الخادم والموزع المحلي:
 *  • FREE → فوري (active)
 *  • مدفوعة داخل تجربة سارية → تبديل بنفس التجربة
 *  • مدفوعة بلا تجربة → بدء تجربة جديدة
 *  • مدفوعة بعد انتهاء التجربة → payment_required
 *    [نقطة Stripe] عند الدفع يُستبدل هذا الرفض بـCheckout Session
 */
export function planSwitch(current: SubscriptionRecord, plan: PlanId, now: Date = new Date()): PlanSwitchResult {
  const trialUsedAt = current.trialUsedAt ? new Date(current.trialUsedAt) : null;
  const trialEndsAt = current.trialEndsAt ? new Date(current.trialEndsAt) : null;

  if (plan === "free") {
    return { ok: true, next: { plan: "free", status: "active", trialUsedAt: trialUsedAt ?? now, trialEndsAt } };
  }
  const trialActive = trialEndsAt != null && trialEndsAt.getTime() > now.getTime();
  if (trialUsedAt && trialActive) {
    return { ok: true, next: { plan, status: "trial", trialUsedAt, trialEndsAt } };
  }
  if (!trialUsedAt) {
    return { ok: true, next: { plan, status: "trial", trialUsedAt: now, trialEndsAt: addDays(now, TRIAL_DAYS) } };
  }
  return { ok: false, code: "payment_required" };
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/** الخطة الفعلية المطبَّقة حسب الحالة والتواريخ */
export function effectivePlan(
  plan: PlanId,
  status: SubscriptionStatus,
  trialEndsAt: string | Date | null | undefined,
  now: number = Date.now(),
): PlanId {
  if (status === "active") return plan;
  if (status === "trial" && trialEndsAt && new Date(trialEndsAt).getTime() > now) return plan;
  return "free";
}

/** صياغة بايتات التخزين للعرض (MB/KB) */
export function formatStorage(bytes: number, lang = "ar"): string {
  const b = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (b >= 1024 * 1024) {
    const mb = b / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} ${lang === "ar" ? "م.ب" : "MB"}`;
  }
  if (b >= 1024) return `${Math.round(b / 1024)} ${lang === "ar" ? "ك.ب" : "KB"}`;
  return `${b} ${lang === "ar" ? "بايت" : "B"}`;
}
