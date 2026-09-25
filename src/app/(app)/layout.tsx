import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

/** تخطيط الصفحات المحمية بالهيكل العام (Sidebar + Header) */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
