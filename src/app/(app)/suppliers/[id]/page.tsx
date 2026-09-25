import type { Metadata } from "next";
import { SupplierDetails } from "@/components/erp/supplier-details";

export const metadata: Metadata = { title: "تفاصيل المورد" };

/** صفحة تفاصيل المورد — /suppliers/[id] */
export default function SupplierDetailsPage() {
  return <SupplierDetails />;
}
