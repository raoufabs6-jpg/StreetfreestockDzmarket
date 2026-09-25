// ============================================================
// المستودعات (Repositories) — كل استعلام هنا مُقيّد بـ organizationId
// عزل المستأجرين (Multi-tenant isolation):
//   • قراءة: where يحتوي organizationId من الجلسة دائمًا
//   • كتابة: organizationId تُشتق من الجلسة ولا تُقبل من العميل
//   • علاقات خارج المؤسسة (عميل/منتج/...) تُتحقق قبل الإنشاء
// ============================================================

import { prisma } from "./db";
import { assertCan, type OrgContext } from "./auth";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import * as v from "./validation";
import type { z } from "zod";

export interface ResourceOps {
  list(ctx: OrgContext): Promise<unknown[]>;
  get(ctx: OrgContext, id: string): Promise<unknown>;
  create(ctx: OrgContext, body: unknown): Promise<unknown>;
  update(ctx: OrgContext, id: string, body: unknown): Promise<unknown>;
  remove(ctx: OrgContext, id: string): Promise<void>;
}

/** يلف كل عملية بفحص الصلاحية (view للقراءة / manage للكتابة) */
function guarded(module: string | null, ops: ResourceOps): ResourceOps {
  const check = (ctx: OrgContext, perm: string) => {
    if (module) assertCan(ctx, perm);
  };
  return {
    list: (ctx) => {
      check(ctx, `${module}.view`);
      return ops.list(ctx);
    },
    get: (ctx, id) => {
      check(ctx, `${module}.view`);
      return ops.get(ctx, id);
    },
    create: (ctx, body) => {
      check(ctx, `${module}.manage`);
      return ops.create(ctx, body);
    },
    update: (ctx, id, body) => {
      check(ctx, `${module}.manage`);
      return ops.update(ctx, id, body);
    },
    remove: (ctx, id) => {
      check(ctx, `${module}.manage`);
      return ops.remove(ctx, id);
    },
  };
}

async function findScopedOrThrow<T>(row: T | null): Promise<T> {
  if (row === null) throw notFound();
  return row;
}

/* ----------------------------- العملاء (CRM) ----------------------------- */

const customers = guarded("customers", {
  list: async (ctx) =>
    prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.customer.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    ),
  create: async (ctx, body) => {
    const data = v.customerSchema.parse(body);
    return prisma.customer.create({ data: { ...data, organizationId: ctx.organizationId } });
  },
  update: async (ctx, id, body) => {
    const data = v.customerSchema.partial().parse(body);
    await findScopedOrThrow(
      await prisma.customer.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    return prisma.customer.update({ where: { id }, data });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.customer.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    await prisma.customer.delete({ where: { id } });
  },
});

/* ------------------------------ الموردون ------------------------------ */

const suppliers = guarded("suppliers", {
  list: async (ctx) =>
    prisma.supplier.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.supplier.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    ),
  create: async (ctx, body) => {
    const data = v.supplierSchema.parse(body);
    return prisma.supplier.create({ data: { ...data, organizationId: ctx.organizationId } });
  },
  update: async (ctx, id, body) => {
    const data = v.supplierSchema.partial().parse(body);
    await findScopedOrThrow(
      await prisma.supplier.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    return prisma.supplier.update({ where: { id }, data });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.supplier.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    await prisma.supplier.delete({ where: { id } });
  },
});

/* ------------------------------- الفئات ------------------------------- */

const categories = guarded("products", {
  list: async (ctx) =>
    prisma.category.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.category.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    ),
  create: async (ctx, body) => {
    const data = v.categorySchema.parse(body);
    return prisma.category.create({ data: { ...data, organizationId: ctx.organizationId } });
  },
  update: async (ctx, id, body) => {
    const data = v.categorySchema.partial().parse(body);
    await findScopedOrThrow(
      await prisma.category.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    return prisma.category.update({ where: { id }, data });
  },
  remove: async (ctx, id) => {
    const row = await findScopedOrThrow(
      await prisma.category.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    const used = await prisma.product.count({
      where: { organizationId: ctx.organizationId, categoryId: row.id },
    });
    if (used > 0) throw conflict("لا يمكن حذف فئة تحتوي على منتجات");
    await prisma.category.delete({ where: { id } });
  },
});

/* ------------------------------- المنتجات ------------------------------- */

type ProductInput = z.infer<typeof v.productSchema>;
type ProductPatch = Partial<ProductInput>;

/** إيجاد/إنشاء فئة بالاسم داخل نفس المؤسسة فقط */
async function resolveCategory(ctx: OrgContext, name: string) {
  const trimmed = name.trim();
  return prisma.category.upsert({
    where: { organizationId_name: { organizationId: ctx.organizationId, name: trimmed } },
    create: { organizationId: ctx.organizationId, name: trimmed },
    update: {},
  });
}

async function productToDto(ctx: OrgContext, id: string) {
  const row = await findScopedOrThrow(
    await prisma.product.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { category: true, inventory: true },
    }),
  );
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    name: row.name,
    sku: row.sku,
    category: row.category.name,
    unit: row.unit,
    costPrice: row.costPrice,
    unitPrice: row.unitPrice,
    stock: row.inventory?.quantity ?? 0,
    minStock: row.minStock,
    description: row.description,
  };
}

const products = guarded("products", {
  list: async (ctx) => {
    const rows = await prisma.product.findMany({
      where: { organizationId: ctx.organizationId },
      include: { category: true, inventory: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      name: row.name,
      sku: row.sku,
      category: row.category.name,
      unit: row.unit,
      costPrice: row.costPrice,
      unitPrice: row.unitPrice,
      stock: row.inventory?.quantity ?? 0,
      minStock: row.minStock,
      description: row.description,
    }));
  },
  get: (ctx, id) => productToDto(ctx, id),
  create: async (ctx, body) => {
    const data = v.productSchema.parse(body) as ProductInput;
    const { category, stock, ...rest } = data;
    const categoryRow = await resolveCategory(ctx, category);
    const created = await prisma.product.create({
      data: { ...rest, categoryId: categoryRow.id, organizationId: ctx.organizationId },
    });
    // المخزون الابتدائي في جدول Inventory المنفصل
    await prisma.inventory.create({
      data: {
        organizationId: ctx.organizationId,
        productId: created.id,
        quantity: stock,
      },
    });
    return productToDto(ctx, created.id);
  },
  update: async (ctx, id, body) => {
    const data = v.productSchema.partial().parse(body) as ProductPatch;
    await findScopedOrThrow(
      await prisma.product.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    const { category, stock, ...rest } = data;
    const categoryRow = category !== undefined ? await resolveCategory(ctx, category) : null;
    if (Object.keys(rest).length > 0 || categoryRow) {
      await prisma.product.update({
        where: { id },
        data: {
          ...rest,
          ...(categoryRow ? { categoryId: categoryRow.id } : {}),
        },
      });
    }
    if (stock !== undefined) {
      await prisma.inventory.upsert({
        where: { productId: id },
        create: { organizationId: ctx.organizationId, productId: id, quantity: stock },
        update: { quantity: stock },
      });
    }
    return productToDto(ctx, id);
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.product.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    // يفشل بـ P2003 (يُترجم إلى 409) إذا كان المنتج مستخدمًا في فواتير
    await prisma.product.delete({ where: { id } });
  },
});

/* --------------------------- حركات المخزون --------------------------- */

const movements = guarded("inventory", {
  list: async (ctx) =>
    prisma.inventoryMovement.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.inventoryMovement.findFirst({
        where: { id, organizationId: ctx.organizationId },
      }),
    ),
  create: async (ctx, body) => {
    const data = v.movementSchema.parse(body);

    const product = await prisma.product.findFirst({
      where: { id: data.productId, organizationId: ctx.organizationId },
      include: { inventory: true },
    });
    if (!product) throw badRequest("المنتج غير موجود في مؤسستك");

    const current = product.inventory?.quantity ?? 0;
    const delta = data.type === "in" ? data.quantity : data.type === "out" ? -data.quantity : 0;
    if (data.type === "adjust") {
      throw badRequest("نوع التسوية غير مدعوم — استخدم إضافة أو سحب");
    }
    if (current + delta < 0) {
      throw badRequest(`الكمية المتوفرة (${current}) لا تكفي العملية`);
    }

    return prisma.$transaction(async (tx) => {
      await tx.inventory.upsert({
        where: { productId: product.id },
        create: {
          organizationId: ctx.organizationId,
          productId: product.id,
          quantity: current + delta,
        },
        update: { quantity: { increment: delta } },
      });
      return tx.inventoryMovement.create({
        data: { ...data, organizationId: ctx.organizationId },
      });
    });
  },
  update: async () => {
    throw badRequest("سجل الحركات للقراءة فقط — عدّل المخزون من صفحة المخزون");
  },
  remove: async () => {
    throw badRequest("سجل الحركات للقراءة فقط — عدّل المخزون من صفحة المخزون");
  },
});

/* ------------------------- التحقق من علاقات المستندات ------------------------- */

async function assertCustomerInOrg(ctx: OrgContext, customerId: string) {
  const row = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!row) throw badRequest("العميل غير موجود في مؤسستك");
  return row;
}

async function assertSupplierInOrg(ctx: OrgContext, supplierId: string) {
  const row = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!row) throw badRequest("المورد غير موجود في مؤسستك");
  return row;
}

async function assertProductsInOrg(ctx: OrgContext, productIds: string[]) {
  const unique = [...new Set(productIds)];
  const found = await prisma.product.findMany({
    where: { organizationId: ctx.organizationId, id: { in: unique } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((p) => p.id));
  const missing = unique.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw badRequest(`منتجات غير موجودة في مؤسستك: ${missing.join(", ")}`);
  }
}

async function assertNumberFree(
  ctx: OrgContext,
  kind: "sale" | "purchase" | "invoice",
  number: string,
  excludeId?: string,
) {
  const where = {
    organizationId: ctx.organizationId,
    number,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
  const existing =
    kind === "sale"
      ? await prisma.sale.findFirst({ where })
      : kind === "purchase"
        ? await prisma.purchase.findFirst({ where })
        : await prisma.invoice.findFirst({ where });
  if (existing) throw conflict(`الرقم «${number}» مستخدم مسبقًا في مؤسستك`);
}

const itemInclude = { items: { orderBy: { id: "asc" as const } } };

/* ------------------------------- المبيعات ------------------------------- */

const sales = guarded("sales", {
  list: async (ctx) =>
    prisma.sale.findMany({
      where: { organizationId: ctx.organizationId },
      include: itemInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.sale.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: itemInclude,
      }),
    ),
  create: async (ctx, body) => {
    const data = v.saleSchema.parse(body);
    await assertCustomerInOrg(ctx, data.customerId);
    await assertProductsInOrg(ctx, data.items.map((i) => i.productId));
    await assertNumberFree(ctx, "sale", data.number);
    return prisma.sale.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: data.customerId,
        number: data.number,
        date: data.date,
        discount: data.discount ?? 0,
        paymentStatus: data.paymentStatus,
        note: data.note ?? null,
        items: {
          create: data.items.map((i) => ({ ...i, organizationId: ctx.organizationId })),
        },
      },
      include: itemInclude,
    });
  },
  update: async (ctx, id, body) => {
    const data = v.saleSchema.partial().parse(body);
    const existing = await findScopedOrThrow(
      await prisma.sale.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    if (data.customerId) await assertCustomerInOrg(ctx, data.customerId);
    if (data.number && data.number !== existing.number) {
      await assertNumberFree(ctx, "sale", data.number, id);
    }
    if (data.items) {
      await assertProductsInOrg(ctx, data.items.map((i) => i.productId));
    }
    return prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id },
        data: {
          ...(data.customerId ? { customerId: data.customerId } : {}),
          ...(data.number ? { number: data.number } : {}),
          ...(data.date ? { date: data.date } : {}),
          ...(data.discount !== undefined ? { discount: data.discount } : {}),
          ...(data.paymentStatus ? { paymentStatus: data.paymentStatus } : {}),
          ...(data.note !== undefined ? { note: data.note } : {}),
        },
      });
      if (data.items) {
        await tx.saleItem.deleteMany({ where: { saleId: id } });
        await tx.saleItem.createMany({
          data: data.items.map((i) => ({
            ...i,
            saleId: id,
            organizationId: ctx.organizationId,
          })),
        });
      }
      return tx.sale.findUniqueOrThrow({ where: { id }, include: itemInclude });
    });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.sale.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    await prisma.sale.delete({ where: { id } });
  },
});

/* ------------------------------ المشتريات ------------------------------ */

const purchases = guarded("purchases", {
  list: async (ctx) =>
    prisma.purchase.findMany({
      where: { organizationId: ctx.organizationId },
      include: itemInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.purchase.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: itemInclude,
      }),
    ),
  create: async (ctx, body) => {
    const data = v.purchaseSchema.parse(body);
    await assertSupplierInOrg(ctx, data.supplierId);
    await assertProductsInOrg(ctx, data.items.map((i) => i.productId));
    await assertNumberFree(ctx, "purchase", data.number);
    return prisma.purchase.create({
      data: {
        organizationId: ctx.organizationId,
        supplierId: data.supplierId,
        number: data.number,
        date: data.date,
        discount: data.discount ?? 0,
        paymentStatus: data.paymentStatus,
        note: data.note ?? null,
        items: {
          create: data.items.map((i) => ({ ...i, organizationId: ctx.organizationId })),
        },
      },
      include: itemInclude,
    });
  },
  update: async (ctx, id, body) => {
    const data = v.purchaseSchema.partial().parse(body);
    const existing = await findScopedOrThrow(
      await prisma.purchase.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    if (data.supplierId) await assertSupplierInOrg(ctx, data.supplierId);
    if (data.number && data.number !== existing.number) {
      await assertNumberFree(ctx, "purchase", data.number, id);
    }
    if (data.items) await assertProductsInOrg(ctx, data.items.map((i) => i.productId));
    return prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: {
          ...(data.supplierId ? { supplierId: data.supplierId } : {}),
          ...(data.number ? { number: data.number } : {}),
          ...(data.date ? { date: data.date } : {}),
          ...(data.discount !== undefined ? { discount: data.discount } : {}),
          ...(data.paymentStatus ? { paymentStatus: data.paymentStatus } : {}),
          ...(data.note !== undefined ? { note: data.note } : {}),
        },
      });
      if (data.items) {
        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
        await tx.purchaseItem.createMany({
          data: data.items.map((i) => ({
            ...i,
            purchaseId: id,
            organizationId: ctx.organizationId,
          })),
        });
      }
      return tx.purchase.findUniqueOrThrow({ where: { id }, include: itemInclude });
    });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.purchase.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    await prisma.purchase.delete({ where: { id } });
  },
});

/* --------------------------- الفواتير (Invoices) --------------------------- */

const invoices = guarded("invoices", {
  list: async (ctx) =>
    prisma.invoice.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.invoice.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    ),
  create: async (ctx, body) => {
    const data = v.invoiceSchema.parse(body);
    await assertCustomerInOrg(ctx, data.customerId);
    await assertNumberFree(ctx, "invoice", data.number);
    return prisma.invoice.create({
      data: { ...data, note: data.note ?? null, organizationId: ctx.organizationId },
    });
  },
  update: async (ctx, id, body) => {
    const data = v.invoiceSchema.partial().parse(body);
    const existing = await findScopedOrThrow(
      await prisma.invoice.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    if (data.customerId) await assertCustomerInOrg(ctx, data.customerId);
    if (data.number && data.number !== existing.number) {
      await assertNumberFree(ctx, "invoice", data.number, id);
    }
    return prisma.invoice.update({ where: { id }, data });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.invoice.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    await prisma.invoice.delete({ where: { id } });
  },
});

/* ------------------------------ المصاريف ------------------------------ */

const expenses = guarded("expenses", {
  list: async (ctx) =>
    prisma.expense.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.expense.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    ),
  create: async (ctx, body) => {
    const data = v.expenseSchema.parse(body);
    return prisma.expense.create({
      data: { ...data, note: data.note ?? null, organizationId: ctx.organizationId },
    });
  },
  update: async (ctx, id, body) => {
    const data = v.expenseSchema.partial().parse(body);
    await findScopedOrThrow(
      await prisma.expense.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    return prisma.expense.update({ where: { id }, data });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.expense.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    await prisma.expense.delete({ where: { id } });
  },
});

/* ------------------------ المستخدمون والصلاحيات ------------------------ */

const USER_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
} as const;

const users = guarded("users", {
  list: async (ctx) =>
    prisma.user.findMany({
      where: { organizationId: ctx.organizationId },
      select: USER_SELECT,
      orderBy: { createdAt: "desc" },
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.user.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: USER_SELECT,
      }),
    ),
  create: async (ctx, body) => {
    const data = v.userSchema.parse(body);
    // منح دور المالك للمدير فقط (تسلسل الصلاحيات)
    if (data.role === "owner" && ctx.role !== "owner") {
      throw forbidden("منح دور المالك للمدير فقط");
    }
    // حساب جديد بلا كلمة مرور (يُفعّل لاحقًا) — لا نُنشئ جلسات هنا
    return prisma.user.create({
      data: { ...data, organizationId: ctx.organizationId },
      select: USER_SELECT,
    });
  },
  update: async (ctx, id, body) => {
    const data = v.userSchema.partial().parse(body);
    const target = await findScopedOrThrow(
      await prisma.user.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: USER_SELECT,
      }),
    );
    // تسلسل الصلاحيات: لا يُغيَّر دور/حالة حساب المالك إلا بواسطة مالك
    if (
      target.role === "owner" &&
      ctx.role !== "owner" &&
      (data.role !== undefined || data.status !== undefined)
    ) {
      throw forbidden("لا يمكن تغيير دور أو حالة حساب مالك إلا بواسطة مالك آخر");
    }
    // منح دور المالك للمدير فقط
    if (data.role === "owner" && ctx.role !== "owner") {
      throw forbidden("منح دور المالك للمدير فقط");
    }
    if (id === ctx.userId) {
      if (data.role && data.role !== ctx.role) {
        throw badRequest("لا يمكنك تغيير دور حسابك الحالي");
      }
      if (data.status === "disabled") {
        throw badRequest("لا يمكنك تعطيل حسابك الحالي");
      }
    }
    return prisma.user.update({ where: { id }, data, select: USER_SELECT });
  },
  remove: async (ctx, id) => {
    if (id === ctx.userId) throw badRequest("لا يمكنك حذف حسابك الحالي");
    const target = await findScopedOrThrow(
      await prisma.user.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: USER_SELECT,
      }),
    );
    if (target.role === "owner" && ctx.role !== "owner") {
      throw forbidden("لا يمكن حذف حساب مالك إلا بواسطة مالك آخر");
    }
    await prisma.user.delete({ where: { id } });
  },
});

/* ------------------------------ المدفوعات ------------------------------ */

const payments = guarded("invoices", {
  list: async (ctx) =>
    prisma.payment.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.payment.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    ),
  create: async (ctx, body) => {
    const data = v.paymentSchema.parse(body);
    if (data.invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: data.invoiceId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!invoice) throw badRequest("الفاتورة غير موجودة في مؤسستك");
    }
    return prisma.payment.create({
      data: { ...data, note: data.note ?? null, organizationId: ctx.organizationId },
    });
  },
  update: async (ctx, id, body) => {
    const data = v.paymentSchema.partial().parse(body);
    await findScopedOrThrow(
      await prisma.payment.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    if (data.invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: data.invoiceId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!invoice) throw badRequest("الفاتورة غير موجودة في مؤسستك");
    }
    return prisma.payment.update({ where: { id }, data });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.payment.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    await prisma.payment.delete({ where: { id } });
  },
});

/* ------------------------------ الإشعارات ------------------------------ */

const notifications = guarded(null, {
  list: async (ctx) =>
    prisma.notification.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.notification.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    ),
  create: async (ctx, body) => {
    const data = v.notificationSchema.parse(body);
    if (data.userId) {
      const member = await prisma.user.findFirst({
        where: { id: data.userId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!member) throw badRequest("المستخدم غير موجود في مؤسستك");
    }
    return prisma.notification.create({
      data: { ...data, organizationId: ctx.organizationId },
    });
  },
  update: async (ctx, id, body) => {
    const data = v.notificationSchema.partial().parse(body);
    await findScopedOrThrow(
      await prisma.notification.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    return prisma.notification.update({ where: { id }, data });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.notification.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    await prisma.notification.delete({ where: { id } });
  },
});

/* ------------------------------ سجل الموارد ------------------------------ */

export const resources: Record<string, ResourceOps> = {
  customers,
  suppliers,
  categories,
  products,
  movements,
  sales,
  purchases,
  invoices,
  expenses,
  users,
  payments,
  notifications,
};

export function getResource(name: string): ResourceOps | null {
  return resources[name] ?? null;
}
