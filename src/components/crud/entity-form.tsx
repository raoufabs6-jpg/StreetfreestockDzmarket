"use client";

// EntityForm — نموذج إضافة/تعديل مبني على حقول السجل (Registry)
// يدعم: حقول نصية/أرقام/تواريخ/قوائم منسدلة/بنود مستند مع حساب تلقائي

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/hooks";
import { cn, formatMoney } from "@/lib/utils";
import type { EntityConfig, FieldDef } from "@/lib/entities/registry";
import { useToast } from "@/components/ui/toast";
import { Button, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { CURRENCIES, type DocumentItem } from "@/lib/types";

type FormValues = Record<string, unknown>;

interface EntityFormProps<T extends { id: string }> {
  open: boolean;
  title: string;
  config: EntityConfig<T>;
  initialValues: FormValues;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function EntityForm<T extends { id: string }>({
  open,
  title,
  config,
  initialValues,
  saving = false,
  onClose,
  onSubmit,
}: EntityFormProps<T>) {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const toast = useToast();

  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const currencySymbol = useMemo(
    () => CURRENCIES[settings?.currency ?? "DZD"].symbol,
    [settings?.currency],
  );

  const set = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const itemsField = config.fields.find((f) => f.kind === "items");
  const items = (values.items as DocumentItem[]) ?? [];
  const subtotal = items.reduce((s, it) => s + num(it.quantity) * num(it.price), 0);
  const discount = num(values.discount);
  const grandTotal = Math.max(0, subtotal - discount);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    for (const field of config.fields) {
      const v = values[field.key];
      if (field.kind === "items") {
        const list = (v as DocumentItem[]) ?? [];
        const bad =
          list.length === 0 ||
          list.some((it) => !it.productId || !(Number(it.quantity) > 0) || !(Number(it.price) >= 0));
        if (field.required && bad) next[field.key] = t("form.emptyItems");
        continue;
      }
      if (field.kind === "email" && typeof v === "string" && v.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) next[field.key] = t("form.invalidEmail");
      }
      if (field.required) {
        const isEmpty =
          v === undefined || v === null || (typeof v === "string" && v.trim() === "");
        if (isEmpty) next[field.key] = t("common.required");
        else if ((field.kind === "number" || field.kind === "currency") && !Number.isFinite(num(v)))
          next[field.key] = t("common.required");
      }
      if (field.min !== undefined && typeof v === "number" && v < field.min) {
        next[field.key] = t("form.minValue", { min: field.min });
      }
    }
    const custom = config.validate?.(values);
    if (custom) next._form = custom;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error(next._form ?? t("toast.fillRequired"));
      return false;
    }
    return true;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(values);
  };

  const renderField = (field: FieldDef) => {
    const v = values[field.key];
    const err = errors[field.key];
    const spanCls = field.span === 2 ? "sm:col-span-2" : "";

    if (field.kind === "items") {
      return (
        <div key={field.key} className={cn("sm:col-span-2", errors.items && "rounded-lg ring-1 ring-rose-300")}>
          <ItemsField
            items={items}
            options={field.productOptions ?? []}
            onChange={(next) => set("items", next)}
            error={err}
          />
        </div>
      );
    }

    switch (field.kind) {
      case "textarea":
        return (
          <div key={field.key} className={spanCls}>
            <Textarea
              label={field.label}
              value={str(v)}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
            {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
          </div>
        );
      case "select":
        return (
          <div key={field.key} className={spanCls}>
            <Select
              label={field.label}
              options={field.options ?? []}
              placeholder={field.placeholder ?? t("common.selectPlaceholder")}
              value={str(v)}
              onChange={(e) => set(field.key, e.target.value)}
              error={err}
            />
          </div>
        );
      case "date":
        return (
          <div key={field.key} className={spanCls}>
            <Input
              type="date"
              label={field.label}
              value={str(v)}
              onChange={(e) => set(field.key, e.target.value)}
              error={err}
            />
          </div>
        );
      case "number":
      case "currency":
        return (
          <div key={field.key} className={spanCls}>
            <Input
              type="number"
              inputMode="decimal"
              label={field.label}
              value={v === undefined || v === null ? "" : str(v)}
              onChange={(e) => set(field.key, e.target.value === "" ? "" : Number(e.target.value))}
              min={field.min}
              step={field.step ?? (field.kind === "currency" ? 0.01 : 1)}
              suffix={field.kind === "currency" ? currencySymbol : undefined}
              error={err}
              dir="ltr"
            />
          </div>
        );
      default:
        return (
          <div key={field.key} className={spanCls}>
            <Input
              type={field.kind === "email" ? "email" : field.kind === "tel" ? "tel" : "text"}
              label={field.label}
              value={str(v)}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              error={err}
              dir={field.kind === "tel" || field.kind === "email" ? "ltr" : "auto"}
            />
          </div>
        );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "..." : t("common.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {config.fields.map(renderField)}

        {itemsField && (
          <div className="sm:col-span-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-500">{t("common.subtotal")}</span>
                <span dir="ltr">{formatMoney(subtotal, settings?.currency ?? "DZD", lang)}</span>
              </div>
              {itemsField && "discount" in values && (
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-500">{t("common.discount")}</span>
                  <span dir="ltr">− {formatMoney(discount, settings?.currency ?? "DZD", lang)}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                <span>{t("form.computedTotal")}</span>
                <span dir="ltr">{formatMoney(grandTotal, settings?.currency ?? "DZD", lang)}</span>
              </div>
            </div>
          </div>
        )}

        {/* إرسال مخفي للسماح بـ Enter */}
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}

/* ------------------------- محرر بنود المستند (Items) ------------------------ */

interface ItemsFieldProps {
  items: DocumentItem[];
  options: Array<{ value: string; label: string; price: number }>;
  onChange: (items: DocumentItem[]) => void;
  error?: string;
}

function ItemsField({ items, options, onChange, error }: ItemsFieldProps) {
  const { t } = useI18n();

  const update = (idx: number, patch: Partial<DocumentItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addLine = () => {
    onChange([...items, { productId: "", quantity: 1, price: 0 }]);
  };

  const removeLine = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-700">{t("field.items")}</label>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        {items.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-slate-400">{t("form.emptyItems")}</p>
        )}
        <ul className="divide-y divide-slate-100">
          {items.map((line, idx) => {
            const opt = options.find((o) => o.value === line.productId);
            return (
              <li key={idx} className="grid grid-cols-12 items-center gap-2 p-3">
                <div className="col-span-12 sm:col-span-5">
                  <select
                    value={line.productId}
                    onChange={(e) => {
                      const next = options.find((o) => o.value === e.target.value);
                      update(idx, { productId: e.target.value, price: next ? next.price : 0 });
                    }}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">{t("form.selectProduct")}</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                    className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    aria-label={t("common.quantity")}
                    dir="ltr"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.price}
                    onChange={(e) => update(idx, { price: Number(e.target.value) })}
                    className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    aria-label={t("common.price")}
                    dir="ltr"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2 text-end text-sm font-bold text-slate-700" dir="ltr">
                  {(Number(line.quantity) || 0) * (Number(line.price) || 0)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={t("form.removeItem")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {opt && (
                  <p className="col-span-12 text-[10px] text-slate-400 sm:hidden">{opt.label}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={addLine}>
          <Plus className="size-3.5" />
          {t("form.addItem")}
        </Button>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
      <p className="text-xs text-slate-400">{t("form.itemsHint")}</p>
    </div>
  );
}
