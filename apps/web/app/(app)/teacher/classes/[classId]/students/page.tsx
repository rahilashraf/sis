import { redirect } from "next/navigation";

export default async function TeacherClassStudentsAliasPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  redirect(`/teacher/classes/${encodeURIComponent(classId)}`);
}
