"use client";

// المستخدمون والصلاحيات — جدول الحسابات + مصفوفة الأدوار

import { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useCurrentUser, useSettings } from "@/lib/hooks";
import { MODULES, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { CrudPage } from "@/components/crud/crud-page";
import { Button, Card, CardTitle } from "@/components/ui/primitives";

const MATRIX_ROLES: Role[] = ["manager", "employee"];

function PermsMatrix() {
  const { t } = useI18n();
  const toast = useToast();
  const { settings, save } = useSettings();
  const { can } = useCurrentUser();

  const [role, setRole] = useState<Role>("manager");
  const [perms, setPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPerms(settings?.rolePermissions?.[role] ?? []);
  }, [settings, role]);

  const manage = can("users.manage");

  const toggle = (perm: string) => {
    if (!manage) return;
    setPerms((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const saveMatrix = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await save({ rolePermissions: { ...settings.rolePermissions, [role]: perms } });
      toast.success(t("toast.permsSaved"));
    } catch {
      toast.error(t("toast.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardTitle
        action={
          manage ? (
            <Button size="sm" onClick={saveMatrix} disabled={saving}>
              {saving ? "..." : t("common.save")}
            </Button>
          ) : undefined
        }
      >
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary-500" />
          {t("users.permissions")}
        </span>
      </CardTitle>

      <div className="flex flex-col gap-3 px-5 pt-4 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {MATRIX_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold transition",
                role === r ? "bg-white text-primary-700 shadow-sm" : "text-slate-500",
              )}
            >
              {t(`enum.role.${r}` as MessageKey)}
            </button>
          ))}
        </div>
        <p className="text-xs leading-5 text-slate-400 sm:flex-1">{t("users.hint")}</p>
      </div>

      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="px-3 py-2 text-start font-medium">{t("common.name")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("users.viewPerm")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("users.managePerm")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {MODULES.map((m) => {
              const viewPerm = `${m}.view`;
              const managePerm = `${m}.manage`;
              return (
                <tr key={m}>
                  <td className="px-3 py-2.5 font-semibold text-slate-700">
                    {t(`nav.${m}` as MessageKey)}
                  </td>
                  {[viewPerm, managePerm].map((perm) => {
                    const on = perms.includes(perm);
                    return (
                      <td key={perm} className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(perm)}
                          disabled={!manage || perm.startsWith("dashboard.")}
                          className={cn(
                            "flex size-6 items-center justify-center rounded-md border transition mx-auto",
                            on
                              ? "border-primary-600 bg-primary-600 text-white"
                              : "border-slate-300 bg-white text-transparent",
                            manage && "hover:border-primary-400",
                            (!manage || perm.startsWith("dashboard.")) && "cursor-not-allowed opacity-70",
                          )}
                          aria-label={perm}
                        >
                          <Check className="size-4" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function UsersPage() {
  return <CrudPage entityKey="users" extra={<PermsMatrix />} />;
}
