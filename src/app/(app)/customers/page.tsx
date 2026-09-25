import type { Metadata } from "next";
import { CrudPage } from "@/components/crud/crud-page";

export const metadata: Metadata = { title: "العملاء" };

export default function CustomersPage() {
  return <CrudPage entityKey="customers" />;
}
