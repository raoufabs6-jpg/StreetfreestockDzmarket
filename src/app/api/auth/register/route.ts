// POST /api/auth/register — تسجيل حساب جديد (SaaS sign-up)
// يُنشئ مؤسسة جديدة + مستخدم المالك (OWNER) ويصدر جلسة فورًا.
// البريد فريد عالميًا؛ لا تُقبل أي بيانات عزل من العميل — organizationId تُشتق من الجلسة.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { registerSchema } from "@/lib/server/validation";
import { createSession, hashPassword } from "@/lib/server/auth";
import { conflict, errorResponse } from "@/lib/server/errors";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/types";
import { Prisma } from "@/generated/prisma/client";

export async function POST(req: Request) {
  try {
    const body = registerSchema.parse(await req.json());
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw conflict("هذا البريد مسجّل بالفعل — سجّل الدخول أو استعد كلمة المرور");
    }

    const organization = await prisma.organization.create({
      data: {
        name: body.organizationName,
        businessName: body.organizationName,
        rolePermissions: DEFAULT_ROLE_PERMISSIONS,
        users: {
          create: {
            name: body.name,
            email,
            role: "owner",
            status: "active",
            passwordHash: hashPassword(body.password),
          },
        },
      },
      include: { users: { select: { id: true, name: true, email: true, role: true } } },
    });

    const owner = organization.users[0];
    await createSession({ sub: owner.id, org: organization.id, role: "owner", v: 0 });

    return NextResponse.json(
      {
        data: {
          organization: { id: organization.id, name: organization.name },
          user: owner,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    // سباق على فريد البريد (P2002) — رسالة أوضح من الرسالة العامة
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return errorResponse(conflict("هذا البريد مسجّل بالفعل — سجّل الدخول أو استعد كلمة المرور"));
    }
    return errorResponse(err);
  }
}
