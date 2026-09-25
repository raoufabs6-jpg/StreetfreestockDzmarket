// /api/v1/[resource]/[id] — قراءة/تحديث/حذف سجل واحد
// يُرفض أي سجل ينتمي لمؤسسة أخرى (404 — دون كشف وجوده).

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/server/auth";
import { errorResponse, notFound } from "@/lib/server/errors";
import { getResource } from "@/lib/server/resources";

type Params = { resource: string; id: string };

async function loadOps(resource: string) {
  const ops = getResource(resource);
  if (!ops) throw notFound("المورد غير معروف");
  return ops;
}

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { resource, id } = await ctx.params;
    const ops = await loadOps(resource);
    const org = await requireOrgContext();
    const row = await ops.get(org, id);
    return NextResponse.json({ data: row });
  } catch (err) {
    return errorResponse(err);
  }
}

async function handleUpdate(req: Request, routeCtx: { params: Promise<Params> }) {
  try {
    const { resource, id } = await routeCtx.params;
    const ops = await loadOps(resource);
    const org = await requireOrgContext();
    const body = await req.json().catch(() => ({}));
    const updated = await ops.update(org, id, body);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

export const PUT = handleUpdate;
export const PATCH = handleUpdate;

export async function DELETE(_req: Request, ctx: { params: Promise<Params> }) {
  try {
    const { resource, id } = await ctx.params;
    const ops = await loadOps(resource);
    const org = await requireOrgContext();
    await ops.remove(org, id);
    return NextResponse.json({ data: { id } });
  } catch (err) {
    return errorResponse(err);
  }
}
