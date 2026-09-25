import type { Metadata } from "next";
import { CrudPage } from "@/components/crud/crud-page";

export const metadata: Metadata = { title: "المشتريات" };

export default function PurchasesPage() {
  return <CrudPage entityKey="purchases" />;
}
