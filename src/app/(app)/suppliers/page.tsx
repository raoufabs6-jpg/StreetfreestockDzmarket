import type { Metadata } from "next";
import { CrudPage } from "@/components/crud/crud-page";

export const metadata: Metadata = { title: "الموردون" };

export default function SuppliersPage() {
  return <CrudPage entityKey="suppliers" />;
}
