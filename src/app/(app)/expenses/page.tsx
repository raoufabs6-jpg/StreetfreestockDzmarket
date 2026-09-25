import type { Metadata } from "next";
import { CrudPage } from "@/components/crud/crud-page";

export const metadata: Metadata = { title: "المصاريف" };

export default function ExpensesPage() {
  return <CrudPage entityKey="expenses" />;
}
