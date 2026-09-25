// POST /api/auth/reset-password — تعيين كلمة مرور جديدة عبر الرمز المؤقت
// • الرمز يُقارَن عبر SHA-256 (الخام لا يُخزَّن)، صالح 30 دقيقة ويُستخدم مرة واحدة.
// • عند النجاح: كلمة المرور تُحدَّث + sessionVersion يُرفع → كل الجلسات القديمة تُبطل.

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/server/db";
import { resetPasswordSchema } from "@/lib/server/validation";
import { errorResponse, badRequest } from "@/lib/server/errors";
import { hashPassword } from "@/lib/server/auth";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(req: Request) {
  try {
    const body = resetPasswordSchema.parse(await req.json());

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(body.token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw badRequest("رابط الاستعادة غير صالح أو منتهي الصلاحية — اطلب رابطًا جديدًا");
    }

    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id } },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: hashPassword(body.password),
          sessionVersion: { increment: 1 },
        },
      }),
    ]);

    return NextResponse.json({
      data: { ok: true, message: "تم تغيير كلمة المرور — سجّل الدخول بجديد" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
