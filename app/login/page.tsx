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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    }

    if (mode === "register") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("Registration successful. Please sign in.");
      setMode("login");
    }
  }

  return (
    <main className="page-shell flex items-center">
      <div className="page-container">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="hero-panel rounded-[2rem] p-8 md:p-10">
            <p className="eyebrow">Secure Access</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl">
              {mode === "login"
                ? "Step into a cleaner document review workspace."
                : "Create an account and start routing approvals faster."}
            </h1>

            <p className="muted-copy mt-5 max-w-xl text-lg leading-8">
              Centralize uploads, reviewer assignments, approval decisions, and
              system logs without the usual clutter.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="metric-card rounded-[1.5rem] p-5">
                <p className="text-sm font-medium text-gray-600">Workflow</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  Upload to decision
                </p>
              </div>

              <div className="metric-card rounded-[1.5rem] p-5">
                <p className="text-sm font-medium text-gray-600">Visibility</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  Auditable by default
                </p>
              </div>
            </div>
          </section>

          <section className="glass-panel w-full rounded-[2rem] p-8 md:p-10">
            <h2 className="text-2xl font-semibold text-gray-900">
              {mode === "login" ? "Sign In" : "Create Account"}
            </h2>

            <p className="muted-copy mt-2 mb-6">
              AI-powered document review and approval system
            </p>

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
                  required
                />
              </div>

              {message && <p className="text-sm text-red-600">{message}</p>}

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
      </div>
    </main>
  );
}
