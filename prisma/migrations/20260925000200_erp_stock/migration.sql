-- ============================================================
-- تطوير قسم ERP (Phase 4):
-- 1) حالة المنتج (نشط/موقوف) — الموقوف لا يُباع
-- 2) ربط حركات المخزون بالمستندات (saleId/purchaseId) —
--    يسمح بعكس آمن عند حذف بيع/شراء عبر حركات تعويضية محسوبة
-- 3) إعداد «السماح ببيع أكبر من المخزون» (طلب مسبق) على مستوى المؤسسة
-- ============================================================

-- 1) حالة المنتج
CREATE TYPE "productStatus" AS ENUM ('active', 'inactive');

ALTER TABLE "Product" ADD COLUMN "status" "productStatus" NOT NULL DEFAULT 'active';

-- 2) مراجع المستندات في سجل الحركات (أعمدة تاريخية — بدون FK ليبقى السجل بعد الحذف)
ALTER TABLE "InventoryMovement" ADD COLUMN "saleId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "purchaseId" TEXT;

CREATE INDEX "InventoryMovement_saleId_idx" ON "InventoryMovement"("saleId");

CREATE INDEX "InventoryMovement_purchaseId_idx" ON "InventoryMovement"("purchaseId");

-- 3) إعداد تجاوز المخزون
ALTER TABLE "Organization" ADD COLUMN "allowOversell" BOOLEAN NOT NULL DEFAULT false;
