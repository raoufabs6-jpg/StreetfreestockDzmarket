// POST /api/auth/login — تسجيل الدخول (بريد + كلمة مرور) وإنشاء جلسة
// حماية: رسائل موحدة لا تكشف وجود الحساب + حد محاولات مؤقت (10/دقيقة لكل بريد).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { loginSchema } from "@/lib/server/validation";
import { createSession, verifyPassword } from "@/lib/server/auth";
import { errorResponse, unauthorized, forbidden, tooManyRequests } from "@/lib/server/errors";

/* حد محاولات الدخول الفاشلة — ذاكرة مؤقتة على مستوى الخادم (أفضلية دفاعية) */
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function throttleKey(email: string): void {
  const now = Date.now();
  const entry = attempts.get(email);
  if (!entry || entry.resetAt < now) {
    attempts.set(email, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw tooManyRequests("عدد محاولات الدخول كبير — انتظر دقيقة ثم أعد المحاولة");
  }
}

function clearAttempts(email: string): void {
  attempts.delete(email);
}

export async function POST(req: Request) {
  try {
    const body = loginSchema.parse(await req.json());
    const email = body.email.toLowerCase();

    throttleKey(email);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: { select: { id: true, name: true, businessName: true } } },
    });

    // رسالة واحدة موحدة — لا نكشف إن كان البريد موجودًا أم لا
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw unauthorized("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }
    if (user.status === "disabled") {
      throw forbidden("هذا الحساب معطّل — راجع مدير مؤسستك");
    }

    clearAttempts(email);
    await createSession({
      sub: user.id,
      org: user.organizationId,
      role: user.role,
      v: user.sessionVersion,
    });

    return NextResponse.json({
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          businessName: user.organization.businessName,
        },
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
