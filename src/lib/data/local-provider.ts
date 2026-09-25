// ============================================================
// محرك البيانات الحالي: التخزين في متصفح المستخدم (localStorage)
// • البيانات حقيقية ومستمرة (ليست قيمًا ثابتة في الكود)
// • قابلة للتصدير/الاستيراد من صفحة الإعدادات
// • يُستبدل بسهولة بمحرك قاعدة بيانات عبر index.ts
// ============================================================

import {
  COLLECTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type BusinessSettings,
  type CollectionName,
  type Invoice,
  type Product,
  type StockMovement,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { emitDataChanged, type DataProvider } from "./provider";
import { buildSeed } from "./seed";

const PREFIX = "akma:";
const SETTINGS_KEY = `${PREFIX}settings`;
const INIT_KEY = `${PREFIX}initialized`;

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: "منشأتي",
  email: "",
  phone: "",
  address: "",
  currency: "DZD",
  currentUserId: null,
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
  allowOversell: false,
};

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** تهيئة أول تشغيل: إعدادات + بيانات بداية (يمكن حذفها من الإعدادات) */
function ensureInitialized(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(INIT_KEY)) return;
  const seed = buildSeed();
  COLLECTIONS.forEach((c) => writeJSON(`${PREFIX}${c}`, seed[c as keyof typeof seed]));
  writeJSON(SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...seed.settings });
  window.localStorage.setItem(INIT_KEY, "1");
  emitDataChanged();
}

class LocalStorageProvider implements DataProvider {
  private rows<T>(collection: CollectionName): T[] {
    ensureInitialized();
    return readJSON<T[]>(`${PREFIX}${collection}`, []);
  }

  private save<T>(collection: CollectionName, rows: T[]): void {
    writeJSON(`${PREFIX}${collection}`, rows);
    emitDataChanged();
  }

  async list<T>(collection: CollectionName): Promise<T[]> {
    return this.rows<T>(collection);
  }

  async get<T>(collection: CollectionName, id: string): Promise<T | null> {
    return this.rows<T>(collection).find((r) => (r as { id?: string }).id === id) ?? null;
  }

  async create<T>(collection: CollectionName, value: T & { id: string }): Promise<T> {
    const rows = this.rows<T>(collection);
    const base = value as T & { id: string; createdAt?: string };
    // الفاتورة: لقطة بنود بأسماء منسوخة + مبلغ محسب (مطابق لسلوك الخادم)
    const incoming = (
      collection === "invoices" ? this.finalizeInvoice(base as unknown as Invoice) : base
    ) as T & { id: string; createdAt?: string };
    const record = { ...incoming, createdAt: incoming.createdAt ?? new Date().toISOString() } as T;
    rows.unshift(record);
    this.save(collection, rows);
    // نظام حركة المخزون الآمن: الحركة هي مصدر تحديث المخزون (مطابق لسلوك الخادم)
    if (collection === "movements") {
      this.applyMovement(record as unknown as StockMovement);
    }
    return record;
  }

  /** إتمام الفاتورة: أسماء بنود منسوخة، مبلغ = (مجموع − خصم)، رقم البيع المصدر */
  private finalizeInvoice(inv: Invoice): Invoice {
    const products = this.rows<Product>("products");
    const items = (inv.items ?? []).map((i) => ({
      productId: i.productId ?? null,
      name:
        i.name?.trim() ||
        products.find((p) => p.id === i.productId)?.name ||
        "",
      quantity: i.quantity,
      price: i.price,
    }));
    const discount = inv.discount ?? 0;
    let amount = inv.amount ?? 0;
    if (items.length > 0) {
      amount = Math.max(
        0,
        items.reduce((s, i) => s + i.quantity * i.price, 0) - discount,
      );
    } else if (!(amount > 0)) {
      throw new Error("amount_required");
    }
    let saleNumber: string | null = null;
    if (inv.saleId) {
      const sale = this.rows<{ id: string; number: string }>("sales").find(
        (s) => s.id === inv.saleId,
      );
      saleNumber = sale?.number ?? inv.saleNumber ?? null; // بيع محذوف → الرقم المنسوخ يبقى
    }
    return { ...inv, items, discount, amount, saleNumber };
  }

  /** تطبيق حركة على مخزون المنتج — in تزيد، out تنقص، adjust تعيّن الكمية */
  private applyMovement(m: StockMovement): void {
    const products = this.rows<Product>("products");
    const idx = products.findIndex((p) => p.id === m.productId);
    if (idx === -1) return;
    const current = products[idx].stock ?? 0;
    const next =
      m.type === "in" ? current + m.quantity : m.type === "out" ? current - m.quantity : m.quantity;
    if (next < 0) return; // ممنوع — الواجهة والخادم يتحققان قبل الإنشاء
    products[idx] = { ...products[idx], stock: next };
    this.save("products", products);
  }

  async update<T>(collection: CollectionName, id: string, patch: Partial<T>): Promise<T> {
    const rows = this.rows<T>(collection);
    const idx = rows.findIndex((r) => (r as { id?: string }).id === id);
    if (idx === -1) throw new Error("record_not_found");
    let updated: T = { ...rows[idx], ...patch, id } as T;
    // تعديل فاتورة → يُعاد حساب اللقطة/المبلغ (مطابق لسلوك الخادم)
    if (collection === "invoices") {
      updated = this.finalizeInvoice(updated as unknown as Invoice) as unknown as T;
    }
    rows[idx] = updated;
    this.save(collection, rows);
    return updated;
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    const rows = this.rows(collection);
    this.save(
      collection,
      rows.filter((r) => (r as { id?: string }).id !== id),
    );
  }

  async getSettings(): Promise<BusinessSettings> {
    ensureInitialized();
    const stored = readJSON<Partial<BusinessSettings>>(SETTINGS_KEY, {});
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      rolePermissions: { ...DEFAULT_ROLE_PERMISSIONS, ...(stored.rolePermissions ?? {}) },
    };
  }

  async updateSettings(patch: Partial<BusinessSettings>): Promise<BusinessSettings> {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    writeJSON(SETTINGS_KEY, next);
    emitDataChanged();
    return next;
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    for (const c of COLLECTIONS) data[c] = await this.list(c);
    data.settings = await this.getSettings();
    return data;
  }

  async importAll(data: Record<string, unknown>): Promise<void> {
    for (const c of COLLECTIONS) {
      if (Array.isArray(data[c])) writeJSON(`${PREFIX}${c}`, data[c]);
    }
    if (data.settings && typeof data.settings === "object") {
      const s = data.settings as Partial<BusinessSettings>;
      await this.updateSettings(s);
    }
    window.localStorage.setItem(INIT_KEY, "1");
    emitDataChanged();
  }

  async clearAll(): Promise<void> {
    COLLECTIONS.forEach((c) => window.localStorage.removeItem(`${PREFIX}${c}`));
    window.localStorage.removeItem(SETTINGS_KEY);
    window.localStorage.setItem(INIT_KEY, "1");
    // نُبقي على الصلاحيات الافتراضية مع إفراغ السجلات
    writeJSON(SETTINGS_KEY, DEFAULT_SETTINGS);
    COLLECTIONS.forEach((c) => writeJSON(`${PREFIX}${c}`, []));
    emitDataChanged();
  }

  /** إعادة تهيئة بيانات البداية التجريبية (من صفحة الإعدادات) */
  async reseed(): Promise<void> {
    const seed = buildSeed();
    COLLECTIONS.forEach((c) => writeJSON(`${PREFIX}${c}`, seed[c as keyof typeof seed]));
    writeJSON(SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...seed.settings });
    window.localStorage.setItem(INIT_KEY, "1");
    emitDataChanged();
  }
}

export const localProvider = new LocalStorageProvider();

/** يُستخدم عند حذف مستند: إنشاء معرّف جديد */
export function newId(): string {
  return uid();
}
