"use client";

import { useParams } from "next/navigation";
import { ParentReRegistrationGate } from "@/components/parent/parent-re-registration-gate";

export default function ParentReRegistrationPage() {
  const params = useParams<{ id: string }>();

  return <ParentReRegistrationGate studentId={params.id} />;
}
