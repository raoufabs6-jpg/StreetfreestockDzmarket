import type { Metadata } from "next";
import { CrudPage } from "@/components/crud/crud-page";

export const metadata: Metadata = { title: "المنتجات" };

export default function ProductsPage() {
  return <CrudPage entityKey="products" />;
}
