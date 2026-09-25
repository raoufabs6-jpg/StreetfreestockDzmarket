// POST /api/auth/login — تسجيل الدخول (بريد + كلمة مرور) وإنشاء جلسة

import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { loginSchema } from "@/lib/server/validation";
import { createSession, verifyPassword } from "@/lib/server/auth";
import { errorResponse, unauthorized, forbidden } from "@/lib/server/errors";

export async function POST(req: Request) {
  try {
    const body = loginSchema.parse(await req.json());

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: { organization: { select: { id: true, name: true, businessName: true } } },
    });

    // رسالة واحدة موحدة — لا نكشف إن كان البريد موجودًا أم لا
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw unauthorized("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }
    if (user.status === "disabled") {
      throw forbidden("هذا الحساب معطّل — راجع مدير مؤسستك");
    }

    await createSession({ sub: user.id, org: user.organizationId, role: user.role });

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
