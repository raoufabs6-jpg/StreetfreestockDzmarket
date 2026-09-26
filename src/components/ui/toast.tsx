"use client";

// Toast notifications — تنبيهات ناجحة/خطأ عائمة

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Info, X, ArrowUpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  /** زر إجراء اختياري (مثل «ترقية الخطة» → /pricing) */
  action?: { label: string; href: string };
}

interface ToastAction {
  label: string;
  href: string;
}

interface ToastValue {
  toast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
  success: (message: string) => void;
  error: (message: string, action?: ToastAction) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const toneStyles: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

const toneIcons: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />,
  error: <XCircle className="size-5 shrink-0 text-rose-500" />,
  info: <Info className="size-5 shrink-0 text-sky-500" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "success", action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone, action }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value = useMemo<ToastValue>(
    () => ({
      toast,
      success: (m: string) => toast(m, "success"),
      error: (m: string, action?: ToastAction) => toast(m, "error", action),
      info: (m: string) => toast(m, "info"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 md:bottom-6 md:end-6 md:w-auto"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-scale-in",
              toneStyles[item.tone],
            )}
          >
            {toneIcons[item.tone]}
            <span className="flex-1 leading-6">
              {item.message}
              {item.action && (
                <Link
                  href={item.action.href}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-rose-700"
                >
                  <ArrowUpCircle className="size-3.5" />
                  {item.action.label}
                </Link>
              )}
            </span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              className="opacity-50 transition hover:opacity-100"
              aria-label="إغلاق"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
