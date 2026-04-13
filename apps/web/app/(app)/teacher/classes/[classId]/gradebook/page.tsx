import { redirect } from "next/navigation";

export default async function TeacherClassGradebookAliasPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  redirect(`/teacher/gradebook?classId=${encodeURIComponent(classId)}`);
}
