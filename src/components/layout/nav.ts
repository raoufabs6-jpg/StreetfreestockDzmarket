// إعدادات التنقل — تُستخدم في القائمة الجانبية والشريط السفلي

import {
  LayoutDashboard,
  Users,
  Package,
  Boxes,
  ShoppingCart,
  Truck,
  ShoppingBag,
  FileText,
  Receipt,
  BarChart3,
  ShieldCheck,
  Settings,
  Gem,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n/ar";
import type { ModuleKey } from "@/lib/types";

export interface NavItem {
  module: ModuleKey;
  href: string;
  labelKey: MessageKey;
  icon: LucideIcon;
}

export const NAV_SECTIONS: Array<{ titleKey: MessageKey; items: NavItem[] }> = [
  {
    titleKey: "nav.sectionMain",
    items: [{ module: "dashboard", href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  },
  {
    titleKey: "nav.sectionOperations",
    items: [
      { module: "customers", href: "/customers", labelKey: "nav.customers", icon: Users },
      { module: "products", href: "/products", labelKey: "nav.products", icon: Package },
      { module: "inventory", href: "/inventory", labelKey: "nav.inventory", icon: Boxes },
      { module: "sales", href: "/sales", labelKey: "nav.sales", icon: ShoppingCart },
      { module: "suppliers", href: "/suppliers", labelKey: "nav.suppliers", icon: Truck },
      { module: "purchases", href: "/purchases", labelKey: "nav.purchases", icon: ShoppingBag },
      { module: "invoices", href: "/invoices", labelKey: "nav.invoices", icon: FileText },
      { module: "expenses", href: "/expenses", labelKey: "nav.expenses", icon: Receipt },
    ],
  },
  {
    titleKey: "nav.sectionManagement",
    items: [
      { module: "reports", href: "/reports", labelKey: "nav.reports", icon: BarChart3 },
      { module: "users", href: "/users", labelKey: "nav.users", icon: ShieldCheck },
      { module: "settings", href: "/subscription", labelKey: "nav.subscription", icon: Gem },
      { module: "settings", href: "/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

/** عناصر الشريط السفلي في الهاتف */
export const BOTTOM_NAV: NavItem[] = [
  NAV_SECTIONS[0].items[0],
  NAV_SECTIONS[1].items[0], // العملاء
  NAV_SECTIONS[1].items[3], // المبيعات
  NAV_SECTIONS[1].items[1], // المنتجات
];
