// ============================================================
// مزوّد البيانات عبر API (وضع قاعدة البيانات)
// ينفّذ نفس واجهة DataProvider فوق /api/v1/* —
// الواجهة لا تعرف أي شيء عن كون البيانات من PostgreSQL.
// ============================================================

import type { BusinessSettings, CollectionName } from "@/lib/types";
import type { PlanId, SubscriptionInfo } from "@/lib/plans";
import { emitDataChanged, type DataProvider } from "./provider";

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

class ApiProvider implements DataProvider {
  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(path, {
        method: init?.method ?? "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new ApiClientError("تعذّر الاتصال بالخادم — تحقق من اتصالك");
    }

    if (res.status === 401) {
      // انتهت الجلسة → إعادة تحميل كاملة لتفريغ كل الحالة ثم فتح /login
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (typeof window !== "undefined") window.location.assign("/login");
      throw new ApiClientError("انتهت الجلسة، سجّل الدخول مجددًا", "UNAUTHORIZED", 401);
    }

    const json = (await res.json().catch(() => null)) as { data?: T } & ApiErrorBody;
    if (!res.ok) {
      throw new ApiClientError(
        json?.error?.message ?? "حدث خطأ غير متوقع",
        json?.error?.code,
        res.status,
        json?.error?.details,
      );
    }
    return json.data as T;
  }

  async list<T>(collection: CollectionName): Promise<T[]> {
    return this.request<T[]>(`/api/v1/${collection}`);
  }

  async get<T>(collection: CollectionName, id: string): Promise<T | null> {
    try {
      return await this.request<T>(`/api/v1/${collection}/${id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) return null;
      throw err;
    }
  }

  async create<T>(collection: CollectionName, value: T & { id: string }): Promise<T> {
    const created = await this.request<T>(`/api/v1/${collection}`, {
      method: "POST",
      body: value,
    });
    emitDataChanged();
    return created;
  }

  async update<T>(collection: CollectionName, id: string, patch: Partial<T>): Promise<T> {
    const updated = await this.request<T>(`/api/v1/${collection}/${id}`, {
      method: "PATCH",
      body: patch,
    });
    emitDataChanged();
    return updated;
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    await this.request(`/api/v1/${collection}/${id}`, { method: "DELETE" });
    emitDataChanged();
  }

  async getSettings(): Promise<BusinessSettings> {
    return this.request<BusinessSettings>("/api/settings");
  }

  async updateSettings(patch: Partial<BusinessSettings>): Promise<BusinessSettings> {
    const next = await this.request<BusinessSettings>("/api/settings", {
      method: "PUT",
      body: patch,
    });
    emitDataChanged();
    return next;
  }

  async getSubscription(): Promise<SubscriptionInfo> {
    return this.request<SubscriptionInfo>("/api/subscription");
  }

  async setPlan(plan: PlanId): Promise<SubscriptionInfo> {
    const next = await this.request<SubscriptionInfo>("/api/subscription", {
      method: "PUT",
      body: { plan },
    });
    emitDataChanged();
    return next;
  }

  /** تصدير: يجمع كل المجموعات من الخادم */
  async exportAll(): Promise<Record<string, unknown>> {
    const collections: CollectionName[] = [
      "customers",
      "products",
      "suppliers",
      "sales",
      "purchases",
      "invoices",
      "expenses",
      "users",
      "movements",
    ];
    const data: Record<string, unknown> = {};
    for (const c of collections) data[c] = await this.list(c);
    data.settings = await this.getSettings();
    return data;
  }

  async importAll(): Promise<void> {
    throw new ApiClientError(
      "الاستيراد غير متاح في وضع قاعدة البيانات — استخدم تصدير/استيراد SQL على الخادم",
      "NOT_SUPPORTED",
    );
  }

  /**
   * مسح بيانات الأعمال (يبقى حساب المؤسسة والمستخدمون):
   * يحترم صلاحيات كل مورد على الخادم — الترتيب يراعي العلاقات.
   */
  async clearAll(): Promise<void> {
    const order = [
      "notifications",
      "payments",
      "invoices",
      "expenses",
      "sales",
      "purchases",
      "movements",
      "products",
      "categories",
      "suppliers",
      "customers",
    ];
    for (const collection of order) {
      const rows = await this.list(collection as CollectionName).catch(() => [] as unknown[]);
      for (const row of rows as Array<{ id: string }>) {
        await this.remove(collection as CollectionName, row.id).catch(() => undefined);
      }
    }
    emitDataChanged();
  }
}

export const apiProvider = new ApiProvider();
