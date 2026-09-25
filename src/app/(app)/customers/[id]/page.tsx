import type { Metadata } from "next";
import { CustomerDetails } from "@/components/crm/customer-details";

export const metadata: Metadata = { title: "تفاصيل العميل" };

/** صفحة تفاصيل العميل — /customers/[id] */
export default function CustomerDetailsPage() {
  return <CustomerDetails />;
}
