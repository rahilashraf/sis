"use client";

import { useParams } from "next/navigation";
import { ParentStudentBilling } from "@/components/parent/parent-student-billing";

export default function ParentStudentBillingPage() {
  const params = useParams<{ id: string }>();

  return <ParentStudentBilling studentId={params.id} />;
}
