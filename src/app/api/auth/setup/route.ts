// POST /api/auth/setup — إنشاء أول مؤسسة + مدير النظام
// يعمل مرة واحدة فقط: إذا وُجدت أي مؤسسة يُرفض (409).

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
            role: "admin",
            status: "active",
            passwordHash: hashPassword(body.password),
          },
        },
      },
      include: { users: { select: { id: true, name: true, email: true, role: true } } },
    });

    const admin = organization.users[0];
    await createSession({ sub: admin.id, org: organization.id, role: "admin" });

    return NextResponse.json(
      {
        data: {
          organization: { id: organization.id, name: organization.name },
          user: admin,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
