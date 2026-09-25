-- Phase 6: نظام الفواتير الاحترافي
-- 1) حقول جديدة على الفاتورة: رابط البيع المصدر (لقطة)، خصم، حالة دفع PAID/PARTIAL/UNPAID
-- 2) جدول بنود الفاتورة (لقطة مستقلة: اسم منتج منسوخ، بدون FK للمنتج)

-- رابط البيع المصدر — بدون FK عمودي (الفاتورة تبقى بعد حذف البيع)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "saleId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "saleNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentStatus" "paymentStatus" NOT NULL DEFAULT 'unpaid';

CREATE INDEX IF NOT EXISTS "Invoice_organizationId_saleId_idx" ON "Invoice"("organizationId", "saleId");

-- بنود الفاتورة
CREATE TABLE IF NOT EXISTS "InvoiceItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceItem_organizationId_invoiceId_idx" ON "InvoiceItem"("organizationId", "invoiceId");

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
