// ============================================================
// نقطة الوصول لطبقة البيانات (Factory)
// ——————————————————————————————————————————————
// الحالية: التخزين المحلي في المتصفح (مناسب لـ MVP بلا خادم).
// لاحقًا: أنشئ `api-provider.ts` ينفّذ DataProvider فوق
// REST/Prisma/Supabase وغيّر السطر التالي فقط:
//   export const getProvider = (): DataProvider => apiProvider;
// ============================================================

import type { DataProvider } from "./provider";
import { localProvider } from "./local-provider";

export { emitDataChanged, onDataChanged, type DataProvider } from "./provider";

export const getProvider = (): DataProvider => localProvider;
