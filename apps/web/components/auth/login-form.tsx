"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
      {/* Logos */}
      <div className="mb-8 mt-2 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
        <Image
          src="/aiok-logo.png"
          alt="AIOK (Darul Ilm)"
          width={160}
          height={60}
          className="object-contain"
          priority
        />

        <div className="hidden sm:block h-10 w-px bg-slate-300" />

        <Image
          src="/iok-school-logo.png"
          alt="IOK Islamic School"
          width={140}
          height={50}
          className="object-contain opacity-90"
        />
      </div>

      {/* Title */}
      <div className="mb-6 text-center space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          AIOK SIS
        </h1>
        <p className="text-sm text-slate-600">Sign in to access the system.</p>
      </div>

      {/* Form */}
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

        {/* Error */}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-sm text-rose-600">{error}</p>
          </div>
        ) : null}

        {/* Button + status */}
        <div className="space-y-3 pt-1">
          <Button
            className="h-11 w-full rounded-xl"
            disabled={isSubmitting}
            type="submit"
          >
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
              Waking up the server. The first login may take upto two minutes.
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
