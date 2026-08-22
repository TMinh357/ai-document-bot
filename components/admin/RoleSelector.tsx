"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatRoleLabel } from "@/lib/role-labels";

interface Props {
  userId: string;
  currentRole: string;
  isSelf: boolean;
}

export default function RoleSelector({ userId, currentRole, isSelf }: Props) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function handleSave() {
    setLoading(true);
    setStatus("idle");
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error();
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="select-field !w-auto rounded-xl px-3 py-2 text-sm"
        value={role}
        onChange={(e) => {
          setRole(e.target.value);
          setStatus("idle");
        }}
        disabled={loading}
      >
        <option value="employee">{formatRoleLabel("employee")}</option>
        <option value="reviewer">{formatRoleLabel("reviewer")}</option>
        <option value="admin">{formatRoleLabel("admin")}</option>
      </select>

      <button
        onClick={handleSave}
        disabled={loading || role === currentRole}
        className="button-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Saving…" : "Save"}
      </button>

      {isSelf && (
        <span className="text-xs text-amber-600 font-medium">(you)</span>
      )}

      {status === "saved" && (
        <span className="text-xs font-semibold text-green-600">Saved</span>
      )}
      {status === "error" && (
        <span className="text-xs font-semibold text-red-600">Error</span>
      )}
    </div>
  );
}
