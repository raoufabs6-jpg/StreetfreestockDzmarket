-- ============================================================
-- ترقية نظام المصادقة (Phase 3):
-- 1) الأدوار الجديدة: owner / admin / manager / employee
--    (تحويل staff → employee مع الحفاظ على البيانات القائمة)
-- 2) إصدار الجلسة sessionVersion — لإبطال كل الجلسات عند تغيير كلمة المرور
-- 3) جدول رموز استعادة كلمة المرور PasswordResetToken
-- =================================================-----------

-- 1) تحديث enum الأدوار (باستبدال النوع كاملاً لتفادي قيود ALTER TYPE ADD VALUE داخل المعاملات)
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "role_new" AS ENUM ('owner', 'admin', 'manager', 'employee');

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "role_new"
  USING (CASE "role"::text WHEN 'staff' THEN 'employee' ELSE "role"::text END)::"role_new";

DROP TYPE "role";

ALTER TYPE "role_new" RENAME TO "role";

-- القيمة الافتراضية الجديدة: حساب الموظف (أول مؤسسة يُنشأ لها مالك صراحةً)
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'employee';

-- 2) إصدار الجلسة — يُرفع آليًا عند تغيير كلمة المرور (إبطال الجلسات القديمة)
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- 3) رموز استعادة كلمة المرور (مُجزّأة، مؤقتة، مرتبطة بالمؤسسة والمستخدم)
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

CREATE INDEX "PasswordResetToken_organizationId_idx" ON "PasswordResetToken"("organizationId");

CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
