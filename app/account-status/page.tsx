import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export default async function AccountStatusPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, status")
    .eq("id", user.id)
    .single();

  const status = (profile?.status ?? "pending") as
    | "pending"
    | "approved"
    | "rejected";

  if (status === "approved") {
    redirect("/dashboard");
  }

  const isPending = status === "pending";

  return (
    <main className="page-shell text-gray-900">
      <div className="page-container max-w-2xl">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Account Status</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              {isPending ? "Awaiting admin approval" : "Account rejected"}
            </h1>
          </div>

          <div className="topbar-nav">
            <LogoutButton />
          </div>
        </div>

        <section
          className={`section-card rounded-[2rem] p-8 ${isPending ? "" : "border-l-4 border-l-red-500"}`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${
                isPending
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}
              aria-hidden="true"
            >
              {isPending ? "⏳" : "✕"}
            </div>

            <div className="flex-1">
              <p className="text-sm muted-copy">
                Signed in as{" "}
                <span className="font-semibold text-gray-900">
                  {profile?.full_name || user.email}
                </span>
              </p>

              {isPending ? (
                <>
                  <p className="mt-3 text-base leading-7 text-gray-800">
                    Your account has been created, but an administrator hasn't
                    approved it yet. You won't be able to access documents,
                    reviews, or the dashboard until your account is approved.
                  </p>
                  <p className="muted-copy mt-3 text-sm">
                    Please check back later, or contact your administrator if
                    you believe approval is taking longer than expected. Once
                    you're approved you'll receive an in-app notification, and
                    refreshing this page will take you to the dashboard.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-base leading-7 text-gray-800">
                    An administrator has rejected your account, so it cannot be
                    used to access this system.
                  </p>
                  <p className="muted-copy mt-3 text-sm">
                    If you believe this is a mistake, please contact your
                    administrator. You can sign out below.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
