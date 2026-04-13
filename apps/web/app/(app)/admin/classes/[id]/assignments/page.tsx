"use client";

import { AssignmentsWorkspace } from "@/components/classes/assignments-workspace";
import { useParams } from "next/navigation";

export default function AdminAssignmentsPage() {
  const params = useParams<{ id: string }>();

  return <AssignmentsWorkspace classId={params.id} mode="admin" />;
}
