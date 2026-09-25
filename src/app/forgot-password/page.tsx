"use client";

// صفحة طلب استعادة كلمة المرور — رد موحّد لا يكشف إن كان البريد مسجّلًا
// في وضع التطوير (بدون بوابة بريد) يعرض الرابط التجريبي مباشرة لتسهيل الاختبار.

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound, MailCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.message ?? t("toast.error"));
        return;
      }
      setSent(true);
      setDevToken(json?.data?.debugToken ?? null);
      toast.success(t("auth.forgotSent"));
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
            <KeyRound className="size-7" />
          </span>
          <h1 className="text-xl font-extrabold text-slate-900">{t("auth.forgotTitle")}</h1>
          <p className="text-sm text-slate-400">{t("auth.forgotSubtitle")}</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="flex items-start gap-3">
              <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-700">{t("auth.forgotSent")}</p>
            </div>

            {devToken && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-xs font-bold text-amber-700">{t("auth.devTokenHint")}</p>
                <Link
                  href={`/reset-password?token=${encodeURIComponent(devToken)}`}
                  className="block break-all text-xs font-bold text-primary-600 hover:text-primary-700"
                  dir="ltr"
                >
                  /reset-password?token={devToken.slice(0, 16)}…
                </Link>
              </div>
            )}

            <div className="mt-5 text-center text-xs">
              <Link href="/login" className="font-bold text-primary-600 hover:text-primary-700">
                {t("auth.backToLogin")}
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
                label={t("common.email")}
                type="email"
                dir="ltr"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
              <Button type="submit" className="w-full" disabled={loading}>
                <KeyRound className="size-4" />
                {loading ? "..." : t("auth.sendResetLink")}
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
