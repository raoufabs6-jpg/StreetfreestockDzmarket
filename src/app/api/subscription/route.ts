// /api/subscription — اشتراك المؤسسة الحالي (الخطة، الحالة، التجربة، الحدود، الاستخدام)
// GET: لأي مستخدم داخل المؤسسة (يحتاج settings.manage للعرض الإداري في الواجهة)
// PUT: تبديل الخطة — يطلب settings.manage؛ الخطط المدفوعة بعد التجربة تُرفض (جاهزية Stripe)

import { NextResponse } from "next/server";
import { assertCan, requireOrgContext } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { getSubscriptionInfo, switchPlan } from "@/lib/server/subscription";
import { PLAN_ORDER, type PlanId } from "@/lib/plans";

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const info = await getSubscriptionInfo(ctx.organizationId);
    return NextResponse.json({ data: info });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireOrgContext();
    assertCan(ctx, "settings.manage");

    const body = (await req.json().catch(() => ({}))) as { plan?: string };
    if (!body.plan || !PLAN_ORDER.includes(body.plan as PlanId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "خطة غير صالحة" } },
        { status: 400 },
      );
    }
    const info = await switchPlan(ctx.organizationId, body.plan as PlanId);
    return NextResponse.json({ data: info });
  } catch (err) {
    return errorResponse(err);
  }
}
