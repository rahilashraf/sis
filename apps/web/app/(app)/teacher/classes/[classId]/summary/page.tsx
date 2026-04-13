import { redirect } from "next/navigation";

export default async function TeacherClassSummaryAliasPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  redirect(`/teacher/classes/${encodeURIComponent(classId)}`);
}
