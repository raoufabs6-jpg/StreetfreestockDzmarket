// POST /api/auth/logout — إنهاء الجلسة (مسح الكوكي)

import { NextResponse } from "next/server";
import { destroySession } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return errorResponse(err);
  }
}
