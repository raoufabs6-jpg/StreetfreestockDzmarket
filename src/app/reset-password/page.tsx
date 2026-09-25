"use client";

// صفحة تعيين كلمة مرور جديدة عبر الرمز المؤقت (?token=)
// عند النجاح تُبطل كل الجلسات القديمة للمستخدم (sessionVersion) ويُطلب تسجيل الدخول.

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Save } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
    setReady(true);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.message ?? t("auth.resetInvalid"));
        return;
      }
      toast.success(t("auth.resetDone"));
      router.push("/login");
      router.refresh();
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-md">
            <Boxes className="size-7" />
          </span>
          <h1 className="text-xl font-extrabold text-slate-900">{t("auth.resetTitle")}</h1>
          <p className="text-sm text-slate-400">{t("auth.resetSubtitle")}</p>
        </div>

        {!ready ? null : !token ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card">
            <p className="text-sm font-semibold text-slate-600">{t("auth.tokenRequired")}</p>
            <div className="mt-4 text-xs">
              <Link
                href="/forgot-password"
                className="font-bold text-primary-600 hover:text-primary-700"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
          >
            <div className="space-y-4">
              <Input
                label={t("auth.password")}
                type="password"
                dir="ltr"
                autoComplete="new-password"
                required
                minLength={8}
                hint={t("auth.passwordMin") ?? undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label={t("auth.confirmPassword")}
                type="password"
                dir="ltr"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                <Save className="size-4" />
                {loading ? "..." : t("auth.saveNewPassword")}
              </Button>
            </div>

            <div className="mt-4 text-center text-xs">
              <Link href="/login" className="font-bold text-primary-600 hover:text-primary-700">
                {t("auth.backToLogin")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
