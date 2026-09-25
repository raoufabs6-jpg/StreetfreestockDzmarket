// إعدادات Prisma CLI (Prisma 7)
// - مسار الـ schema والهجرات (migrations)
// - رابط قاعدة البيانات يُقرأ من DATABASE_URL (ملف .env — لا أسرار في الكود)
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // يُفضَّل DATABASE_URL من .env — قيمة احتياطية تسمح بـ generate/validate
    // بدون قاعدة بيانات (مثل خطوة التركيب على Vercel).
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/akma_business",
  },
});
