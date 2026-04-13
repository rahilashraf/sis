"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export default function HomePage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
      return;
    }

    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="text-sm text-slate-500">Loading...</p>
    </main>
  );
}
