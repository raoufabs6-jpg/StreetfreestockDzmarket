"use client";

// صفحة تسجيل الدخول (وضع قاعدة البيانات فقط)

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, LogIn } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.message ?? t("auth.wrongCredentials"));
        return;
      }
      router.push("/dashboard");
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
        {/* الشعار */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-md">
            <Boxes className="size-7" />
          </span>
          <h1 className="text-xl font-extrabold text-slate-900">AKMA Business</h1>
          <p className="text-sm text-slate-400">{t("app.tagline")}</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
        >
          <h2 className="mb-4 text-base font-bold text-slate-800">{t("auth.signIn")}</h2>
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
            <Input
              label={t("auth.password")}
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <div className="-mt-1 text-xs">
              <Link
                href="/forgot-password"
                className="font-bold text-primary-600 hover:text-primary-700"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="size-4" />
              {loading ? "..." : t("auth.signIn")}
            </Button>
          </div>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-slate-400">{t("auth.noAccount")}</span>
          <Link href="/register" className="font-bold text-primary-600 hover:text-primary-700">
            {t("auth.createCta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
