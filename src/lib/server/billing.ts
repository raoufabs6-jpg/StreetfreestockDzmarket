// ============================================================
// BillingProvider — تجريد بوابة الدفع (§10 Future Payment)
// لا يوجد أي دفع حقيقي الآن: التطبيق يعمل بالكامل بدون مزوّد.
//
// لربط Stripe/PayPal لاحقًا:
//   1) اكتب MyProvider implements BillingProvider
//   2) ادع setBillingProvider(new MyProvider()) عند الإقلاع
//   3) استقبل Webhook لتفعيل الاشتراك وملء currentPeriodStart/End
// نقطة الربط الوحيدة الحالية: src/lib/server/subscription.ts (switchPlan)
// ============================================================

import type { PlanId } from "@/lib/plans";

export interface CheckoutSession {
  /** رابط Redirect الذي يوفّره المزوّد (Stripe Checkout مثلاً) */
  url: string;
  sessionId: string;
}

export interface BillingCustomer {
  customerId: string;
}

export interface BillingSubscriptionRef {
  billingSubscriptionId: string;
  status: string;
}

export interface CreateCheckoutSessionParams {
  organizationId: string;
  plan: PlanId;
  /** رابط العودة بعد إتمام/إلغاء الدفع */
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreateSubscriptionParams {
  organizationId: string;
  plan: PlanId;
  billingCustomerId: string;
  /** نهاية التجربة إن وُجدت — يحوّلها المزوّد إلى بداية الدورة */
  trialEndsAt?: Date | null;
}

/** واجهة مزوّد الفوترة — كل الأساليب قابلة للاستبدال دون مساس بالتطبيق */
export interface BillingProvider {
  readonly name: string;
  createCustomer(params: { organizationId: string; email?: string }): Promise<BillingCustomer>;
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSession>;
  createSubscription(params: CreateSubscriptionParams): Promise<BillingSubscriptionRef>;
  cancelSubscription(params: {
    organizationId: string;
    billingSubscriptionId: string;
  }): Promise<void>;
  changeSubscription(params: {
    organizationId: string;
    billingSubscriptionId: string;
    plan: PlanId;
  }): Promise<BillingSubscriptionRef>;
}

/** يُرمى عندما لا يوجد مزوّد مُفعّل — التطبيق يتعامل معه برد403 لطيف */
export class BillingNotConfiguredError extends Error {
  readonly code = "BILLING_NOT_CONFIGURED";
  constructor() {
    super("لم تُفعّل بوابة دفع بعد — التطبيق يعمل بدونها (جاهزية Stripe/PayPal لاحقًا)");
    this.name = "BillingNotConfiguredError";
  }
}

/**
 * المزوّد الافتراضي: بلا مفاتيح وبلا شبكة — كل الأساليب ترفض بلطف.
 * هذا ما يجعل التطبيق يعمل اليوم دون أي مزوّد دفع.
 */
export class NoopBillingProvider implements BillingProvider {
  readonly name = "noop";

  async createCustomer(): Promise<BillingCustomer> {
    throw new BillingNotConfiguredError();
  }
  async createCheckoutSession(): Promise<CheckoutSession> {
    throw new BillingNotConfiguredError();
  }
  async createSubscription(): Promise<BillingSubscriptionRef> {
    throw new BillingNotConfiguredError();
  }
  async cancelSubscription(): Promise<void> {
    throw new BillingNotConfiguredError();
  }
  async changeSubscription(): Promise<BillingSubscriptionRef> {
    throw new BillingNotConfiguredError();
  }
}

let current: BillingProvider = new NoopBillingProvider();

export function getBillingProvider(): BillingProvider {
  return current;
}

/** للربط المستقبلي: setBillingProvider(new StripeBillingProvider(...)) */
export function setBillingProvider(provider: BillingProvider): void {
  current = provider;
}
