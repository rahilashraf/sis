"use client";

import { AssignmentsWorkspace } from "@/components/classes/assignments-workspace";
import { useParams } from "next/navigation";

export default function TeacherAssignmentsPage() {
  const params = useParams<{ classId: string }>();

  return <AssignmentsWorkspace classId={params.classId} mode="teacher" />;
}
