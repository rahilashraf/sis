"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    <Card className="w-full max-w-md p-6 md:p-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          AIOK (Darul Ilm) SIS
        </h1>
        <p className="text-sm text-slate-600">
          Sign in with your provided login information.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
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
          />
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="space-y-2 pt-2">
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>

          {showWakeMessage ? (
            <p className="text-sm text-slate-500 text-center">
              Waking up the server. The first login may take a little longer.
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}