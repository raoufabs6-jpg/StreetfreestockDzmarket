"use client";

// القائمة الجانبية — ثابتة على الكمبيوتر (قابلة للطي) + درج على الهاتف

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/hooks";
import { NAV_SECTIONS } from "./nav";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  /** درج الهاتف (overlay) */
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse, mobile = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { can } = useCurrentUser();

  const isCollapsed = collapsed && !mobile;

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-e border-slate-200 bg-white transition-all duration-200",
        mobile ? "w-72" : isCollapsed ? "w-20" : "w-64",
      )}
    >
      {/* الشعار */}
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={cn(
          "flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-5",
          isCollapsed && "justify-center px-0",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
          <Boxes className="size-5" />
        </span>
        {(!isCollapsed || mobile) && (
          <span className="leading-tight">
            <span className="block text-sm font-extrabold text-slate-900">AKMA Business</span>
            <span className="block text-[10px] font-medium text-slate-400">
              {t("app.tagline")}
            </span>
          </span>
        )}
      </Link>

      {/* الروابط */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter((item) => can(`${item.module}.view`));
          if (visible.length === 0) return null;
          return (
            <div key={section.titleKey} className="mb-4">
              {(!isCollapsed || mobile) && (
                <p className="mb-1.5 px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {t(section.titleKey)}
                </p>
              )}
              <ul className="space-y-1">
                {visible.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        title={t(item.labelKey)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                          isCollapsed && !mobile && "justify-center px-0",
                          active
                            ? "bg-primary-50 text-primary-700"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-5 shrink-0",
                            active ? "text-primary-600" : "text-slate-400",
                          )}
                        />
                        {(!isCollapsed || mobile) && <span>{t(item.labelKey)}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* زر الطي (سطح المكتب فقط) */}
      {onToggleCollapse && !mobile && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-12 shrink-0 items-center justify-center gap-2 border-t border-slate-100 text-xs font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
          aria-label={isCollapsed ? "توسيع القائمة" : "طي القائمة"}
        >
          <ChevronsLeft className={cn("size-4 transition-transform", isCollapsed && "rotate-180")} />
          {!isCollapsed && <span>{t("sidebar.collapse")}</span>}
        </button>
      )}
    </aside>
  );
}
