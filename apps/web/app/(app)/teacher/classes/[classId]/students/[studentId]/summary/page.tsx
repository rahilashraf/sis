import { redirect } from "next/navigation";

export default async function TeacherStudentSummaryAliasPage({
  params,
}: {
  params: Promise<{ classId: string; studentId: string }>;
}) {
  const { classId, studentId } = await params;
  redirect(
    `/teacher/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`,
  );
}
