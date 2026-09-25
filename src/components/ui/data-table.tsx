"use client";

// DataTable — جدول احترافي: بحث + فلاتر + ترقيم + إجراءات + حالة فارغة

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, EmptyState, Spinner } from "./primitives";

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** إخفاء العمود على الشاشات الصغيرة */
  hideBelow?: "sm" | "md" | "lg";
}

interface DataTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** شريط البحث (اختياري) */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** فلاتر إضافية (عناصر Select مثلاً) */
  filters?: ReactNode;
  /** زر الإضافة */
  onAdd?: () => void;
  addLabel?: string;
  /** الترقيم (يُتحكم من الصفحة) */
  total?: number;
  page?: number;
  perPage?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  /** ملخص أعلى الجدول (عدد النتائج...) */
  caption?: ReactNode;
}

const hideClasses: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  onAdd,
  addLabel,
  total,
  page = 1,
  perPage = 10,
  onPageChange,
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  rowActions,
  caption,
}: DataTableProps<T>) {
  const totalCount = total ?? rows.length;
  const from = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      {/* شريط الأدوات */}
      {(onSearchChange || filters || onAdd) && (
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          {onSearchChange && (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" />
              <input
                type="search"
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder ?? "بحث..."}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white ps-9 pe-3 text-sm outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>
          )}
          {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
          {onAdd && (
            <Button onClick={onAdd} className="w-full lg:w-auto">
              <Plus className="size-4" />
              {addLabel}
            </Button>
          )}
        </div>
      )}

      {caption && (
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium text-slate-500">
          {caption}
        </div>
      )}

      {/* الجدول */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 text-start text-xs font-bold text-slate-500">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-start whitespace-nowrap",
                    col.className,
                    col.hideBelow && hideClasses[col.hideBelow],
                  )}
                >
                  {col.header}
                </th>
              ))}
              {rowActions && (
                <th className="px-4 py-3 text-end text-xs font-bold whitespace-nowrap">
                  الإجراءات
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-16">
                  <div className="flex justify-center">
                    <Spinner />
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)}>
                  <EmptyState
                    icon={emptyIcon ?? <Inbox className="size-6" />}
                    title={emptyTitle ?? "لا توجد بيانات"}
                    description={emptyDescription}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowId(row)} className="transition hover:bg-slate-50/70">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 align-middle text-slate-600",
                        col.className,
                        col.hideBelow && hideClasses[col.hideBelow],
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        {rowActions(row)}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* الترقيم */}
      {totalCount > perPage && onPageChange && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row">
          <p className="text-xs text-slate-500">
            عرض {from}–{to} من {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="السابق"
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-xs text-slate-400">…</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onPageChange(p)}
                    className={cn(
                      "min-w-8 rounded-lg px-2 py-1 text-xs font-semibold transition",
                      p === page
                        ? "bg-primary-600 text-white"
                        : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="التالي"
            >
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
