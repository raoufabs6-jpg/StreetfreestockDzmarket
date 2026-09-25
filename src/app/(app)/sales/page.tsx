import type { Metadata } from "next";
import { CrudPage } from "@/components/crud/crud-page";

export const metadata: Metadata = { title: "المبيعات" };

export default function SalesPage() {
  return <CrudPage entityKey="sales" />;
}
