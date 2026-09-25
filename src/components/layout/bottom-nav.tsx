"use client";

// الشريط السفلي للهاتف (Bottom Navigation)

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { BOTTOM_NAV } from "./nav";

export function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const items = [
    ...BOTTOM_NAV.map((item) => ({ href: item.href, labelKey: item.labelKey, icon: item.icon })),
    { href: "__menu__", labelKey: "nav.more" as const, icon: Menu },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href !== "__menu__" && pathname.startsWith(item.href);
          const label = t(item.labelKey);
          return (
            <li key={item.href}>
              {item.href === "__menu__" ? (
                <button
                  type="button"
                  onClick={onOpenMenu}
                  className="flex w-full flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-slate-500"
                >
                  <Icon className="size-5" />
                  {label}
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition",
                    active ? "text-primary-600" : "text-slate-500",
                  )}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
