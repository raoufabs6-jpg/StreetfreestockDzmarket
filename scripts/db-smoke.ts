// فحص سريع لصحة قاعدة البيانات (Smoke Test)
// ينشئ مؤسسة اختبارية مؤقتة، يجرّب أهم العلاقات والقيود، ثم يحذفها.
// التشغيل: DATABASE_URL مضبوط ثم:  npm run db:smoke
// ⚠️ لا يمس بيانات مؤسستك الحقيقية — ينشئ مؤسسة "SMOKE-TEST" ويحذفها.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/types";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`فشل الفحص: ${msg}`);
}

async function main() {
  const org = await prisma.organization.create({
    data: { name: "SMOKE-TEST", rolePermissions: DEFAULT_ROLE_PERMISSIONS },
  });
  console.log("• مؤسسة الاختبار:", org.id);

  try {
    // مستخدم (مالك المؤسسة)
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: "Smoke Owner",
        email: `smoke-${org.id}@test.local`,
        role: "owner",
      },
    });
    assert(user.id, "إنشاء مستخدم");

    // رمز استعادة كلمة المرور (يُحذف تلقائيًا مع المؤسسة عبر Cascade)
    const resetToken = await prisma.passwordResetToken.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        tokenHash: `smoke-${org.id}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    assert(resetToken.id, "إنشاء رمز استعادة كلمة المرور");

    // عميل + فئة + منتج + مخزون
    const customer = await prisma.customer.create({
      data: { organizationId: org.id, name: "عميل اختبار" },
    });
    const category = await prisma.category.create({
      data: { organizationId: org.id, name: "فئة اختبار" },
    });
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        categoryId: category.id,
        name: "منتج اختبار",
        sku: "SMOKE-1",
        unitPrice: 100,
        costPrice: 60,
      },
    });
    await prisma.inventory.create({
      data: { organizationId: org.id, productId: product.id, quantity: 10 },
    });
    assert(product.categoryId === category.id, "علاقة منتج↔فئة");

    // بيع + بنود (معاملة)
    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        number: "SMOKE-SAL-1",
        date: "2026-09-25",
        items: {
          create: [{ organizationId: org.id, productId: product.id, quantity: 2, price: 100 }],
        },
      },
      include: { items: true },
    });
    assert(sale.items.length === 1, "بنود البيع");

    // فاتورة + دفعة + مصروف + حركة مخزون + إشعار
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        number: "SMOKE-INV-1",
        date: "2026-09-25",
        dueDate: "2026-10-05",
        amount: 200,
      },
    });
    await prisma.payment.create({
      data: { organizationId: org.id, invoiceId: invoice.id, amount: 50, date: "2026-09-25" },
    });
    await prisma.expense.create({
      data: {
        organizationId: org.id,
        date: "2026-09-25",
        category: "rent",
        amount: 1000,
        description: "إيجار اختبار",
      },
    });
    await prisma.inventoryMovement.create({
      data: { organizationId: org.id, productId: product.id, type: "in", quantity: 10, date: "2026-09-25" },
    });
    await prisma.notification.create({
      data: { organizationId: org.id, type: "low_stock", title: "تنبيه اختبار" },
    });
    const supplier = await prisma.supplier.create({
      data: { organizationId: org.id, name: "مورد اختبار" },
    });
    await prisma.purchase.create({
      data: {
        organizationId: org.id,
        supplierId: supplier.id,
        number: "SMOKE-PUR-1",
        date: "2026-09-25",
        items: {
          create: [{ organizationId: org.id, productId: product.id, quantity: 5, price: 60 }],
        },
      },
      include: { items: true, supplier: true },
    });

    // قيود التفرّد
    let uniqueFailed = false;
    try {
      await prisma.user.create({
        data: { organizationId: org.id, name: "مكرر", email: user.email },
      });
    } catch {
      uniqueFailed = true;
    }
    assert(uniqueFailed, "قيد تفرد البريد الإلكتروني");

    let saleNumberFailed = false;
    try {
      await prisma.sale.create({
        data: {
          organizationId: org.id,
          customerId: customer.id,
          number: "SMOKE-SAL-1",
          date: "2026-09-25",
        },
      });
    } catch {
      saleNumberFailed = true;
    }
    assert(saleNumberFailed, "قيد تفرد رقم البيع داخل المؤسسة");

    // عزل المؤسسات: مؤسسة أخرى لا ترى بيانات هذه المؤسسة
    const otherOrg = await prisma.organization.create({ data: { name: "OTHER" } });
    const leak = await prisma.customer.findMany({ where: { organizationId: otherOrg.id } });
    assert(leak.length === 0, "عزل بيانات المؤسسات");
    const crossGet = await prisma.customer.findFirst({
      where: { id: customer.id, organizationId: otherOrg.id },
    });
    assert(crossGet === null, "منع الوصول العابر للمؤسسات");
    await prisma.organization.delete({ where: { id: otherOrg.id } });

    console.log("✅ نجح فحص قاعدة البيانات (علاقات + قيود + عزل المؤسسات)");
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
    console.log("• تم حذف بيانات الاختبار");
  }
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
