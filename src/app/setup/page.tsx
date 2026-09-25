"use client";

// صفحة تهيئة أول مؤسسة (تعمل مرة واحدة فقط في كل نشر)

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Building2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export default function SetupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState({
    organizationName: "",
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: form.organizationName,
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.message ?? t("toast.error"));
        return;
      }
      toast.success(t("toast.created"));
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-md">
            <Boxes className="size-7" />
          </span>
          <h1 className="text-xl font-extrabold text-slate-900">{t("auth.setupTitle")}</h1>
          <p className="text-sm text-slate-400">{t("auth.setupSubtitle")}</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
        >
          <div className="space-y-4">
            <Input
              label={t("auth.orgName")}
              required
              value={form.organizationName}
              onChange={(e) => setForm((f) => ({ ...f, organizationName: e.target.value }))}
              placeholder="شركتي ذ.م.م"
            />
            <Input
              label={t("auth.adminName")}
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label={t("common.email")}
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@example.com"
            />
            <Input
              label={t("auth.password")}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              required
              minLength={8}
              hint={t("auth.passwordMin") ?? undefined}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <Input
              label={t("auth.confirmPassword")}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              required
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              <Building2 className="size-4" />
              {loading ? "..." : t("auth.setupTitle")}
            </Button>
          </div>
        </form>

        <div className="mt-4 text-center text-xs">
          <Link href="/login" className="font-bold text-primary-600 hover:text-primary-700">
            {t("auth.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
