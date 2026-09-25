// /api/v1/[resource] — قائمة (GET) وإنشاء (POST) لكل الموارد
// كل العمليات محمية بجلسة + عزل organizationId (انظر lib/server/resources.ts)

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/server/auth";
import { errorResponse, notFound } from "@/lib/server/errors";
import { getResource } from "@/lib/server/resources";

type Params = { resource: string };

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { resource } = await ctx.params;
    const ops = getResource(resource);
    if (!ops) throw notFound("المورد غير معروف");
    const org = await requireOrgContext();
    const rows = await ops.list(org);
    return NextResponse.json({ data: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, routeCtx: { params: Promise<Params> }) {
  try {
    const { resource } = await routeCtx.params;
    const ops = getResource(resource);
    if (!ops) throw notFound("المورد غير معروف");
    const org = await requireOrgContext();
    const body = await req.json().catch(() => ({}));
    const created = await ops.create(org, body);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
