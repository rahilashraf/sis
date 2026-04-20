"use client";

import { useParams } from "next/navigation";
import { StudentBillingAccount } from "@/components/admin/student-billing-account";

export default function AdminStudentBillingAccountPage() {
  const params = useParams<{ id: string }>();

  return <StudentBillingAccount studentId={params.id} />;
}
