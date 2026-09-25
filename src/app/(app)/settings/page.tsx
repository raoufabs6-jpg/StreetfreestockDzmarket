"use client";

// الإعدادات — بيانات المنشأة، اللغة/العملة، وإدارة البيانات

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, Database, Download, Upload, RotateCcw, Trash2, Info, Globe } from "lucide-react";
import { useI18n, LANGS, type Lang } from "@/lib/i18n";
import { useCurrentUser, useSettings } from "@/lib/hooks";
import { getProvider } from "@/lib/data";
import { CURRENCIES, type CurrencyCode } from "@/lib/types";
import { cn, downloadJSON, todayISO } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/modal";
import { Button, Card, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import type { AppUser } from "@/lib/types";

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const { settings, loading, save } = useSettings();
  const { users, switchUser } = useCurrentUser();
  const { can } = useCurrentUser();

  const manage = can("settings.manage");

  // نموذج بيانات المنشأة
  const [form, setForm] = useState({ businessName: "", email: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        businessName: settings.businessName,
        email: settings.email,
        phone: settings.phone,
        address: settings.address,
      });
    }
  }, [settings]);

  // حوارو التأكيد
  const [confirmKind, setConfirmKind] = useState<null | "clear" | "seed">(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await save(form);
      toast.success(t("settings.saved"));
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    const data = await getProvider().exportAll();
    downloadJSON(`akma-backup-${todayISO()}.json`, data);
    toast.success(t("toast.exported"));
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Record<string, unknown>;
      await getProvider().importAll(data);
      toast.success(t("toast.imported"));
    } catch {
      toast.error(t("toast.error"));
    }
  };

  const handleConfirm = async () => {
    try {
      if (confirmKind === "clear") {
        await getProvider().clearAll();
        toast.success(t("toast.cleared"));
      } else if (confirmKind === "seed") {
        const provider = getProvider();
        if (!provider.reseed) {
          toast.error(t("settings.reseedUnsupported"));
          setConfirmKind(null);
          return;
        }
        await provider.reseed();
        toast.success(t("toast.reseeded"));
      }
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setConfirmKind(null);
    }
  };

  if (loading || !settings) {
    return <p className="py-20 text-center text-sm text-slate-400">{t("common.loading")}</p>;
  }

  return (
    <div>
      <PageHeader title={t("page.settings")} subtitle={t("settings.aboutText")} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* بيانات المنشأة */}
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Building2 className="size-4 text-primary-500" />
              {t("settings.business")}
            </span>
          </CardTitle>
          <form onSubmit={onSubmit} className="space-y-4 p-5">
            <p className="-mt-2 text-xs text-slate-400">{t("settings.businessHint")}</p>
            <Input
              label={t("common.name")}
              value={form.businessName}
              onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
              required
              disabled={!manage}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label={t("common.email")}
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                disabled={!manage}
              />
              <Input
                label={t("common.phone")}
                type="tel"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                disabled={!manage}
              />
            </div>
            <Textarea
              label={t("common.address")}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              disabled={!manage}
            />
            {manage && (
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? "..." : t("common.save")}
                </Button>
              </div>
            )}
          </form>
        </Card>

        {/* عام */}
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Globe className="size-4 text-primary-500" />
              {t("settings.general")}
            </span>
          </CardTitle>
          <div className="space-y-5 p-5">
            <Select
              label={t("settings.currency")}
              value={settings.currency}
              onChange={(e) => void save({ currency: e.target.value as CurrencyCode })}
              disabled={!manage}
              options={Object.entries(CURRENCIES).map(([value, meta]) => ({
                value,
                label: `${meta.label} (${meta.symbol})`,
              }))}
            />

            {/* السماح ببيع أكبر من المخزون (طلب مسبق) — يُفحص على الخادم أيضًا */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={settings.allowOversell}
                disabled={!manage}
                onChange={(e) => void save({ allowOversell: e.target.checked })}
                className="mt-0.5 size-4 accent-primary-600"
              />
              <span>
                <span className="block text-sm font-bold text-slate-700">
                  {t("settings.allowOversell")}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {t("settings.allowOversellHint")}
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">{t("settings.language")}</label>
              <div className="flex gap-2">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code as Lang)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-bold transition",
                      lang === l.code
                        ? "border-primary-600 bg-primary-600 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <Select
              label={t("settings.pickUser")}
              value={settings.currentUserId ?? ""}
              onChange={(e) => void switchUser(e.target.value)}
              placeholder={t("common.selectPlaceholder")}
              options={users.map((u: AppUser) => ({
                value: u.id,
                label: `${u.name} — ${t(`enum.role.${u.role}` as "enum.role.admin")}`,
              }))}
            />
          </div>
        </Card>

        {/* البيانات */}
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Database className="size-4 text-primary-500" />
              {t("settings.data")}
            </span>
          </CardTitle>
          <div className="space-y-3 p-5">
            <p className="-mt-1 text-xs leading-5 text-slate-400">{t("settings.dataHint")}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="secondary" onClick={handleExport}>
                <Download className="size-4" />
                {t("settings.exportData")}
              </Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!manage}>
                <Upload className="size-4" />
                {t("settings.importData")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {manage && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                <p className="mb-3 flex items-center gap-2 text-xs font-bold text-rose-700">
                  <Trash2 className="size-4" />
                  {t("settings.danger")}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" size="sm" onClick={() => setConfirmKind("seed")}>
                    <RotateCcw className="size-3.5" />
                    {t("settings.seedData")}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setConfirmKind("clear")}>
                    <Trash2 className="size-3.5" />
                    {t("settings.clearData")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* عن المشروع */}
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Info className="size-4 text-primary-500" />
              {t("settings.about")}
            </span>
          </CardTitle>
          <div className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-600 text-lg font-extrabold text-white">
                A
              </span>
              <div>
                <p className="text-base font-extrabold text-slate-900">{t("app.name")}</p>
                <p className="text-xs text-slate-400">{t("app.tagline")}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-slate-500">{t("settings.aboutText")}</p>
            <p className="text-xs text-slate-400" dir="ltr">
              Next.js · TypeScript · Tailwind CSS
            </p>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmKind === "clear"}
        title={t("settings.clearData")}
        message={t("settings.clearConfirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmKind(null)}
      />
      <ConfirmDialog
        open={confirmKind === "seed"}
        title={t("settings.seedData")}
        message={t("settings.seedConfirm")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        danger={false}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmKind(null)}
      />
    </div>
  );
}
