// اتصال قاعدة البيانات — Prisma 7 + محرك PostgreSQL (driver adapter)
// • كسول (lazy): لا يُفتح أي اتصال عند استيراد الملف — ضروري لنجاح
//   `next build` بدون DATABASE_URL، ويعمل أثناء التشغيل بشكل طبيعي.
// • Singleton يمنع فتح اتصالات متعددة أثناء إعادة التحميل في التطوير.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let client: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL غير مضبوط. أضفه في ملف .env (انظر .env.example) وفي متغيرات بيئة Vercel.",
      );
    }
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    if (process.env.NODE_ENV !== "production") {
      (globalThis as { __akmaPrisma?: PrismaClient }).__akmaPrisma = client;
    }
  }
  return client;
}

/**
 * مُصادَق (Proxy) يؤجّل إنشاء العميل حتى أول استعلام —
 * يحافظ على الأنواع الكاملة لـ PrismaClient.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const instance = getPrisma() as unknown as Record<string | symbol, unknown>;
    const value = instance[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  },
});
