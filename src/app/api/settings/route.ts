// /api/settings — إعدادات المنشأة (محسوبة من مؤسسة الجلسة فقط)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { assertCan, requireOrgContext } from "@/lib/server/auth";
import { errorResponse, forbidden } from "@/lib/server/errors";
import { settingsSchema } from "@/lib/server/validation";
import { DEFAULT_ROLE_PERMISSIONS, type BusinessSettings, type Role } from "@/lib/types";

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId } });
    if (!org) throw forbidden("المؤسسة غير موجودة");

    const settings: BusinessSettings = {
      businessName: org.businessName ?? "",
      email: org.email ?? "",
      phone: org.phone ?? "",
      address: org.address ?? "",
      currency: org.currency as BusinessSettings["currency"],
      currentUserId: ctx.userId,
      rolePermissions: (org.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS) as Record<
        Role,
        string[]
      >,
    };
    return NextResponse.json({ data: settings });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireOrgContext();
    const body = settingsSchema.parse(await req.json());

    // التبديل بين حسابات المؤسسة (عرض تجريبي) لا يتطلب صلاحية،
    // أم تعديل بيانات المنشأة/الصلاحيات يتطلب settings.manage.
    const isSwitchOnly =
      body.currentUserId !== undefined &&
      Object.keys(body).every((k) => k === "currentUserId");
    if (!isSwitchOnly) {
      assertCan(ctx, "settings.manage");
    }

    // مصفوفة الصلاحيات: للمالك أو مدير النظام فقط (server-side)
    if (body.rolePermissions !== undefined && ctx.role !== "owner" && ctx.role !== "admin") {
      throw forbidden("تعديل مصفوفة الصلاحيات للمالك أو مدير النظام فقط");
    }

    // التبديل بين الحسابات: داخل نفس المؤسسة فقط
    if (body.currentUserId !== undefined && body.currentUserId !== null) {
      const member = await prisma.user.findFirst({
        where: { id: body.currentUserId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!member) throw forbidden("لا يمكن اختيار مستخدم خارج مؤسستك");
    }

    const org = await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        ...(body.businessName !== undefined ? { businessName: body.businessName } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.rolePermissions !== undefined
          ? { rolePermissions: body.rolePermissions }
          : {}),
      },
    });

    // currentUserId يُعاد في الاستجابة دائمًا كـ سجل المستخدم الحالي — لا يُخزَّن
    const settings: BusinessSettings = {
      businessName: org.businessName ?? "",
      email: org.email ?? "",
      phone: org.phone ?? "",
      address: org.address ?? "",
      currency: org.currency as BusinessSettings["currency"],
      currentUserId: body.currentUserId ?? ctx.userId,
      rolePermissions: (org.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS) as Record<
        Role,
        string[]
      >,
    };
    return NextResponse.json({ data: settings });
  } catch (err) {
    return errorResponse(err);
  }
}
