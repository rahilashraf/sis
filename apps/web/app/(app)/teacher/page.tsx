"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export default function TeacherPage() {
  const router = useRouter();
  const { session, status } = useAuth();

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    if (session?.user.role === "SUPPLY_TEACHER") {
      router.replace("/teacher/attendance");
      return;
    }

    router.replace("/teacher/dashboard");
  }, [router, session?.user.role, status]);

  return null;
}
