"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessageType("error");
        setMessage(error.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    }

    if (mode === "register") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        setMessageType("error");
        setMessage(error.message);
        return;
      }

      const newUserId = data.user?.id;
      if (newUserId) {
        // Fire-and-forget — admins get notified but a failure here must not
        // block the registration UX. The DB trigger creates the profile row
        // synchronously with the auth.users insert, so the route can read it.
        fetch("/api/auth/register-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: newUserId }),
        }).catch(() => {});
      }

      setMessageType("success");
      setMessage("Registration successful. Please sign in.");
      setMode("login");
    }
  }

  return (
    <main className="page-shell flex items-center justify-center">
      <div className="flex w-full flex-col items-center px-6">
        <div className="mb-8 text-center">
          <p className="text-2xl font-medium tracking-wide text-gray-600">
            Academic Document Approval Workspace
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-gray-900 md:whitespace-nowrap md:text-5xl">
            Submit, review, and verify research documents.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-gray-600 md:text-base">
            Designed for students, researchers, supervisors, and department
            reviewers who need a clear record of comments, decisions,
            signatures, and document integrity.
          </p>
        </div>

        <section className="glass-panel w-full max-w-md rounded-[2rem] p-8 md:p-10">
            <h2 className="mb-6 text-2xl font-semibold text-gray-900">
              {mode === "login" ? "Sign In" : "Create Account"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Full Name
                  </label>
                  <input
                    className="input-field"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Smith"
                    autoComplete="name"
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  className="input-field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  autoComplete="email"
                  autoFocus={mode === "login"}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  className="input-field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
              </div>

              {message && (
                <div
                  role="alert"
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                    messageType === "success"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  <svg
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      messageType === "success"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    {messageType === "success" ? (
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    ) : (
                      <path
                        fillRule="evenodd"
                        d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    )}
                  </svg>
                  <span className="font-medium">{message}</span>
                </div>
              )}

              <button type="submit" className="button-primary w-full">
                {mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>

            <button
              className="mt-4 text-sm font-medium text-teal-700 hover:text-teal-800"
              onClick={() =>
                setMode(mode === "login" ? "register" : "login")
              }
            >
              {mode === "login"
                ? "Do not have an account? Create one"
                : "Already have an account? Sign in"}
            </button>
        </section>
      </div>
    </main>
  );
}
