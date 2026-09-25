// ============================================================
// نقطة الوصول لطبقة البيانات (Factory)
// ——————————————————————————————————————————————
// الوضعان:
//  1) "local" (افتراضي): التخزين في متصفح المستخدم — MVP بلا خادم.
//  2) "api": PostgreSQL عبر Prisma + عزل multi-tenant —
//     يُفعَّل بمتغير البيئة NEXT_PUBLIC_DATA_PROVIDER=api
//     (مع DATABASE_URL + AUTH_SECRET).
// لاحقًا: أضف مزوّدًا جديدًا هنا دون تغيير أي مكوّن واجهة.
// ============================================================

import type { DataProvider } from "./provider";
import { localProvider } from "./local-provider";
import { apiProvider } from "./api-provider";

export { emitDataChanged, onDataChanged, type DataProvider } from "./provider";

/** هل التطبيق يعمل بقاعدة بيانات حقيقية؟ */
export const isApiMode = process.env.NEXT_PUBLIC_DATA_PROVIDER === "api";

export const getProvider = (): DataProvider =>
  isApiMode ? apiProvider : localProvider;
