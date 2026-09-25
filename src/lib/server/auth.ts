// المصادقة والجلسات — بدون مفاتيح في الكود:
// • AUTH_SECRET من متغيرات البيئة (يُشترط في وضع قاعدة البيانات).
// • كلمات المرور مُجزّأة بـ scrypt + salt عشوائي.
// • الجلسة كوكي موقّع HMAC-SHA256 (HttpOnly) يحمل المستخدم والمؤسسة.

import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "./db";
import { unauthorized, forbidden, serverError } from "./errors";
import { DEFAULT_ROLE_PERMISSIONS, type Role } from "@/lib/types";

export const SESSION_COOKIE = "akma_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 أيام

export interface SessionPayload {
  /** userId */
  sub: string;
  /** organizationId — مصدر عزل البيانات */
  org: string;
  role: Role;
  /** إصدار الجلسة — يجب مطابقته مع user.sessionVersion (للإبطال عند تغيير كلمة المرور) */
  v?: number;
  exp: number;
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  role: Role;
  email: string;
  name: string;
  rolePermissions: Record<Role, string[]>;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw serverError(
      "AUTH_SECRET غير مضبوط. أنشئ قيمة عشوائية (مثال: openssl rand -base64 32) وأضفها في متغيرات البيئة.",
    );
  }
  return secret;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function signSession(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    if (!payload.sub || !payload.org) return null;
    return payload;
  } catch {
    return null;
  }
}

/** إنشاء جلسة بعد تسجيل الدخول الناجح */
export async function createSession(payload: Omit<SessionPayload, "exp">): Promise<void> {
  const token = signSession({ ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** جلسة من الكوكي الحالي (بدون قاعدة بيانات) */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** سياق المؤسسة الحالي — كل استعلامات البيانات تمر من هنا */
export async function requireOrgContext(): Promise<OrgContext> {
  const session = await getSession();
  if (!session) throw unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      organizationId: true,
      email: true,
      name: true,
      role: true,
      status: true,
      sessionVersion: true,
      organization: { select: { rolePermissions: true } },
    },
  });

  // حماية إضافية: المستخدم حُذف/عُطّل أو تغيّرت مؤسسته أو أُبطلت جلسته (تغيير كلمة المرور)
  if (
    !user ||
    user.organizationId !== session.org ||
    user.status === "disabled" ||
    (session.v ?? 0) !== user.sessionVersion
  ) {
    throw unauthorized("الجلسة لم تعد صالحة، سجّل الدخول مجددًا");
  }

  const perms = (user.organization.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS) as Partial<
    Record<Role, string[]>
  >;

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
    name: user.name,
    rolePermissions: {
      owner: perms.owner ?? DEFAULT_ROLE_PERMISSIONS.owner,
      admin: perms.admin ?? DEFAULT_ROLE_PERMISSIONS.admin,
      manager: perms.manager ?? DEFAULT_ROLE_PERMISSIONS.manager,
      employee: perms.employee ?? DEFAULT_ROLE_PERMISSIONS.employee,
    },
  };
}

/**
 * فحص الصلاحية على مستوى الخادم (نفس دلالة العميل):
 * OWNER وADMIN يملكان كل الوحدات (صلاحية كاملة/معظم النظام)،
 * وإلا يجب وجود "الوحدة.الإجراء" في مصفوفة الدور.
 */
export function can(ctx: OrgContext, permission: string): boolean {
  if (ctx.role === "owner" || ctx.role === "admin") return true;
  return (ctx.rolePermissions[ctx.role] ?? []).includes(permission);
}

export function assertCan(ctx: OrgContext, permission: string): void {
  if (!can(ctx, permission)) throw forbidden(`لا تملك صلاحية: ${permission}`);
}

/* --------------------------- كلمات المرور (scrypt) --------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
