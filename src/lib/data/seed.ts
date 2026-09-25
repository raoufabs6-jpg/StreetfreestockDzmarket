// ============================================================
// بيانات البداية (Seed) — تُنشأ مرة واحدة عند أول تشغيل فقط.
// كل السجلات قابلة للتعديل والحذف من الواجهة، ويمكن حذفها
// كلها من "الإعدادات → مسح البيانات" والاستبدال ببياناتك.
// ============================================================

import {
  DEFAULT_ROLE_PERMISSIONS,
  type AppUser,
  type BusinessSettings,
  type Customer,
  type Expense,
  type Invoice,
  type Product,
  type Purchase,
  type Sale,
  type Supplier,
} from "@/lib/types";
import { daysAgoISO, docTotal } from "@/lib/utils";

export interface SeedData {
  customers: Customer[];
  products: Product[];
  suppliers: Supplier[];
  sales: Sale[];
  purchases: Purchase[];
  invoices: Invoice[];
  expenses: Expense[];
  users: AppUser[];
  movements: [];
  settings: BusinessSettings;
}

function base<T extends { id: string; createdAt: string }>(id: string, daysBack: number, rest: Omit<T, "id" | "createdAt">): T {
  return { id, createdAt: new Date(Date.now() - daysBack * 86400000).toISOString(), ...rest } as T;
}

export function buildSeed(): SeedData {
  const customers: Customer[] = [
    base<Customer>("cus-1", 40, { name: "شركة النور للتوزيع", email: "contact@elnour.dz", phone: "0550 12 34 56", address: "حي البدر، باب الزوار، الجزائر", note: "عميل أساسي — طلبات أسبوعية" }),
    base<Customer>("cus-2", 32, { name: "مؤسسة الأمل للتجارة", email: "info@alamal.dz", phone: "0661 23 45 67", address: "شارع ديدوش مراد، الجزائر الوسطى", note: "" }),
    base<Customer>("cus-3", 25, { name: "مخبزة الفجر", email: "elfajr.bakery@gmail.com", phone: "0770 98 76 54", address: "بئر مراد رايس، الجزائر", note: "دفع نقدي دائمًا" }),
    base<Customer>("cus-4", 18, { name: "متجر الوفرة", email: "", phone: "0555 44 33 22", address: "الحراش، الجزائر", note: "" }),
    base<Customer>("cus-5", 10, { name: "شركة البناء الحديث", email: "achat@batimod.dz", phone: "021 45 67 89", address: "المنطقة الصناعية، الرويبة", note: "يطلب فاتورة رسميًا" }),
    base<Customer>("cus-6", 4, { name: "سليم بن عيسى", email: "salim@mail.dz", phone: "0779 11 22 33", address: "باب الزوار، الجزائر", note: "" }),
  ];

  const products: Product[] = [
    base<Product>("prd-1", 60, { name: "لابتوب Lenovo ThinkPad", sku: "LP-001", category: "إلكترونيات", unit: "piece", costPrice: 72000, unitPrice: 89900, stock: 12, minStock: 3, description: "" }),
    base<Product>("prd-2", 60, { name: "طابعة HP LaserJet", sku: "PR-014", category: "إلكترونيات", unit: "piece", costPrice: 24500, unitPrice: 29900, stock: 2, minStock: 4, description: "طابعة ليزر أبيض وأسود" }),
    base<Product>("prd-3", 55, { name: "ورق A4 (500 ورقة)", sku: "PP-500", category: "قرطاسية", unit: "box", costPrice: 520, unitPrice: 750, stock: 140, minStock: 30, description: "" }),
    base<Product>("prd-4", 55, { name: "حبر أسود 85A", sku: "INK-85A", category: "قرطاسية", unit: "piece", costPrice: 2400, unitPrice: 3200, stock: 0, minStock: 5, description: "" }),
    base<Product>("prd-5", 50, { name: "كرسي مكتبي ergonomic", sku: "CHR-021", category: "أثاث", unit: "piece", costPrice: 15800, unitPrice: 21500, stock: 7, minStock: 2, description: "" }),
    base<Product>("prd-6", 50, { name: "مكتب خشبي 140سم", sku: "DSK-140", category: "أثاث", unit: "piece", costPrice: 28000, unitPrice: 36500, stock: 4, minStock: 2, description: "" }),
    base<Product>("prd-7", 45, { name: "سماعات لاسلكية", sku: "AUD-077", category: "إلكترونيات", unit: "piece", costPrice: 3100, unitPrice: 4900, stock: 3, minStock: 6, description: "" }),
    base<Product>("prd-8", 45, { name: "أكواب ورقية (50 حبة)", sku: "CUP-050", category: "مستلزمات", unit: "box", costPrice: 380, unitPrice: 600, stock: 62, minStock: 15, description: "" }),
    base<Product>("prd-9", 40, { name: "شاشة Samsung 24\"", sku: "MON-024", category: "إلكترونيات", unit: "piece", costPrice: 18500, unitPrice: 23900, stock: 9, minStock: 3, description: "" }),
    base<Product>("prd-10", 40, { name: "لوحة مفاتيح لاسلكية", sku: "KBD-010", category: "إلكترونيات", unit: "piece", costPrice: 1900, unitPrice: 2800, stock: 18, minStock: 5, description: "" }),
  ];

  const suppliers: Supplier[] = [
    base<Supplier>("sup-1", 70, { name: "الجملة للتكنولوجيا", contactName: "كريم بوعلام", email: "sales@techwholesale.dz", phone: "021 00 11 22", address: "المنطقة الصناعية، الجزائر", note: "مورّد رئيسي للإلكترونيات" }),
    base<Supplier>("sup-2", 65, { name: "مؤسسة الورق الوطني", contactName: "أمينة حداد", email: "", phone: "023 55 66 77", address: "سطيف", note: "" }),
    base<Supplier>("sup-3", 60, { name: "دار الأثاث الحديث", contactName: "ياسين قادري", email: "contact@modern-furn.dz", phone: "027 33 44 55", address: "وهران", note: "" }),
  ];

  const saleRows: Array<[string, number, string, Array<[string, number]>, number, Sale["paymentStatus"]]> = [
    ["SAL-0001", 34, "cus-1", [["prd-3", 20], ["prd-4", 5]], 0, "paid"],
    ["SAL-0002", 28, "cus-2", [["prd-1", 2]], 1500, "paid"],
    ["SAL-0003", 21, "cus-3", [["prd-8", 10], ["prd-3", 5]], 0, "paid"],
    ["SAL-0004", 16, "cus-1", [["prd-5", 4], ["prd-6", 2]], 500, "unpaid"],
    ["SAL-0005", 12, "cus-4", [["prd-9", 3]], 0, "paid"],
    ["SAL-0006", 9, "cus-5", [["prd-1", 1], ["prd-10", 4]], 300, "partial"],
    ["SAL-0007", 6, "cus-6", [["prd-7", 2], ["prd-10", 1]], 0, "paid"],
    ["SAL-0008", 3, "cus-2", [["prd-9", 2], ["prd-3", 8]], 200, "unpaid"],
    ["SAL-0009", 2, "cus-1", [["prd-5", 3]], 0, "paid"],
    ["SAL-0010", 1, "cus-3", [["prd-8", 15], ["prd-4", 3]], 100, "paid"],
  ];

  const productMap = new Map(products.map((p) => [p.id, p]));
  const sales: Sale[] = saleRows.map(([number, daysBack, customerId, lines, discount, paymentStatus], i) => {
    const items = lines.map(([productId, quantity]) => ({
      productId,
      quantity,
      price: productMap.get(productId)?.unitPrice ?? 0,
    }));
    return base<Sale>(`sal-${i + 1}`, daysBack, {
      number,
      date: daysAgoISO(daysBack),
      customerId,
      items,
      discount,
      paymentStatus,
      note: "",
    });
  });

  const purchaseRows: Array<[string, number, string, Array<[string, number]>, Purchase["paymentStatus"]]> = [
    ["PUR-0001", 38, "sup-1", [["prd-1", 5], ["prd-9", 6]], "paid"],
    ["PUR-0002", 30, "sup-2", [["prd-3", 200], ["prd-4", 30]], "paid"],
    ["PUR-0003", 22, "sup-3", [["prd-5", 10], ["prd-6", 6]], "unpaid"],
    ["PUR-0004", 14, "sup-1", [["prd-7", 20], ["prd-10", 25]], "paid"],
    ["PUR-0005", 7, "sup-2", [["prd-8", 80]], "partial"],
    ["PUR-0006", 2, "sup-1", [["prd-9", 5]], "unpaid"],
  ];

  const purchases: Purchase[] = purchaseRows.map(([number, daysBack, supplierId, lines, paymentStatus], i) => {
    const items = lines.map(([productId, quantity]) => ({
      productId,
      quantity,
      price: productMap.get(productId)?.costPrice ?? 0,
    }));
    return base<Purchase>(`pur-${i + 1}`, daysBack, {
      number,
      date: daysAgoISO(daysBack),
      supplierId,
      items,
      discount: 0,
      paymentStatus,
      note: "",
    });
  });

  const invoices: Invoice[] = [
    base<Invoice>("inv-1", 30, { number: "INV-0001", date: daysAgoISO(30), dueDate: daysAgoISO(15), customerId: "cus-1", amount: docTotal(sales[0].items, sales[0].discount), status: "paid", note: "" }),
    base<Invoice>("inv-2", 20, { number: "INV-0002", date: daysAgoISO(20), dueDate: daysAgoISO(5), customerId: "cus-2", amount: docTotal(sales[1].items, sales[1].discount), status: "paid", note: "" }),
    base<Invoice>("inv-3", 15, { number: "INV-0003", date: daysAgoISO(15), dueDate: daysAgoISO(-1), customerId: "cus-1", amount: docTotal(sales[3].items, sales[3].discount), status: "sent", note: "بانتظار التحويل البنكي" }),
    base<Invoice>("inv-4", 10, { number: "INV-0004", date: daysAgoISO(10), dueDate: daysAgoISO(-4), customerId: "cus-4", amount: docTotal(sales[4].items, sales[4].discount), status: "overdue", note: "" }),
    base<Invoice>("inv-5", 4, { number: "INV-0005", date: daysAgoISO(4), dueDate: daysAgoISO(10), customerId: "cus-5", amount: docTotal(sales[5].items, sales[5].discount), status: "sent", note: "" }),
    base<Invoice>("inv-6", 1, { number: "INV-0006", date: daysAgoISO(1), dueDate: daysAgoISO(15), customerId: "cus-3", amount: docTotal(sales[9].items, sales[9].discount), status: "draft", note: "" }),
  ];

  const expenses: Expense[] = [
    base<Expense>("exp-1", 27, { date: daysAgoISO(27), category: "rent", amount: 65000, description: "إيجار المخزن — الشهر الجاري", paymentMethod: "bank", note: "" }),
    base<Expense>("exp-2", 25, { date: daysAgoISO(25), category: "salaries", amount: 180000, description: "رواتب الفريق (3 أشخاص)", paymentMethod: "bank", note: "" }),
    base<Expense>("exp-3", 18, { date: daysAgoISO(18), category: "utilities", amount: 9800, description: "فاتورة الكهرباء والماء", paymentMethod: "cash", note: "" }),
    base<Expense>("exp-4", 12, { date: daysAgoISO(12), category: "transport", amount: 7500, description: "توصيل الطلبات", paymentMethod: "cash", note: "" }),
    base<Expense>("exp-5", 8, { date: daysAgoISO(8), category: "marketing", amount: 15000, description: "إعلانات فيسبوك", paymentMethod: "bank", note: "" }),
    base<Expense>("exp-6", 3, { date: daysAgoISO(3), category: "maintenance", amount: 4200, description: "صيانة الطابعة", paymentMethod: "cash", note: "" }),
    base<Expense>("exp-7", 1, { date: daysAgoISO(1), category: "other", amount: 2500, description: "مستلزمات مكتبية متنوعة", paymentMethod: "cash", note: "" }),
  ];

  const users: AppUser[] = [
    base<AppUser>("usr-1", 90, { name: "أحمد قاسمي", email: "ahmed@akma.dz", phone: "0550 00 00 01", role: "admin", status: "active" }),
    base<AppUser>("usr-2", 60, { name: "فاطمة زهراء", email: "fatima@akma.dz", phone: "0550 00 00 02", role: "manager", status: "active" }),
    base<AppUser>("usr-3", 30, { name: "يوسف بن محمد", email: "youcef@akma.dz", phone: "0550 00 00 03", role: "staff", status: "active" }),
  ];

  const settings: BusinessSettings = {
    businessName: "AKMA Business",
    email: "contact@akma.dz",
    phone: "0550 00 00 00",
    address: "الجزائر العاصمة، الجزائر",
    currency: "DZD",
    currentUserId: "usr-1",
    rolePermissions: DEFAULT_ROLE_PERMISSIONS,
  };

  return {
    customers,
    products,
    suppliers,
    sales,
    purchases,
    invoices,
    expenses,
    users,
    movements: [],
    settings,
  };
}
