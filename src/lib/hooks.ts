"use client";

// ============================================================
// Hooks لاستخدام طبقة البيانات من مكونات الواجهة
// — components لا تعرف شيئًا عن localStorage، فقط هذه الطبقة.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getProvider, onDataChanged } from "@/lib/data";
import type {
  AppUser,
  BusinessSettings,
  CollectionName,
  PermissionAction,
  Role,
} from "@/lib/types";

/** جلب مجموعة كاملة + عمليات الكتابة، مع تحديث تلقائي عند أي تغيير */
export function useCollection<T extends { id: string }>(collection: CollectionName) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getProvider().list<T>(collection);
      if (mounted.current) {
        setRows(data);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "load_error");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const off = onDataChanged(() => void refresh());
    return () => {
      mounted.current = false;
      off();
    };
  }, [refresh]);

  const create = useCallback(
    async (value: T & { id: string }) => getProvider().create<T>(collection, value),
    [collection],
  );
  const update = useCallback(
    async (id: string, patch: Partial<T>) => getProvider().update<T>(collection, id, patch),
    [collection],
  );
  const remove = useCallback(
    async (id: string) => getProvider().remove(collection, id),
    [collection],
  );

  return { rows, loading, error, refresh, create, update, remove };
}

/** إعدادات المنشأة (متزامنة تلقائيًا) */
export function useSettings() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const s = await getProvider().getSettings();
    setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const off = onDataChanged(() => void refresh());
    return () => off();
  }, [refresh]);

  const save = useCallback(
    async (patch: Partial<BusinessSettings>) => {
      const next = await getProvider().updateSettings(patch);
      setSettings(next);
      return next;
    },
    [],
  );

  return { settings, loading, refresh, save };
}

/** المستخدم الحالي + الصلاحيات */
export function useCurrentUser() {
  const { settings, loading, save } = useSettings();
  const { rows: users } = useCollection<AppUser>("users");

  const user = useMemo(
    () => users.find((u) => u.id === settings?.currentUserId) ?? null,
    [users, settings?.currentUserId],
  );

  /** بدون مستخدم محدد → نعتبر المستخدم المالك */
  const role: Role = user?.role ?? "owner";
  const permissions = useMemo(
    () => settings?.rolePermissions?.[role] ?? [],
    [settings?.rolePermissions, role],
  );

  // المالك ومدير النظام يملكان صلاحية كاملة (مطابق لفحص الخادم)
  const can = useCallback(
    (perm: string) => role === "owner" || role === "admin" || permissions.includes(perm),
    [role, permissions],
  );

  const canManage = useCallback(
    (module: string) => can(`${module}.manage` as `${string}.${PermissionAction}`),
    [can],
  );

  const switchUser = useCallback((id: string) => save({ currentUserId: id }), [save]);

  return { user, users, role, can, canManage, switchUser, settings, loadingSettings: loading, saveSettings: save };
}
