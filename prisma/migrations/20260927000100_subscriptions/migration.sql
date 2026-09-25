-- Phase 7: SaaS Subscription Plans
-- جدول اشتراك واحد لكل مؤسسة: خطة + حالة + فترة تجربة + نهاية دورة مدفوعة (جاهزية Stripe)

CREATE TYPE "plan" AS ENUM ('free', 'basic', 'business', 'pro');
CREATE TYPE "subscriptionStatus" AS ENUM ('trial', 'active', 'expired', 'cancelled');

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "plan" NOT NULL DEFAULT 'business',
    "status" "subscriptionStatus" NOT NULL DEFAULT 'trial',
    "trialUsedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
