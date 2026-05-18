"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-5 py-[0.72rem] font-semibold leading-none text-red-700 transition hover:-translate-y-px hover:border-red-300 hover:bg-red-50 hover:text-red-800"
    >
      Sign Out
    </button>
  );
}
