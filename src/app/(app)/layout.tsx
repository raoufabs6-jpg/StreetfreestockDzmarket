import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/auth";
import { isApiMode } from "@/lib/data";

/**
 * تخطيط الصفحات المحمية:
 * • وضع قاعدة البيانات (api): يُشترط وجود جلسة صالحة — وإلا تحويل لـ /login.
 * • وضع التخزين المحلي: يعمل بدون تسجيل دخول (كالسابق).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (isApiMode) {
    const store = await cookies();
    const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
    if (!session) redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
