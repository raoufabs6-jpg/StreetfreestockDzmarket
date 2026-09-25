import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AKMA Business — إدارة أعمال بسيطة",
    template: "%s | AKMA Business",
  },
  description:
    "منصة بسيطة لإدارة الأعمال تجمع وظائف ERP وCRM في نظام واحد: عملاء، منتجات، مخزون، مبيعات، مشتريات، فواتير وتقارير.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // اللغة والاتجاه الافتراضيان عربي/RTL — يحدّثهما مزوّد i18n عند التبديل
    <html lang="ar" dir="rtl">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
