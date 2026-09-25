// طبقة الأخطاء الموحدة لواجهات API
// كل الردود: { data } عند النجاح أو { error: { code, message, details? } } عند الفشل
// — رسائل عربية للواجهة، وأكواد ثابتة للبرمجيات.

import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "VALIDATION_ERROR", message, details);
export const unauthorized = (message = "يجب تسجيل الدخول أولًا") =>
  new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "ليس لديك صلاحية لهذا الإجراء") =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "السجل غير موجود") =>
  new ApiError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);
export const tooManyRequests = (message = "محاولات كثيرة — انتظر قليلًا ثم أعد المحاولة") =>
  new ApiError(429, "RATE_LIMITED", message);
export const serverError = (message = "خطأ داخلي في الخادم") =>
  new ApiError(500, "INTERNAL_ERROR", message);

function prismaErrorToApi(err: Prisma.PrismaClientKnownRequestError): ApiError | null {
  switch (err.code) {
    case "P2002":
      return conflict("قيمة مكررة: هذا السجل موجود مسبقًا (فريد مخالف).");
    case "P2025":
      return notFound("السجل غير موجود أو تم حذفه.");
    case "P2003":
      return conflict("لا يمكن تنفيذ العملية: السجل مرتبط ببيانات أخرى.");
    case "P2009":
      return badRequest("قيمة غير صالحة في أحد الحقول.");
    default:
      return null;
  }
}

/** تحويل أي خطأ إلى رد HTTP موحد */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }

  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "تحقق من الحقول المدخلة",
          details: fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const api = prismaErrorToApi(err);
    if (api) return errorResponse(api);
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "تعذّر الاتصال بقاعدة البيانات. تحقق من DATABASE_URL.",
        },
      },
      { status: 503 },
    );
  }

  // خطأ غير متوقع — نسجّله في السيرفر فقط ولا نكشف تفاصيل داخلية للعميل
  console.error("[akma-api] unexpected error:", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "خطأ داخلي في الخادم" } },
    { status: 500 },
  );
}

/** التفاف معالج بمعالجة أخطاء موحدة */
export function withErrors<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
