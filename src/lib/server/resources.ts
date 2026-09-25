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
import { assertPlanLimit } from "./subscription";
import * as v from "./validation";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

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
    await assertPlanLimit(ctx.organizationId, "customers");
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
    status: row.status,
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
      status: row.status,
    }));
  },
  get: (ctx, id) => productToDto(ctx, id),
  create: async (ctx, body) => {
    const data = v.productSchema.parse(body) as ProductInput;
    await assertPlanLimit(ctx.organizationId, "products");
    const { category, stock, ...rest } = data;
    const categoryRow = await resolveCategory(ctx, category);
    // منتج + مخزون افتتاحي + حركة «رصيد افتتاحي» في معاملة واحدة
    const createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...rest, categoryId: categoryRow.id, organizationId: ctx.organizationId },
      });
      await tx.inventory.create({
        data: {
          organizationId: ctx.organizationId,
          productId: created.id,
          quantity: stock,
        },
      });
      if (stock > 0) {
        await logMovement(tx, ctx, {
          productId: created.id,
          type: "in",
          quantity: stock,
          date: new Date().toISOString().slice(0, 10),
          note: "رصيد افتتاحي",
        });
      }
      return created.id;
    });
    return productToDto(ctx, createdId);
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
      // تعديل مباشر للكمية → يُسجَّل كحركة تسووية (السجل لا يُترك صامتًا)
      const before = await prisma.inventory.findUnique({
        where: { productId: id },
        select: { quantity: true },
      });
      if ((before?.quantity ?? 0) !== stock) {
        await prisma.$transaction(async (tx) => {
          await tx.inventory.upsert({
            where: { productId: id },
            create: { organizationId: ctx.organizationId, productId: id, quantity: stock },
            update: { quantity: stock },
          });
          await logMovement(tx, ctx, {
            productId: id,
            type: "adjust",
            quantity: stock,
            date: new Date().toISOString().slice(0, 10),
            note: "تعديل مباشر من بطاقة المنتج",
          });
        });
      } else if (!before) {
        await prisma.inventory.create({
          data: { organizationId: ctx.organizationId, productId: id, quantity: stock },
        });
      }
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
    if (data.type !== "adjust" && current + delta < 0) {
      throw badRequest(`الكمية المتوفرة (${current}) لا تكفي العملية`);
    }

    return prisma.$transaction(async (tx) => {
      if (data.type === "adjust") {
        // تعديل الكمية (جرد): تعيين القيمة الفعلية — يقبل الصفر
        await setStock(tx, ctx, product.id, data.quantity);
      } else {
        await changeStock(tx, ctx, product.id, delta, {
          allowNegative: false,
          label: product.name,
        });
      }
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

async function loadProductsInOrg(
  ctx: OrgContext,
  ids: string[],
  tx?: Tx,
): Promise<
  Array<{ id: string; name: string; status: "active" | "inactive"; inventory: { quantity: number } | null }>
> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const db = tx ?? prisma;
  const found = await db.product.findMany({
    where: { organizationId: ctx.organizationId, id: { in: unique } },
    select: {
      id: true,
      name: true,
      status: true,
      inventory: { select: { quantity: true } },
    },
  });
  const foundIds = new Set(found.map((p) => p.id));
  const missing = unique.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw badRequest(`منتجات غير موجودة في مؤسستك: ${missing.join(", ")}`);
  }
  return found;
}

/** تجميع كميات البنود لكل منتج (بنود مكررة للمنتج الواحد) */
function groupQty(items: Array<{ productId: string; quantity: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of items) {
    map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
  }
  return map;
}

/**
 * تغيير مخزون آمن داخل المعاملة:
 * لا ينزل تحت الصفر إلا إذا سُمح صراحةً (allowNegative — بيع بتجاوز المخزون).
 * الإزالة (stockDelta سالب) تُرفض بـ 400 برسالة واضحة تحتوي اسم المنتج والكمية.
 */
async function changeStock(
  tx: Tx,
  ctx: OrgContext,
  productId: string,
  stockDelta: number,
  opts: { allowNegative: boolean; label: string },
): Promise<void> {
  if (stockDelta === 0) return;
  const inv = await tx.inventory.findUnique({
    where: { productId },
    select: { quantity: true },
  });
  const current = inv?.quantity ?? 0;
  const next = current + stockDelta;
  if (stockDelta < 0 && next < 0 && !opts.allowNegative) {
    throw badRequest(
      `الكمية المتوفرة من «${opts.label}» (${current}) لا تكفي العملية (المطلوب ${-stockDelta})`,
    );
  }
  if (inv) {
    await tx.inventory.update({ where: { productId }, data: { quantity: next } });
  } else {
    await tx.inventory.create({
      data: { organizationId: ctx.organizationId, productId, quantity: next },
    });
  }
}

/** تعيين كمية فعلية (جرد) — يقبل الصفر */
async function setStock(
  tx: Tx,
  ctx: OrgContext,
  productId: string,
  target: number,
): Promise<void> {
  const inv = await tx.inventory.findUnique({ where: { productId }, select: { quantity: true } });
  if (inv) {
    await tx.inventory.update({ where: { productId }, data: { quantity: target } });
  } else {
    await tx.inventory.create({
      data: { organizationId: ctx.organizationId, productId, quantity: target },
    });
  }
}

/** تسجيل حركة مخزون مرتبطة بمستند (saleId/purchaseId اختياريان — أعمدة تاريخية) */
async function logMovement(
  tx: Tx,
  ctx: OrgContext,
  data: {
    productId: string;
    type: "in" | "out" | "adjust";
    quantity: number;
    date: string;
    note?: string | null;
    saleId?: string | null;
    purchaseId?: string | null;
  },
) {
  return tx.inventoryMovement.create({
    data: { ...data, organizationId: ctx.organizationId },
  });
}

/** إعداد تجاوز المخزون لمؤسسة الجلسة */
async function getAllowOversell(tx: Tx, ctx: OrgContext): Promise<boolean> {
  const org = await tx.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { allowOversell: true },
  });
  return org?.allowOversell ?? false;
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
    await assertNumberFree(ctx, "sale", data.number);
    const needQty = groupQty(data.items);

    return prisma.$transaction(async (tx) => {
      const allowOversell = await getAllowOversell(tx, ctx);
      const products = await loadProductsInOrg(ctx, [...needQty.keys()], tx);
      const byId = new Map(products.map((p) => [p.id, p]));

      // التحقق: منتج موقوف يُمنع — مخزون غير كافٍ يُمنع إلا بإعداد «تجاوز المخزون»
      for (const p of products) {
        if (p.status === "inactive") {
          throw badRequest(`المنتج «${p.name}» موقوف — لا يمكن بيعه`);
        }
        const needed = needQty.get(p.id) ?? 0;
        const available = p.inventory?.quantity ?? 0;
        if (!allowOversell && needed > available) {
          throw badRequest(
            `الكمية المتوفرة من «${p.name}» (${available}) لا تكفي العملية (المطلوب ${needed}) — يمكن تفعيل «السماح ببيع أكبر من المخزون» من الإعدادات`,
          );
        }
      }

      // البيع → ينقص المخزون ويُسجَّل كحركة «out» مرتبطة بالبيع
      const sale = await tx.sale.create({
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

      for (const [productId, qty] of needQty) {
        const p = byId.get(productId)!;
        await changeStock(tx, ctx, productId, -qty, {
          allowNegative: allowOversell,
          label: p.name,
        });
        await logMovement(tx, ctx, {
          productId,
          type: "out",
          quantity: qty,
          date: data.date,
          note: `بيع ${data.number}`,
          saleId: sale.id,
        });
      }
      return sale;
    });
  },
  update: async (ctx, id, body) => {
    const data = v.saleSchema.partial().parse(body);
    const existing = await findScopedOrThrow(
      await prisma.sale.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: itemInclude,
      }),
    );
    if (data.customerId) await assertCustomerInOrg(ctx, data.customerId);
    if (data.number && data.number !== existing.number) {
      await assertNumberFree(ctx, "sale", data.number, id);
    }

    return prisma.$transaction(async (tx) => {
      // تغيّرت البنود → فروقات المخزون تُطبَّق كحركات مرتبطة بالبيع
      if (data.items) {
        const allowOversell = await getAllowOversell(tx, ctx);
        const oldQty = groupQty(existing.items);
        const newQty = groupQty(data.items);
        const allIds = [...new Set([...oldQty.keys(), ...newQty.keys()])];
        const products = await loadProductsInOrg(ctx, allIds, tx);
        const byId = new Map(products.map((p) => [p.id, p]));
        const docNumber = data.number ?? existing.number;
        const docDate = data.date ?? existing.date;

        for (const productId of allIds) {
          const delta = (newQty.get(productId) ?? 0) - (oldQty.get(productId) ?? 0);
          if (delta === 0) continue;
          const p = byId.get(productId)!;
          if (delta > 0) {
            if (p.status === "inactive") {
              throw badRequest(`المنتج «${p.name}» موقوف — لا يمكن بيعه`);
            }
            const available = p.inventory?.quantity ?? 0;
            if (!allowOversell && delta > available) {
              throw badRequest(
                `الكمية المتوفرة من «${p.name}» (${available}) لا تكفي العملية (المطلوب ${delta})`,
              );
            }
          }
          await changeStock(tx, ctx, productId, -delta, {
            allowNegative: delta > 0 && allowOversell,
            label: p.name,
          });
          await logMovement(tx, ctx, {
            productId,
            type: delta > 0 ? "out" : "in",
            quantity: Math.abs(delta),
            date: docDate,
            note: `تعديل بيع ${docNumber}`,
            saleId: id,
          });
        }
      }

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
    const existing = await findScopedOrThrow(
      await prisma.sale.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: itemInclude,
      }),
    );

    await prisma.$transaction(async (tx) => {
      // حذف آمن: يُعكس فقط الأثر الفعلي لهذا البيع (من حركاته المرتبطة).
      // بيع قديم بلا حركات مرتبطة (أُنشئ قبل نظام الربط) → لا يُعدَّل المخزون إطلاقًا.
      const linked = await tx.inventoryMovement.findMany({
        where: { saleId: id, organizationId: ctx.organizationId },
      });
      const net = new Map<string, number>();
      for (const m of linked) {
        const cur = net.get(m.productId) ?? 0;
        const effect = m.type === "out" ? m.quantity : m.type === "in" ? -m.quantity : 0;
        net.set(m.productId, cur + effect);
      }
      if (net.size > 0) {
        const products = await loadProductsInOrg(ctx, [...net.keys()], tx);
        const byId = new Map(products.map((p) => [p.id, p]));
        for (const [productId, qty] of net) {
          if (qty <= 0) continue;
          const p = byId.get(productId)!;
          await changeStock(tx, ctx, productId, qty, {
            allowNegative: false,
            label: p.name,
          });
          await logMovement(tx, ctx, {
            productId,
            type: "in",
            quantity: qty,
            date: existing.date,
            note: `إلغاء بيع ${existing.number}`,
            saleId: id,
          });
        }
      }
      await tx.sale.delete({ where: { id } });
    });
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
    await assertNumberFree(ctx, "purchase", data.number);
    const needQty = groupQty(data.items);

    return prisma.$transaction(async (tx) => {
      const products = await loadProductsInOrg(ctx, [...needQty.keys()], tx);
      const byId = new Map(products.map((p) => [p.id, p]));

      // الشراء → يزيد المخزون ويُسجَّل كحركة «in» مرتبطة بالشراء
      const purchase = await tx.purchase.create({
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

      for (const [productId, qty] of needQty) {
        const p = byId.get(productId)!;
        await changeStock(tx, ctx, productId, qty, { allowNegative: false, label: p.name });
        await logMovement(tx, ctx, {
          productId,
          type: "in",
          quantity: qty,
          date: data.date,
          note: `شراء ${data.number}`,
          purchaseId: purchase.id,
        });
      }
      return purchase;
    });
  },
  update: async (ctx, id, body) => {
    const data = v.purchaseSchema.partial().parse(body);
    const existing = await findScopedOrThrow(
      await prisma.purchase.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: itemInclude,
      }),
    );
    if (data.supplierId) await assertSupplierInOrg(ctx, data.supplierId);
    if (data.number && data.number !== existing.number) {
      await assertNumberFree(ctx, "purchase", data.number, id);
    }

    return prisma.$transaction(async (tx) => {
      if (data.items) {
        const oldQty = groupQty(existing.items);
        const newQty = groupQty(data.items);
        const allIds = [...new Set([...oldQty.keys(), ...newQty.keys()])];
        const products = await loadProductsInOrg(ctx, allIds, tx);
        const byId = new Map(products.map((p) => [p.id, p]));
        const docNumber = data.number ?? existing.number;
        const docDate = data.date ?? existing.date;

        for (const productId of allIds) {
          const delta = (newQty.get(productId) ?? 0) - (oldQty.get(productId) ?? 0);
          if (delta === 0) continue;
          const p = byId.get(productId)!;
          await changeStock(tx, ctx, productId, delta, {
            allowNegative: false,
            label: p.name,
          });
          await logMovement(tx, ctx, {
            productId,
            type: delta > 0 ? "in" : "out",
            quantity: Math.abs(delta),
            date: docDate,
            note: `تعديل شراء ${docNumber}`,
            purchaseId: id,
          });
        }
      }

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
    const existing = await findScopedOrThrow(
      await prisma.purchase.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: itemInclude,
      }),
    );

    await prisma.$transaction(async (tx) => {
      // حذف آمن: يُعكس فقط الأثر الفعلي لهذا الشراء (من حركاته المرتبطة).
      // إن لم يكفِ المخزون لعكس الكمية (بِيعت بالفعل) → 400 بدل تعديل خاطئ.
      const linked = await tx.inventoryMovement.findMany({
        where: { purchaseId: id, organizationId: ctx.organizationId },
      });
      const net = new Map<string, number>();
      for (const m of linked) {
        const cur = net.get(m.productId) ?? 0;
        const effect = m.type === "in" ? m.quantity : m.type === "out" ? -m.quantity : 0;
        net.set(m.productId, cur + effect);
      }
      if (net.size > 0) {
        const products = await loadProductsInOrg(ctx, [...net.keys()], tx);
        const byId = new Map(products.map((p) => [p.id, p]));
        for (const [productId, qty] of net) {
          if (qty <= 0) continue;
          const p = byId.get(productId)!;
          await changeStock(tx, ctx, productId, -qty, {
            allowNegative: false,
            label: p.name,
          });
          await logMovement(tx, ctx, {
            productId,
            type: "out",
            quantity: qty,
            date: existing.date,
            note: `إلغاء شراء ${existing.number}`,
            purchaseId: id,
          });
        }
      }
      await tx.purchase.delete({ where: { id } });
    });
  },
});

/* --------------------------- الفواتير (Invoices) --------------------------- */

/** لقطة بنود الفاتورة: تحقّق من المنتجات داخل المؤسسة وانسخ أسماءها */
async function resolveInvoiceItems(
  ctx: OrgContext,
  items: Array<{ productId?: string | null; name?: string; quantity: number; price: number }>,
): Promise<Array<{ productId: string | null; name: string; quantity: number; price: number }>> {
  if (items.length === 0) return [];
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  const products = ids.length > 0 ? await loadProductsInOrg(ctx, ids) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((i) => {
    if (i.productId) {
      const p = byId.get(i.productId);
      if (!p) throw badRequest("الفاتورة: منتج غير موجود في مؤسستك");
      return { productId: i.productId, name: p.name, quantity: i.quantity, price: i.price };
    }
    const name = (i.name ?? "").trim();
    if (!name) throw badRequest("الفاتورة: كل بند يحتاج منتجًا أو اسمًا");
    return { productId: null, name, quantity: i.quantity, price: i.price };
  });
}

const invoices = guarded("invoices", {
  list: async (ctx) =>
    prisma.invoice.findMany({
      where: { organizationId: ctx.organizationId },
      include: itemInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  get: async (ctx, id) =>
    findScopedOrThrow(
      await prisma.invoice.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: itemInclude,
      }),
    ),
  create: async (ctx, body) => {
    const data = v.invoiceSchema.parse(body);
    await assertPlanLimit(ctx.organizationId, "invoices");
    await assertCustomerInOrg(ctx, data.customerId);
    await assertNumberFree(ctx, "invoice", data.number);

    // مصدر الفاتورة: بيع داخل نفس المؤسسة (يُنسخ رقمه ليبقى بعد حذف البيع)
    let saleNumber: string | null = null;
    if (data.saleId) {
      const sale = await prisma.sale.findFirst({
        where: { id: data.saleId, organizationId: ctx.organizationId },
        select: { number: true },
      });
      if (!sale) throw badRequest("المبيعات: بيع مصدر غير موجود في مؤسستك");
      saleNumber = sale.number;
    }

    // لقطة البنود (أسماء منسوخة) + مبلغ محسب — الفاتورة لا تلمس المخزون إطلاقًا
    const items = await resolveInvoiceItems(ctx, data.items ?? []);
    const discount = data.discount ?? 0;
    let amount = data.amount ?? 0;
    if (items.length > 0) {
      amount = Math.max(0, items.reduce((s, i) => s + i.quantity * i.price, 0) - discount);
    } else if (!(amount > 0)) {
      throw badRequest("المبلغ يجب أن يكون أكبر من صفر");
    }

    return prisma.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: data.customerId,
        number: data.number,
        date: data.date,
        dueDate: data.dueDate,
        amount,
        discount,
        status: data.status,
        paymentStatus: data.paymentStatus ?? "unpaid",
        saleId: data.saleId ?? null,
        saleNumber,
        note: data.note ?? null,
        items: {
          create: items.map((i) => ({ ...i, organizationId: ctx.organizationId })),
        },
      },
      include: itemInclude,
    });
  },
  update: async (ctx, id, body) => {
    const data = v.invoiceSchema.partial().parse(body);
    const existing = await findScopedOrThrow(
      await prisma.invoice.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: itemInclude,
      }),
    );
    if (data.customerId) await assertCustomerInOrg(ctx, data.customerId);
    if (data.number && data.number !== existing.number) {
      await assertNumberFree(ctx, "invoice", data.number, id);
    }

    let saleNumber = existing.saleNumber;
    if (data.saleId !== undefined) {
      if (data.saleId) {
        const sale = await prisma.sale.findFirst({
          where: { id: data.saleId, organizationId: ctx.organizationId },
          select: { number: true },
        });
        if (!sale) throw badRequest("المبيعات: بيع مصدر غير موجود في مؤسستك");
        saleNumber = sale.number;
      } else {
        saleNumber = null;
      }
    }

    // المبلغ يُعاد حسابه من البنود والخصم — الفواتير القديمة بلا بنود تبقى بمبلغها اليدوي
    const nextItems =
      data.items !== undefined ? await resolveInvoiceItems(ctx, data.items) : existing.items;
    const nextDiscount = data.discount ?? existing.discount;
    let nextAmount = existing.amount;
    if (nextItems.length > 0) {
      nextAmount = Math.max(
        0,
        nextItems.reduce((s, i) => s + i.quantity * i.price, 0) - nextDiscount,
      );
    } else if (data.amount !== undefined) {
      if (!(data.amount > 0)) throw badRequest("المبلغ يجب أن يكون أكبر من صفر");
      nextAmount = data.amount;
    }

    return prisma.invoice.update({
      where: { id },
      data: {
        number: data.number ?? existing.number,
        date: data.date ?? existing.date,
        dueDate: data.dueDate ?? existing.dueDate,
        customerId: data.customerId ?? existing.customerId,
        saleId: data.saleId !== undefined ? data.saleId : existing.saleId,
        saleNumber,
        amount: nextAmount,
        discount: nextDiscount,
        status: data.status ?? existing.status,
        paymentStatus: data.paymentStatus ?? existing.paymentStatus,
        note: data.note !== undefined ? data.note : existing.note,
        ...(data.items !== undefined
          ? {
              items: {
                deleteMany: {},
                create: nextItems.map((i) => ({
                  ...i,
                  organizationId: ctx.organizationId,
                })),
              },
            }
          : {}),
      },
      include: itemInclude,
    });
  },
  remove: async (ctx, id) => {
    await findScopedOrThrow(
      await prisma.invoice.findFirst({ where: { id, organizationId: ctx.organizationId } }),
    );
    // البنود تُحذف تلقائيًا (Cascade) — المدفوعات تبقى مرتبطتها NULL
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
    await assertPlanLimit(ctx.organizationId, "users");
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
