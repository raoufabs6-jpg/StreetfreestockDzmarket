// ============================================================
// AKMA Business — أنماط البيانات الأساسية (Domain Types)
// هذه الأنواع تمثل مصدر الحقيقة للمشروع، ويمكن ربطها لاحقًا
// بأي قاعدة بيانات (PostgreSQL / Supabase ...) دون تغيير الواجهة.
// ============================================================

export type ID = string;

export interface BaseRecord {
  id: ID;
  createdAt: string; // ISO date string
}

/** عميل CRM */
export interface Customer extends BaseRecord {
  name: string;
  email: string;
  phone: string;
  address: string;
  note: string;
}

/** منتج */
export type Unit = "piece" | "kg" | "g" | "l" | "m" | "box";
export type ProductStatus = "active" | "inactive";

export interface Product extends BaseRecord {
  name: string;
  sku: string;
  category: string;
  unit: Unit;
  costPrice: number;
  unitPrice: number;
  stock: number;
  minStock: number;
  description: string;
  /** نشط/موقوف — الموقوف لا يظهر في نماذج البيع ولا يمكن بيعه */
  status?: ProductStatus;
}

/** مورد */
export interface Supplier extends BaseRecord {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  note: string;
}

export type PaymentStatus = "paid" | "unpaid" | "partial";

export interface DocumentItem {
  productId: ID;
  quantity: number;
  price: number;
}

/** فاتورة مبيعات */
export interface Sale extends BaseRecord {
  number: string;
  date: string; // YYYY-MM-DD
  customerId: ID;
  items: DocumentItem[];
  discount: number;
  paymentStatus: PaymentStatus;
  note: string;
}

/** فاتورة مشتريات */
export interface Purchase extends BaseRecord {
  number: string;
  date: string;
  supplierId: ID;
  items: DocumentItem[];
  discount: number;
  paymentStatus: PaymentStatus;
  note: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

/** بند فاتورة — لقطة مستقلة (الاسم منسوخ عند الإصدار) */
export interface InvoiceItem {
  productId: string | null;
  /** اسم المنتج وقت إصدار الفاتورة */
  name?: string;
  quantity: number;
  price: number;
}

/** فاتورة احترافية (بيع/تحصيل) قابلة للطباعة A4 */
export interface Invoice extends BaseRecord {
  number: string;
  date: string;
  dueDate: string;
  customerId: ID;
  /** البيع المصدر (لقطة) — اختياري للفواتير اليدوية */
  saleId?: ID | null;
  saleNumber?: string | null;
  discount: number;
  amount: number;
  status: InvoiceStatus;
  /** حالة الدفع: paid / partial / unpaid */
  paymentStatus: PaymentStatus;
  items: InvoiceItem[];
  note: string;
}

export type ExpenseCategory =
  | "rent"
  | "salaries"
  | "utilities"
  | "marketing"
  | "transport"
  | "maintenance"
  | "other";

export type PaymentMethod = "cash" | "bank" | "check";

/** مصروف */
export interface Expense extends BaseRecord {
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  paymentMethod: PaymentMethod;
  note: string;
}

export const ROLES = ["owner", "admin", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];
export type UserStatus = "active" | "invited" | "disabled";

/** مستخدم النظام */
export interface AppUser extends BaseRecord {
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
}

/** حركة مخزون */
export type MovementType = "in" | "out" | "adjust";

export interface StockMovement extends BaseRecord {
  productId: ID;
  type: MovementType;
  quantity: number;
  date: string;
  note: string;
}

/** إعدادات المنشأة */
export interface BusinessSettings {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  currency: CurrencyCode;
  currentUserId: ID | null;
  /** صلاحيات كل دور: مصفوفة من "الوحدة.إجراء" مثل "customers.view" */
  rolePermissions: Record<Role, string[]>;
  /** السماح ببيع أكبر من المخزون المتوفر (طلب مسبق) — يُفحص على الخادم أيضًا */
  allowOversell: boolean;
}

export type CurrencyCode = "DZD" | "EUR" | "USD" | "MAD" | "TND";

export const CURRENCIES: Record<CurrencyCode, { symbol: string; label: string }> = {
  DZD: { symbol: "د.ج", label: "دينار جزائري" },
  EUR: { symbol: "€", label: "يورو" },
  USD: { symbol: "$", label: "دولار أمريكي" },
  MAD: { symbol: "د.م", label: "درهم مغربي" },
  TND: { symbol: "د.ت", label: "دينار تونسي" },
};

/** أسماء المجموعات (Collections) — تُستخدم في طبقة البيانات */
export const COLLECTIONS = [
  "customers",
  "products",
  "suppliers",
  "sales",
  "purchases",
  "invoices",
  "expenses",
  "users",
  "movements",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

/** وحدات النظام المستخدمة في مصفوفة الصلاحيات */
export const MODULES = [
  "dashboard",
  "customers",
  "products",
  "inventory",
  "sales",
  "suppliers",
  "purchases",
  "invoices",
  "expenses",
  "reports",
  "users",
  "settings",
] as const;

export type ModuleKey = (typeof MODULES)[number];
export type PermissionAction = "view" | "manage";

/**
 * الصلاحيات الافتراضية لكل دور:
 • OWNER: صلاحيات كاملة (يتجاوز المصفوفة في الخادم أيضًا)
 • ADMIN: إدارة معظم النظام (كل الوحدات)
 • MANAGER: المبيعات والعملاء والمخزون والمشتريات والتقارير
 • EMPLOYEE: إضافة المبيعات وعرض ما يُمنح له من صلاحيات (قابل للتوسعة من الإعدادات)
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner: MODULES.flatMap((m) => [`${m}.view`, `${m}.manage`]),
  admin: MODULES.flatMap((m) => [`${m}.view`, `${m}.manage`]),
  manager: [
    ...MODULES.filter((m) => m !== "users").flatMap((m) => [`${m}.view`]),
    ...MODULES.filter((m) =>
      ["customers", "products", "inventory", "sales", "suppliers", "purchases", "invoices", "expenses"].includes(m),
    ).map((m) => `${m}.manage`),
    "reports.manage",
  ],
  employee: [
    "dashboard.view",
    "customers.view",
    "products.view",
    "inventory.view",
    "sales.view",
    "sales.manage",
    "invoices.view",
    "invoices.manage",
    "expenses.view",
  ],
};
