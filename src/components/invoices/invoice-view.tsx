"use client";

// ============================================================
// عرض الفاتورة الاحترافي — ورقة A4 للطباعة + تحميل PDF
// • التصميم عربي RTL (الفرنسية/الإنجليزية لاحقًا عبر مفاتيح i18n)
// • «طباعة الفاتورة» → نافذة الطباعة بورقة A4
// • «تحميل PDF» → التقاط الورقة نفسها وتصديرها PDF (html2canvas + jsPDF)
// • الفاتورة لقطة مستقلة: البنود والأسماء منسوخة وقت الإصدار
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, FileDown, Printer, Receipt, Store } from "lucide-react";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useCollection, useCurrentUser, useSettings } from "@/lib/hooks";
import { getProvider } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/utils";
import type { Customer, Invoice, InvoiceItem, Product } from "@/lib/types";
import { Badge, Button, EmptyState, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const paymentTone: Record<string, "emerald" | "rose" | "amber" | "slate"> = {
  paid: "emerald",
  unpaid: "rose",
  partial: "amber",
};

export function InvoiceView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { can } = useCurrentUser();
  const { settings } = useSettings();
  const currency = settings?.currency ?? "DZD";
  const { rows: products } = useCollection<Product>("products");

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const viewable = can("invoices.view");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const inv = await getProvider().get<Invoice>("invoices", id);
      if (!inv) {
        setInvoice(null);
        return;
      }
      setInvoice(inv);
      const cust = await getProvider()
        .get<Customer>("customers", inv.customerId)
        .catch(() => null);
      setCustomer(cust);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const items: InvoiceItem[] = useMemo(() => invoice?.items ?? [], [invoice]);

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.price, 0),
    [items],
  );
  const discount = invoice?.discount ?? 0;
  const total = invoice?.amount ?? Math.max(0, subtotal - discount);

  /** اسم البند: من اللقطة أولًا ثم من المنتج الحالي (للصفحات القديمة) */
  const nameOfItem = (it: InvoiceItem) =>
    it.name?.trim() ||
    products.find((p) => p.id === it.productId)?.name ||
    "—";

  /* ------------------------------ الطباعة ------------------------------ */
  const handlePrint = () => {
    window.print();
  };

  /* ------------------------------- PDF -------------------------------- */
  const handleDownloadPdf = async () => {
    if (!sheetRef.current || !invoice) return;
    setPdfBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const pageW = 210; // A4 بالميليمتر
      const pageH = 297;
      const imgH = (canvas.height * pageW) / canvas.width;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      let heightLeft = imgH;
      let y = 0;
      pdf.addImage(imgData, "JPEG", 0, y, pageW, imgH);
      heightLeft -= pageH;
      // فواتير أطول من صفحة → تقسيمها على صفحات A4 متتالية
      while (heightLeft > 0.5) {
        y -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, y, pageW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(`${invoice.number}.pdf`);
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setPdfBusy(false);
    }
  };

  /* ------------------------------- العرض ------------------------------- */
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

  if (loadError || !invoice) {
    return (
      <EmptyState
        icon={<Receipt className="size-6" />}
        title={t("crm.notFound")}
        description={loadError ? t("toast.error") : undefined}
        action={
          <Link href="/invoices">
            <Button variant="secondary" size="sm">
              <ArrowRight className="size-4" />
              {t("page.invoices")}
            </Button>
          </Link>
        }
      />
    );
  }

  const money = (v: number) => formatMoney(v, currency, lang);

  return (
    <div className="invoice-print-root mx-auto max-w-[210mm]">
      {/* شريط الأدوات — لا يظهر عند الطباعة */}
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/invoices">
          <Button variant="ghost" size="sm">
            <ArrowRight className="size-4" />
            {t("common.back")}
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={handlePrint} title={t("invoice.print")}>
            <Printer className="size-4" />
            {t("invoice.print")}
          </Button>
          <Button onClick={handleDownloadPdf} disabled={pdfBusy} title={t("invoice.downloadPdf")}>
            <FileDown className="size-4" />
            {pdfBusy ? t("invoice.pdfGenerating") : t("invoice.downloadPdf")}
          </Button>
        </div>
      </div>

      {/* ورقة الفاتورة A4 */}
      <div
        ref={sheetRef}
        dir="rtl"
        className="invoice-sheet mx-auto min-h-[297mm] w-full max-w-[210mm] rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-10 print:border-0 print:shadow-none"
      >
        {/* الترويسة: بيانات المؤسسة + عنوان الفاتورة */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-900 pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary-600">
              <Store className="size-5" />
              <span className="text-xs font-bold uppercase tracking-wide">
                {t("invoice.company")}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
              {settings?.businessName?.trim() || t("invoice.company")}
            </h1>
            <div className="mt-1 space-y-0.5 text-sm text-slate-600">
              {settings?.address && <p>{settings.address}</p>}
              {(settings?.phone || settings?.email) && (
                <p dir="ltr" className="text-start">
                  {[settings?.phone, settings?.email].filter(Boolean).join("  ·  ")}
                </p>
              )}
            </div>
          </div>

          <div className="text-end">
            <p className="text-3xl font-black leading-none text-primary-700">
              {t("invoice.docTitle")}
            </p>
            <p className="mt-2 font-mono text-lg font-bold text-slate-900" dir="ltr">
              {invoice.number}
            </p>
            <div className="mt-1 space-y-0.5 text-sm text-slate-600">
              <p>
                {t("common.date")}: {formatDate(invoice.date, lang)}
              </p>
              <p>
                {t("field.dueDate")}: {formatDate(invoice.dueDate, lang)}
              </p>
            </div>
            <div className="mt-2 flex justify-end">
              <Badge tone={paymentTone[invoice.paymentStatus ?? "unpaid"] ?? "slate"}>
                {t(`enum.payment.${invoice.paymentStatus ?? "unpaid"}` as MessageKey)}
              </Badge>
            </div>
          </div>
        </div>

        {/* بيانات العميل */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400">{t("field.customer")}</p>
              <p className="text-base font-bold text-slate-900">{customer?.name ?? "—"}</p>
            </div>
            <div className="space-y-0.5 text-sm text-slate-600 text-end">
              {customer?.phone && (
                <p dir="ltr">
                  <span className="font-semibold">{t("common.phone")}:</span> {customer.phone}
                </p>
              )}
              {customer?.email && (
                <p dir="ltr">
                  <span className="font-semibold">{t("common.email")}:</span> {customer.email}
                </p>
              )}
              {customer?.address && (
                <p>
                  <span className="font-semibold">{t("common.address")}:</span> {customer.address}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* البنود */}
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="w-10 p-2.5 text-center font-semibold">#</th>
                <th className="p-2.5 text-start font-semibold">{t("field.product")}</th>
                <th className="w-24 p-2.5 text-center font-semibold">{t("common.quantity")}</th>
                <th className="w-32 p-2.5 text-center font-semibold">{t("field.unitPrice")}</th>
                <th className="w-36 p-2.5 text-center font-semibold">{t("common.total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    —
                  </td>
                </tr>
              ) : (
                items.map((it, i) => (
                  <tr key={`${it.productId ?? "x"}-${i}`} className="avoid-break">
                    <td className="p-2.5 text-center text-slate-500">{i + 1}</td>
                    <td className="p-2.5 font-semibold text-slate-800">{nameOfItem(it)}</td>
                    <td className="p-2.5 text-center font-bold" dir="ltr">
                      {it.quantity}
                    </td>
                    <td className="p-2.5 text-center" dir="ltr">
                      {money(it.price)}
                    </td>
                    <td className="p-2.5 text-center font-bold text-slate-900" dir="ltr">
                      {money(it.quantity * it.price)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* الإجماليات */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-sm space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t("common.subtotal")}</span>
              <span dir="ltr" className="font-semibold">
                {money(subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t("common.discount")}</span>
              <span dir="ltr" className="font-semibold text-rose-600">
                − {money(discount)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t-2 border-slate-900 pt-2">
              <span className="text-base font-black text-slate-900">
                {t("common.total")}
              </span>
              <span dir="ltr" className="text-lg font-black text-primary-700">
                {money(total)}
              </span>
            </div>
          </div>
        </div>

        {/* ملاحظات + المصدر */}
        {(invoice.note || invoice.saleNumber) && (
          <div className="mt-4 space-y-1 text-sm text-slate-600">
            {invoice.saleNumber && (
              <p className="text-xs text-slate-400">
                {t("invoice.source")}:{" "}
                <span dir="ltr" className="font-semibold">
                  {invoice.saleNumber}
                </span>
              </p>
            )}
            {invoice.note && (
              <p>
                <span className="font-semibold">{t("common.note")}:</span> {invoice.note}
              </p>
            )}
          </div>
        )}

        {/* التذييل: التوقيعات */}
        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-sm text-slate-700">
          <div className="avoid-break">
            <p className="font-bold">{t("invoice.clientSignature")}</p>
            <div className="mt-12 border-t border-dashed border-slate-400 pt-1" />
          </div>
          <div className="avoid-break">
            <p className="font-bold">{t("invoice.companyStamp")}</p>
            <div className="mt-12 border-t border-dashed border-slate-400 pt-1" />
          </div>
        </div>

        <p className="mt-6 text-center text-xs font-bold text-primary-700">
          {t("invoice.thanks")}
        </p>
      </div>
    </div>
  );
}
