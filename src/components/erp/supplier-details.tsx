"use client";

// تفاصيل المورد (ERP) — بسيطة ومباشرة:
//   بيانات المورد + إجمالي المشتريات + عدد المشتريات + المبالغ المستحقة
//   + سجل المشتريات + ملاحظات + تعديل/حذف
// المشتريات محسوبة من مورّد البيانات نفسه (يعمل في الوضعين local و api).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  ShoppingBag,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useCurrentUser, useSettings } from "@/lib/hooks";
import { useEntityConfig } from "@/lib/entities/registry";
import { getProvider } from "@/lib/data";
import { docTotal, formatDate, formatMoney } from "@/lib/utils";
import type { Purchase, Supplier } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/modal";
import { EntityForm } from "@/components/crud/entity-form";
import { useToast } from "@/components/ui/toast";

const paymentTone: Record<string, "emerald" | "rose" | "amber" | "slate"> = {
  paid: "emerald",
  unpaid: "rose",
  partial: "amber",
};

export function SupplierDetails() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { can } = useCurrentUser();
  const { settings } = useSettings();
  const currency = settings?.currency ?? "DZD";
  const config = useEntityConfig("suppliers");
  const manage = can("suppliers.manage");
  const viewable = can("suppliers.view");

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const s = await getProvider().get<Supplier>("suppliers", id);
      if (!s) {
        setSupplier(null);
        return;
      }
      setSupplier(s);
      const all = await getProvider().list<Purchase>("purchases").catch(() => [] as Purchase[]);
      setPurchases(all.filter((p) => p.supplierId === id));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ------------------------------ الإحصاءات ------------------------------ */
  const totalPurchases = useMemo(
    () => purchases.reduce((sum, p) => sum + docTotal(p.items, p.discount), 0),
    [purchases],
  );
  // المبالغ المستحقة: مشتريات غير مدفوعة بالكامل (unpaid + partial بقيمتها الكاملة)
  const dueAmount = useMemo(
    () =>
      purchases
        .filter((p) => p.paymentStatus !== "paid")
        .reduce((sum, p) => sum + docTotal(p.items, p.discount), 0),
    [purchases],
  );

  /* ------------------------------ العمليات ------------------------------ */
  const handleSave = async (values: Record<string, unknown>) => {
    if (!supplier) return;
    setSaving(true);
    try {
      const patch = { ...values };
      delete patch.id;
      delete patch.createdAt;
      const updated = await getProvider().update<Supplier>(
        "suppliers",
        supplier.id,
        patch as Partial<Supplier>,
      );
      setSupplier(updated);
      setEditOpen(false);
      toast.success(t("toast.updated"));
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!supplier) return;
    setDeleting(true);
    try {
      await getProvider().remove("suppliers", supplier.id);
      toast.success(t("toast.deleted"));
      router.push("/suppliers");
    } catch {
      toast.error(t("toast.error"));
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  /* -------------------------------- العرض -------------------------------- */
  if (!viewable) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
        <p className="text-sm font-bold text-slate-700">{t("error.forbidden")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (loadError || !supplier) {
    return (
      <EmptyState
        icon={<Building2 className="size-6" />}
        title={t("crm.notFound")}
        description={loadError ? t("toast.error") : undefined}
        action={
          <Link href="/suppliers">
            <Button variant="secondary" size="sm">
              <ArrowRight className="size-4" />
              {t("erp.suppliersList")}
            </Button>
          </Link>
        }
      />
    );
  }

  const infoRow = (Icon: typeof Phone, label: string, value: string, ltr = false) => (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="truncate text-sm font-bold text-slate-800" dir={ltr ? "ltr" : undefined}>
          {value}
        </p>
      </div>
    </div>
  );

  const stat = (Icon: typeof Receipt, label: string, value: string, hint?: string) => (
    <Card key={label} className="px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">{label}</p>
          <p className="truncate text-lg font-extrabold text-slate-900">{value}</p>
          {hint && <p className="truncate text-[11px] text-slate-400">{hint}</p>}
        </div>
      </div>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={t("erp.supplierDetails")}
        actions={
          <>
            <Link href="/suppliers">
              <Button variant="ghost" size="sm">
                <ArrowRight className="size-4" />
                {t("erp.suppliersList")}
              </Button>
            </Link>
            {manage && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  {t("common.edit")}
                </Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  {t("common.delete")}
                </Button>
              </>
            )}
          </>
        }
      />

      {/* الإحصاءات */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {stat(ShoppingBag, t("erp.purchasesCount"), String(purchases.length))}
        {stat(Receipt, t("crm.totalPurchases"), formatMoney(totalPurchases, currency, lang))}
        {stat(
          Receipt,
          t("erp.dueAmount"),
          formatMoney(dueAmount, currency, lang),
          dueAmount > 0 ? t("erp.dueHint") : undefined,
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* بيانات المورد + الملاحظات */}
        <div className="space-y-5">
          <Card>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Building2 className="size-4 text-primary-500" />
                {t("erp.supplierInfo")}
              </span>
            </CardTitle>
            <div className="divide-y divide-slate-100 px-5 pb-5">
              {infoRow(Phone, t("common.phone"), supplier.phone || "—", true)}
              {infoRow(Mail, t("common.email"), supplier.email || "—", true)}
              {infoRow(MapPin, t("common.address"), supplier.address || "—")}
              {infoRow(CalendarDays, t("common.createdAt"), formatDate(supplier.createdAt, lang))}
            </div>
          </Card>

          <Card>
            <CardTitle>
              <span className="flex items-center gap-2">
                <StickyNote className="size-4 text-amber-500" />
                {t("common.notes")}
              </span>
            </CardTitle>
            <p className="whitespace-pre-wrap px-5 pb-5 text-sm leading-6 text-slate-600">
              {supplier.contactName ? (
                <span className="mb-2 block font-bold text-slate-700">
                  {t("field.contactName")}: {supplier.contactName}
                </span>
              ) : null}
              {supplier.note?.trim() || <span className="text-slate-400">—</span>}
            </p>
          </Card>
        </div>

        {/* سجل المشتريات */}
        <Card className="lg:col-span-2">
          <CardTitle
            action={
              <Badge tone="slate">{t("common.results", { count: purchases.length })}</Badge>
            }
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="size-4 text-primary-500" />
              {t("erp.purchasesLog")}
            </span>
          </CardTitle>

          {purchases.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-400">{t("crm.noPurchases")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 px-5 pb-5">
              {[...purchases]
                .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt))
                .map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800" dir="ltr">
                        {p.number}
                      </p>
                      <time className="text-xs text-slate-400" dateTime={p.date}>
                        {formatDate(p.date, lang)}
                      </time>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-extrabold text-slate-700">
                        {formatMoney(docTotal(p.items, p.discount), currency, lang)}
                      </span>
                      <Badge tone={paymentTone[p.paymentStatus] ?? "slate"}>
                        {t(`enum.payment.${p.paymentStatus}` as MessageKey)}
                      </Badge>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {/* تعديل المورد */}
      {editOpen && (
        <EntityForm<Supplier>
          key={supplier.id}
          open={editOpen}
          title={t("dialog.editEntity", { name: config.singular })}
          config={config}
          initialValues={supplier as unknown as Record<string, unknown>}
          saving={saving}
          onClose={() => setEditOpen(false)}
          onSubmit={handleSave}
        />
      )}

      {/* حذف المورد */}
      <ConfirmDialog
        open={deleteOpen}
        title={t("dialog.deleteEntity", { name: config.singular })}
        message={t("dialog.deleteMessage", { name: supplier.name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
