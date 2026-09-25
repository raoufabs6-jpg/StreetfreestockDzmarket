// ============================================================
// واجهة طبقة البيانات (Data Provider)
// كل منطق الوصول للبيانات يمر من هنا فقط.
// لربط قاعدة بيانات حقيقية لاحقًا: أنشئ ملفًا جديدًا
// (مثل api-provider.ts) ينفّذ نفس الواجهة فوق REST/Prisma
// وبدّل المستورد في index.ts — لن تحتاج لتغيير أي مكوّن واجهة.
// ============================================================

import type { BusinessSettings, CollectionName } from "@/lib/types";
import type { PlanId, SubscriptionInfo } from "@/lib/plans";

export interface DataProvider {
  list<T>(collection: CollectionName): Promise<T[]>;
  get<T>(collection: CollectionName, id: string): Promise<T | null>;
  create<T>(collection: CollectionName, value: T & { id: string }): Promise<T>;
  update<T>(collection: CollectionName, id: string, patch: Partial<T>): Promise<T>;
  remove(collection: CollectionName, id: string): Promise<void>;
  getSettings(): Promise<BusinessSettings>;
  updateSettings(patch: Partial<BusinessSettings>): Promise<BusinessSettings>;
  /** اشتراك المؤسسة: الخطة، الحالة، التجربة، الحدود، الاستخدام */
  getSubscription(): Promise<SubscriptionInfo>;
  /** تبديل الخطة (يدفع قواعد التجربة/الدفع — انظر plans.planSwitch) */
  setPlan(plan: PlanId): Promise<SubscriptionInfo>;
  /** استيراد نسخة كاملة من البيانات (من ملف JSON) */
  importAll(data: Record<string, unknown>): Promise<void>;
  /** تصدير كل البيانات */
  exportAll(): Promise<Record<string, unknown>>;
  /** مسح كل البيانات */
  clearAll(): Promise<void>;
  /** (اختياري) إعادة تهيئة بيانات تجريبية — ينفّذه محرك التخزين المحلي */
  reseed?(): Promise<void>;
}

/** بث بسيط لتززيح Hooks بعد أي عملية كتابة */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onDataChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitDataChanged(): void {
  listeners.forEach((fn) => fn());
}
