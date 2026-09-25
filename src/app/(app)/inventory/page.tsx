"use client";

// المخزون — مستويات المنتجات + تعديل الكميات + سجل الحركات

import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History, Scale } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCollection, useCurrentUser, useSettings } from "@/lib/hooks";
import { cn, formatMoney, formatDate, todayISO, uid } from "@/lib/utils";
import type { MovementType, Product, StockMovement } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { DataTable, type TableColumn } from "@/components/ui/data-table";
import { Badge, Button, Card, Input, PageHeader, Textarea } from "@/components/ui/primitives";

export default function InventoryPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { settings } = useSettings();
  const { can } = useCurrentUser();

  const { rows: products, loading } = useCollection<Product>("products");
  const { rows: movements, create: createMovement } = useCollection<StockMovement>("movements");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // نافذة التعديل
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<MovementType>("in");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const currency = settings?.currency ?? "DZD";
  const money = (v: number) => formatMoney(v, currency, lang);
  const manage = can("inventory.manage");

  const stockValue = products.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const lowCount = products.filter((p) => p.stock <= p.minStock).length;
  const outCount = products.filter((p) => p.stock <= 0).length;

  const filtered = useMemo(() => {
    let list = [...products];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => [p.name, p.sku, p.category].some((v) => v.toLowerCase().includes(q)));
    if (statusFilter === "low") list = list.filter((p) => p.stock > 0 && p.stock <= p.minStock);
    if (statusFilter === "out") list = list.filter((p) => p.stock <= 0);
    if (statusFilter === "ok") list = list.filter((p) => p.stock > p.minStock);
    return list.sort((a, b) => a.stock / Math.max(a.minStock, 1) - b.stock / Math.max(b.minStock, 1));
  }, [products, search, statusFilter]);

  const perPage = 10;
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const openAdjust = (p: Product, type: MovementType) => {
    setAdjustTarget(p);
    setAdjustType(type);
    setQty(1);
    setNote("");
  };

  const applyAdjust = async () => {
    if (!adjustTarget) return;
    const isSet = adjustType === "adjust"; // تعيين كمية فعلية (جرد) — يقبل الصفر
    if (isSet ? qty < 0 || !Number.isInteger(qty) : !(qty > 0)) {
      toast.error(t("toast.fillRequired"));
      return;
    }
    const nextStock = isSet ? qty : adjustTarget.stock + (adjustType === "in" ? qty : -qty);
    if (nextStock < 0) {
      toast.error(t("toast.fillRequired"));
      return;
    }
    setSaving(true);
    try {
      // الحركة هي مصدر تحديث المخزون وحده (الخادم والوضع المحلي يطبّقانها)
      // — لا تعديل مباشر للكمية حتى لا تُعدَّل مرتين
      await createMovement({
        id: uid("mov-"),
        createdAt: new Date().toISOString(),
        productId: adjustTarget.id,
        type: adjustType,
        quantity: qty,
        date: todayISO(),
        note,
      });
      toast.success(t("toast.stockUpdated"));
      setAdjustTarget(null);
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setSaving(false);
    }
  };

  const productColumns: TableColumn<Product>[] = [
    {
      key: "name",
      header: t("common.name"),
      render: (p) => (
        <span>
          <span className="font-semibold text-slate-800">{p.name}</span>
          <span className="mt-0.5 block text-[11px] text-slate-400" dir="ltr">
            {p.sku || "—"}
          </span>
        </span>
      ),
    },
    { key: "category", header: t("common.category"), render: (p) => p.category || "—", hideBelow: "sm" },
    {
      key: "stock",
      header: t("inventory.currentStock"),
      render: (p) => (
        <Badge tone={p.stock <= 0 ? "rose" : p.stock <= p.minStock ? "amber" : "emerald"}>
          {p.stock} {t(`enum.unit.${p.unit}` as "enum.unit.piece")}
        </Badge>
      ),
    },
    {
      key: "min",
      header: t("field.minStock"),
      render: (p) => <span className="text-slate-400">{p.minStock}</span>,
      hideBelow: "md",
    },
    {
      key: "value",
      header: t("common.value"),
      render: (p) => <span className="font-semibold text-slate-700">{money(p.stock * p.costPrice)}</span>,
      hideBelow: "lg",
    },
  ];

  const movementColumns: TableColumn<StockMovement>[] = [
    {
      key: "product",
      header: t("field.product"),
      render: (m) => (
        <span className="font-semibold text-slate-700">
          {products.find((p) => p.id === m.productId)?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: t("common.type"),
      render: (m) => (
        <Badge tone={m.type === "in" ? "emerald" : m.type === "out" ? "rose" : "sky"}>
          {t(`enum.movement.${m.type}` as "enum.movement.in")}
        </Badge>
      ),
    },
    {
      key: "qty",
      header: t("common.quantity"),
      render: (m) => (
        <span
          className={cn(
            "font-bold",
            m.type === "in" ? "text-emerald-600" : m.type === "out" ? "text-rose-600" : "text-sky-600",
          )}
        >
          {m.type === "in" ? "+" : m.type === "out" ? "−" : "="}
          {m.quantity}
        </span>
      ),
    },
    { key: "date", header: t("common.date"), render: (m) => formatDate(m.date, lang), hideBelow: "sm" },
    { key: "note", header: t("common.note"), render: (m) => m.note || "—", hideBelow: "lg" },
  ];

  const remaining = adjustTarget
    ? adjustType === "adjust"
      ? qty
      : adjustTarget.stock + (adjustType === "in" ? qty : -qty)
    : 0;

  return (
    <div>
      <PageHeader
        title={t("page.inventory")}
        subtitle={t("inventory.stockValue") + ": " + money(stockValue)}
      />

      {/* ملخص */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t("dashboard.products")}</p>
          <p className="mt-1 text-xl font-extrabold text-slate-900">{products.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t("inventory.stockValue")}</p>
          <p className="mt-1 text-xl font-extrabold text-slate-900">{money(stockValue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t("inventory.low")}</p>
          <p className="mt-1 text-xl font-extrabold text-amber-600">{lowCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t("inventory.out")}</p>
          <p className="mt-1 text-xl font-extrabold text-rose-600">{outCount}</p>
        </Card>
      </div>

      {/* جدول المخزون */}
      <DataTable
        columns={productColumns}
        rows={paged}
        getRowId={(p) => p.id}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder={t("field.searchByName")}
        filters={
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            aria-label={t("inventory.stockStatus")}
          >
            <option value="">
              {t("inventory.stockStatus")}: {t("common.all")}
            </option>
            <option value="ok">{t("inventory.inStock")}</option>
            <option value="low">{t("inventory.low")}</option>
            <option value="out">{t("inventory.out")}</option>
          </select>
        }
        total={filtered.length}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        loading={loading}
        emptyTitle={t("common.noData")}
        caption={filtered.length > 0 ? t("common.results", { count: filtered.length }) : undefined}
        rowActions={
          manage
            ? (p) => (
                <>
                  <button
                    type="button"
                    onClick={() => openAdjust(p, "in")}
                    className="rounded-lg p-2 text-emerald-500 transition hover:bg-emerald-50"
                    title={t("inventory.adjustIn")}
                    aria-label={t("inventory.adjustIn")}
                  >
                    <ArrowDownToLine className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openAdjust(p, "out")}
                    className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50"
                    title={t("inventory.adjustOut")}
                    aria-label={t("inventory.adjustOut")}
                  >
                    <ArrowUpFromLine className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openAdjust(p, "adjust")}
                    className="rounded-lg p-2 text-sky-500 transition hover:bg-sky-50"
                    title={t("inventory.adjustSet")}
                    aria-label={t("inventory.adjustSet")}
                  >
                    <Scale className="size-4" />
                  </button>
                </>
              )
            : undefined
        }
      />

      {/* سجل الحركات */}
      <div className="mt-6">
        <DataTable
          columns={movementColumns}
          rows={[...movements]
            .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt))
            .slice(0, 10)}
          getRowId={(m) => m.id}
          emptyTitle={t("inventory.noMovements")}
          emptyIcon={<History className="size-6" />}
          searchPlaceholder={t("common.search")}
        />
      </div>

      {/* نافذة تعديل المخزون */}
      <Modal
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title={
          adjustTarget
            ? t("inventory.adjustTitle", { name: adjustTarget.name })
            : ""
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={applyAdjust} disabled={saving}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        {adjustTarget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">{t("inventory.currentStock")}</span>
              <Badge tone={adjustTarget.stock <= adjustTarget.minStock ? "amber" : "emerald"}>
                {adjustTarget.stock}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAdjustType("in")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition",
                  adjustType === "in"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50",
                )}
              >
                <ArrowDownToLine className="size-4" />
                {t("inventory.adjustIn")}
              </button>
              <button
                type="button"
                onClick={() => setAdjustType("out")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition",
                  adjustType === "out"
                    ? "border-rose-400 bg-rose-50 text-rose-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50",
                )}
              >
                <ArrowUpFromLine className="size-4" />
                {t("inventory.adjustOut")}
              </button>
              <button
                type="button"
                onClick={() => setAdjustType("adjust")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition",
                  adjustType === "adjust"
                    ? "border-sky-400 bg-sky-50 text-sky-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50",
                )}
              >
                <Scale className="size-4" />
                {t("inventory.adjustSet")}
              </button>
            </div>

            <Input
              type="number"
              min={adjustType === "adjust" ? 0 : 1}
              label={adjustType === "adjust" ? t("inventory.adjustSet") : t("inventory.adjustLabel")}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              dir="ltr"
            />
            <Textarea
              label={t("common.note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("field.notePlaceholder")}
            />
            <p className="text-xs font-medium text-slate-500">
              {t("inventory.remainingAfter", { value: remaining })}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
