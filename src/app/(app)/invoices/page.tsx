import type { Metadata } from "next";
import { CrudPage } from "@/components/crud/crud-page";

export const metadata: Metadata = { title: "الفواتير" };

export default function InvoicesPage() {
  return <CrudPage entityKey="invoices" />;
}
