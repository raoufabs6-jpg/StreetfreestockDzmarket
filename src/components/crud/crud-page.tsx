"use client";

// CrudPage — صفحة إدارة موحدة تُبنى من إعدادات سجل الكيانات
// بحث + فلاتر + نطاق تاريخ + ترقيم + نموذج + حذف بتأكيد

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pencil, Trash2, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCollection, useCurrentUser } from "@/lib/hooks";
import {
  useEntityConfig,
  type EntityKey,
  type EntityMap,
} from "@/lib/entities/registry";
import { cn, uid } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { DataTable, type TableColumn } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/modal";
import { Button, PageHeader } from "@/components/ui/primitives";
import { EntityForm } from "./entity-form";

interface CrudPageProps<K extends EntityKey> {
  entityKey: K;
  /** مكوّن إضافي أسفل الجدول (مثل مصفوفة الصلاحيات) */
  extra?: ReactNode;
}

export function CrudPage<K extends EntityKey>({ entityKey, extra }: CrudPageProps<K>) {
  type T = EntityMap[K];
  const { t } = useI18n();
  const toast = useToast();
  const { can } = useCurrentUser();
  const config = useEntityConfig(entityKey);
  const { rows, loading, create, update, remove } = useCollection<T>(config.collection);

  const manage = can(`${config.module}.manage`);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  // إعادة الترقيم عند تغيير البحث/الفلاتر
  useEffect(() => {
    setPage(1);
  }, [search, filterValues, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    let list = [...rows];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((row) =>
        config.searchKeys.some((key) => String(row[key] ?? "").toLowerCase().includes(q)),
      );
    }
    for (const f of config.filters ?? []) {
      const v = filterValues[f.id];
      if (v) list = list.filter((row) => f.apply(row, v));
    }
    if (config.dateRangeKey) {
      const key = config.dateRangeKey;
      if (dateFrom) list = list.filter((row) => String(row[key] ?? "") >= dateFrom);
      if (dateTo) list = list.filter((row) => String(row[key] ?? "") <= dateTo);
    }
    if (config.sort) list.sort(config.sort);
    else list.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return list;
  }, [rows, search, filterValues, dateFrom, dateTo, config]);

  const perPage = config.perPage ?? 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  /* ------------------------------- العمليات ------------------------------- */

  const openAdd = () => {
    setEditing(null);
    setInitialValues({ ...config.defaultValues(rows) });
    setFormOpen(true);
  };

  const openEdit = (row: T) => {
    setEditing(row);
    setInitialValues({ ...(row as unknown as Record<string, unknown>) });
    setFormOpen(true);
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing) {
        const patch = { ...values };
        delete patch.id;
        delete patch.createdAt;
        await update(editing.id, patch as Partial<T>);
        toast.success(t("toast.updated"));
      } else {
        await create({
          ...values,
          id: uid("rec-"),
          createdAt: new Date().toISOString(),
        } as T & { id: string });
        toast.success(t("toast.created"));
      }
      setFormOpen(false);
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (row: T) => {
    const blocked = config.blockDelete?.(row);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setDeleteTarget(row);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await remove(deleteTarget.id);
      toast.success(t("toast.deleted"));
      setDeleteTarget(null);
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setDeleting(false);
    }
  };

  /* -------------------------------- العرض -------------------------------- */

  if (!can(`${config.module}.view`)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
        <p className="text-sm font-bold text-slate-700">{t("error.forbidden")}</p>
      </div>
    );
  }

  const columns: TableColumn<T>[] = config.columns;

  const filterSelectCls =
    "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

  return (
    <div>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={
          manage ? (
            <span className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700">
              {t("common.results", { count: filtered.length })}
            </span>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={paged}
        getRowId={(r) => r.id}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={config.searchPlaceholder}
        filters={
          <>
            {(config.filters ?? []).map((f) => (
              <select
                key={f.id}
                value={filterValues[f.id] ?? ""}
                onChange={(e) =>
                  setFilterValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                }
                className={filterSelectCls}
                aria-label={f.label}
              >
                <option value="">
                  {f.label}: {t("common.all")}
                </option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ))}
            {config.dateRangeKey && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={cn(filterSelectCls, "w-36")}
                  aria-label={t("common.from")}
                  dir="ltr"
                />
                <span className="text-xs text-slate-400">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={cn(filterSelectCls, "w-36")}
                  aria-label={t("common.to")}
                  dir="ltr"
                />
              </div>
            )}
            {(Object.values(filterValues).some(Boolean) || dateFrom || dateTo || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterValues({});
                  setDateFrom("");
                  setDateTo("");
                  setSearch("");
                }}
              >
                {t("common.reset")}
              </Button>
            )}
          </>
        }
        onAdd={manage ? openAdd : undefined}
        addLabel={`${t("common.add")} ${config.singular}`}
        total={filtered.length}
        page={safePage}
        perPage={perPage}
        onPageChange={setPage}
        loading={loading}
        emptyTitle={search || Object.values(filterValues).some(Boolean) ? t("common.noResults") : t("common.noData")}
        emptyDescription={
          search || Object.values(filterValues).some(Boolean)
            ? t("common.trySearch")
            : t("field.searchByName")
        }
        emptyIcon={<Users className="size-6" />}
        caption={
          filtered.length > 0
            ? t("common.results", { count: filtered.length })
            : undefined
        }
        rowActions={
          manage
            ? (row) => (
                <>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-primary-50 hover:text-primary-600"
                    aria-label={t("common.edit")}
                    title={t("common.edit")}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDelete(row)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )
            : undefined
        }
      />

      {extra}

      {formOpen && (
        <EntityForm<T>
          key={editing?.id ?? "new"}
          open={formOpen}
          title={
            editing
              ? t("dialog.editEntity", { name: config.singular })
              : t("dialog.addEntity", { name: config.singular })
          }
          config={config}
          initialValues={initialValues}
          saving={saving}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("dialog.deleteEntity", { name: config.singular })}
        message={deleteTarget ? t("dialog.deleteMessage", { name: config.rowName(deleteTarget) }) : ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
