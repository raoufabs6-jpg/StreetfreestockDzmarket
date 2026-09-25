import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-primary-100 text-primary-600">
        <Compass className="size-8" />
      </span>
      <h1 className="text-2xl font-extrabold text-slate-900">الصفحة غير موجودة</h1>
      <p className="max-w-sm text-sm text-slate-500">
        الرابط الذي تبحث عنه غير صحيح أو تم نقله.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700"
      >
        العودة للوحة التحكم
      </Link>
    </div>
  );
}
