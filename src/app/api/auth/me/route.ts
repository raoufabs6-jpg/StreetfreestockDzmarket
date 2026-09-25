// GET /api/auth/me — الجلسة الحالية (المستخدم + المؤسسة)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireOrgContext } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, businessName: true, currency: true },
    });
    return NextResponse.json({
      data: {
        user: { id: ctx.userId, name: ctx.name, email: ctx.email, role: ctx.role },
        organization: org,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
