"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/auth-context";
import { login } from "@/lib/api/auth";

export function LoginForm() {
  const router = useRouter();
  const { setSession, status } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWakeMessage, setShowWakeMessage] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    setShowWakeMessage(false);

    const timer = window.setTimeout(() => {
      setShowWakeMessage(true);
    }, 3000);

    try {
      const response = await login(username, password);
      setSession(response);
      router.replace("/dashboard");
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Login failed";

      setError(message);
    } finally {
      window.clearTimeout(timer);
      setIsSubmitting(false);
      setShowWakeMessage(false);
    }
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 md:p-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white shadow-md">
          A
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            AIOK (Darul Ilm) SIS
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Sign in to access the school information system.
          </p>
        </div>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-700"
            htmlFor="username"
          >
            Username
          </label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-700"
            htmlFor="password"
          >
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="h-11"
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-sm text-rose-600">{error}</p>
          </div>
        ) : null}

        <div className="space-y-3 pt-1">
          <Button className="h-11 w-full rounded-xl" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </span>
            ) : (
              "Sign in"
            )}
          </Button>

          {showWakeMessage ? (
            <p className="text-center text-sm text-slate-500">
              Waking up the server. The first login may take a little longer.
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}