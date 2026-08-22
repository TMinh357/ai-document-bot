export function formatRoleLabel(role: string | null | undefined): string {
  if (role === "employee") return "Submitter";
  if (role === "reviewer") return "Reviewer";
  if (role === "admin") return "Administrator";
  return "Unknown role";
}

export function formatRoleDescription(role: string | null | undefined): string {
  if (role === "employee") return "student or researcher submitter";
  if (role === "reviewer") return "supervisor or department reviewer";
  if (role === "admin") return "system or department administrator";
  return "unmapped role";
}
