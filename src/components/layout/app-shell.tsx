"use client";

// هيكل التطبيق (App Shell) — Sidebar ثابت + Header + محتوى + شريط سفلي للهاتف

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";

const COLLAPSE_KEY = "akma:sidebar-collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // استرجاع حالة الطي المحفوظة
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen">
      {/* Sidebar — سطح المكتب */}
      <div className="fixed inset-y-0 start-0 z-40 hidden md:block">
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </div>

      {/* درج الهاتف */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 start-0 animate-fade-in">
            <Sidebar collapsed={false} mobile onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* المحتوى */}
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          collapsed ? "md:ps-20" : "md:ps-64",
        )}
      >
        <Header onOpenMenu={() => setDrawerOpen(true)} />
        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 md:pb-8">{children}</main>
      </div>

      <BottomNav onOpenMenu={() => setDrawerOpen(true)} />
    </div>
  );
}
