"use client";

// تفاصيل العميل (CRM) — بطاقة بسيطة وسهلة:
//   معلومات العميل + إجمالي المشتريات + عدد الطلبات + آخر عملية شراء
//   + سجل العمليات (Customer Timeline) + الملاحظات
// كل البيانات محسوبة من مورّد البيانات نفسه (يعمل في الوضعين local و api).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  ListOrdered,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser, useSettings } from "@/lib/hooks";
import { useEntityConfig } from "@/lib/entities/registry";
import { getProvider } from "@/lib/data";
import { docTotal, formatDate, formatMoney } from "@/lib/utils";
import type { Customer, Invoice, Sale } from "@/lib/types";
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
import { CustomerTimeline, type TimelineItem } from "./customer-timeline";

export function CustomerDetails() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { can } = useCurrentUser();
  const { settings } = useSettings();
  const currency = settings?.currency ?? "DZD";
  const config = useEntityConfig("customers");
  const manage = can("customers.manage");
  const viewable = can("customers.view");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
      const c = await getProvider().get<Customer>("customers", id);
      if (!c) {
        setCustomer(null);
        return;
      }
      setCustomer(c);
      // المبيعات/الفواتير الخاصة بهذا العميل فقط (فشل الصلاحية → أصفار بأمان)
      const [allSales, allInvoices] = await Promise.all([
        getProvider().list<Sale>("sales").catch(() => [] as Sale[]),
        getProvider().list<Invoice>("invoices").catch(() => [] as Invoice[]),
      ]);
      setSales(allSales.filter((s) => s.customerId === id));
      setInvoices(allInvoices.filter((i) => i.customerId === id));
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
    () => sales.reduce((sum, s) => sum + docTotal(s.items, s.discount), 0),
    [sales],
  );
  const ordersCount = sales.length;
  const lastPurchase = useMemo(
    () => sales.reduce<string | null>((max, s) => (s.date > (max ?? "") ? s.date : max), null),
    [sales],
  );

  /* -------------------------- الخط الزمني للعميل -------------------------- */
  const timelineItems = useMemo<TimelineItem[]>(() => {
    if (!customer) return [];
    const items: TimelineItem[] = [
      { id: `c-${customer.id}`, date: customer.createdAt, kind: "created", title: t("crm.tl.created") },
      ...sales.map((s) => ({
        id: `s-${s.id}`,
        date: s.date,
        kind: "sale" as const,
        title: t("crm.tl.sale"),
        meta: s.number,
        amount: docTotal(s.items, s.discount),
      })),
      ...invoices.map((i) => ({
        id: `i-${i.id}`,
        date: i.date,
        kind: "invoice" as const,
        title: t("crm.tl.invoice"),
        meta: i.number,
        amount: i.amount,
      })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [customer, sales, invoices, t]);

  /* ------------------------------ العمليات ------------------------------ */
  const handleSave = async (values: Record<string, unknown>) => {
    if (!customer) return;
    setSaving(true);
    try {
      const patch = { ...values };
      delete patch.id;
      delete patch.createdAt;
      const updated = await getProvider().update<Customer>(
        "customers",
        customer.id,
        patch as Partial<Customer>,
      );
      setCustomer(updated);
      setEditOpen(false);
      toast.success(t("toast.updated"));
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    setDeleting(true);
    try {
      await getProvider().remove("customers", customer.id);
      toast.success(t("toast.deleted"));
      router.push("/customers");
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

  if (loadError || !customer) {
    return (
      <EmptyState
        icon={<Receipt className="size-6" />}
        title={t("crm.notFound")}
        description={loadError ? t("toast.error") : undefined}
        action={
          <Link href="/customers">
            <Button variant="secondary" size="sm">
              <ArrowRight className="size-4" />
              {t("crm.backToList")}
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

  const stat = (Icon: typeof Receipt, label: string, value: string) => (
    <Card key={label} className="px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">{label}</p>
          <p className="truncate text-lg font-extrabold text-slate-900">{value}</p>
        </div>
      </div>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={t("crm.customerDetails")}
        actions={
          <>
            <Link href="/customers">
              <Button variant="ghost" size="sm">
                <ArrowRight className="size-4" />
                {t("crm.backToList")}
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
        {stat(Receipt, t("crm.totalPurchases"), formatMoney(totalPurchases, currency, lang))}
        {stat(ListOrdered, t("crm.ordersCount"), String(ordersCount))}
        {stat(
          CalendarDays,
          t("crm.lastPurchase"),
          lastPurchase ? formatDate(lastPurchase, lang) : "—",
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* العمود الأيمن: معلومات + ملاحظات */}
        <div className="space-y-5">
          <Card>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Phone className="size-4 text-primary-500" />
                {t("crm.customerInfo")}
              </span>
            </CardTitle>
            <div className="divide-y divide-slate-100 px-5 pb-5">
              {infoRow(Phone, t("common.phone"), customer.phone || "—", true)}
              {infoRow(Mail, t("common.email"), customer.email || "—", true)}
              {infoRow(MapPin, t("common.address"), customer.address || "—")}
              {infoRow(CalendarDays, t("common.createdAt"), formatDate(customer.createdAt, lang))}
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
              {customer.note?.trim() || <span className="text-slate-400">—</span>}
            </p>
          </Card>
        </div>

        {/* العمود الأيسر: الخط الزمني */}
        <Card className="lg:col-span-2">
          <CardTitle
            action={
              <Badge tone="slate">
                {t("common.results", { count: timelineItems.length })}
              </Badge>
            }
          >
            <span className="flex items-center gap-2">
              <ListOrdered className="size-4 text-primary-500" />
              {t("crm.activityLog")}
            </span>
          </CardTitle>
          <p className="px-5 pt-1 text-xs text-slate-400">{t("crm.timelineHint")}</p>
          <CustomerTimeline items={timelineItems} currency={currency} />
        </Card>
      </div>

      {/* تعديل العميل */}
      {editOpen && (
        <EntityForm<Customer>
          key={customer.id}
          open={editOpen}
          title={t("dialog.editEntity", { name: config.singular })}
          config={config}
          initialValues={customer as unknown as Record<string, unknown>}
          saving={saving}
          onClose={() => setEditOpen(false)}
          onSubmit={handleSave}
        />
      )}

      {/* حذف العميل */}
      <ConfirmDialog
        open={deleteOpen}
        title={t("dialog.deleteEntity", { name: config.singular })}
        message={t("dialog.deleteMessage", { name: customer.name })}
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
