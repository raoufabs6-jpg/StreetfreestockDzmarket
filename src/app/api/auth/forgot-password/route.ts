// POST /api/auth/forgot-password — طلب استعادة كلمة المرور
// • الرد موحّد دائمًا (لا نكشف إن كان البريد مسجّلًا — منع تخمين الحسابات).
// • الرمز الخام يُرسل عبر EMAIL_WEBHOOK_URL (إن وُجد) ولا يُخزَّن — فقط SHA-256.
// • في وضع التطوير بدون بريد: يُعاد debugToken لتسهيل الاختبار (أبدًا في الإنتاج).

import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/server/db";
import { forgotPasswordSchema } from "@/lib/server/validation";
import { errorResponse, tooManyRequests } from "@/lib/server/errors";

const RESET_TTL_MS = 30 * 60 * 1000; // 30 دقيقة
const MAX_REQUESTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 دقيقة
const requests = new Map<string, { count: number; resetAt: number }>();

function throttle(email: string): void {
  const now = Date.now();
  const entry = requests.get(email);
  if (!entry || entry.resetAt < now) {
    requests.set(email, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    throw tooManyRequests("طلبات كثيرة لهذا البريد — انتظر قليلًا ثم أعد المحاولة");
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(req: Request) {
  try {
    const body = forgotPasswordSchema.parse(await req.json());
    const email = body.email.toLowerCase();
    throttle(email);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, organizationId: true, email: true },
    });

    let debugToken: string | undefined;

    if (user) {
      const token = randomBytes(32).toString("base64url");
      const origin = new URL(req.url).origin;

      // رمز واحد فعّال — الحذف السابق يبطل أي روابط قديمة
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      });

      const resetUrl = `${origin}/reset-password?token=${token}`;
      const webhook = process.env.EMAIL_WEBHOOK_URL;

      if (webhook) {
        // بوابة بريد عامة (Resend/Make/خادمك) — لا مفاتيح في الكود، من البيئة فقط
        try {
          await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: user.email,
              subject: "AKMA Business — استعادة كلمة المرور",
              text: `لتعيين كلمة مرور جديدة افتح الرابط ( صالح 30 دقيقة):\n${resetUrl}`,
              resetUrl,
            }),
          });
        } catch (err) {
          console.error("[auth] reset email webhook failed:", err);
        }
      } else if (process.env.NODE_ENV !== "production") {
        // وضع التطوير: يظهر الرابط مباشرة في الواجهة لتسهيل الاختبار
        debugToken = token;
        console.warn(`[auth] reset link (dev only): ${resetUrl}`);
      }
    }

    return NextResponse.json({
      data: {
        ok: true,
        message: "إذا كان البريد مسجّلًا فسيصلك رابط إعادة تعيين كلمة المرور",
        ...(debugToken ? { debugToken } : {}),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
