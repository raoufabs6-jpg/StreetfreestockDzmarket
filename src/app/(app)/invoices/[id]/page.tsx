import type { Metadata } from "next";
import { InvoiceView } from "@/components/invoices/invoice-view";

export const metadata: Metadata = { title: "فاتورة" };

/** صفحة الفاتورة — عرض A4 + طباعة + تحميل PDF — /invoices/[id] */
export default function InvoiceDetailsPage() {
  return <InvoiceView />;
}
