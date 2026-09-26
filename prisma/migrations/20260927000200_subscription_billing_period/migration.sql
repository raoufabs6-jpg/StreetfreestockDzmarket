-- إضافة غير تدميرية: بداية الدورة المدفوعة (جاهزية بوابة دفع لاحقة — Stripe مثلاً)
-- لا يحذف ولا يعدّل أي بيانات موجودة
ALTER TABLE "Subscription" ADD COLUMN "currentPeriodStart" TIMESTAMP(3);
