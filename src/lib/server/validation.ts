// التحقق من المدخلات (Zod) — رسائل عربية، قيم مطابقة لأنواع الواجهة.
// ملاحظة: organizationId لا يُقبل أبدًا من العميل — يُشتق من الجلسة دائمًا.

import { z } from "zod";

/* ------------------------------ مساعدات مشتركة ------------------------------ */

/** تحويل الفارغ إلى null (حقول نصية اختيارية) مع إبقاء undefined كما هو */
const emptyToNull = <T extends z.ZodType>(inner: T) =>
  z.preprocess((v) => (v === "" ? null : v), inner.optional().nullable());

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD");

const money = z.number().finite("قيمة رقمية غير صالحة").min(0, "لا يمكن أن تكون سالبة");
const qty = z.number().int("الكمية يجب أن تكون عددًا صحيحًا").min(1, "الكمية على الأقل 1");
const optionalMoney = z.number().finite("قيمة رقمية غير صالحة").min(0, "لا يمكن أن تكون سالبة");
const shortText = z.string().trim().min(1, "هذا الحقل مطلوب").max(300, "قيمة طويلة جدًا");
const email = z.string().trim().email("أدخل بريدًا إلكترونيًا صالحًا").max(200);
const optionalEmail = z
  .string()
  .trim()
  .email("أدخل بريدًا إلكترونيًا صالحًا")
  .max(200)
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

const note = emptyToNull(z.string().max(2000, "ملاحظة طويلة جدًا"));
const phone = emptyToNull(z.string().max(40));

const numberStr = z
  .string()
  .trim()
  .min(1, "الرقم مطلوب")
  .max(60)
  // يمنع تكرار نفس الرقم داخل المؤسسة
  .regex(/^[A-Za-z0-9\-_/.]+$/, "الرقم يحوي أحرف غير مسموحة");

/* --------------------------------- الكيانات --------------------------------- */

export const customerSchema = z.object({
  name: shortText,
  email: optionalEmail,
  phone,
  address: note,
  note,
});

export const supplierSchema = z.object({
  name: shortText,
  contactName: emptyToNull(z.string().max(200)),
  email: optionalEmail,
  phone,
  address: note,
  note,
});

export const categorySchema = z.object({
  name: shortText.transform((s) => s.trim()),
});

export const unitValues = ["piece", "kg", "g", "l", "m", "box"] as const;
export const productStatusValues = ["active", "inactive"] as const;

export const productSchema = z.object({
  name: shortText,
  sku: emptyToNull(z.string().trim().max(60)),
  category: shortText, // اسم الفئة — يُحوَّل إلى سجل Category داخل المؤسسة
  unit: z.enum(unitValues, { message: "وحدة قياس غير صالحة" }),
  costPrice: money,
  unitPrice: money,
  stock: z.number().int("الكمية يجب أن تكون عددًا صحيحًا").min(0, "لا يمكن أن تكون سالبة"),
  minStock: z.number().int("الحد يجب أن يكون عددًا صحيحًا").min(0, "لا يمكن أن يكون سالبة"),
  description: note,
  status: z.enum(productStatusValues, { message: "حالة المنتج غير صالحة" }).optional(),
});

export const itemSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: qty,
  price: money,
});

export const paymentStatusValues = ["paid", "unpaid", "partial"] as const;

export const saleSchema = z.object({
  number: numberStr,
  date: dateString,
  customerId: z.string().min(1, "اختر العميل"),
  items: z.array(itemSchema).min(1, "أضف بندًا واحدًا على الأقل").max(500, "بنود كثيرة جدًا"),
  discount: optionalMoney.default(0),
  paymentStatus: z.enum(paymentStatusValues, { message: "حالة دفع غير صالحة" }),
  note,
});

export const purchaseSchema = z.object({
  number: numberStr,
  date: dateString,
  supplierId: z.string().min(1, "اختر المورد"),
  items: z.array(itemSchema).min(1, "أضف بندًا واحدًا على الأقل").max(500, "بنود كثيرة جدًا"),
  discount: optionalMoney.default(0),
  paymentStatus: z.enum(paymentStatusValues, { message: "حالة دفع غير صالحة" }),
  note,
});

export const invoiceStatusValues = ["draft", "sent", "paid", "overdue"] as const;

export const invoiceSchema = z.object({
  number: numberStr,
  date: dateString,
  dueDate: dateString,
  customerId: z.string().min(1, "اختر العميل"),
  amount: money.refine((v) => v > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  status: z.enum(invoiceStatusValues, { message: "حالة فاتورة غير صالحة" }),
  note,
});

export const expenseCategoryValues = [
  "rent",
  "salaries",
  "utilities",
  "marketing",
  "transport",
  "maintenance",
  "other",
] as const;
export const paymentMethodValues = ["cash", "bank", "check"] as const;

export const expenseSchema = z.object({
  date: dateString,
  category: z.enum(expenseCategoryValues, { message: "فئة غير صالحة" }),
  amount: money.refine((v) => v > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  description: shortText,
  paymentMethod: z.enum(paymentMethodValues, { message: "طريقة دفع غير صالحة" }),
  note,
});

export const roleValues = ["owner", "admin", "manager", "employee"] as const;
export const userStatusValues = ["active", "invited", "disabled"] as const;

export const userSchema = z.object({
  name: shortText,
  email,
  phone,
  role: z.enum(roleValues, { message: "دور غير صالح" }),
  status: z.enum(userStatusValues, { message: "حالة غير صالحة" }),
});

export const movementTypeValues = ["in", "out", "adjust"] as const;

/**
 * حركة مخزون:
 * • in/out: كمية حركة (على الأقل 1) — تُطبَّق كفارق على المخزون
 * • adjust: تعيين كمية فعلية بعد الجرد (0 مسموح) — تُستبدل الكمية الحالية
 */
export const movementSchema = z
  .object({
    productId: z.string().min(1, "اختر المنتج"),
    type: z.enum(movementTypeValues, { message: "نوع حركة غير صالح" }),
    quantity: z.number().int("الكمية يجب أن تكون عددًا صحيحًا").min(0, "لا يمكن أن تكون سالبة"),
    date: dateString,
    note,
  })
  .superRefine((v, ctx) => {
    if (v.type !== "adjust" && v.quantity < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "الكمية على الأقل 1",
      });
    }
  });

export const paymentSchema = z.object({
  invoiceId: z.string().optional().nullable(),
  amount: money.refine((v) => v > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  date: dateString,
  method: z.enum(paymentMethodValues, { message: "طريقة دفع غير صالحة" }),
  note,
});

export const notificationSchema = z.object({
  type: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(200),
  body: emptyToNull(z.string().max(1000)),
  link: emptyToNull(z.string().max(300)),
  read: z.boolean().optional(),
  userId: z.string().optional().nullable(),
});

/* -------------------------------- الإعدادات -------------------------------- */

export const currencyValues = ["DZD", "EUR", "USD", "MAD", "TND"] as const;

export const settingsSchema = z.object({
  businessName: z.string().trim().max(200).optional(),
  email: optionalEmail,
  phone,
  address: emptyToNull(z.string().max(400)),
  currency: z.enum(currencyValues, { message: "عملة غير صالحة" }).optional(),
  currentUserId: z.string().optional().nullable(),
  allowOversell: z.boolean().optional(),
  rolePermissions: z
    .record(
      z.enum(roleValues),
      z.array(z.string().regex(/^[a-z]+\.(view|manage)$/, "صلاحية غير صالحة")),
    )
    .optional(),
});

/* ------------------------------ المصادقة/التهيئة ------------------------------ */

export const loginSchema = z.object({
  email: z.string().trim().email("أدخل بريدًا إلكترونيًا صالحًا"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export const setupSchema = z.object({
  organizationName: z.string().trim().min(2, "اسم المؤسسة قصير جدًا").max(200),
  name: z.string().trim().min(2, "الاسم قصير جدًا").max(200),
  email: z.string().trim().email("أدخل بريدًا إلكترونيًا صالحًا"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل").max(200),
});

/** تسجيل حساب جديد: يُنشئ مؤسسة + مستخدم مالك (OWNER) ويسجّل الدخول */
export const registerSchema = setupSchema;

/** طلب استعادة كلمة المرور — الرد موحّد سواء وُجد البريد أم لا (لا كشف الحسابات) */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("أدخل بريدًا إلكترونيًا صالحًا"),
});

/** تعيين كلمة مرور جديدة عبر الرمز المؤقت */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10, "رمز الاستعادة غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل").max(200),
});
