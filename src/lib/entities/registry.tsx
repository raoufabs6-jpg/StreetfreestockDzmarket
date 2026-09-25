"use client";

// ============================================================
// سجل الكيانات (Entity Registry)
// يعرّف لكل وحدة: حقول النموذج، أعمدة الجدول، الفلاتر،
// التحقق، والقيم الافتراضية — وتُبنى الصفحات منه تلقائيًا.
// ============================================================

import { useMemo } from "react";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import type { TableColumn } from "@/components/ui/data-table";
import Link from "next/link";
import { useI18n, type Lang, type MessageKey } from "@/lib/i18n";
import { useCollection, useSettings, useCurrentUser } from "@/lib/hooks";
import { CURRENCIES, ROLES, type CurrencyCode } from "@/lib/types";
import type {
  AppUser,
  Customer,
  Expense,
  Invoice,
  Product,
  Purchase,
  Sale,
  Supplier,
} from "@/lib/types";
import { docTotal, formatDate, formatMoney, nextDocNumber, todayISO, daysAgoISO } from "@/lib/utils";

/* --------------------------------- أنواع ---------------------------------- */

export type FieldKind =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "currency"
  | "date"
  | "textarea"
  | "select"
  | "items";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  min?: number;
  step?: number;
  /** امتداد الحقل في الشبكة (2 = عرض كامل) */
  span?: 1 | 2;
  /** حقل البنود: خيارات المنتجات مع السعر المناسب */
  productOptions?: Array<FieldOption & { price: number }>;
  priceMode?: "sale" | "cost";
}

export interface FilterDef<T> {
  id: string;
  label: string;
  options: FieldOption[];
  apply: (row: T, value: string) => boolean;
}

export interface EntityConfig<T extends { id: string }> {
  collection: "customers" | "products" | "suppliers" | "sales" | "purchases" | "invoices" | "expenses" | "users";
  module: string;
  title: string;
  subtitle: string;
  singular: string;
  searchKeys: Array<keyof T & string>;
  searchPlaceholder: string;
  defaultValues: (rows: T[]) => Partial<T>;
  fields: FieldDef[];
  columns: TableColumn<T>[];
  filters?: FilterDef<T>[];
  dateRangeKey?: keyof T & string;
  sort?: (a: T, b: T) => number;
  /** رابط صفحة التفاصيل — يضيف زر «التفاصيل» في صفوف الجدول */
  rowLink?: (row: T) => string;
  rowName: (row: T) => string;
  validate?: (values: Record<string, unknown>) => string | null;
  /** حذف محظور (مثل حسابك الحالي) — يُرجع رسالة الخطأ */
  blockDelete?: (row: T) => string | null;
  perPage?: number;
}

export type EntityKey =
  | "customers"
  | "products"
  | "suppliers"
  | "sales"
  | "purchases"
  | "invoices"
  | "expenses"
  | "users";

export interface EntityMap {
  customers: Customer;
  products: Product;
  suppliers: Supplier;
  sales: Sale;
  purchases: Purchase;
  invoices: Invoice;
  expenses: Expense;
  users: AppUser;
}

interface BuildCtx {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  lang: Lang;
  currency: CurrencyCode;
  deps: {
    customers: Customer[];
    suppliers: Supplier[];
    products: Product[];
    currentUserId: string | null;
  };
}

/* ------------------------------ وسوم مساعدة ------------------------------- */

const paymentTone: Record<string, BadgeTone> = {
  paid: "emerald",
  unpaid: "rose",
  partial: "amber",
};
const invoiceTone: Record<string, BadgeTone> = {
  draft: "slate",
  sent: "sky",
  paid: "emerald",
  overdue: "rose",
};
const roleTone: Record<string, BadgeTone> = {
  owner: "primary",
  admin: "sky",
  manager: "emerald",
  employee: "slate",
};
const userStatusTone: Record<string, BadgeTone> = {
  active: "emerald",
  invited: "amber",
  disabled: "rose",
};

function stockTone(p: Product): { tone: BadgeTone; label: string } {
  if (p.stock <= 0) return { tone: "rose", label: "" };
  if (p.stock <= p.minStock) return { tone: "amber", label: "" };
  return { tone: "emerald", label: "" };
}

function nameOf(list: Array<{ id: string; name: string }>, id: string): string {
  return list.find((x) => x.id === id)?.name ?? "—";
}

/* ------------------------------- البانيون -------------------------------- */

const builders: { [K in EntityKey]: (ctx: BuildCtx) => EntityConfig<EntityMap[K]> } = {
  customers: ({ t }) => ({
    collection: "customers",
    module: "customers",
    title: t("page.customers"),
    subtitle: t("subtitle.customers"),
    singular: t("entity.customers"),
    searchKeys: ["name", "email", "phone", "address"],
    searchPlaceholder: t("field.emailOrName"),
    rowName: (r) => r.name,
    // صفحة التفاصيل (CRM): بطاقة العميل + إحصاءات + الخط الزمني
    rowLink: (r) => `/customers/${r.id}`,
    dateRangeKey: "createdAt",
    filters: [
      {
        id: "email",
        label: t("crm.filterByContact"),
        options: [
          { value: "yes", label: t("crm.hasEmail") },
          { value: "no", label: t("crm.noEmail") },
        ],
        apply: (r, v) => (v === "yes" ? !!r.email : !r.email),
      },
    ],
    defaultValues: () => ({ name: "", email: "", phone: "", address: "", note: "" }),
    fields: [
      { key: "name", label: t("common.name"), kind: "text", required: true, span: 2, placeholder: t("field.searchByName") },
      { key: "email", label: t("common.email"), kind: "email", placeholder: "name@example.com" },
      { key: "phone", label: t("common.phone"), kind: "tel", required: true, placeholder: "0550 00 00 00" },
      { key: "address", label: t("common.address"), kind: "text", span: 2 },
      { key: "note", label: t("common.note"), kind: "textarea", span: 2, placeholder: t("field.notePlaceholder") },
    ],
    columns: [
      {
        key: "name",
        header: t("common.name"),
        render: (r) => (
          <Link
            href={`/customers/${r.id}`}
            className="font-semibold text-slate-800 transition hover:text-primary-600"
          >
            {r.name}
          </Link>
        ),
      },
      { key: "email", header: t("common.email"), render: (r) => r.email || "—", hideBelow: "lg" },
      { key: "phone", header: t("common.phone"), render: (r) => <span dir="ltr">{r.phone || "—"}</span> },
      { key: "address", header: t("common.address"), render: (r) => <span className="line-clamp-1">{r.address || "—"}</span>, hideBelow: "md" },
      { key: "createdAt", header: t("common.createdAt"), render: (r) => formatDate(r.createdAt, "ar" as Lang), hideBelow: "lg" },
    ],
    perPage: 10,
  }),

  products: ({ t, lang, currency }) => {
    const money = (v: number) => formatMoney(v, currency, lang);
    return {
      collection: "products",
      module: "products",
      title: t("page.products"),
      subtitle: t("subtitle.products"),
      singular: t("entity.products"),
      searchKeys: ["name", "sku", "category"],
      searchPlaceholder: t("field.searchByName"),
      rowName: (r) => r.name,
      defaultValues: () => ({
        name: "",
        sku: "",
        category: "",
        unit: "piece",
        costPrice: 0,
        unitPrice: 0,
        stock: 0,
        minStock: 3,
        description: "",
      }),
      fields: [
        { key: "name", label: t("common.name"), kind: "text", required: true, span: 2 },
        { key: "sku", label: t("field.sku"), kind: "text", placeholder: "SKU-001" },
        { key: "category", label: t("common.category"), kind: "text", required: true },
        {
          key: "unit",
          label: t("field.unit"),
          kind: "select",
          required: true,
          options: (["piece", "kg", "g", "l", "m", "box"] as const).map((u) => ({
            value: u,
            label: t(`enum.unit.${u}` as MessageKey),
          })),
        },
        { key: "costPrice", label: t("field.costPrice"), kind: "currency", required: true, min: 0 },
        { key: "unitPrice", label: t("field.unitPrice"), kind: "currency", required: true, min: 0 },
        { key: "stock", label: t("field.stock"), kind: "number", required: true, min: 0 },
        { key: "minStock", label: t("field.minStock"), kind: "number", min: 0 },
        { key: "description", label: t("common.description"), kind: "textarea", span: 2 },
      ],
      columns: [
        {
          key: "name",
          header: t("common.name"),
          render: (r) => (
            <span>
              <span className="font-semibold text-slate-800">{r.name}</span>
              <span className="mt-0.5 block text-[11px] text-slate-400" dir="ltr">
                {r.sku || "—"}
              </span>
            </span>
          ),
        },
        { key: "category", header: t("common.category"), render: (r) => <Badge tone="primary">{r.category}</Badge>, hideBelow: "sm" },
        { key: "cost", header: t("field.costPrice"), render: (r) => money(r.costPrice), hideBelow: "lg" },
        { key: "price", header: t("field.unitPrice"), render: (r) => <span className="font-semibold text-slate-800">{money(r.unitPrice)}</span> },
        {
          key: "stock",
          header: t("field.stock"),
          render: (r) => (
            <Badge tone={stockTone(r).tone}>
              {r.stock} {t(`enum.unit.${r.unit}` as MessageKey)}
            </Badge>
          ),
        },
      ],
      filters: [
        {
          id: "category",
          label: t("common.category"),
          options: [], // تُملأ ديناميكيًا من الصفوف (أدناه)
          apply: () => true,
        },
        {
          id: "stock",
          label: t("inventory.stockStatus"),
          options: [
            { value: "ok", label: t("inventory.inStock") },
            { value: "low", label: t("inventory.low") },
            { value: "out", label: t("inventory.out") },
          ],
          apply: (r, v) => {
            if (v === "out") return r.stock <= 0;
            if (v === "low") return r.stock > 0 && r.stock <= r.minStock;
            if (v === "ok") return r.stock > r.minStock;
            return true;
          },
        },
      ],
      perPage: 10,
    };
  },

  suppliers: ({ t }) => ({
    collection: "suppliers",
    module: "suppliers",
    title: t("page.suppliers"),
    subtitle: t("subtitle.suppliers"),
    singular: t("entity.suppliers"),
    searchKeys: ["name", "contactName", "email", "phone"],
    searchPlaceholder: t("field.searchByName"),
    rowName: (r) => r.name,
    defaultValues: () => ({ name: "", contactName: "", email: "", phone: "", address: "", note: "" }),
    fields: [
      { key: "name", label: t("common.name"), kind: "text", required: true, span: 2 },
      { key: "contactName", label: t("field.contactName"), kind: "text" },
      { key: "phone", label: t("common.phone"), kind: "tel", required: true },
      { key: "email", label: t("common.email"), kind: "email" },
      { key: "address", label: t("common.address"), kind: "text" },
      { key: "note", label: t("common.note"), kind: "textarea", span: 2, placeholder: t("field.notePlaceholder") },
    ],
    columns: [
      { key: "name", header: t("common.name"), render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
      { key: "contactName", header: t("field.contactName"), render: (r) => r.contactName || "—", hideBelow: "md" },
      { key: "phone", header: t("common.phone"), render: (r) => <span dir="ltr">{r.phone || "—"}</span> },
      { key: "email", header: t("common.email"), render: (r) => r.email || "—", hideBelow: "lg" },
      { key: "createdAt", header: t("common.createdAt"), render: (r) => formatDate(r.createdAt, "ar" as Lang), hideBelow: "lg" },
    ],
  }),

  sales: ({ t, lang, currency, deps }) => {
    const money = (v: number) => formatMoney(v, currency, lang);
    return {
      collection: "sales",
      module: "sales",
      title: t("page.sales"),
      subtitle: t("subtitle.sales"),
      singular: t("entity.sales"),
      searchKeys: ["number", "note"],
      searchPlaceholder: t("field.number"),
      rowName: (r) => r.number,
      dateRangeKey: "date",
      sort: (a, b) => b.date.localeCompare(a.date),
      defaultValues: (rows) => ({
        number: nextDocNumber(rows, "SAL-"),
        date: todayISO(),
        customerId: "",
        items: [],
        discount: 0,
        paymentStatus: "unpaid",
        note: "",
      }),
      fields: [
        { key: "number", label: t("field.number"), kind: "text", required: true },
        { key: "date", label: t("field.docDate"), kind: "date", required: true },
        {
          key: "customerId",
          label: t("field.customer"),
          kind: "select",
          required: true,
          options: deps.customers.map((c) => ({ value: c.id, label: c.name })),
          placeholder: t("common.selectPlaceholder"),
        },
        {
          key: "items",
          label: t("field.items"),
          kind: "items",
          required: true,
          span: 2,
          priceMode: "sale",
          productOptions: deps.products.map((p) => ({
            value: p.id,
            label: `${p.name} — ${p.sku}`,
            price: p.unitPrice,
          })),
        },
        { key: "discount", label: t("common.discount"), kind: "currency", min: 0 },
        {
          key: "paymentStatus",
          label: t("field.paymentStatus"),
          kind: "select",
          required: true,
          options: (["paid", "unpaid", "partial"] as const).map((s) => ({
            value: s,
            label: t(`enum.payment.${s}` as MessageKey),
          })),
        },
        { key: "note", label: t("common.note"), kind: "textarea", span: 2, placeholder: t("field.notePlaceholder") },
      ],
      columns: [
        { key: "number", header: t("field.number"), render: (r) => <span className="font-semibold text-slate-800" dir="ltr">{r.number}</span> },
        { key: "customer", header: t("field.customer"), render: (r) => nameOf(deps.customers, r.customerId) },
        { key: "date", header: t("common.date"), render: (r) => formatDate(r.date, lang), hideBelow: "sm" },
        {
          key: "total",
          header: t("common.total"),
          render: (r) => <span className="font-bold text-slate-900">{money(docTotal(r.items, r.discount))}</span>,
        },
        {
          key: "status",
          header: t("common.status"),
          render: (r) => <Badge tone={paymentTone[r.paymentStatus] ?? "slate"}>{t(`enum.payment.${r.paymentStatus}` as MessageKey)}</Badge>,
          hideBelow: "md",
        },
      ],
      filters: [
        {
          id: "status",
          label: t("common.status"),
          options: (["paid", "unpaid", "partial"] as const).map((s) => ({
            value: s,
            label: t(`enum.payment.${s}` as MessageKey),
          })),
          apply: (r, v) => (v ? r.paymentStatus === v : true),
        },
      ],
      perPage: 10,
    };
  },

  purchases: ({ t, lang, currency, deps }) => {
    const money = (v: number) => formatMoney(v, currency, lang);
    return {
      collection: "purchases",
      module: "purchases",
      title: t("page.purchases"),
      subtitle: t("subtitle.purchases"),
      singular: t("entity.purchases"),
      searchKeys: ["number", "note"],
      searchPlaceholder: t("field.number"),
      rowName: (r) => r.number,
      dateRangeKey: "date",
      sort: (a, b) => b.date.localeCompare(a.date),
      defaultValues: (rows) => ({
        number: nextDocNumber(rows, "PUR-"),
        date: todayISO(),
        supplierId: "",
        items: [],
        discount: 0,
        paymentStatus: "unpaid",
        note: "",
      }),
      fields: [
        { key: "number", label: t("field.number"), kind: "text", required: true },
        { key: "date", label: t("field.docDate"), kind: "date", required: true },
        {
          key: "supplierId",
          label: t("field.supplier"),
          kind: "select",
          required: true,
          options: deps.suppliers.map((s) => ({ value: s.id, label: s.name })),
          placeholder: t("common.selectPlaceholder"),
        },
        {
          key: "items",
          label: t("field.items"),
          kind: "items",
          required: true,
          span: 2,
          priceMode: "cost",
          productOptions: deps.products.map((p) => ({
            value: p.id,
            label: `${p.name} — ${p.sku}`,
            price: p.costPrice,
          })),
        },
        { key: "discount", label: t("common.discount"), kind: "currency", min: 0 },
        {
          key: "paymentStatus",
          label: t("field.paymentStatus"),
          kind: "select",
          required: true,
          options: (["paid", "unpaid", "partial"] as const).map((s) => ({
            value: s,
            label: t(`enum.payment.${s}` as MessageKey),
          })),
        },
        { key: "note", label: t("common.note"), kind: "textarea", span: 2, placeholder: t("field.notePlaceholder") },
      ],
      columns: [
        { key: "number", header: t("field.number"), render: (r) => <span className="font-semibold text-slate-800" dir="ltr">{r.number}</span> },
        { key: "supplier", header: t("field.supplier"), render: (r) => nameOf(deps.suppliers, r.supplierId) },
        { key: "date", header: t("common.date"), render: (r) => formatDate(r.date, lang), hideBelow: "sm" },
        {
          key: "total",
          header: t("common.total"),
          render: (r) => <span className="font-bold text-slate-900">{money(docTotal(r.items, r.discount))}</span>,
        },
        {
          key: "status",
          header: t("common.status"),
          render: (r) => <Badge tone={paymentTone[r.paymentStatus] ?? "slate"}>{t(`enum.payment.${r.paymentStatus}` as MessageKey)}</Badge>,
          hideBelow: "md",
        },
      ],
      filters: [
        {
          id: "status",
          label: t("common.status"),
          options: (["paid", "unpaid", "partial"] as const).map((s) => ({
            value: s,
            label: t(`enum.payment.${s}` as MessageKey),
          })),
          apply: (r, v) => (v ? r.paymentStatus === v : true),
        },
      ],
      perPage: 10,
    };
  },

  invoices: ({ t, lang, currency, deps }) => {
    const money = (v: number) => formatMoney(v, currency, lang);
    return {
      collection: "invoices",
      module: "invoices",
      title: t("page.invoices"),
      subtitle: t("subtitle.invoices"),
      singular: t("entity.invoices"),
      searchKeys: ["number", "note"],
      searchPlaceholder: t("field.number"),
      rowName: (r) => r.number,
      dateRangeKey: "date",
      sort: (a, b) => b.date.localeCompare(a.date),
      defaultValues: (rows) => ({
        number: nextDocNumber(rows, "INV-"),
        date: todayISO(),
        dueDate: daysAgoISO(-15),
        customerId: "",
        amount: 0,
        status: "draft",
        note: "",
      }),
      fields: [
        { key: "number", label: t("field.number"), kind: "text", required: true },
        { key: "date", label: t("field.docDate"), kind: "date", required: true },
        { key: "dueDate", label: t("field.dueDate"), kind: "date", required: true },
        {
          key: "customerId",
          label: t("field.customer"),
          kind: "select",
          required: true,
          options: deps.customers.map((c) => ({ value: c.id, label: c.name })),
          placeholder: t("common.selectPlaceholder"),
        },
        { key: "amount", label: t("common.amount"), kind: "currency", required: true, min: 0 },
        {
          key: "status",
          label: t("common.status"),
          kind: "select",
          required: true,
          options: (["draft", "sent", "paid", "overdue"] as const).map((s) => ({
            value: s,
            label: t(`enum.invoice_status.${s}` as MessageKey),
          })),
        },
        { key: "note", label: t("common.note"), kind: "textarea", span: 2, placeholder: t("field.notePlaceholder") },
      ],
      columns: [
        { key: "number", header: t("field.number"), render: (r) => <span className="font-semibold text-slate-800" dir="ltr">{r.number}</span> },
        { key: "customer", header: t("field.customer"), render: (r) => nameOf(deps.customers, r.customerId) },
        { key: "date", header: t("common.date"), render: (r) => formatDate(r.date, lang), hideBelow: "sm" },
        { key: "due", header: t("field.dueDate"), render: (r) => formatDate(r.dueDate, lang), hideBelow: "lg" },
        { key: "amount", header: t("common.amount"), render: (r) => <span className="font-bold text-slate-900">{money(r.amount)}</span> },
        {
          key: "status",
          header: t("common.status"),
          render: (r) => <Badge tone={invoiceTone[r.status] ?? "slate"}>{t(`enum.invoice_status.${r.status}` as MessageKey)}</Badge>,
          hideBelow: "md",
        },
      ],
      filters: [
        {
          id: "status",
          label: t("common.status"),
          options: (["draft", "sent", "paid", "overdue"] as const).map((s) => ({
            value: s,
            label: t(`enum.invoice_status.${s}` as MessageKey),
          })),
          apply: (r, v) => (v ? r.status === v : true),
        },
      ],
      perPage: 10,
    };
  },

  expenses: ({ t, lang, currency }) => {
    const money = (v: number) => formatMoney(v, currency, lang);
    const cats: Expense["category"][] = ["rent", "salaries", "utilities", "marketing", "transport", "maintenance", "other"];
    return {
      collection: "expenses",
      module: "expenses",
      title: t("page.expenses"),
      subtitle: t("subtitle.expenses"),
      singular: t("entity.expenses"),
      searchKeys: ["description", "note"],
      searchPlaceholder: t("common.description"),
      rowName: (r) => r.description,
      dateRangeKey: "date",
      sort: (a, b) => b.date.localeCompare(a.date),
      defaultValues: () => ({
        date: todayISO(),
        category: "other",
        amount: 0,
        description: "",
        paymentMethod: "cash",
        note: "",
      }),
      fields: [
        { key: "date", label: t("field.docDate"), kind: "date", required: true },
        {
          key: "category",
          label: t("field.expenseCategory"),
          kind: "select",
          required: true,
          options: cats.map((c) => ({ value: c, label: t(`enum.expense.${c}` as MessageKey) })),
        },
        { key: "amount", label: t("common.amount"), kind: "currency", required: true, min: 0 },
        { key: "description", label: t("common.description"), kind: "text", required: true, span: 2 },
        {
          key: "paymentMethod",
          label: t("field.paymentMethod"),
          kind: "select",
          options: (["cash", "bank", "check"] as const).map((m) => ({
            value: m,
            label: t(`enum.method.${m}` as MessageKey),
          })),
        },
        { key: "note", label: t("common.note"), kind: "textarea", span: 2, placeholder: t("field.notePlaceholder") },
      ],
      columns: [
        { key: "date", header: t("common.date"), render: (r) => formatDate(r.date, lang) },
        { key: "category", header: t("common.category"), render: (r) => <Badge tone="violet">{t(`enum.expense.${r.category}` as MessageKey)}</Badge>, hideBelow: "sm" },
        { key: "description", header: t("common.description"), render: (r) => <span className="font-semibold text-slate-800">{r.description}</span> },
        { key: "method", header: t("field.paymentMethod"), render: (r) => t(`enum.method.${r.paymentMethod}` as MessageKey), hideBelow: "lg" },
        { key: "amount", header: t("common.amount"), render: (r) => <span className="font-bold text-rose-600">{money(r.amount)}</span> },
      ],
      filters: [
        {
          id: "category",
          label: t("common.category"),
          options: cats.map((c) => ({ value: c, label: t(`enum.expense.${c}` as MessageKey) })),
          apply: (r, v) => (v ? r.category === v : true),
        },
        {
          id: "method",
          label: t("field.paymentMethod"),
          options: (["cash", "bank", "check"] as const).map((m) => ({
            value: m,
            label: t(`enum.method.${m}` as MessageKey),
          })),
          apply: (r, v) => (v ? r.paymentMethod === v : true),
        },
      ],
      perPage: 10,
    };
  },

  users: ({ t, lang, deps }) => ({
    collection: "users",
    module: "users",
    title: t("page.users"),
    subtitle: t("subtitle.users"),
    singular: t("entity.users"),
    searchKeys: ["name", "email"],
    searchPlaceholder: t("field.emailOrName"),
    rowName: (r) => r.name,
    defaultValues: () => ({ name: "", email: "", phone: "", role: "employee", status: "invited" }),
    blockDelete: (r) => (r.id === deps.currentUserId ? t("toast.deleteSelfBlocked") : null),
    fields: [
      { key: "name", label: t("common.fullName"), kind: "text", required: true, span: 2 },
      { key: "email", label: t("common.email"), kind: "email", required: true },
      { key: "phone", label: t("common.phone"), kind: "tel" },
      {
        key: "role",
        label: t("field.role"),
        kind: "select",
        required: true,
        options: ROLES.map((r) => ({
          value: r,
          label: t(`enum.role.${r}` as MessageKey),
        })),
      },
      {
        key: "status",
        label: t("common.status"),
        kind: "select",
        required: true,
        options: (["active", "invited", "disabled"] as const).map((s) => ({
          value: s,
          label: t(`enum.user_status.${s}` as MessageKey),
        })),
      },
    ],
    columns: [
      {
        key: "name",
        header: t("common.name"),
        render: (r) => (
          <span className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700">
              {r.name.slice(0, 2)}
            </span>
            <span>
              <span className="block font-semibold text-slate-800">{r.name}</span>
              {r.id === deps.currentUserId && (
                <span className="text-[10px] font-medium text-primary-500">{t("users.current")}</span>
              )}
            </span>
          </span>
        ),
      },
      { key: "email", header: t("common.email"), render: (r) => <span dir="ltr">{r.email}</span>, hideBelow: "md" },
      {
        key: "role",
        header: t("field.role"),
        render: (r) => <Badge tone={roleTone[r.role] ?? "slate"}>{t(`enum.role.${r.role}` as MessageKey)}</Badge>,
      },
      {
        key: "status",
        header: t("common.status"),
        render: (r) => <Badge tone={userStatusTone[r.status] ?? "slate"}>{t(`enum.user_status.${r.status}` as MessageKey)}</Badge>,
        hideBelow: "sm",
      },
      { key: "createdAt", header: t("common.createdAt"), render: (r) => formatDate(r.createdAt, lang), hideBelow: "lg" },
    ],
    filters: [
      {
        id: "role",
        label: t("field.role"),
        options: ROLES.map((r) => ({
          value: r,
          label: t(`enum.role.${r}` as MessageKey),
        })),
        apply: (r, v) => (v ? r.role === v : true),
      },
      {
        id: "status",
        label: t("common.status"),
        options: (["active", "invited", "disabled"] as const).map((s) => ({
          value: s,
          label: t(`enum.user_status.${s}` as MessageKey),
        })),
        apply: (r, v) => (v ? r.status === v : true),
      },
    ],
    perPage: 8,
  }),
};

/* --------------------------------- Hook ----------------------------------- */

export function useEntityConfig<K extends EntityKey>(key: K): EntityConfig<EntityMap[K]> {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const { user } = useCurrentUser();
  const { rows: customers } = useCollection<Customer>("customers");
  const { rows: suppliers } = useCollection<Supplier>("suppliers");
  const { rows: products } = useCollection<Product>("products");

  const currency = settings?.currency ?? "DZD";

  return useMemo(() => {
    const config = builders[key]({
      t,
      lang,
      currency,
      deps: { customers, suppliers, products, currentUserId: user?.id ?? settings?.currentUserId ?? null },
    });
    // خيارات فلتر الفئات (المنتجات) تُملأ ديناميكيًا
    if (key === "products" && config.filters) {
      const catFilter = config.filters.find((f) => f.id === "category");
      if (catFilter) {
        const seen = new Set<string>();
        const options: FieldOption[] = [];
        for (const p of products) {
          if (p.category && !seen.has(p.category)) {
            seen.add(p.category);
            options.push({ value: p.category, label: p.category });
          }
        }
        catFilter.options = options;
        catFilter.apply = (row, v) => (v ? (row as Product).category === v : true);
      }
    }
    return config;
  }, [key, t, lang, currency, customers, suppliers, products, user?.id, settings?.currentUserId]);
}

/** اختصارات عملة للقوائم المنسدلة في أماكن أخرى */
export const currencyOptions = Object.entries(CURRENCIES).map(([value, meta]) => ({
  value,
  label: `${meta.label} (${meta.symbol})`,
}));
