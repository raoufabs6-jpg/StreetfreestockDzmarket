// POST /api/auth/setup — إنشاء أول مؤسسة + حساب المالك (OWNER)
// يعمل مرة واحدة فقط: إذا وُجدت أي مؤسسة يُرفض (409).
// ملاحظة: للتسجيل المفتوح في أي وقت استخدم POST /api/auth/register.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { setupSchema } from "@/lib/server/validation";
import { createSession, hashPassword } from "@/lib/server/auth";
import { conflict, errorResponse } from "@/lib/server/errors";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const orgCount = await prisma.organization.count();
    if (orgCount > 0) {
      throw conflict("تم إنشاء مؤسسة بالفعل — سجّل الدخول بدلًا من ذلك");
    }

    const body = setupSchema.parse(await req.json());

    const organization = await prisma.organization.create({
      data: {
        name: body.organizationName,
        businessName: body.organizationName,
        rolePermissions: DEFAULT_ROLE_PERMISSIONS,
        users: {
          create: {
            name: body.name,
            email: body.email.toLowerCase(),
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
    return errorResponse(err);
  }
}
